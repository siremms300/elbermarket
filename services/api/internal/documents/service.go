package documents

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
)

// AllowedUploadTypes are the file types accepted for upload. Every upload
// must declare a Content-Type from this list.
var AllowedUploadTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/webp":      true,
	"application/pdf": true,
}

// MaxFileSizeBytes is the maximum permitted document size (20 MB).
const MaxFileSizeBytes = 20 * 1024 * 1024

// Upload URL TTL.
const UploadURLTTL = 15 * time.Minute
const DownloadURLTTL = time.Hour

// Service manages the document lifecycle.
type Service struct {
	db     *pgxpool.Pool
	store  Store
	logger *slog.Logger
}

func NewService(db *pgxpool.Pool, store Store, logger *slog.Logger) *Service {
	return &Service{db: db, store: store, logger: logger}
}

// RequestUploadInput is the payload for requesting an upload URL.
type RequestUploadInput struct {
	UserID      string
	OwnerType   string // 'user' | 'organisation' | 'transport_request' | ...
	OwnerID     string
	DocumentType string // 'national_id' | 'cac_certificate' | ...
	ContentType string
	FileSizeBytes int64
	Filename    string
}

// RequestUploadResult is the response.
type RequestUploadResult struct {
	DocumentID string       `json:"document_id"`
	StorageKey string       `json:"storage_key"`
	Upload     *UploadTarget `json:"upload"`
}

// RequestUpload creates a document row in 'pending_upload' state and
// returns a presigned URL the client uses to upload the file. Once the
// upload succeeds, the client calls ConfirmUpload to finalize the row.
func (s *Service) RequestUpload(ctx context.Context, input RequestUploadInput) (*RequestUploadResult, error) {
	// Validate
	if !AllowedUploadTypes[input.ContentType] {
		return nil, fmt.Errorf("content_type %q is not allowed", input.ContentType)
	}
	if input.FileSizeBytes <= 0 || input.FileSizeBytes > MaxFileSizeBytes {
		return nil, fmt.Errorf("file size must be between 1 and %d bytes", MaxFileSizeBytes)
	}
	if !isValidOwnerType(input.OwnerType) {
		return nil, fmt.Errorf("invalid owner_type: %s", input.OwnerType)
	}

	// Generate a unique storage key. Structure: owner_type/owner_id/document_id.ext
	docID := uuid.NewString()
	ext := extensionForContentType(input.ContentType)
	storageKey := fmt.Sprintf("%s/%s/%s%s", input.OwnerType, input.OwnerID, docID, ext)

	// Request presigned URL
	target, err := s.store.GenerateUploadURL(ctx, storageKey, input.ContentType, UploadURLTTL)
	if err != nil {
		return nil, fmt.Errorf("generate upload url: %w", err)
	}

	// Insert the document row in 'pending_upload' state
	_, err = s.db.Exec(ctx, `
		INSERT INTO elber.documents (
			id, owner_type, owner_id, document_type,
			storage_key, content_type, file_size_bytes,
			original_filename, uploaded_by_user_id,
			access_classification
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9,
			'private'
		)
	`, docID, input.OwnerType, input.OwnerID, input.DocumentType,
		storageKey, input.ContentType, input.FileSizeBytes,
		nullIfEmpty(input.Filename), input.UserID)
	if err != nil {
		return nil, fmt.Errorf("insert document: %w", err)
	}

	return &RequestUploadResult{
		DocumentID: docID,
		StorageKey: storageKey,
		Upload:     target,
	}, nil
}

// ConfirmUpload marks a document as uploaded. Called after the client
// successfully uploads to the presigned URL.
//
// The caller must own the document (same user_id who requested the upload).
func (s *Service) ConfirmUpload(ctx context.Context, userID, documentID string) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE elber.documents
		SET updated_at = NOW()
		WHERE id = $1 AND uploaded_by_user_id = $2
	`, documentID, userID)
	if err != nil {
		return fmt.Errorf("confirm upload: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("document not found or not owned by user")
	}
	return nil
}

// GetDownloadURL returns a presigned download URL for the document.
// Verifies the caller has access (owner or admin — admin check is deferred
// to Phase 2 when the admin console exists; for now only the owner).
func (s *Service) GetDownloadURL(ctx context.Context, userID, documentID string) (string, error) {
	var storageKey string
	var uploadedBy *string
	err := s.db.QueryRow(ctx, `
		SELECT storage_key, uploaded_by_user_id
		FROM elber.documents
		WHERE id = $1
	`, documentID).Scan(&storageKey, &uploadedBy)
	if err != nil {
		return "", fmt.Errorf("load document: %w", err)
	}

	if uploadedBy == nil || *uploadedBy != userID {
		return "", fmt.Errorf("not authorized to access this document")
	}

	return s.store.GenerateDownloadURL(ctx, storageKey, DownloadURLTTL)
}

// GetDocument returns the full document metadata. Used by the verification
// service to look up details.
func (s *Service) GetDocument(ctx context.Context, documentID string) (*Document, error) {
	var d Document
	err := s.db.QueryRow(ctx, `
		SELECT id, owner_type, owner_id, document_type,
		       storage_key, content_type, file_size_bytes,
		       original_filename, uploaded_by_user_id,
		       access_classification, created_at
		FROM elber.documents
		WHERE id = $1
	`, documentID).Scan(
		&d.ID, &d.OwnerType, &d.OwnerID, &d.DocumentType,
		&d.StorageKey, &d.ContentType, &d.FileSizeBytes,
		&d.OriginalFilename, &d.UploadedByUserID,
		&d.AccessClassification, &d.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("load document: %w", err)
	}
	return &d, nil
}

// Document is the API-facing view.
type Document struct {
	ID                   string    `json:"id"`
	OwnerType            string    `json:"owner_type"`
	OwnerID              string    `json:"owner_id"`
	DocumentType         string    `json:"document_type"`
	StorageKey           string    `json:"-"`
	ContentType          string    `json:"content_type"`
	FileSizeBytes        int64     `json:"file_size_bytes"`
	OriginalFilename     *string   `json:"original_filename,omitempty"`
	UploadedByUserID     *string   `json:"uploaded_by_user_id,omitempty"`
	AccessClassification string    `json:"access_classification"`
	CreatedAt            time.Time `json:"created_at"`
}

// ─── Helpers ────────────────────────────────────────────────────────────

func isValidOwnerType(t string) bool {
	switch t {
	case "user", "organisation", "transport_request", "transport_claim",
		"insurance_claim", "verification_case", "inspection":
		return true
	}
	return false
}

func extensionForContentType(ct string) string {
	switch ct {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "application/pdf":
		return ".pdf"
	}
	return ""
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

// generateRandomKey generates a random hex string for unique identifiers
// where needed.
func generateRandomKey(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

var _ = generateRandomKey // reserved for future use (e.g., signed tokens)