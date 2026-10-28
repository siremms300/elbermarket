package fleet

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/elbermarket/api/internal/platform/apierror"
	"github.com/elbermarket/api/internal/platform/authctx"
	"github.com/elbermarket/api/internal/platform/validation"
)

type Handlers struct {
	svc *Service
}

func NewHandlers(svc *Service) *Handlers {
	return &Handlers{svc: svc}
}

// ─── Vehicles ───────────────────────────────────────────────────────────

type createVehiclePayload struct {
	PlateNumber        string  `json:"plate_number"`
	VehicleType        string  `json:"vehicle_type"`
	Make               string  `json:"make,omitempty"`
	Model              string  `json:"model,omitempty"`
	Year               int     `json:"year,omitempty"`
	CapacityKg         float64 `json:"capacity_kg"`
	CapacityM3         float64 `json:"capacity_m3,omitempty"`
	HomeBaseLocationID string  `json:"home_base_location_id,omitempty"`
}

func (h *Handlers) CreateVehicle(w http.ResponseWriter, r *http.Request) {
	userID := authctx.UserFromContext(r.Context())
	orgID := authctx.OrgFromContext(r.Context())
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	var p createVehiclePayload
	if err := decodeJSON(r, &p); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "plate_number", p.PlateNumber, 2, 20)
	validation.OneOf(&errs, "vehicle_type", p.VehicleType,
		"truck", "van", "pickup", "trailer", "tanker", "refrigerated", "other")
	if p.CapacityKg <= 0 {
		errs.Add("capacity_kg", "invalid", "Must be greater than zero.")
	}
	if p.Year != 0 && (p.Year < 1900 || p.Year > time.Now().Year()+1) {
		errs.Add("year", "invalid", "Must be a valid year.")
	}
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	vehicle, err := h.svc.CreateVehicle(r.Context(), CreateVehicleInput{
		UserID:             userID,
		OrgID:              orgID,
		PlateNumber:        p.PlateNumber,
		VehicleType:        p.VehicleType,
		Make:               p.Make,
		Model:              p.Model,
		Year:               p.Year,
		CapacityKg:         p.CapacityKg,
		CapacityM3:         p.CapacityM3,
		HomeBaseLocationID: p.HomeBaseLocationID,
	})
	if err != nil {
		writeFleetError(w, r, err, h.svc)
		return
	}

	writeJSON(w, http.StatusCreated, vehicle)
}

func (h *Handlers) ListVehicles(w http.ResponseWriter, r *http.Request) {
	userID := authctx.UserFromContext(r.Context())
	orgID := authctx.OrgFromContext(r.Context())
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	vehicles, err := h.svc.ListVehicles(r.Context(), userID, orgID)
	if err != nil {
		writeFleetError(w, r, err, h.svc)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"vehicles": vehicles})
}

func (h *Handlers) GetVehicle(w http.ResponseWriter, r *http.Request) {
	userID := authctx.UserFromContext(r.Context())
	orgID := authctx.OrgFromContext(r.Context())
	vehicleID := chi.URLParam(r, "id")
	if userID == "" || orgID == "" || vehicleID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	vehicle, err := h.svc.GetVehicle(r.Context(), userID, orgID, vehicleID)
	if err != nil {
		writeFleetError(w, r, err, h.svc)
		return
	}

	writeJSON(w, http.StatusOK, vehicle)
}

type updateVehiclePayload struct {
	Make       *string  `json:"make,omitempty"`
	Model      *string  `json:"model,omitempty"`
	Year       *int     `json:"year,omitempty"`
	CapacityKg *float64 `json:"capacity_kg,omitempty"`
	CapacityM3 *float64 `json:"capacity_m3,omitempty"`
	Status     *string  `json:"status,omitempty"`
}

func (h *Handlers) UpdateVehicle(w http.ResponseWriter, r *http.Request) {
	userID := authctx.UserFromContext(r.Context())
	orgID := authctx.OrgFromContext(r.Context())
	vehicleID := chi.URLParam(r, "id")
	if userID == "" || orgID == "" || vehicleID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	var p updateVehiclePayload
	if err := decodeJSON(r, &p); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	if p.Status != nil {
		var errs validation.Errors
		validation.OneOf(&errs, "status", *p.Status, "active", "maintenance", "retired")
		if apiErr := errs.ToError(); apiErr != nil {
			apierror.WriteError(w, r, apiErr)
			return
		}
	}

	vehicle, err := h.svc.UpdateVehicle(r.Context(), UpdateVehicleInput{
		UserID:     userID,
		OrgID:      orgID,
		VehicleID:  vehicleID,
		Make:       p.Make,
		Model:      p.Model,
		Year:       p.Year,
		CapacityKg: p.CapacityKg,
		CapacityM3: p.CapacityM3,
		Status:     p.Status,
	})
	if err != nil {
		writeFleetError(w, r, err, h.svc)
		return
	}

	writeJSON(w, http.StatusOK, vehicle)
}

func (h *Handlers) DeleteVehicle(w http.ResponseWriter, r *http.Request) {
	userID := authctx.UserFromContext(r.Context())
	orgID := authctx.OrgFromContext(r.Context())
	vehicleID := chi.URLParam(r, "id")
	if userID == "" || orgID == "" || vehicleID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	if err := h.svc.DeleteVehicle(r.Context(), userID, orgID, vehicleID); err != nil {
		writeFleetError(w, r, err, h.svc)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Drivers ────────────────────────────────────────────────────────────

type createDriverPayload struct {
	DriverUserID  string `json:"driver_user_id"`
	LicenseNumber string `json:"license_number"`
	LicenseClass  string `json:"license_class,omitempty"`
	LicenseExpiry string `json:"license_expiry"`
}

func (h *Handlers) CreateDriver(w http.ResponseWriter, r *http.Request) {
	userID := authctx.UserFromContext(r.Context())
	orgID := authctx.OrgFromContext(r.Context())
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	var p createDriverPayload
	if err := decodeJSON(r, &p); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "driver_user_id", p.DriverUserID, 1, 100)
	validation.RequiredString(&errs, "license_number", p.LicenseNumber, 2, 50)
	validation.RequiredString(&errs, "license_expiry", p.LicenseExpiry, 10, 10)

	var expiry time.Time
	if p.LicenseExpiry != "" {
		var parseErr error
		expiry, parseErr = time.Parse("2006-01-02", p.LicenseExpiry)
		if parseErr != nil {
			errs.Add("license_expiry", "invalid", "Must be in YYYY-MM-DD format.")
		}
	}
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	driver, err := h.svc.CreateDriver(r.Context(), CreateDriverInput{
		UserID:        userID,
		OrgID:         orgID,
		DriverUserID:  p.DriverUserID,
		LicenseNumber: p.LicenseNumber,
		LicenseClass:  p.LicenseClass,
		LicenseExpiry: expiry,
	})
	if err != nil {
		writeFleetError(w, r, err, h.svc)
		return
	}

	writeJSON(w, http.StatusCreated, driver)
}

func (h *Handlers) ListDrivers(w http.ResponseWriter, r *http.Request) {
	userID := authctx.UserFromContext(r.Context())
	orgID := authctx.OrgFromContext(r.Context())
	if userID == "" || orgID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	drivers, err := h.svc.ListDrivers(r.Context(), userID, orgID)
	if err != nil {
		writeFleetError(w, r, err, h.svc)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"drivers": drivers})
}

// ─── Error mapping ──────────────────────────────────────────────────────

func writeFleetError(w http.ResponseWriter, r *http.Request, err error, svc *Service) {
	switch {
	case errors.Is(err, ErrNotMember):
		apierror.WriteError(w, r, apierror.Forbidden("You are not an active member of this organisation."))
	case errors.Is(err, ErrNotFleetOwner):
		apierror.WriteError(w, r, apierror.Forbidden("Your organisation must be verified as a Fleet Owner to manage vehicles and drivers."))
	case errors.Is(err, ErrVehicleNotFound), errors.Is(err, ErrDriverNotFound):
		apierror.WriteError(w, r, apierror.NotFound("Record not found."))
	case errors.Is(err, ErrDuplicatePlate):
		apierror.WriteError(w, r, apierror.Conflict(apierror.CodeConflict, "A vehicle with this plate number is already registered."))
	case errors.Is(err, ErrInvalidType):
		apierror.WriteError(w, r, apierror.Validation("Invalid vehicle type.",
			apierror.Detail{Field: "vehicle_type", Code: "invalid", Message: "Must be a valid vehicle type."}))
	case errors.Is(err, ErrDriverNotMember):
		apierror.WriteError(w, r, apierror.Validation("Driver must be a member of your organisation.",
			apierror.Detail{Field: "driver_user_id", Code: "not_member", Message: "Invite this user to your organisation first."}))
	case errors.Is(err, ErrDriverExists):
		apierror.WriteError(w, r, apierror.Conflict(apierror.CodeConflict, "This user is already registered as a driver."))
	case errors.Is(err, ErrLicenseExpired):
		apierror.WriteError(w, r, apierror.Validation("Driver license has expired.",
			apierror.Detail{Field: "license_expiry", Code: "expired", Message: "License expiry must be in the future."}))
	default:
		svc.logger.Error("fleet operation failed", "error", err)
		apierror.WriteError(w, r, apierror.Internal())
	}
}

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