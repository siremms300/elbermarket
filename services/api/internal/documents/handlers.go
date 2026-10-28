package documents

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/elbermarket/api/internal/identity"
	"github.com/elbermarket/api/internal/platform/apierror"
	"github.com/elbermarket/api/internal/platform/validation"
)

type Handlers struct {
	svc *Service
}

func NewHandlers(svc *Service) *Handlers {
	return &Handlers{svc: svc}
}

// RequestUpload handles POST /api/v1/documents/upload-url
func (h *Handlers) RequestUpload(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	if user == nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	var payload struct {
		OwnerType     string `json:"owner_type"`
		OwnerID       string `json:"owner_id"`
		DocumentType  string `json:"document_type"`
		ContentType   string `json:"content_type"`
		FileSizeBytes int64  `json:"file_size_bytes"`
		Filename      string `json:"filename"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "owner_type", payload.OwnerType, 2, 50)
	validation.RequiredString(&errs, "owner_id", payload.OwnerID, 2, 100)
	validation.RequiredString(&errs, "document_type", payload.DocumentType, 2, 100)
	validation.RequiredString(&errs, "content_type", payload.ContentType, 3, 100)
	if payload.FileSizeBytes <= 0 {
		errs.Add("file_size_bytes", "invalid", "Must be greater than zero.")
	}
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	result, err := h.svc.RequestUpload(r.Context(), RequestUploadInput{
		UserID:        user.ID,
		OwnerType:     payload.OwnerType,
		OwnerID:       payload.OwnerID,
		DocumentType:  payload.DocumentType,
		ContentType:   payload.ContentType,
		FileSizeBytes: payload.FileSizeBytes,
		Filename:      payload.Filename,
	})
	if err != nil {
		h.svc.logger.Error("request upload failed", "error", err)
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// ConfirmUpload handles POST /api/v1/documents/{id}/confirm
func (h *Handlers) ConfirmUpload(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	docID := chi.URLParam(r, "id")
	if user == nil || docID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	if err := h.svc.ConfirmUpload(r.Context(), user.ID, docID); err != nil {
		h.svc.logger.Error("confirm upload failed", "error", err)
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetDownloadURL handles GET /api/v1/documents/{id}/url
func (h *Handlers) GetDownloadURL(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	docID := chi.URLParam(r, "id")
	if user == nil || docID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	url, err := h.svc.GetDownloadURL(r.Context(), user.ID, docID)
	if err != nil {
		if err.Error() == "not authorized to access this document" {
			apierror.WriteError(w, r, apierror.Forbidden("Not authorized."))
			return
		}
		apierror.WriteError(w, r, apierror.NotFound("Document not found."))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

// ─── Utilities ─────────────────────────────────────────────────────────

func decodeJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(dest)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}