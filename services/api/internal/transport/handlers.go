// HTTP handlers for the transport package.
//
// Thin layer. All business logic lives in the service. Handlers:
//   1. Parse and validate the request body
//   2. Extract the authenticated user and org
//   3. Call the service
//   4. Translate domain errors to apierror
//   5. Return JSON

package transport

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv" 
	"time"

	"github.com/go-chi/chi/v5" 
	"github.com/elbermarket/api/internal/platform/apierror"
	"github.com/elbermarket/api/internal/platform/validation"
	"github.com/elbermarket/api/internal/platform/authctx"
)

// Handlers wraps the transport service.
type Handlers struct {
	svc *Service
}

// NewHandlers constructs the handlers.
func NewHandlers(svc *Service) *Handlers {
	return &Handlers{svc: svc}
}

// ─── Create endpoint ────────────────────────────────────────────────────

type createRequestPayload struct {
	ExternalReference string `json:"external_reference,omitempty"`

	CargoDescription   string         `json:"cargo_description"`
	CargoDeclaredValue float64        `json:"cargo_declared_value"`
	CargoWeightKg      float64        `json:"cargo_weight_kg"`
	CargoVolumeM3      float64        `json:"cargo_volume_m3,omitempty"`
	HandlingRequirements map[string]any `json:"handling_requirements,omitempty"`

	PickupLocationID    string  `json:"pickup_location_id,omitempty"`
	PickupAddress       string  `json:"pickup_address"` 
	PickupLatitude       float64  `json:"pickup_latitude"`
    PickupLongitude      float64  `json:"pickup_longitude"`

	DestinationLocationID string  `json:"destination_location_id,omitempty"`
	DestinationAddress    string  `json:"destination_address"`
	DestinationLatitude  *float64 `json:"destination_latitude,omitempty"`
    DestinationLongitude *float64 `json:"destination_longitude,omitempty"`

	PickupWindowStart time.Time `json:"pickup_window_start"`
	PickupWindowEnd   time.Time `json:"pickup_window_end"`

	RequiredVehicleType   string  `json:"required_vehicle_type,omitempty"`
	RequiredMinCapacityKg float64 `json:"required_min_capacity_kg,omitempty"`

	Currency string `json:"currency,omitempty"`
}

func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	// ─── Extract authentication context.
	userID := userIDFromContext(r.Context())
	orgID := orgIDFromContext(r.Context())
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	// ─── Decode body.
	var payload createRequestPayload
	if err := decodeJSON(r, &payload); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	// ─── Validate.
	var errs validation.Errors
	validation.RequiredString(&errs, "cargo_description", payload.CargoDescription, 3, 500)
	if payload.CargoDeclaredValue <= 0 {
		errs.Add("cargo_declared_value", "invalid", "Must be greater than zero.")
	}
	if payload.CargoWeightKg <= 0 {
		errs.Add("cargo_weight_kg", "invalid", "Must be greater than zero.")
	}
	validation.RequiredString(&errs, "pickup_address", payload.PickupAddress, 5, 500)
	if payload.PickupLatitude < -90 || payload.PickupLatitude > 90 {
		errs.Add("pickup_latitude", "invalid", "Must be between -90 and 90.")
	}
	if payload.PickupLongitude < -180 || payload.PickupLongitude > 180 {
		errs.Add("pickup_longitude", "invalid", "Must be between -180 and 180.")
	}
	// validation.RequiredString(&errs, "destination_address", payload.DestinationAddress, 5, 500)
	// if payload.DestinationLatitude < -90 || payload.DestinationLatitude > 90 {
	// 	errs.Add("destination_latitude", "invalid", "Must be between -90 and 90.")
	// }
	// if payload.DestinationLongitude < -180 || payload.DestinationLongitude > 180 {
	// 	errs.Add("destination_longitude", "invalid", "Must be between -180 and 180.")
	// }  





	// validation.RequiredString(&errs, "destination_address", payload.DestinationAddress, 5, 500)
	// // Destination coordinates are optional. If provided, validate ranges.
	// if payload.DestinationLatitude != 0 && (payload.DestinationLatitude < -90 || payload.DestinationLatitude > 90) {
	// 	errs.Add("destination_latitude", "invalid", "Must be between -90 and 90.")
	// }
	// if payload.DestinationLongitude != 0 && (payload.DestinationLongitude < -180 || payload.DestinationLongitude > 180) {
	// 	errs.Add("destination_longitude", "invalid", "Must be between -180 and 180.")
	// }


	validation.RequiredString(&errs, "destination_address", payload.DestinationAddress, 5, 500)
	// Destination coordinates are optional. Validate only when present.
	hasDestLat := payload.DestinationLatitude != nil
	hasDestLon := payload.DestinationLongitude != nil
	if hasDestLat != hasDestLon {
		errs.Add("destination_latitude", "invalid", "Provide both latitude and longitude, or leave both blank.")
	}
	if hasDestLat && (*payload.DestinationLatitude < -90 || *payload.DestinationLatitude > 90) {
		errs.Add("destination_latitude", "invalid", "Must be between -90 and 90.")
	}
	if hasDestLon && (*payload.DestinationLongitude < -180 || *payload.DestinationLongitude > 180) {
		errs.Add("destination_longitude", "invalid", "Must be between -180 and 180.")
	}




	if payload.PickupWindowStart.IsZero() {
		errs.Add("pickup_window_start", "required", "This field is required.")
	}
	if payload.PickupWindowEnd.IsZero() {
		errs.Add("pickup_window_end", "required", "This field is required.")
	}
	if !payload.PickupWindowStart.IsZero() && !payload.PickupWindowEnd.IsZero() &&
		!payload.PickupWindowEnd.After(payload.PickupWindowStart) {
		errs.Add("pickup_window_end", "invalid", "Must be after pickup_window_start.")
	}
	if payload.PickupWindowStart.Before(time.Now()) {
		errs.Add("pickup_window_start", "invalid", "Must be in the future.")
	}
	if payload.RequiredVehicleType != "" {
		validation.OneOf(&errs, "required_vehicle_type", payload.RequiredVehicleType,
			"truck", "van", "pickup", "trailer", "tanker", "refrigerated", "other")
	}
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	// ─── Default currency.
	currency := payload.Currency
	if currency == "" {
		currency = "NGN"
	}

	// ─── Call service.
	result, err := h.svc.CreateRequest(r.Context(), CreateRequestInput{
		RequesterUserID:      userID,
		RequesterOrgID:       orgID,
		ExternalReference:    payload.ExternalReference,
		CargoDescription:     payload.CargoDescription,
		CargoDeclaredValue:   payload.CargoDeclaredValue,
		CargoWeightKg:        payload.CargoWeightKg,
		CargoVolumeM3:        payload.CargoVolumeM3,
		HandlingRequirements: payload.HandlingRequirements,
		PickupLocationID:     payload.PickupLocationID,
		PickupAddress:        payload.PickupAddress,
		PickupLatitude:       payload.PickupLatitude,
		PickupLongitude:      payload.PickupLongitude,
		DestinationLocationID: payload.DestinationLocationID,
		DestinationAddress:   payload.DestinationAddress,
		DestinationLatitude:  payload.DestinationLatitude,
		DestinationLongitude: payload.DestinationLongitude,
		PickupWindowStart:    payload.PickupWindowStart,
		PickupWindowEnd:      payload.PickupWindowEnd,
		RequiredVehicleType:  payload.RequiredVehicleType,
		RequiredMinCapacityKg: payload.RequiredMinCapacityKg,
		Currency:             currency,
	})

	if err != nil {
		switch {
		case errors.Is(err, ErrNotMember):
			apierror.WriteError(w, r, apierror.Forbidden(
				"You are not an active member of this organisation.",
			))
		case errors.Is(err, ErrVerificationNeeded):
			apierror.WriteError(w, r, apierror.Forbidden(
				"Your organisation must be active to create transport requests.",
			))
		default:
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

// ─── Context helpers ────────────────────────────────────────────────────
//
// These read from the context set by the middleware chain. The user ID
// comes from the auth middleware. The org ID is set by the client in a
// header (X-Organisation-Id), and validated by the middleware.

// type userCtxKey struct{}
// type orgCtxKey struct{}

// // WithUserID attaches the authenticated user ID to the context.
// func WithUserID(ctx context.Context, userID string) context.Context {
// 	return context.WithValue(ctx, userCtxKey{}, userID)
// }

// // WithOrganisationID attaches the active organisation ID to the context.
// func WithOrganisationID(ctx context.Context, orgID string) context.Context {
// 	return context.WithValue(ctx, orgCtxKey{}, orgID)
// }

// func userIDFromContext(ctx context.Context) string {
// 	id, _ := ctx.Value(userCtxKey{}).(string)
// 	return id
// }

// func orgIDFromContext(ctx context.Context) string {
// 	id, _ := ctx.Value(orgCtxKey{}).(string)
// 	return id
// }


func userIDFromContext(ctx context.Context) string {
    return authctx.UserFromContext(ctx)
}

func orgIDFromContext(ctx context.Context) string {
    return authctx.OrgFromContext(ctx)
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








// List handles GET /api/v1/transport-requests
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	orgID := orgIDFromContext(r.Context())
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	// Parse query params.
	status := r.URL.Query().Get("status")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 50
	offset := 0
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			limit = n
		}
	}
	if offsetStr != "" {
		if n, err := strconv.Atoi(offsetStr); err == nil && n >= 0 {
			offset = n
		}
	}

	result, err := h.svc.List(r.Context(), ListInput{
		RequesterUserID: userID,
		RequesterOrgID:  orgID,
		Status:          status,
		Limit:           limit,
		Offset:          offset,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrNotMember):
			apierror.WriteError(w, r, apierror.Forbidden(
				"You are not an active member of this organisation.",
			))
		default:
			h.svc.logger.Error("transport list failed", "error", err)
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// Get handles GET /api/v1/transport-requests/{id}
func (h *Handlers) Get(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	orgID := orgIDFromContext(r.Context())
	tripID := chi.URLParam(r, "id")
	if userID == "" || orgID == "" || tripID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Missing trip ID."))
		return
	}

	result, err := h.svc.Get(r.Context(), userID, orgID, tripID)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotMember):
			apierror.WriteError(w, r, apierror.Forbidden(
				"You are not an active member of this organisation.",
			))
		case errors.Is(err, ErrNotFound):
			apierror.WriteError(w, r, apierror.NotFound("Transport request not found."))
		default:
			h.svc.logger.Error("transport get failed", "error", err)
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusOK, result)
}




// Summary handles GET /api/v1/transport-requests/summary
func (h *Handlers) Summary(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	orgID := orgIDFromContext(r.Context())
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	result, err := h.svc.Summary(r.Context(), SummaryInput{
		RequesterUserID: userID,
		RequesterOrgID:  orgID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrNotMember):
			apierror.WriteError(w, r, apierror.Forbidden(
				"You are not an active member of this organisation.",
			))
		default:
			h.svc.logger.Error("transport summary failed", "error", err)
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusOK, result)
}