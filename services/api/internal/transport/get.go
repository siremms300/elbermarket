// Transport detail read operation.

package transport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// TripDetail is the full response for GET /transport-requests/{id}.
type TripDetail struct {
	TransportRequest TransportRequest `json:"transport_request"`
	InsurancePolicy  *InsurancePolicy `json:"insurance_policy,omitempty"`
	Events           []TripEvent      `json:"events"`
	Assignment       *Assignment      `json:"assignment,omitempty"`
}

// TripEvent is a single event from the timeline.
type TripEvent struct {
	ID           string    `json:"id"`
	EventType    string    `json:"event_type"`
	StatusBefore *string   `json:"status_before,omitempty"`
	StatusAfter  *string   `json:"status_after,omitempty"`
	ActorUserID  *string   `json:"actor_user_id,omitempty"`
	Notes        *string   `json:"notes,omitempty"`
	OccurredAt   time.Time `json:"occurred_at"`
}

// Assignment is the current assignment (if any).
type Assignment struct {
	ID                    string    `json:"id"`
	VehicleID             string    `json:"vehicle_id"`
	DriverID              string    `json:"driver_id"`
	FreightCharge         float64   `json:"freight_charge"`
	AssignedByUserID      string    `json:"assigned_by_user_id"`
	AssignedAt            time.Time `json:"assigned_at"`
}

// Get returns a full trip detail by ID. Verifies the caller is a member
// of the requesting organisation.
func (s *Service) Get(ctx context.Context, userID, orgID, tripID string) (*TripDetail, error) {
	// Authorization check.
	var orgStatus string
	err := s.db.QueryRow(ctx, `
		SELECT o.status
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1 AND m.user_id = $2 AND m.status = 'active'
	`, orgID, userID).Scan(&orgStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, fmt.Errorf("check membership: %w", err)
	}

	// Load the trip.
	var t TransportRequest
	var pickupLocID, destLocID, reqVehicleType *string
	var cargoVolume, reqMinCapacity *float64
	var freightAssigned, freightFinal *float64
	var externalRef *string

	err = s.db.QueryRow(ctx, `
		SELECT
			id, reference, status,
			requester_user_id, requester_org_id, external_reference,
			cargo_description, cargo_declared_value, cargo_currency,
			cargo_weight_kg, cargo_volume_m3,
			pickup_location_id, pickup_address, pickup_latitude, pickup_longitude,
			destination_location_id, destination_address, destination_latitude, destination_longitude,
			straight_line_distance_m,
			pickup_window_start, pickup_window_end,
			required_vehicle_type, required_min_capacity_kg,
			freight_charge_assigned, freight_charge_final, freight_currency,
			requested_at, created_at
		FROM elber.transport_requests
		WHERE id = $1 AND requester_org_id = $2
	`, tripID, orgID).Scan(
		&t.ID, &t.Reference, &t.Status,
		&t.RequesterUserID, &t.RequesterOrgID, &externalRef,
		&t.CargoDescription, &t.CargoDeclaredValue, &t.CargoCurrency,
		&t.CargoWeightKg, &cargoVolume,
		&pickupLocID, &t.PickupAddress, &t.PickupLatitude, &t.PickupLongitude,
		&destLocID, &t.DestinationAddress, &t.DestinationLatitude, &t.DestinationLongitude,
		&t.StraightLineDistanceM,
		&t.PickupWindowStart, &t.PickupWindowEnd,
		&reqVehicleType, &reqMinCapacity,
		&freightAssigned, &freightFinal, &t.FreightCurrency,
		&t.RequestedAt, &t.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("load trip: %w", err)
	}
	if externalRef != nil {
		t.ExternalReference = *externalRef
	}
	if cargoVolume != nil {
		t.CargoVolumeM3 = *cargoVolume
	}
	if reqVehicleType != nil {
		t.RequiredVehicleType = *reqVehicleType
	}
	if reqMinCapacity != nil {
		t.RequiredMinCapacityKg = *reqMinCapacity
	}

	// Load insurance policy (if any).
	var policy *InsurancePolicy
	var polID, polRef, polCurrency, polStatus string
	var polCoverage, polPremium float64
	err = s.db.QueryRow(ctx, `
		SELECT id, reference, coverage_amount, premium_amount, currency, status
		FROM elber.insurance_policies
		WHERE transport_request_id = $1
	`, tripID).Scan(&polID, &polRef, &polCoverage, &polPremium, &polCurrency, &polStatus)
	if err == nil {
		policy = &InsurancePolicy{
			ID:             polID,
			Reference:      polRef,
			CoverageAmount: polCoverage,
			PremiumAmount:  polPremium,
			Currency:       polCurrency,
			Status:         polStatus,
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("load policy: %w", err)
	}

	// Load events.
	rows, err := s.db.Query(ctx, `
		SELECT id, event_type, status_before, status_after, actor_user_id, notes, occurred_at
		FROM elber.trip_events
		WHERE transport_request_id = $1
		ORDER BY occurred_at ASC
	`, tripID)
	if err != nil {
		return nil, fmt.Errorf("load events: %w", err)
	}
	defer rows.Close()

	events := []TripEvent{}
	for rows.Next() {
		var e TripEvent
		if err := rows.Scan(&e.ID, &e.EventType, &e.StatusBefore, &e.StatusAfter, &e.ActorUserID, &e.Notes, &e.OccurredAt); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, e)
	}

	return &TripDetail{
		TransportRequest: t,
		InsurancePolicy:  policy,
		Events:           events,
	}, nil
}