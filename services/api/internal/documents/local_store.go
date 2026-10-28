// Local filesystem storage. Development only.

package documents

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// LocalStore is a development-only store that saves files to the local
// filesystem. It is NOT used in production — the NewStore function refuses
// to return a LocalStore when environment is production.
//
// Presigned URLs are not real for local storage. Instead, we return
// URLs pointing to the API itself (`/dev-upload/{key}`) which accept
// uploads and serve files back. This lets the mobile dev flow work
// without needing real R2 credentials.

type LocalStore struct {
	root string
}

func NewLocalStore(root string) (*LocalStore, error) {
	if root == "" {
		root = "/tmp/elbermarket-documents"
	}
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, fmt.Errorf("mkdir local store: %w", err)
	}
	return &LocalStore{root: root}, nil
}

// For local, the "presigned URL" points to a dev-only API endpoint that
// accepts direct PUTs. Not for production.
func (s *LocalStore) GenerateUploadURL(ctx context.Context, storageKey, contentType string, ttl time.Duration) (*UploadTarget, error) {
	return &UploadTarget{
		URL:    fmt.Sprintf("/dev-upload/%s", storageKey),
		Method: "PUT",
		Headers: map[string]string{
			"Content-Type": contentType,
		},
	}, nil
}

func (s *LocalStore) GenerateDownloadURL(ctx context.Context, storageKey string, ttl time.Duration) (string, error) {
	return fmt.Sprintf("/dev-download/%s", storageKey), nil
}

func (s *LocalStore) Delete(ctx context.Context, storageKey string) error {
	return os.Remove(filepath.Join(s.root, storageKey))
}

func (s *LocalStore) HealthCheck(ctx context.Context) error {
	// Try writing a probe file
	probe := filepath.Join(s.root, ".health")
	if err := os.WriteFile(probe, []byte("ok"), 0644); err != nil {
		return fmt.Errorf("write probe: %w", err)
	}
	os.Remove(probe)
	return nil
}

// Path returns the filesystem path for a storage key (used by the
// dev-upload and dev-download handlers).
func (s *LocalStore) Path(storageKey string) string {
	return filepath.Join(s.root, storageKey)
}