// Transport summary — aggregated stats for the home screen.
//
// Provides the numbers a shipper wants at a glance: how many trips are
// currently active, how many were delivered this month, and how much has
// been spent. Plus recent activity across all their trips.

package transport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// SummaryInput is the query context for a summary.
type SummaryInput struct {
	RequesterUserID string
	RequesterOrgID  string
}

// SummaryResult is the response shape.
type SummaryResult struct {
	ActiveCount          int            `json:"active_count"`
	DeliveredThisMonth   int            `json:"delivered_this_month"`
	TotalSpendThisMonth  float64        `json:"total_spend_this_month"`
	Currency             string         `json:"currency"`
	RecentEvents         []RecentEvent  `json:"recent_events"`
}

// RecentEvent is one entry in the "recent activity" feed.
type RecentEvent struct {
	TripID         string    `json:"trip_id"`
	TripReference  string    `json:"trip_reference"`
	EventType      string    `json:"event_type"`
	StatusAfter    *string   `json:"status_after,omitempty"`
	OccurredAt     time.Time `json:"occurred_at"`
}

// Summary returns aggregated stats and recent events for the requesting
// organisation.
func (s *Service) Summary(ctx context.Context, input SummaryInput) (*SummaryResult, error) {
	// Authorization: verify membership
	var orgStatus string
	err := s.db.QueryRow(ctx, `
		SELECT o.status
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1 AND m.user_id = $2 AND m.status = 'active'
	`, input.RequesterOrgID, input.RequesterUserID).Scan(&orgStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, fmt.Errorf("check membership: %w", err)
	}

	// Aggregated stats. "Active" = anything not in a terminal state.
	// "Delivered this month" = delivered or closed in the current calendar month.
	// "Total spend this month" = sum of freight_charge_final on delivered/closed trips this month.
	var result SummaryResult
	err = s.db.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'closed', 'cancelled', 'failed')),
			COUNT(*) FILTER (
				WHERE status IN ('delivered', 'closed')
				  AND COALESCE(delivered_at, closed_at) >= date_trunc('month', NOW())
			),
			COALESCE(SUM(COALESCE(freight_charge_final, freight_charge_assigned, 0)) FILTER (
				WHERE status IN ('delivered', 'closed')
				  AND COALESCE(delivered_at, closed_at) >= date_trunc('month', NOW())
			), 0)
		FROM elber.transport_requests
		WHERE requester_org_id = $1
	`, input.RequesterOrgID).Scan(
		&result.ActiveCount,
		&result.DeliveredThisMonth,
		&result.TotalSpendThisMonth,
	)
	if err != nil {
		return nil, fmt.Errorf("compute stats: %w", err)
	}

	result.Currency = "NGN"

	// Recent events across all the org's trips.
	rows, err := s.db.Query(ctx, `
		SELECT
			tr.id,
			tr.reference,
			te.event_type,
			te.status_after,
			te.occurred_at
		FROM elber.trip_events te
		JOIN elber.transport_requests tr ON tr.id = te.transport_request_id
		WHERE tr.requester_org_id = $1
		ORDER BY te.occurred_at DESC
		LIMIT 5
	`, input.RequesterOrgID)
	if err != nil {
		return nil, fmt.Errorf("load recent events: %w", err)
	}
	defer rows.Close()

	result.RecentEvents = []RecentEvent{}
	for rows.Next() {
		var e RecentEvent
		if err := rows.Scan(
			&e.TripID,
			&e.TripReference,
			&e.EventType,
			&e.StatusAfter,
			&e.OccurredAt,
		); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		result.RecentEvents = append(result.RecentEvents, e)
	}

	return &result, nil
}