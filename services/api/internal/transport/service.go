// Transport domain service.
//
// The business logic for the transport lifecycle. Every operation on a
// transport request goes through here — no handler manipulates the
// transport tables directly.
//
// Phase 2 starts with CreateRequest. Subsequent slices add:
//   - AssignVehicle (coordinator assigns)
//   - ConfirmAssignment (shipper confirms)
//   - MarkPickup, MarkTransit, MarkDelivered (driver executes)
//   - CapturePOD (driver records delivery)
//   - Close (system computes metrics, finalizes)

package transport

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"github.com/elbermarket/api/internal/notifications"
)

// Errors returned by the service.
var (
	ErrInvalidStatus      = errors.New("invalid status transition")
	ErrNotFound           = errors.New("transport request not found")
	ErrNotMember          = errors.New("not a member of the requesting organisation")
	ErrVerificationNeeded = errors.New("organisation is not verified")
)

// CreateRequestInput is the payload for creating a new transport request.
type CreateRequestInput struct {
	// Who is requesting.
	RequesterUserID string
	RequesterOrgID  string

	// External reference (shipper's own commercial context).
	ExternalReference string

	// What's being moved.
	CargoDescription    string
	CargoDeclaredValue  float64
	CargoWeightKg       float64
	CargoVolumeM3       float64 // optional, 0 if not provided
	HandlingRequirements map[string]any

	// From where to where.
	PickupLocationID    string // optional
	PickupAddress       string
	PickupLatitude      float64
	PickupLongitude     float64
	DestinationLocationID string // optional
	DestinationAddress  string
	DestinationLatitude  *float64
	DestinationLongitude *float64

	// When.
	PickupWindowStart time.Time
	PickupWindowEnd   time.Time

	// Vehicle requirements.
	RequiredVehicleType    string // optional
	RequiredMinCapacityKg  float64 // optional

	// Currency for financial fields.
	Currency string

	// Client IP for audit.
	ClientIP string
}

// CreateRequestResult is what's returned on successful creation. Includes
// both the request record and the auto-attached insurance policy.
type CreateRequestResult struct {
	TransportRequest TransportRequest    `json:"transport_request"`
	InsurancePolicy  InsurancePolicy     `json:"insurance_policy"`
}

// TransportRequest is the API-facing view of a transport_requests row.
// Not all DB columns are exposed — internal fields like created_by are
// kept private.
type TransportRequest struct {
	ID          string  `json:"id"`
	Reference   string  `json:"reference"`
	Status      string  `json:"status"`

	RequesterUserID string `json:"requester_user_id"`
	RequesterOrgID  string `json:"requester_org_id"`

	ExternalReference string `json:"external_reference,omitempty"`

	CargoDescription   string  `json:"cargo_description"`
	CargoDeclaredValue float64 `json:"cargo_declared_value"`
	CargoCurrency      string  `json:"cargo_currency"`
	CargoWeightKg      float64 `json:"cargo_weight_kg"`
	CargoVolumeM3      float64 `json:"cargo_volume_m3,omitempty"`

	PickupAddress   string  `json:"pickup_address"`
	PickupLatitude  float64 `json:"pickup_latitude"`
	PickupLongitude float64 `json:"pickup_longitude"`

	DestinationAddress   string  `json:"destination_address"`
	// DestinationLatitude  float64 `json:"destination_latitude"`
	// DestinationLongitude float64 `json:"destination_longitude"`



	DestinationLatitude  *float64 `json:"destination_latitude,omitempty"`
	DestinationLongitude *float64 `json:"destination_longitude,omitempty"`



	// StraightLineDistanceM float64 `json:"straight_line_distance_m"`

	StraightLineDistanceM *float64 `json:"straight_line_distance_m,omitempty"`

	PickupWindowStart time.Time `json:"pickup_window_start"`
	PickupWindowEnd   time.Time `json:"pickup_window_end"`

	RequiredVehicleType   string  `json:"required_vehicle_type,omitempty"`
	RequiredMinCapacityKg float64 `json:"required_min_capacity_kg,omitempty"`

	FreightCurrency string `json:"freight_currency,omitempty"`

	RequestedAt time.Time `json:"requested_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// InsurancePolicy is the API-facing view of an insurance_policies row
// after auto-attachment.
type InsurancePolicy struct {
	ID              string  `json:"id"`
	Reference       string  `json:"reference"`
	CoverageAmount  float64 `json:"coverage_amount"`
	PremiumAmount   float64 `json:"premium_amount"`
	Currency        string  `json:"currency"`
	Status          string  `json:"status"`
}

// Service is the transport domain service.
// type Service struct {
// 	db     *pgxpool.Pool
// 	logger *slog.Logger
// }

// // NewService constructs the transport service.
// func NewService(db *pgxpool.Pool, logger *slog.Logger) *Service {
// 	return &Service{db: db, logger: logger}
// }





type Service struct {
	db     *pgxpool.Pool
	logger *slog.Logger
	notify *notifications.Service
}

func NewService(db *pgxpool.Pool, logger *slog.Logger, notify *notifications.Service) *Service {
	return &Service{db: db, logger: logger, notify: notify}
}








// CreateRequest creates a new transport request and attaches an insurance
// policy in a single transaction. On success, the request is in status
// 'requested' and is awaiting coordinator assignment.
//
// The operation:
//   1. Validates the requesting organisation is active and the caller is
//      a member (authorization check).
//   2. Generates a unique reference (retries on collision).
//   3. Computes the straight-line distance (via PostGIS).
//   4. Computes the insurance premium.
//   5. Inserts the transport_requests row.
//   6. Inserts the trip_events row (state: requested).
//   7. Inserts the insurance_policies row (auto-attached).
//   8. Returns both records.
func (s *Service) CreateRequest(ctx context.Context, input CreateRequestInput) (*CreateRequestResult, error) {
	// ─── Authorization: caller must be an active member of an active org
	var orgStatus string
	err := s.db.QueryRow(ctx, `
		SELECT o.status
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1
		  AND m.user_id = $2
		  AND m.status = 'active'
	`, input.RequesterOrgID, input.RequesterUserID).Scan(&orgStatus)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, fmt.Errorf("check membership: %w", err)
	}
	if orgStatus != "active" {
		return nil, ErrVerificationNeeded
	}

	// ─── Generate reference with collision retry.
	// The DB-level UNIQUE constraint on reference makes concurrent
	// collisions safe: if two goroutines generate the same reference at
	// the same time, one insert succeeds and one fails on the constraint.
	// We retry with a fresh reference.
	var reference string
	for attempt := 0; attempt < 5; attempt++ {
		var genErr error
		reference, genErr = generateReference()
		if genErr != nil {
			return nil, fmt.Errorf("generate reference: %w", genErr)
		}

		// Check if it's already taken. This is cheap and avoids most
		// retries, but is not authoritative — the UNIQUE constraint is.
		var exists bool
		err = s.db.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM elber.transport_requests WHERE reference = $1)
		`, reference).Scan(&exists)
		if err != nil {
			return nil, fmt.Errorf("check reference: %w", err)
		}
		if !exists {
			break
		}
		// Collision — try again. Statistically impossible in practice.
	}

	// ─── Compute straight-line distance via PostGIS (single query).
	// We compute it in the database rather than in Go, because the DB
	// has the spheroid maths baked in via ST_Distance on GEOGRAPHY.
	// var distanceM float64
	// err = s.db.QueryRow(ctx, `
	// 	SELECT elber.distance_meters(
	// 		elber.make_point($1, $2),
	// 		elber.make_point($3, $4)
	// 	)::FLOAT8
	// `, input.PickupLatitude, input.PickupLongitude,
	// 	input.DestinationLatitude, input.DestinationLongitude).Scan(&distanceM)
	// if err != nil {
	// 	return nil, fmt.Errorf("compute distance: %w", err)
	// }



		var distanceM *float64
	if input.DestinationLatitude != nil && input.DestinationLongitude != nil {
		var d float64
		err = s.db.QueryRow(ctx, `
			SELECT elber.distance_meters(
				elber.make_point($1, $2),
				elber.make_point($3, $4)
			)::FLOAT8
		`, input.PickupLatitude, input.PickupLongitude,
			*input.DestinationLatitude, *input.DestinationLongitude).Scan(&d)
		if err != nil {
			return nil, fmt.Errorf("compute distance: %w", err)
		}
		distanceM = &d
	}




	// distanceKm := distanceM / 1000.0

	// // ─── Compute insurance premium from cargo value and distance.
	// premium := calculateInsurancePremium(input.CargoDeclaredValue, distanceKm)
	
	var distanceKm float64
	if distanceM != nil {
		distanceKm = *distanceM / 1000.0
	}
	premium := calculateInsurancePremium(input.CargoDeclaredValue, distanceKm)
	
	
	
	coverage := input.CargoDeclaredValue

	// ─── Begin transaction. All inserts commit together or roll back.
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// ─── Insert transport request.
	requestID := uuid.NewString()
	now := time.Now()

	// Handle optional fields as nil-able.
	var pickupLocID, destLocID any
	if input.PickupLocationID != "" {
		pickupLocID = input.PickupLocationID
	}
	if input.DestinationLocationID != "" {
		destLocID = input.DestinationLocationID
	}
	var cargoVolume any
	if input.CargoVolumeM3 > 0 {
		cargoVolume = input.CargoVolumeM3
	}
	var requiredVehicleType any
	if input.RequiredVehicleType != "" {
		requiredVehicleType = input.RequiredVehicleType
	}
	var requiredMinCapacity any
	if input.RequiredMinCapacityKg > 0 {
		requiredMinCapacity = input.RequiredMinCapacityKg
	}
	var externalRef any
	if strings.TrimSpace(input.ExternalReference) != "" {
		externalRef = strings.TrimSpace(input.ExternalReference)
	}
	// var handling any = input.HandlingRequirements
	// if handling == nil {
	// 	handling = map[string]any{}
	// } 

	handling := input.HandlingRequirements
	if handling == nil {
		handling = map[string]any{}
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO elber.transport_requests (
			id, reference,
			requester_user_id, requester_org_id, external_reference,
			cargo_description, cargo_declared_value, cargo_currency,
			cargo_weight_kg, cargo_volume_m3, handling_requirements,
			pickup_location_id, pickup_address, pickup_latitude, pickup_longitude,
			destination_location_id, destination_address, destination_latitude, destination_longitude,
			pickup_window_start, pickup_window_end,
			required_vehicle_type, required_min_capacity_kg,
			freight_currency,
			status,
			requested_at,
			created_at, updated_at
		) VALUES (
			$1, $2,
			$3, $4, $5,
			$6, $7, $8,
			$9, $10, $11,
			$12, $13, $14, $15,
			$16, $17, $18, $19,
			$20, $21,
			$22, $23,
			$24,
			'requested',
			$25,
			$25, $25
		)
	`,
		requestID, reference,
		input.RequesterUserID, input.RequesterOrgID, externalRef,
		input.CargoDescription, input.CargoDeclaredValue, input.Currency,
		input.CargoWeightKg, cargoVolume, handling,
		pickupLocID, input.PickupAddress, input.PickupLatitude, input.PickupLongitude,
		// destLocID, input.DestinationAddress, input.DestinationLatitude, input.DestinationLongitude,
		destLocID, input.DestinationAddress, input.DestinationLatitude, input.DestinationLongitude,
		input.PickupWindowStart, input.PickupWindowEnd,
		requiredVehicleType, requiredMinCapacity,
		input.Currency,
		now,
	)
	if err != nil {
		// If the error is a UNIQUE constraint violation on reference,
		// someone else just took our reference. The retry loop above
		// should have caught this, but if it slipped through, we could
		// retry here. In practice this never happens.
		return nil, fmt.Errorf("insert transport request: %w", err)
	}

	// ─── Insert creation event.
	_, err = tx.Exec(ctx, `
		INSERT INTO elber.trip_events (
			id, transport_request_id,
			event_type, status_before, status_after,
			actor_user_id,
			event_data, occurred_at, created_at
		) VALUES (
			$1, $2,
			'created', NULL, 'requested',
			$3,
			$4, $5, $5
		)
	`, uuid.NewString(), requestID,
		input.RequesterUserID,
		map[string]any{"reference": reference, "cargo_description": input.CargoDescription},
		now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert creation event: %w", err)
	}

	// ─── Insert insurance policy (auto-attached at creation).
	policyID := uuid.NewString()
	policyReference := "INS-" + strings.TrimPrefix(reference, "TRP-")

	// Policy is effective from the pickup window start through 30 days
	// after the pickup window end (allowing time for delivery + claim
	// reporting if trip runs long).
	effectiveFrom := input.PickupWindowStart
	effectiveUntil := input.PickupWindowEnd.AddDate(0, 1, 0)

	_, err = tx.Exec(ctx, `
		INSERT INTO elber.insurance_policies (
			id, reference, transport_request_id,
			insurer_partner_id, insurer_policy_ref,
			coverage_amount, premium_amount, currency,
			coverage_terms, status,
			effective_from, effective_until,
			created_at, updated_at
		) VALUES (
			$1, $2, $3,
			$4, NULL,
			$5, $6, $7,
			$8, 'pending',
			$9, $10,
			$11, $11
		)
	`,
		policyID, policyReference, requestID,
		"pending_partner", // placeholder until insurer partnership activated
		coverage, premium, input.Currency,
		map[string]any{
			"base_rate":     insuranceBaseRate,
			"distance_rate": insuranceDistanceRate,
			"distance_km":   distanceKm,
		},
		effectiveFrom, effectiveUntil,
		now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert insurance policy: %w", err)
	}

	// ─── Commit.
	// if err := tx.Commit(ctx); err != nil {
	// 	return nil, fmt.Errorf("commit: %w", err)
	// }


		// ─── Commit.
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	// ─── Fire notification (fire-and-forget: failure doesn't fail the request).
	// If notification creation fails, the trip is still created — the user
	// just doesn't get a notification. We log the failure and move on.
	// Rationale: trip creation is the important thing; notifications are
	// a convenience. A notification failure should not roll back a valid trip.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := s.notify.Create(ctx, notifications.CreateInput{
			RecipientUserID:    input.RequesterUserID,
			OrganisationID:     input.RequesterOrgID,
			EventType:          notifications.EventTransportRequestCreated,
			Title:              "Transport request created",
			Body:               fmt.Sprintf("Your transport request %s for %s has been created and is awaiting assignment.", reference, input.CargoDescription),
			RelatedEntityType:  "transport_request",
			RelatedEntityID:    requestID,
			Metadata: map[string]any{
				"reference":        reference,
				"status":           "requested",
				"cargo":            input.CargoDescription,
				"pickup_address":   input.PickupAddress,
				"destination_address": input.DestinationAddress,
				"distance_m":       distanceM,
				"premium":          premium,
			},
			Priority: "normal",
			// Email target — for now, we don't have the user's email in scope.
			// We'll add it in A.2 by loading from users table. For A.1, only
			// in-app delivery is created.
			// Channels: []string{notifications.ChannelInApp},
			Channels: []string{notifications.ChannelInApp, notifications.ChannelEmail},
		})
		if err != nil {
			s.logger.Error("failed to create notification",
				"error", err,
				"trip_id", requestID,
				"trip_reference", reference,
			)
		}
	}()



	// ─── Build response.
	return &CreateRequestResult{
		TransportRequest: TransportRequest{
			ID:                    requestID,
			Reference:             reference,
			Status:                "requested",
			RequesterUserID:       input.RequesterUserID,
			RequesterOrgID:        input.RequesterOrgID,
			ExternalReference:     input.ExternalReference,
			CargoDescription:      input.CargoDescription,
			CargoDeclaredValue:    input.CargoDeclaredValue,
			CargoCurrency:         input.Currency,
			CargoWeightKg:         input.CargoWeightKg,
			CargoVolumeM3:         input.CargoVolumeM3,
			PickupAddress:         input.PickupAddress,
			PickupLatitude:        input.PickupLatitude,
			PickupLongitude:       input.PickupLongitude,
			DestinationAddress:    input.DestinationAddress,
			DestinationLatitude:  input.DestinationLatitude,
			DestinationLongitude: input.DestinationLongitude,
			StraightLineDistanceM: distanceM,
			PickupWindowStart:     input.PickupWindowStart,
			PickupWindowEnd:       input.PickupWindowEnd,
			RequiredVehicleType:   input.RequiredVehicleType,
			RequiredMinCapacityKg: input.RequiredMinCapacityKg,
			RequestedAt:           now,
			CreatedAt:             now,
		},
		InsurancePolicy: InsurancePolicy{
			ID:             policyID,
			Reference:      policyReference,
			CoverageAmount: coverage,
			PremiumAmount:  premium,
			Currency:       input.Currency,
			Status:         "pending",
		},
	}, nil
}