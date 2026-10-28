// HTTP handlers for the organisation package.

package organisation

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/elbermarket/api/internal/platform/apierror"
	"github.com/elbermarket/api/internal/platform/validation"
)

// Handlers wraps the service.
type Handlers struct {
	svc *Service
}

// NewHandlers constructs the handlers.
func NewHandlers(svc *Service) *Handlers {
	return &Handlers{svc: svc}
}

// ─── Create ─────────────────────────────────────────────────────────────

type createRequest struct {
	LegalName        string `json:"legal_name"`
	TradingName      string `json:"trading_name"`
	OrganisationType string `json:"organisation_type"`
	PrimaryPhone     string `json:"primary_phone"`
	PrimaryEmail     string `json:"primary_email"`

	LocationName string `json:"location_name"`
	AddressLine  string `json:"address_line"`
	Locality     string `json:"locality"`
	State        string `json:"state"`
}

func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	if userID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	var req createRequest
	if err := decodeJSON(r, &req); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "legal_name", req.LegalName, 2, 200)
	validation.OptionalString(&errs, "trading_name", req.TradingName, 0, 200)
	validation.OneOf(&errs, "organisation_type", req.OrganisationType, AllOrganisationTypes()...)
	validation.OptionalString(&errs, "primary_phone", req.PrimaryPhone, 0, 20)
	validation.OptionalString(&errs, "primary_email", req.PrimaryEmail, 0, 254)
	validation.RequiredString(&errs, "location_name", req.LocationName, 1, 200)
	validation.OptionalString(&errs, "address_line", req.AddressLine, 0, 300)
	validation.OptionalString(&errs, "locality", req.Locality, 0, 100)
	validation.OptionalString(&errs, "state", req.State, 0, 100)
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	result, err := h.svc.Create(r.Context(), userID, CreateInput{
		LegalName:        req.LegalName,
		TradingName:      req.TradingName,
		OrganisationType: req.OrganisationType,
		PrimaryPhone:     req.PrimaryPhone,
		PrimaryEmail:     req.PrimaryEmail,
		LocationName:     req.LocationName,
		AddressLine:      req.AddressLine,
		Locality:         req.Locality,
		State:            req.State,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidType):
			apierror.WriteError(w, r, apierror.Validation(
				"Invalid organisation type.",
				apierror.Detail{Field: "organisation_type", Code: "invalid", Message: "Must be one of the allowed types."},
			))
		case errors.Is(err, ErrDuplicateName):
			apierror.WriteError(w, r, apierror.Conflict(
				apierror.CodeConflict,
				"You already have a business with this name.",
			))
		default:
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

// ─── List ───────────────────────────────────────────────────────────────

func (h *Handlers) ListMine(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	if userID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	orgs, err := h.svc.ListForUser(r.Context(), userID)
	if err != nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"organisations": orgs})
}

// ─── Get one ────────────────────────────────────────────────────────────

func (h *Handlers) GetOne(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	orgID := chi.URLParam(r, "id")
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	result, err := h.svc.GetForUser(r.Context(), userID, orgID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			apierror.WriteError(w, r, apierror.NotFound("Organisation not found."))
			return
		}
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// ─── Types ──────────────────────────────────────────────────────────────

func (h *Handlers) ListTypes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"types": AllOrganisationTypes(),
	})
}

// ─── Context helper ─────────────────────────────────────────────────────
//
// The user ID comes from the identity middleware. Handlers never read it
// from the request body or query params.

type userCtxKey struct{}

// WithUserID attaches the authenticated user ID to the context. Called by
// middleware after authentication.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userCtxKey{}, userID)
}

func userIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(userCtxKey{}).(string)
	return id
}

// ─── Utilities ──────────────────────────────────────────────────────────

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