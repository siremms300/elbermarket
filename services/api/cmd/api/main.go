package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/elbermarket/api/internal/auth"
	"github.com/elbermarket/api/internal/documents"
	"github.com/elbermarket/api/internal/notifications"
	"github.com/elbermarket/api/internal/organisation"
	"github.com/elbermarket/api/internal/platform/config"
	"github.com/elbermarket/api/internal/platform/database"
	"github.com/elbermarket/api/internal/platform/email"
	"github.com/elbermarket/api/internal/platform/httpserver"
	"github.com/elbermarket/api/internal/platform/jwt"
	"github.com/elbermarket/api/internal/platform/logging"
	"github.com/elbermarket/api/internal/platform/sms"
	"github.com/elbermarket/api/internal/transport"
	"github.com/elbermarket/api/internal/verification"
	"github.com/elbermarket/api/internal/fleet"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic("config load failed: " + err.Error())
	}

	logger := logging.New(cfg.Environment, cfg.LogLevel)
	slog.SetDefault(logger)

	logger.Info("starting elber-market api",
		"environment", cfg.Environment,
		"version", cfg.Version,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	logger.Info("database connection established")

	// ─── SMS provider ─────────────────────────────────────────────────
	smsProvider, err := sms.NewProvider(sms.Config{
		Provider:         cfg.SMSProvider,
		Environment:      cfg.Environment,
		TermiiAPIKey:     cfg.TermiiAPIKey,
		TermiiSenderID:   cfg.TermiiSenderID,
		TermiiBaseURL:    cfg.TermiiBaseURL,
		TwilioAccountSID: cfg.TwilioAccountSID,
		TwilioAuthToken:  cfg.TwilioAuthToken,
		TwilioFromNumber: cfg.TwilioFromNumber,
	}, logger)
	if err != nil {
		logger.Error("sms provider init failed", "error", err)
		os.Exit(1)
	}

	// ─── Email provider ───────────────────────────────────────────────
	emailProvider, err := email.NewProvider(email.Config{
		Provider:        cfg.EmailProvider,
		Environment:     cfg.Environment,
		ResendAPIKey:    cfg.ResendAPIKey,
		ResendFromEmail: cfg.ResendFromEmail,
		ResendFromName:  cfg.ResendFromName,
	}, logger)
	if err != nil {
		logger.Error("email provider init failed", "error", err)
		os.Exit(1)
	}

	// ─── JWT issuer ───────────────────────────────────────────────────
	jwtIssuer := jwt.NewIssuer(cfg.JWTSecret, time.Duration(cfg.JWTAccessTTL)*time.Second)

	// ─── OTP engine ───────────────────────────────────────────────────
	otpEngine := auth.NewOTPEngine(db, smsProvider, emailProvider, logger)

	// ─── Auth service ─────────────────────────────────────────────────
	authService := auth.NewService(db, otpEngine, jwtIssuer, smsProvider, emailProvider, logger)

	// ─── Real authenticator, wrapped by the identity adapter ──────────
	realAuth := auth.NewAuthenticator(db, jwtIssuer)
	identityAuth := auth.NewIdentityAdapter(realAuth)

	// ─── Organisation service ─────────────────────────────────────────
	orgService := organisation.NewService(db, logger)

	// ─── Document store + service ─────────────────────────────────────
	documentStore, err := documents.NewStore(documents.Config{
		Provider:          cfg.DocumentStore,
		R2AccountID:       cfg.R2AccountID,
		R2AccessKeyID:     cfg.R2AccessKeyID,
		R2SecretAccessKey: cfg.R2SecretAccessKey,
		R2Bucket:          cfg.R2Bucket,
		LocalRoot:         "/tmp/elbermarket-documents",
	}, cfg.Environment)
	if err != nil {
		logger.Error("document store init failed", "error", err)
		os.Exit(1)
	}

	if err := documentStore.HealthCheck(ctx); err != nil {
		logger.Error("document store health check failed", "error", err)
		os.Exit(1)
	}
	logger.Info("document store initialised", "provider", cfg.DocumentStore)

	documentService := documents.NewService(db, documentStore, logger)

	// ─── Verification service ─────────────────────────────────────────
	verificationService := verification.NewService(db, logger)

	// ─── Notification service + dispatcher ────────────────────────────
	notificationService := notifications.NewService(db, logger)

	dispatcher := notifications.NewDispatcher(db, emailProvider, logger)
	dispatcherCtx, dispatcherCancel := context.WithCancel(context.Background())
	go dispatcher.Start(dispatcherCtx)
	logger.Info("notification dispatcher started")

	// Fleet service
	fleetService := fleet.NewService(db, logger)

	// ─── Transport service ────────────────────────────────────────────
	transportService := transport.NewService(db, logger, notificationService)

	// ─── Router ───────────────────────────────────────────────────────
	router := httpserver.NewRouter(httpserver.Dependencies{
		Logger:              logger,
		DB:                  db,
		Config:              cfg,
		SMSProvider:         smsProvider,
		EmailProvider:       emailProvider,
		AuthService:         authService,
		JWTAuthenticator:    identityAuth,
		JWTIssuer:           jwtIssuer,
		OrgService:          orgService,
		TransportService:    transportService,
		FleetService:        fleetService,
		NotificationService: notificationService,
		DocumentService:     documentService,
		VerificationService: verificationService,
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("http server listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		logger.Error("server error", "error", err)
		os.Exit(1)
	case sig := <-shutdown:
		logger.Info("shutdown signal received", "signal", sig.String())

		// Stop the dispatcher first.
		logger.Info("stopping notification dispatcher")
		dispatcherCancel()
		dispatcher.Stop()
		logger.Info("notification dispatcher stopped")

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
			_ = srv.Close()
			os.Exit(1)
		}
		logger.Info("server stopped cleanly")
	}
}






































// package main

// import (
// 	"context"
// 	"errors"
// 	"log/slog"
// 	"net/http"
// 	"os"
// 	"os/signal"
// 	"syscall"
// 	"time"

// 	"github.com/elbermarket/api/internal/auth"
// 	"github.com/elbermarket/api/internal/organisation"
// 	"github.com/elbermarket/api/internal/platform/config"
// 	"github.com/elbermarket/api/internal/platform/database"
// 	"github.com/elbermarket/api/internal/platform/email"
// 	"github.com/elbermarket/api/internal/platform/httpserver"
// 	"github.com/elbermarket/api/internal/platform/jwt"
// 	"github.com/elbermarket/api/internal/platform/logging"
// 	"github.com/elbermarket/api/internal/platform/sms"
// 	"github.com/elbermarket/api/internal/transport"
// 	"github.com/elbermarket/api/internal/notifications"
// 	"github.com/elbermarket/api/internal/documents"
// 	"github.com/elbermarket/api/internal/verification"
// )

// func main() {
// 	cfg, err := config.Load()
// 	if err != nil {
// 		panic("config load failed: " + err.Error())
// 	}

// 	logger := logging.New(cfg.Environment, cfg.LogLevel)
// 	slog.SetDefault(logger)

// 	logger.Info("starting elber-market api",
// 		"environment", cfg.Environment,
// 		"version", cfg.Version,
// 	)

// 	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
// 	defer cancel()

// 	db, err := database.Connect(ctx, cfg.DatabaseURL)
// 	if err != nil {
// 		logger.Error("database connection failed", "error", err)
// 		os.Exit(1)
// 	}
// 	defer db.Close()

// 	logger.Info("database connection established")

// 	// SMS provider.
// 	smsProvider, err := sms.NewProvider(sms.Config{
// 		Provider:         cfg.SMSProvider,
// 		Environment:      cfg.Environment,
// 		TermiiAPIKey:     cfg.TermiiAPIKey,
// 		TermiiSenderID:   cfg.TermiiSenderID,
// 		TermiiBaseURL:    cfg.TermiiBaseURL,
// 		TwilioAccountSID: cfg.TwilioAccountSID,
// 		TwilioAuthToken:  cfg.TwilioAuthToken,
// 		TwilioFromNumber: cfg.TwilioFromNumber,
// 	}, logger)
// 	if err != nil {
// 		logger.Error("sms provider init failed", "error", err)
// 		os.Exit(1)
// 	}

// 	// Email provider.
// 	emailProvider, err := email.NewProvider(email.Config{
// 		Provider:        cfg.EmailProvider,
// 		Environment:     cfg.Environment,
// 		ResendAPIKey:    cfg.ResendAPIKey,
// 		ResendFromEmail: cfg.ResendFromEmail,
// 		ResendFromName:  cfg.ResendFromName,
// 	}, logger)
// 	if err != nil {
// 		logger.Error("email provider init failed", "error", err)
// 		os.Exit(1)
// 	}

// 	// JWT issuer.
// 	jwtIssuer := jwt.NewIssuer(cfg.JWTSecret, time.Duration(cfg.JWTAccessTTL)*time.Second)

// 	// OTP engine.
// 	otpEngine := auth.NewOTPEngine(db, smsProvider, emailProvider, logger)

// 	// Auth service.
// 	authService := auth.NewService(db, otpEngine, jwtIssuer, smsProvider, emailProvider, logger)

// 	// Real authenticator, wrapped by the identity adapter.
// 	realAuth := auth.NewAuthenticator(db, jwtIssuer)
// 	identityAuth := auth.NewIdentityAdapter(realAuth)

// 	// Organisation service.
// 	orgService := organisation.NewService(db, logger)

// 	// Transport service.
// 	// transportService := transport.NewService(db, logger)

// 		// Notification service.
// 	notificationService := notifications.NewService(db, logger)


// 	// Start the notification dispatcher.
// 	dispatcher := notifications.NewDispatcher(db, emailProvider, logger)
// 	dispatcherCtx, dispatcherCancel := context.WithCancel(context.Background())
// 	go dispatcher.Start(dispatcherCtx)
// 	logger.Info("notification dispatcher started")






// 	// Transport service.
// 	transportService := transport.NewService(db, logger, notificationService)

// 	router := httpserver.NewRouter(httpserver.Dependencies{
// 		Logger:           logger,
// 		DB:               db,
// 		Config:           cfg,
// 		SMSProvider:      smsProvider,
// 		EmailProvider:    emailProvider,
// 		AuthService:      authService,
// 		JWTAuthenticator: identityAuth,
// 		JWTIssuer:        jwtIssuer,
// 		OrgService:       orgService,
// 		TransportService: transportService,
// 		NotificationService: notificationService,
// 	})

// 	srv := &http.Server{
// 		Addr:              cfg.HTTPAddr,
// 		Handler:           router,
// 		ReadHeaderTimeout: 10 * time.Second,
// 		ReadTimeout:       30 * time.Second,
// 		WriteTimeout:      30 * time.Second,
// 		IdleTimeout:       60 * time.Second,
// 	}

// 	serverErrors := make(chan error, 1)
// 	go func() {
// 		logger.Info("http server listening", "addr", cfg.HTTPAddr)
// 		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
// 			serverErrors <- err
// 		}
// 	}()

// 	shutdown := make(chan os.Signal, 1)
// 	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

// 	select {
// 	case err := <-serverErrors:
// 		logger.Error("server error", "error", err)
// 		os.Exit(1)
// 	// case sig := <-shutdown:
// 	// 	logger.Info("shutdown signal received", "signal", sig.String())

// 	// 	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
// 	// 	defer cancel()

// 	// 	if err := srv.Shutdown(ctx); err != nil {


// 		case sig := <-shutdown:
// 		logger.Info("shutdown signal received", "signal", sig.String())

// 		// Stop the dispatcher first — it needs to finish current batch
// 		// and stop polling.
// 		logger.Info("stopping notification dispatcher")
// 		dispatcherCancel()
// 		dispatcher.Stop()
// 		logger.Info("notification dispatcher stopped")

// 		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
// 		defer cancel()

// 		if err := srv.Shutdown(ctx); err != nil {
// 			logger.Error("graceful shutdown failed", "error", err)
// 			_ = srv.Close()
// 			os.Exit(1)
// 		}
// 		logger.Info("server stopped cleanly")
// 	}
// }


























































// package main

// import (
// 	"context"
// 	"errors"
// 	"log/slog"
// 	"net/http"
// 	"os"
// 	"os/signal"
// 	"syscall"
// 	"time"

// 	"github.com/elbermarket/api/internal/auth"
// 	"github.com/elbermarket/api/internal/organisation"
// 	"github.com/elbermarket/api/internal/platform/config"
// 	"github.com/elbermarket/api/internal/platform/database"
// 	"github.com/elbermarket/api/internal/platform/email"
// 	"github.com/elbermarket/api/internal/platform/httpserver"
// 	"github.com/elbermarket/api/internal/platform/jwt"
// 	"github.com/elbermarket/api/internal/platform/logging"
// 	"github.com/elbermarket/api/internal/platform/sms"
// 	"github.com/elbermarket/api/internal/transport"
// 	"github.com/elbermarket/api/internal/notifications"
// 	"github.com/elbermarket/api/internal/documents"
// 	"github.com/elbermarket/api/internal/verification"
// )

// func main() {
// 	cfg, err := config.Load()
// 	if err != nil {
// 		panic("config load failed: " + err.Error())
// 	}

// 	logger := logging.New(cfg.Environment, cfg.LogLevel)
// 	slog.SetDefault(logger)

// 	logger.Info("starting elber-market api",
// 		"environment", cfg.Environment,
// 		"version", cfg.Version,
// 	)

// 	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
// 	defer cancel()

// 	db, err := database.Connect(ctx, cfg.DatabaseURL)
// 	if err != nil {
// 		logger.Error("database connection failed", "error", err)
// 		os.Exit(1)
// 	}
// 	defer db.Close()

// 	logger.Info("database connection established")

// 	// SMS provider.
// 	smsProvider, err := sms.NewProvider(sms.Config{
// 		Provider:         cfg.SMSProvider,
// 		Environment:      cfg.Environment,
// 		TermiiAPIKey:     cfg.TermiiAPIKey,
// 		TermiiSenderID:   cfg.TermiiSenderID,
// 		TermiiBaseURL:    cfg.TermiiBaseURL,
// 		TwilioAccountSID: cfg.TwilioAccountSID,
// 		TwilioAuthToken:  cfg.TwilioAuthToken,
// 		TwilioFromNumber: cfg.TwilioFromNumber,
// 	}, logger)
// 	if err != nil {
// 		logger.Error("sms provider init failed", "error", err)
// 		os.Exit(1)
// 	}

// 	// Email provider.
// 	emailProvider, err := email.NewProvider(email.Config{
// 		Provider:        cfg.EmailProvider,
// 		Environment:     cfg.Environment,
// 		ResendAPIKey:    cfg.ResendAPIKey,
// 		ResendFromEmail: cfg.ResendFromEmail,
// 		ResendFromName:  cfg.ResendFromName,
// 	}, logger)
// 	if err != nil {
// 		logger.Error("email provider init failed", "error", err)
// 		os.Exit(1)
// 	}

// 	// JWT issuer.
// 	jwtIssuer := jwt.NewIssuer(cfg.JWTSecret, time.Duration(cfg.JWTAccessTTL)*time.Second)

// 	// OTP engine.
// 	otpEngine := auth.NewOTPEngine(db, smsProvider, emailProvider, logger)

// 	// Auth service.
// 	authService := auth.NewService(db, otpEngine, jwtIssuer, smsProvider, emailProvider, logger)

// 	// Real authenticator, wrapped by the identity adapter.
// 	realAuth := auth.NewAuthenticator(db, jwtIssuer)
// 	identityAuth := auth.NewIdentityAdapter(realAuth)

// 	// Organisation service.
// 	orgService := organisation.NewService(db, logger)

// 	// Transport service.
// 	// transportService := transport.NewService(db, logger)

// 		// Notification service.
// 	notificationService := notifications.NewService(db, logger)


// 	// Start the notification dispatcher.
// 	dispatcher := notifications.NewDispatcher(db, emailProvider, logger)
// 	dispatcherCtx, dispatcherCancel := context.WithCancel(context.Background())
// 	go dispatcher.Start(dispatcherCtx)
// 	logger.Info("notification dispatcher started")






// 	// Transport service.
// 	transportService := transport.NewService(db, logger, notificationService)

// 	router := httpserver.NewRouter(httpserver.Dependencies{
// 		Logger:           logger,
// 		DB:               db,
// 		Config:           cfg,
// 		SMSProvider:      smsProvider,
// 		EmailProvider:    emailProvider,
// 		AuthService:      authService,
// 		JWTAuthenticator: identityAuth,
// 		JWTIssuer:        jwtIssuer,
// 		OrgService:       orgService,
// 		TransportService: transportService,
// 		NotificationService: notificationService,
// 	})

// 	srv := &http.Server{
// 		Addr:              cfg.HTTPAddr,
// 		Handler:           router,
// 		ReadHeaderTimeout: 10 * time.Second,
// 		ReadTimeout:       30 * time.Second,
// 		WriteTimeout:      30 * time.Second,
// 		IdleTimeout:       60 * time.Second,
// 	}

// 	serverErrors := make(chan error, 1)
// 	go func() {
// 		logger.Info("http server listening", "addr", cfg.HTTPAddr)
// 		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
// 			serverErrors <- err
// 		}
// 	}()

// 	shutdown := make(chan os.Signal, 1)
// 	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

// 	select {
// 	case err := <-serverErrors:
// 		logger.Error("server error", "error", err)
// 		os.Exit(1)
// 	// case sig := <-shutdown:
// 	// 	logger.Info("shutdown signal received", "signal", sig.String())

// 	// 	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
// 	// 	defer cancel()

// 	// 	if err := srv.Shutdown(ctx); err != nil {


// 		case sig := <-shutdown:
// 		logger.Info("shutdown signal received", "signal", sig.String())

// 		// Stop the dispatcher first — it needs to finish current batch
// 		// and stop polling.
// 		logger.Info("stopping notification dispatcher")
// 		dispatcherCancel()
// 		dispatcher.Stop()
// 		logger.Info("notification dispatcher stopped")

// 		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
// 		defer cancel()

// 		if err := srv.Shutdown(ctx); err != nil {
// 			logger.Error("graceful shutdown failed", "error", err)
// 			_ = srv.Close()
// 			os.Exit(1)
// 		}
// 		logger.Info("server stopped cleanly")
// 	}
// }