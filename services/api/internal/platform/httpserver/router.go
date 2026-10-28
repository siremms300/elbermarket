 package httpserver

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"

	"github.com/elbermarket/api/internal/auth"
	"github.com/elbermarket/api/internal/documents"
	"github.com/elbermarket/api/internal/identity"
	"github.com/elbermarket/api/internal/notifications"
	"github.com/elbermarket/api/internal/organisation"
	"github.com/elbermarket/api/internal/platform/config"
	"github.com/elbermarket/api/internal/platform/email"
	"github.com/elbermarket/api/internal/platform/jwt"
	"github.com/elbermarket/api/internal/platform/sms"
	"github.com/elbermarket/api/internal/transport"
	"github.com/elbermarket/api/internal/verification"
	"github.com/elbermarket/api/internal/fleet"
)

type Dependencies struct {
	Logger *slog.Logger
	DB     *pgxpool.Pool
	Config *config.Config

	SMSProvider   sms.Provider
	EmailProvider email.Provider

	AuthService      *auth.Service
	JWTAuthenticator *auth.IdentityAdapter
	JWTIssuer        *jwt.Issuer

	OrgService *organisation.Service

	TransportService    *transport.Service
	NotificationService *notifications.Service

	DocumentService     *documents.Service
	VerificationService *verification.Service

	FleetService *fleet.Service
}

func NewRouter(deps Dependencies) http.Handler {
	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
			"http://localhost:8081",
			"http://localhost:19006",
			"http://localhost:3000",
			"http://127.0.0.1:8081",
			"http://127.0.0.1:19006",
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-Id", "X-Real-IP", "X-Organisation-Id"},
		ExposedHeaders:   []string{"X-Request-Id"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(RequestLogger(deps.Logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/healthz", HealthHandler(deps))
	r.Get("/readyz", ReadinessHandler(deps))

	authHandlers := auth.NewHandlers(deps.AuthService)
	orgHandlers := organisation.NewHandlers(deps.OrgService)
	transportHandlers := transport.NewHandlers(deps.TransportService)
	notificationHandlers := notifications.NewHandlers(deps.NotificationService)
	documentHandlers := documents.NewHandlers(deps.DocumentService)
	verificationHandlers := verification.NewHandlers(deps.VerificationService)
	fleetHandlers := fleet.NewHandlers(deps.FleetService)



	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{
				"service": "elber-market-api",
				"version": deps.Config.Version,
				"status":  "ok",
			})
		})

		// ─── Public auth endpoints ────────────────────────────────────
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", authHandlers.Register)
			r.Post("/register/verify", authHandlers.RegisterVerify)
			r.Post("/signin", authHandlers.SignIn)
			r.Post("/signin/verify", authHandlers.SignInVerify)
			r.Post("/refresh", authHandlers.Refresh)
		})

		// ─── Public: organisation types ───────────────────────────────
		r.Get("/organisations/types", orgHandlers.ListTypes)

		// ─── Public: verification tiers (for tier picker) ─────────────
		r.Get("/verification/tiers", verificationHandlers.ListTiers)

		// ─── Authenticated routes ─────────────────────────────────────
		r.Group(func(r chi.Router) {
			r.Use(identity.RequireAuthentication(deps.JWTAuthenticator))
			r.Use(auth.AttachSession(deps.JWTIssuer))

			// Auth
			r.Get("/me", identity.MeHandler)
			r.Post("/auth/signout", authHandlers.SignOut)
			r.Get("/auth/sessions", authHandlers.ListSessions)
			r.Delete("/auth/sessions/{id}", authHandlers.RevokeSession)

			// Notifications
			r.Route("/notifications", func(r chi.Router) {
				r.Get("/", notificationHandlers.List)
				r.Get("/unread-count", notificationHandlers.UnreadCount)
				r.Post("/{id}/read", notificationHandlers.MarkRead)
			})

			// Organisations
			r.Post("/organisations", orgHandlers.Create)
			r.Get("/me/organisations", orgHandlers.ListMine)
			r.Get("/organisations/{id}", orgHandlers.GetOne)

			// Documents
			r.Route("/documents", func(r chi.Router) {
				r.Post("/upload-url", documentHandlers.RequestUpload)
				r.Post("/{id}/confirm", documentHandlers.ConfirmUpload)
				r.Get("/{id}/url", documentHandlers.GetDownloadURL)
			})

			// Verification (submission + status per organisation)
			r.Post("/organisations/{id}/verification", verificationHandlers.Submit)
			r.Get("/organisations/{id}/verification", verificationHandlers.GetStatus)

			// Transport — requires org context
			r.Route("/transport-requests", func(r chi.Router) {
				r.Use(OrganisationContext(deps.DB))
				r.Get("/", transportHandlers.List)
				r.Post("/", transportHandlers.Create)
				r.Get("/summary", transportHandlers.Summary)
				r.Get("/{id}", transportHandlers.Get)
			})


			// Fleet — requires org context
			r.Route("/vehicles", func(r chi.Router) {
				r.Use(OrganisationContext(deps.DB))
				r.Get("/", fleetHandlers.ListVehicles)
				r.Post("/", fleetHandlers.CreateVehicle)
				r.Get("/{id}", fleetHandlers.GetVehicle)
				r.Patch("/{id}", fleetHandlers.UpdateVehicle)
				r.Delete("/{id}", fleetHandlers.DeleteVehicle)
			})

			r.Route("/drivers", func(r chi.Router) {
				r.Use(OrganisationContext(deps.DB))
				r.Get("/", fleetHandlers.ListDrivers)
				r.Post("/", fleetHandlers.CreateDriver)
			})




		})
	})

	return r
}















































































// package httpserver

// import (
// 	"net/http"
// 	"time"

// 	"github.com/go-chi/chi/v5"
// 	"github.com/go-chi/chi/v5/middleware"
// 	"github.com/go-chi/cors"
// 	"github.com/jackc/pgx/v5/pgxpool"
// 	"log/slog"

// 	"github.com/elbermarket/api/internal/auth"
// 	"github.com/elbermarket/api/internal/identity"
// 	"github.com/elbermarket/api/internal/organisation"
// 	"github.com/elbermarket/api/internal/platform/config"
// 	"github.com/elbermarket/api/internal/platform/email"
// 	"github.com/elbermarket/api/internal/platform/jwt"
// 	"github.com/elbermarket/api/internal/platform/sms"
// 	"github.com/elbermarket/api/internal/transport"
// 	"github.com/elbermarket/api/internal/notifications"
// 	"github.com/elbermarket/api/internal/documents"
// 	"github.com/elbermarket/api/internal/verification"
// )

// type Dependencies struct {
// 	Logger *slog.Logger
// 	DB     *pgxpool.Pool
// 	Config *config.Config

// 	SMSProvider   sms.Provider
// 	EmailProvider email.Provider

// 	AuthService      *auth.Service
// 	JWTAuthenticator *auth.IdentityAdapter
// 	JWTIssuer        *jwt.Issuer

// 	OrgService *organisation.Service

// 	TransportService *transport.Service 
// 	NotificationService *notifications.Service

// 	DocumentService *documents.Service
// 	VerificationService *verification.Service
 
// }

// func NewRouter(deps Dependencies) http.Handler {
// 	r := chi.NewRouter()

// 	r.Use(cors.Handler(cors.Options{
// 		AllowedOrigins: []string{
// 			"http://localhost:8081",
// 			"http://localhost:19006",
// 			"http://localhost:3000",
// 			"http://127.0.0.1:8081",
// 			"http://127.0.0.1:19006",
// 		},
// 		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
// 		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-Id", "X-Real-IP", "X-Organisation-Id"},
// 		ExposedHeaders:   []string{"X-Request-Id"},
// 		AllowCredentials: false,
// 		MaxAge:           300,
// 	}))

// 	r.Use(middleware.RequestID)
// 	r.Use(middleware.RealIP)
// 	r.Use(RequestLogger(deps.Logger))
// 	r.Use(middleware.Recoverer)
// 	r.Use(middleware.Timeout(30 * time.Second))

// 	r.Get("/healthz", HealthHandler(deps))
// 	r.Get("/readyz", ReadinessHandler(deps))

// 	authHandlers := auth.NewHandlers(deps.AuthService)
// 	orgHandlers := organisation.NewHandlers(deps.OrgService)
// 	transportHandlers := transport.NewHandlers(deps.TransportService)
// 	notificationHandlers := notifications.NewHandlers(deps.NotificationService)

// 	r.Route("/api/v1", func(r chi.Router) {
// 		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
// 			writeJSON(w, http.StatusOK, map[string]any{
// 				"service": "elber-market-api",
// 				"version": deps.Config.Version,
// 				"status":  "ok",
// 			})
// 		})

// 		// Public auth endpoints.
// 		r.Route("/auth", func(r chi.Router) {
// 			r.Post("/register", authHandlers.Register)
// 			r.Post("/register/verify", authHandlers.RegisterVerify)
// 			r.Post("/signin", authHandlers.SignIn)
// 			r.Post("/signin/verify", authHandlers.SignInVerify)
// 			r.Post("/refresh", authHandlers.Refresh)
// 		})

// 		// Public: organisation types.
// 		r.Get("/organisations/types", orgHandlers.ListTypes)

// 		// Authenticated.
// 		r.Group(func(r chi.Router) {
// 			r.Use(identity.RequireAuthentication(deps.JWTAuthenticator))
// 			r.Use(auth.AttachSession(deps.JWTIssuer))

// 			// Auth
// 			r.Get("/me", identity.MeHandler)
// 			r.Post("/auth/signout", authHandlers.SignOut)
// 			r.Get("/auth/sessions", authHandlers.ListSessions)
// 			r.Delete("/auth/sessions/{id}", authHandlers.RevokeSession)


// 			// Notifications
// 			// notificationHandlers := notifications.NewHandlers(deps.NotificationService)
// 			r.Route("/notifications", func(r chi.Router) {
// 				r.Get("/", notificationHandlers.List)
// 				r.Get("/unread-count", notificationHandlers.UnreadCount)
// 				r.Post("/{id}/read", notificationHandlers.MarkRead)
// 			})

// 			// Organisations
// 			r.Post("/organisations", orgHandlers.Create)
// 			r.Get("/me/organisations", orgHandlers.ListMine)
// 			r.Get("/organisations/{id}", orgHandlers.GetOne)

			 

// 			// Transport — requires org context.
// 			// r.Route("/transport-requests", func(r chi.Router) {
// 			// 	r.Use(OrganisationContext(deps.DB))
// 			// 	r.Get("/", transportHandlers.List)
// 			// 	r.Post("/", transportHandlers.Create)
// 			// 	r.Get("/{id}", transportHandlers.Get)
// 			// })

// 			// Transport — requires org context.
// 			r.Route("/transport-requests", func(r chi.Router) {
// 				r.Use(OrganisationContext(deps.DB))
// 				r.Get("/", transportHandlers.List)
// 				r.Post("/", transportHandlers.Create)
// 				r.Get("/summary", transportHandlers.Summary)  // before /{id}
// 				r.Get("/{id}", transportHandlers.Get)
// 			})

// 			// After existing routes, add:

// 			// Documents
// 			documentHandlers := documents.NewHandlers(deps.DocumentService)
// 			r.Route("/documents", func(r chi.Router) {
// 				r.Post("/upload-url", documentHandlers.RequestUpload)
// 				r.Post("/{id}/confirm", documentHandlers.ConfirmUpload)
// 				r.Get("/{id}/url", documentHandlers.GetDownloadURL)
// 			})

// 			// Verification
// 			verificationHandlers := verification.NewHandlers(deps.VerificationService)
// 			r.Route("/verification", func(r chi.Router) {
// 				r.Get("/tiers", verificationHandlers.ListTiers)
// 			})
// 			r.Post("/organisations/{id}/verification", verificationHandlers.Submit)
// 			r.Get("/organisations/{id}/verification", verificationHandlers.GetStatus)
// 		})
// 	})

// 	return r
// }

























































// package httpserver

// import (
// 	"net/http"
// 	"time"

// 	"github.com/go-chi/chi/v5"
// 	"github.com/go-chi/chi/v5/middleware"
// 	"github.com/go-chi/cors"
// 	"github.com/jackc/pgx/v5/pgxpool"
// 	"log/slog"

// 	"github.com/elbermarket/api/internal/auth"
// 	"github.com/elbermarket/api/internal/identity"
// 	"github.com/elbermarket/api/internal/organisation"
// 	"github.com/elbermarket/api/internal/platform/config"
// 	"github.com/elbermarket/api/internal/platform/email"
// 	"github.com/elbermarket/api/internal/platform/jwt"
// 	"github.com/elbermarket/api/internal/platform/sms"
// 	"github.com/elbermarket/api/internal/transport"
// )

// type Dependencies struct {
// 	Logger *slog.Logger
// 	DB     *pgxpool.Pool
// 	Config *config.Config

// 	// Providers
// 	SMSProvider   sms.Provider
// 	EmailProvider email.Provider

// 	// Auth
// 	AuthService      *auth.Service
// 	JWTAuthenticator *auth.IdentityAdapter
// 	JWTIssuer        *jwt.Issuer

// 	// Organisation
// 	OrgService *organisation.Service

// 	// Transport
// 	TransportService *transport.Service
// }

// func NewRouter(deps Dependencies) http.Handler {
// 	r := chi.NewRouter()

// 	// CORS
// 	r.Use(cors.Handler(cors.Options{
// 		AllowedOrigins: []string{
// 			"http://localhost:8081",
// 			"http://localhost:19006",
// 			"http://localhost:3000",
// 			"http://127.0.0.1:8081",
// 			"http://127.0.0.1:19006",
// 		},
// 		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
// 		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-Id", "X-Real-IP", "X-Organisation-Id"},
// 		ExposedHeaders:   []string{"X-Request-Id"},
// 		AllowCredentials: false,
// 		MaxAge:           300,
// 	}))

// 	r.Use(middleware.RequestID)
// 	r.Use(middleware.RealIP)
// 	r.Use(RequestLogger(deps.Logger))
// 	r.Use(middleware.Recoverer)
// 	r.Use(middleware.Timeout(30 * time.Second))

// 	r.Get("/healthz", HealthHandler(deps))
// 	r.Get("/readyz", ReadinessHandler(deps))

// 	authHandlers := auth.NewHandlers(deps.AuthService)
// 	orgHandlers := organisation.NewHandlers(deps.OrgService)
// 	transportHandlers := transport.NewHandlers(deps.TransportService)

// 	r.Route("/api/v1", func(r chi.Router) {
// 		// Public.
// 		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
// 			writeJSON(w, http.StatusOK, map[string]any{
// 				"service": "elber-market-api",
// 				"version": deps.Config.Version,
// 				"status":  "ok",
// 			})
// 		})

// 		// Public: auth endpoints.
// 		r.Route("/auth", func(r chi.Router) {
// 			r.Post("/register", authHandlers.Register)
// 			r.Post("/register/verify", authHandlers.RegisterVerify)
// 			r.Post("/signin", authHandlers.SignIn)
// 			r.Post("/signin/verify", authHandlers.SignInVerify)
// 			r.Post("/refresh", authHandlers.Refresh)
// 		})

// 		// Public: organisation types (for the type picker).
// 		r.Get("/organisations/types", orgHandlers.ListTypes)

// 		// Authenticated.
// 		r.Group(func(r chi.Router) {
// 			r.Use(identity.RequireAuthentication(deps.JWTAuthenticator))
// 			r.Use(auth.AttachSession(deps.JWTIssuer))

// 			// Auth
// 			r.Get("/me", identity.MeHandler)
// 			r.Post("/auth/signout", authHandlers.SignOut)
// 			r.Get("/auth/sessions", authHandlers.ListSessions)
// 			r.Delete("/auth/sessions/{id}", authHandlers.RevokeSession)

// 			// Organisations
// 			r.Post("/organisations", orgHandlers.Create)
// 			r.Get("/me/organisations", orgHandlers.ListMine)
// 			r.Get("/organisations/{id}", orgHandlers.GetOne)

// 			// Transport
// 			r.Route("/transport-requests", func(r chi.Router) {
// 				r.Post("/", transportHandlers.Create)
// 			})
// 		})
// 	})

// 	return r
// }




































// package httpserver

// import (
// 	"net/http"
// 	"time"

// 	"github.com/go-chi/chi/v5"
// 	"github.com/go-chi/chi/v5/middleware"
// 	"github.com/go-chi/cors"
// 	"github.com/jackc/pgx/v5/pgxpool"
// 	"log/slog"

// 	"github.com/elbermarket/api/internal/auth"
// 	"github.com/elbermarket/api/internal/identity"
// 	"github.com/elbermarket/api/internal/organisation"
// 	"github.com/elbermarket/api/internal/platform/config"
// 	"github.com/elbermarket/api/internal/platform/email"
// 	"github.com/elbermarket/api/internal/platform/jwt"
// 	"github.com/elbermarket/api/internal/platform/sms"
// 	"github.com/elbermarket/api/internal/transport"
// )

// type Dependencies struct {
// 	Logger *slog.Logger
// 	DB     *pgxpool.Pool
// 	Config *config.Config

// 	// Providers
// 	SMSProvider   sms.Provider
// 	EmailProvider email.Provider

// 	// Auth
// 	AuthService      *auth.Service
// 	JWTAuthenticator *auth.IdentityAdapter
// 	JWTIssuer        *jwt.Issuer

// 	// Organisation
// 	OrgService *organisation.Service
// 	TransportService *transport.Service
// }

// func NewRouter(deps Dependencies) http.Handler {
// 	r := chi.NewRouter()

// 	// CORS. Required for the mobile app in web mode and for the future web
// 	// app. In production this list is tightened to known origins.
// 	r.Use(cors.Handler(cors.Options{
// 		AllowedOrigins: []string{
// 			"http://localhost:8081",
// 			"http://localhost:19006",
// 			"http://localhost:3000",
// 			"http://127.0.0.1:8081",
// 			"http://127.0.0.1:19006",
// 		},
// 		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
// 		AllowedHeaders: []string{
// 			"Accept", "Authorization", "Content-Type", "X-Request-Id", "X-Real-IP",
// 		},
// 		ExposedHeaders:   []string{"X-Request-Id"},
// 		AllowCredentials: false,
// 		MaxAge:           300,
// 	}))

// 	r.Use(middleware.RequestID)
// 	r.Use(middleware.RealIP)
// 	r.Use(RequestLogger(deps.Logger))
// 	r.Use(middleware.Recoverer)
// 	r.Use(middleware.Timeout(30 * time.Second))

// 	r.Get("/healthz", HealthHandler(deps))
// 	r.Get("/readyz", ReadinessHandler(deps))

// 	authHandlers := auth.NewHandlers(deps.AuthService)
// 	transportHandlers := transport.NewHandlers(deps.TransportService)
// 	orgHandlers := organisation.NewHandlers(deps.OrgService)

// 	r.Route("/api/v1", func(r chi.Router) {
// 		// Public.
// 		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
// 			writeJSON(w, http.StatusOK, map[string]any{
// 				"service": "elber-market-api",
// 				"version": deps.Config.Version,
// 				"status":  "ok",
// 			})
// 		})

// 		// Public: auth endpoints.
// 		r.Route("/auth", func(r chi.Router) {
// 			r.Post("/register", authHandlers.Register)
// 			r.Post("/register/verify", authHandlers.RegisterVerify)
// 			r.Post("/signin", authHandlers.SignIn)
// 			r.Post("/signin/verify", authHandlers.SignInVerify)
// 			r.Post("/refresh", authHandlers.Refresh)
// 		})

// 		// Public: organisation types (for the type picker).
// 		r.Get("/organisations/types", orgHandlers.ListTypes)

// 		// Authenticated.
// 		r.Group(func(r chi.Router) {
// 			r.Use(identity.RequireAuthentication(deps.JWTAuthenticator))
// 			r.Use(auth.AttachSession(deps.JWTIssuer))

// 			// Auth
// 			r.Get("/me", identity.MeHandler)
// 			r.Post("/auth/signout", authHandlers.SignOut)
// 			r.Get("/auth/sessions", authHandlers.ListSessions)
// 			r.Delete("/auth/sessions/{id}", authHandlers.RevokeSession)

// 			// Organisations
// 			r.Post("/organisations", orgHandlers.Create)
// 			r.Get("/me/organisations", orgHandlers.ListMine)
// 			r.Get("/organisations/{id}", orgHandlers.GetOne)

// 			// Transport requests
// 			r.Route("/transport-requests", func(r chi.Router) {
// 				r.Post("/", transportHandlers.Create)
// 			})
// 		})
// 	})

// 	return r
// }