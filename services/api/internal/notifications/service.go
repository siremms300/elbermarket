// Notification service.
//
// Creates notifications and their delivery rows. Does NOT dispatch them —
// that's the dispatcher's job (A.2). This layer:
//
//   - Creates the notification row (per recipient)
//   - Creates one delivery row per enabled channel (in_app, email, sms)
//   - Honors per-user preferences (opt-out per event/channel)
//   - Is called synchronously from domain services (transport, payment, etc.)
//
// Why synchronous creation + async dispatch:
//   - Creation is fast (a few inserts) — no external calls
//   - Sending emails is slow and can fail — that happens in the dispatcher
//   - The domain service's transaction includes the notification rows, so
//     they commit atomically with the business event. If the trip creation
//     commits, the notification exists.

package notifications

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
)

// Event type constants. Free-form on the DB, but centralized here so
// callers use consistent names.
const (
	EventTransportRequestCreated         = "transport_request_created"
	EventTransportRequestCancelled       = "transport_request_cancelled"
	EventTransportRequestStatusChanged   = "transport_request_status_changed"
)

// Channel constants.
const (
	ChannelInApp = "in_app"
	ChannelEmail = "email"
	ChannelSMS   = "sms"
	ChannelPush  = "push"
)

// Service creates notifications.
type Service struct {
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewService constructs the service.
func NewService(db *pgxpool.Pool, logger *slog.Logger) *Service {
	return &Service{db: db, logger: logger}
}

// CreateInput is the payload for creating a notification.
type CreateInput struct {
	RecipientUserID string
	OrganisationID  string // optional

	EventType string
	Title     string
	Body      string

	// Related entity for deep-linking.
	RelatedEntityType string
	RelatedEntityID   string

	// Structured metadata for client rendering.
	Metadata map[string]any

	// Priority: low, normal, high, urgent.
	Priority string

	// Channels to attempt. If empty, defaults to in_app + email.
	Channels []string

	// Email-specific data. The dispatcher uses this to render and send.
	// If EmailTo is empty, no email delivery row is created.
	EmailTo string

	// Optional: an extra plain-text email body. If empty, the dispatcher
	// will use the notification title+body.
	EmailSubjectOverride string
}

// Create inserts a notification and its delivery rows. Honors user
// preferences — a channel the user has disabled for this event type is
// marked skipped, not created as pending.
//
// Returns the notification ID.
func (s *Service) Create(ctx context.Context, input CreateInput) (string, error) {
	if input.RecipientUserID == "" {
		return "", fmt.Errorf("recipient_user_id is required")
	}
	if input.EventType == "" || input.Title == "" || input.Body == "" {
		return "", fmt.Errorf("event_type, title, and body are required")
	}

	priority := input.Priority
	if priority == "" {
		priority = "normal"
	}

	// channels := input.Channels
	// if len(channels) == 0 {
	// 	channels = []string{ChannelInApp}
	// 	if input.EmailTo != "" {
	// 		channels = append(channels, ChannelEmail)
	// 	}
	// }


	channels := input.Channels
	if len(channels) == 0 {
		channels = []string{ChannelInApp}
	}

	// If email is requested but no target provided, look up the user's
	// email from the users table.
	emailTo := input.EmailTo
	if containsChannel(channels, ChannelEmail) && emailTo == "" {
		var userEmail *string
		err := s.db.QueryRow(ctx, `
			SELECT email FROM elber.users WHERE id = $1
		`, input.RecipientUserID).Scan(&userEmail)
		if err == nil && userEmail != nil && *userEmail != "" {
			emailTo = *userEmail
		}
	}




	metadata := input.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}

	notificationID := uuid.NewString()

	// Insert the notification row.
	var orgID any
	if input.OrganisationID != "" {
		orgID = input.OrganisationID
	}
	var relatedType any
	if input.RelatedEntityType != "" {
		relatedType = input.RelatedEntityType
	}
	var relatedID any
	if input.RelatedEntityID != "" {
		relatedID = input.RelatedEntityID
	}

	_, err := s.db.Exec(ctx, `
		INSERT INTO elber.notifications (
			id, recipient_user_id, organisation_id,
			event_type, title, body,
			related_entity_type, related_entity_id,
			metadata, priority
		) VALUES (
			$1, $2, $3,
			$4, $5, $6,
			$7, $8,
			$9, $10
		)
	`, notificationID, input.RecipientUserID, orgID,
		input.EventType, input.Title, input.Body,
		relatedType, relatedID,
		metadata, priority)
	if err != nil {
		return "", fmt.Errorf("insert notification: %w", err)
	}

	// Insert a delivery row for each channel.
	for _, channel := range channels {
		// Check user preference for this event/channel.
		var enabled bool = true
		err = s.db.QueryRow(ctx, `
			SELECT enabled FROM elber.notification_preferences
			WHERE user_id = $1 AND event_type = $2 AND channel = $3
		`, input.RecipientUserID, input.EventType, channel).Scan(&enabled)
		// If no row, default to enabled=true. If scan returned pgx.ErrNoRows
		// we ignore it. Any other error is a real problem.
		if err != nil && err.Error() != "no rows in result set" {
			s.logger.Warn("preference check failed, defaulting to enabled",
				"error", err, "channel", channel)
		}

		status := "pending"
		if !enabled {
			status = "skipped"
		}

		// Determine target.
		var target any
		// switch channel {
		// case ChannelEmail:
		// 	if input.EmailTo != "" {
		// 		target = input.EmailTo
		// 	} else {
		// 		// No email target — skip this channel.
		// 		status = "skipped"
		// 	}


		switch channel {
		case ChannelEmail:
			if emailTo != "" {
				target = emailTo
			} else {
				status = "skipped"
			}
		case ChannelSMS, ChannelPush:
			// Not implemented in Phase 2 for these events.
			status = "skipped"
		}

		_, err = s.db.Exec(ctx, `
			INSERT INTO elber.notification_deliveries (
				notification_id, channel, target, status
			) VALUES ($1, $2, $3, $4)
		`, notificationID, channel, target, status)
		if err != nil {
			return "", fmt.Errorf("insert delivery (%s): %w", channel, err)
		}
	}

	return notificationID, nil
}


func containsChannel(channels []string, c string) bool {
	for _, x := range channels {
		if x == c {
			return true
		}
	}
	return false
}