package verification

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

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

// ListTiers handles GET /api/v1/verification/tiers
func (h *Handlers) ListTiers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"tiers": TierRequirements(),
	})
}

// Submit handles POST /api/v1/organisations/{id}/verification
func (h *Handlers) Submit(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	orgID := chi.URLParam(r, "id")
	if user == nil || orgID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	var payload struct {
		RequestedTier string   `json:"requested_tier"`
		DocumentIDs   []string `json:"document_ids"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "requested_tier", payload.RequestedTier, 2, 50)
	validation.OneOf(&errs, "requested_tier", payload.RequestedTier, "basic", "business", "fleet_owner")
	if len(payload.DocumentIDs) == 0 {
		errs.Add("document_ids", "required", "At least one document is required.")
	}
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	result, err := h.svc.Submit(r.Context(), SubmitInput{
		UserID:         user.ID,
		OrganisationID: orgID,
		RequestedTier:  payload.RequestedTier,
		DocumentIDs:    payload.DocumentIDs,
	})
	if err != nil {
		switch {
		case strings.Contains(err.Error(), "not a member"):
			apierror.WriteError(w, r, apierror.Forbidden("Not a member of this organisation."))
		case strings.Contains(err.Error(), "invalid tier"):
			apierror.WriteError(w, r, apierror.Validation(
				"Invalid tier.",
				apierror.Detail{Field: "requested_tier", Code: "invalid", Message: "Must be basic, business, or fleet_owner."},
			))
		case strings.Contains(err.Error(), "already pending"):
			apierror.WriteError(w, r, apierror.Conflict(
				apierror.CodeConflict,
				"A verification case is already pending for this organisation.",
			))
		case strings.Contains(err.Error(), "missing required documents"):
			apierror.WriteError(w, r, apierror.Validation(
				err.Error(),
				apierror.Detail{Field: "document_ids", Code: "missing", Message: err.Error()},
			))
		default:
			h.svc.logger.Error("verification submit failed", "error", err)
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// GetStatus handles GET /api/v1/organisations/{id}/verification
func (h *Handlers) GetStatus(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	orgID := chi.URLParam(r, "id")
	if user == nil || orgID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	result, err := h.svc.GetStatus(r.Context(), user.ID, orgID)
	if err != nil {
		if strings.Contains(err.Error(), "not a member") {
			apierror.WriteError(w, r, apierror.Forbidden("Not a member of this organisation."))
			return
		}
		h.svc.logger.Error("verification status failed", "error", err)
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// AdminDecide handles POST /api/v1/admin/verification/{id}/decide
//
// NOTE: staff-only authorization is a Phase 2 concern. For Phase 1, this
// endpoint exists but is not mounted on the router (no admin console yet).
// When the admin web app is built, this endpoint gets wired with a
// `staff.verification.decide` permission check.
func (h *Handlers) AdminDecide(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	caseID := chi.URLParam(r, "id")
	if user == nil || caseID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	var payload struct {
		Decision string `json:"decision"`
		Reason   string `json:"reason"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.OneOf(&errs, "decision", payload.Decision, "approved", "rejected", "more_info")
	validation.RequiredString(&errs, "reason", payload.Reason, 5, 1000)
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	if err := h.svc.Decide(r.Context(), DecideInput{
		StaffUserID: user.ID,
		CaseID:      caseID,
		Decision:    payload.Decision,
		Reason:      payload.Reason,
	}); err != nil {
		h.svc.logger.Error("admin decide failed", "error", err)
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	w.WriteHeader(http.StatusNoContent)
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