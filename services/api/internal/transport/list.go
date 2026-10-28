// Transport list and detail read operations.
//
// The service already has CreateRequest. This file adds read operations.
// Kept separate so the service.go file doesn't grow unbounded.

package transport

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// ListInput is the query parameters for listing transport requests.
type ListInput struct {
	RequesterUserID string
	RequesterOrgID  string

	// Optional status filter — "requested", "assigned", etc. Empty = all.
	Status string

	// Pagination.
	Limit  int // default 50, max 100
	Offset int
}

// TripSummary is a lightweight view for the list screen.
type TripSummary struct {
	ID                    string    `json:"id"`
	Reference             string    `json:"reference"`
	Status                string    `json:"status"`
	CargoDescription      string    `json:"cargo_description"`
	CargoWeightKg         float64   `json:"cargo_weight_kg"`
	PickupAddress         string    `json:"pickup_address"`
	DestinationAddress    string    `json:"destination_address"`
	StraightLineDistanceM *float64  `json:"straight_line_distance_m,omitempty"`
	PickupWindowStart     time.Time `json:"pickup_window_start"`
	PickupWindowEnd       time.Time `json:"pickup_window_end"`
	FreightChargeAssigned float64   `json:"freight_charge_assigned,omitempty"`
	FreightChargeFinal    float64   `json:"freight_charge_final,omitempty"`
	FreightCurrency       string    `json:"freight_currency"`
	RequestedAt           time.Time `json:"requested_at"`
	CreatedAt             time.Time `json:"created_at"`
}

// ListResult is what List returns.
type ListResult struct {
	Trips  []TripSummary `json:"transport_requests"`
	Total  int           `json:"total"`
	Limit  int           `json:"limit"`
	Offset int           `json:"offset"`
}

// List returns the transport requests owned by the given organisation,
// respecting pagination and status filter.
func (s *Service) List(ctx context.Context, input ListInput) (*ListResult, error) {
	// Authorization: verify the user is a member of the org.
	var orgStatus string
	err := s.db.QueryRow(ctx, `
		SELECT o.status
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1 AND m.user_id = $2 AND m.status = 'active'
	`, input.RequesterOrgID, input.RequesterUserID).Scan(&orgStatus)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotMember
		}
		return nil, fmt.Errorf("check membership: %w", err)
	}

	limit := input.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	offset := input.Offset
	if offset < 0 {
		offset = 0
	}

	// Build query with optional status filter.
	baseWhere := `requester_org_id = $1`
	args := []any{input.RequesterOrgID}
	if input.Status != "" {
		baseWhere += ` AND status = $2`
		args = append(args, input.Status)
	}

	// Count total.
	var total int
	countQuery := `SELECT COUNT(*) FROM elber.transport_requests WHERE ` + baseWhere
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count trips: %w", err)
	}

	// Fetch page.
	query := `
		SELECT
			id, reference, status,
			cargo_description, cargo_weight_kg,
			pickup_address, destination_address,
			straight_line_distance_m,
			pickup_window_start, pickup_window_end,
			COALESCE(freight_charge_assigned, 0),
			COALESCE(freight_charge_final, 0),
			freight_currency,
			requested_at, created_at
		FROM elber.transport_requests
		WHERE ` + baseWhere + `
		ORDER BY created_at DESC
		LIMIT $` + fmt.Sprint(len(args)+1) + ` OFFSET $` + fmt.Sprint(len(args)+2)

	args = append(args, limit, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list trips: %w", err)
	}
	defer rows.Close()

	trips := []TripSummary{}
	for rows.Next() {
		var t TripSummary
		if err := rows.Scan(
			&t.ID, &t.Reference, &t.Status,
			&t.CargoDescription, &t.CargoWeightKg,
			&t.PickupAddress, &t.DestinationAddress,
			&t.StraightLineDistanceM,
			&t.PickupWindowStart, &t.PickupWindowEnd,
			&t.FreightChargeAssigned,
			&t.FreightChargeFinal,
			&t.FreightCurrency,
			&t.RequestedAt, &t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan trip: %w", err)
		}
		trips = append(trips, t)
	}

	return &ListResult{
		Trips:  trips,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
}