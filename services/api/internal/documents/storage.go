// Package documents handles document storage and lifecycle.
//
// A DocumentStore abstracts where files live. Development uses a local
// filesystem for speed. Production uses Cloudflare R2 (S3-compatible).
//
// The store generates presigned URLs: the client uploads directly to
// R2 (via the upload URL) or downloads directly from R2 (via the download
// URL). The API never proxies bytes.

package documents

import (
	"context"
	"fmt"
	"time"
)

// UploadTarget is what the client needs to upload a file directly to
// storage. Contains the presigned URL and the fields/headers the client
// must include.
type UploadTarget struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

// Store abstracts the storage backend.
type Store interface {
	// GenerateUploadURL returns a presigned URL the client can PUT to
	// upload a file at the given storage key. The URL is valid for the
	// specified duration (typically 15 minutes).
	GenerateUploadURL(ctx context.Context, storageKey, contentType string, ttl time.Duration) (*UploadTarget, error)

	// GenerateDownloadURL returns a presigned URL the client can GET
	// to download a file at the given storage key. The URL is valid for
	// the specified duration (typically 1 hour).
	GenerateDownloadURL(ctx context.Context, storageKey string, ttl time.Duration) (string, error)

	// Delete removes a file. Used when an upload is abandoned or a
	// document is deleted.
	Delete(ctx context.Context, storageKey string) error

	// HealthCheck verifies the store is reachable. Called at startup.
	HealthCheck(ctx context.Context) error
}

// ─── Configuration ──────────────────────────────────────────────────────

// Config for storage.
type Config struct {
	Provider string // "local" or "r2"
	// R2 fields
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Bucket          string
	// Local fields
	LocalRoot string // filesystem path for local storage
}

// NewStore returns the configured storage backend. The "local" backend
// is development-only and refuses to start in production.
func NewStore(cfg Config, environment string) (Store, error) {
	switch cfg.Provider {
	case "local":
		if environment == "production" {
			return nil, fmt.Errorf("local document store cannot be used in production")
		}
		return NewLocalStore(cfg.LocalRoot)
	case "r2":
		return NewR2Store(cfg.R2AccountID, cfg.R2AccessKeyID, cfg.R2SecretAccessKey, cfg.R2Bucket)
	default:
		return nil, fmt.Errorf("unknown document store provider: %q", cfg.Provider)
	}
}