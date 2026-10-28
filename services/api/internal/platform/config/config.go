package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration. Every field must come from the
// environment. Nothing is hardcoded. This is what allows the same binary
// to run in local development, staging and production without modification.
type Config struct {
	Environment string
	Version     string
	HTTPAddr    string
	LogLevel    string
	DatabaseURL string
	RedisURL    string
	ResendAPIKey    string
	ResendFromEmail string
	ResendFromName  string

	// JWT configuration. The secret is used for HS256 signing in Phase 1.
	// In Phase 2 this will move to RSA keys (private + public) so that
	// verification can happen without access to signing key material.
	JWTSecret      string
	JWTAccessTTL   int // seconds
	JWTRefreshTTL  int // seconds

	// SMS configuration. Provider is either "termii", "twilio", or "stub".
	// Stub logs OTPs to the console and is used when no provider is
	// configured (development).
	SMSProvider       string
	TermiiAPIKey      string
	TermiiSenderID    string
	TermiiBaseURL     string
	TwilioAccountSID  string
	TwilioAuthToken   string
	TwilioFromNumber  string

	// Email configuration. Provider is either "stub" (logs to console) or
	// a provider name we'll add when a live sender is chosen. For Phase 1
	// only "stub" is implemented — email OTPs are logged to the console.
	EmailProvider string


	// Document storage (R2)
	DocumentStore       string
	R2AccountID         string
	R2AccessKeyID       string
	R2SecretAccessKey   string
	R2Bucket            string
}

func Load() (*Config, error) {
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")

	cfg := &Config{
		Environment: getEnv("ELBER_ENV", "development"),
		Version:     getEnv("ELBER_VERSION", "dev"),
		HTTPAddr:    getEnv("ELBER_HTTP_ADDR", ":8080"),
		LogLevel:    getEnv("ELBER_LOG_LEVEL", "info"),
		DatabaseURL: getEnv("ELBER_DATABASE_URL", ""),
		RedisURL:    getEnv("ELBER_REDIS_URL", ""),

		JWTSecret:     getEnv("ELBER_JWT_SECRET", ""),
		JWTAccessTTL:  getEnvInt("ELBER_JWT_ACCESS_TTL", 3600),       // 1 hour
		JWTRefreshTTL: getEnvInt("ELBER_JWT_REFRESH_TTL", 2592000),   // 30 days

		SMSProvider:      getEnv("ELBER_SMS_PROVIDER", "termii"),
		TermiiAPIKey:     getEnv("ELBER_TERMII_API_KEY", ""),
		TermiiSenderID:   getEnv("ELBER_TERMII_SENDER_ID", "ELBER"),
		TermiiBaseURL:    getEnv("ELBER_TERMII_BASE_URL", "https://v4.api.termii.com"),
		TwilioAccountSID: getEnv("ELBER_TWILIO_ACCOUNT_SID", ""),
		TwilioAuthToken:  getEnv("ELBER_TWILIO_AUTH_TOKEN", ""),
		TwilioFromNumber: getEnv("ELBER_TWILIO_FROM_NUMBER", ""),

		EmailProvider: getEnv("ELBER_EMAIL_PROVIDER", "resend"),
		ResendAPIKey:    getEnv("ELBER_RESEND_API_KEY", ""),
		ResendFromEmail: getEnv("ELBER_RESEND_FROM_EMAIL", "noreply@elbermarket.com"),
		ResendFromName:  getEnv("ELBER_RESEND_FROM_NAME", "ELBER MARKET"),
		
		DocumentStore:     getEnv("ELBER_DOCUMENT_STORE", "local"),
		R2AccountID:       getEnv("ELBER_R2_ACCOUNT_ID", ""),
		R2AccessKeyID:     getEnv("ELBER_R2_ACCESS_KEY_ID", ""),
		R2SecretAccessKey: getEnv("ELBER_R2_SECRET_ACCESS_KEY", ""),
		R2Bucket:          getEnv("ELBER_R2_BUCKET", "elbermarket-documents"),

	
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("ELBER_DATABASE_URL is required")
	}

	// In production the JWT secret is mandatory. In development a dev
	// default keeps local setup zero-friction without weakening production.
	if cfg.JWTSecret == "" {
		if cfg.Environment == "production" {
			return nil, fmt.Errorf("ELBER_JWT_SECRET is required in production")
		}
		cfg.JWTSecret = "dev-only-insecure-secret-change-in-production"
	}

	if len(cfg.JWTSecret) < 32 && cfg.Environment == "production" {
		return nil, fmt.Errorf("ELBER_JWT_SECRET must be at least 32 characters in production")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(value); err == nil {
			return n
		}
	}
	return fallback
}