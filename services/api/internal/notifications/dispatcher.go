// Dispatcher.
//
// Background goroutine that polls notification_deliveries for pending
// items and sends them via the appropriate channel. Runs in the API
// process; no separate worker infrastructure needed for Phase 2.
//
// Concurrency design:
//   - Single worker (one goroutine) — no contention, no need for
//     FOR UPDATE SKIP LOCKED yet. Multiple workers can be added when
//     throughput demands it (Phase 3+).
//   - Each row is claimed with a transactional UPDATE ... WHERE id IN (...)
//     that transitions status pending → in_progress. This is the atomic
//     claim — even if another worker were added, they wouldn't
//     double-send.
//   - On success, status → sent. On failure, status → failed with
//     retry logic (backoff). Permanent failures (invalid email, etc.)
//     go directly to failed without retry.
//
// Retry strategy:
//   - Transient failures (provider 5xx, timeout): retry with backoff
//     (30s → 2m → 8m), up to max_attempts
//   - Permanent failures (provider 4xx with clear error): fail immediately
//
// Stale lock recovery:
//   - If the process crashes between claim and update, rows stay
//     in_progress. A periodic reaper resets rows that have been
//     in_progress for over 5 minutes back to pending.

package notifications

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"

	"github.com/elbermarket/api/internal/platform/email"
)

// Dispatcher polls and sends notification deliveries.
type Dispatcher struct {
	db       *pgxpool.Pool
	email    email.Provider
	logger   *slog.Logger
	interval time.Duration
	stop     chan struct{}
	done     chan struct{}
}

// NewDispatcher constructs the dispatcher. Does not start it.
func NewDispatcher(db *pgxpool.Pool, emailProvider email.Provider, logger *slog.Logger) *Dispatcher {
	return &Dispatcher{
		db:       db,
		email:    emailProvider,
		logger:   logger,
		interval: 5 * time.Second,
		stop:     make(chan struct{}),
		done:     make(chan struct{}),
	}
}

// Start begins the dispatcher loop in a background goroutine.
// Blocks the calling goroutine; call from `go dispatcher.Start(ctx)`.
func (d *Dispatcher) Start(ctx context.Context) {
	defer close(d.done)

	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()

	// Run once immediately so the first trip doesn't wait 5 seconds.
	d.tick(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-d.stop:
			return
		case <-ticker.C:
			d.tick(ctx)
		}
	}
}

// Stop signals the dispatcher to stop and waits for it to exit.
func (d *Dispatcher) Stop() {
	close(d.stop)
	<-d.done
}

// tick processes one batch of pending deliveries + runs the reaper.
func (d *Dispatcher) tick(ctx context.Context) {
	// Process one batch of pending deliveries.
	if err := d.processBatch(ctx); err != nil {
		d.logger.Error("dispatcher batch failed", "error", err)
	}

	// Reset stale in_progress rows.
	if err := d.reapStale(ctx); err != nil {
		d.logger.Error("dispatcher reap failed", "error", err)
	}
}

// processBatch claims and processes up to 20 pending deliveries.
func (d *Dispatcher) processBatch(ctx context.Context) error {
	// Claim a batch — atomically mark as in_progress.
	// Uses CTE to select+update in one statement, guaranteeing atomicity
	// even with future concurrent workers.
	rows, err := d.db.Query(ctx, `
		WITH claimed AS (
			SELECT id FROM elber.notification_deliveries
			WHERE status = 'pending'
			  AND next_attempt_at <= NOW()
			ORDER BY next_attempt_at
			LIMIT 20
			FOR UPDATE SKIP LOCKED
		)
		UPDATE elber.notification_deliveries d
		SET status = 'in_progress',
		    updated_at = NOW()
		FROM claimed
		WHERE d.id = claimed.id
		RETURNING d.id, d.notification_id, d.channel, d.target, d.attempt_count, d.max_attempts
	`)
	if err != nil {
		return fmt.Errorf("claim batch: %w", err)
	}

	type item struct {
		ID              string
		NotificationID  string
		Channel         string
		Target          *string
		AttemptCount    int
		MaxAttempts     int
	}

	var items []item
	for rows.Next() {
		var i item
		if err := rows.Scan(&i.ID, &i.NotificationID, &i.Channel, &i.Target, &i.AttemptCount, &i.MaxAttempts); err != nil {
			rows.Close()
			return fmt.Errorf("scan claimed: %w", err)
		}
		items = append(items, i)
	}
	rows.Close()

	if len(items) == 0 {
		return nil
	}

	// Process each item. Do not use transaction here — each send is
	// independent.
	for _, i := range items {
		d.processOne(ctx, i.ID, i.NotificationID, i.Channel, i.Target, i.AttemptCount, i.MaxAttempts)
	}

	return nil
}

func (d *Dispatcher) processOne(ctx context.Context, id, notificationID, channel string, target *string, attemptCount, maxAttempts int) {
	var sendErr error

	switch channel {
	case ChannelInApp:
		// In-app is a no-op send — the notification row IS the delivery.
		// Marking it 'sent' just means "acknowledged as visible to the app."
		sendErr = nil

	case ChannelEmail:
		if target == nil || strings.TrimSpace(*target) == "" {
			// No email target — fail permanently.
			d.failPermanent(ctx, id, "email target missing")
			return
		}

		// Load the notification to render the email.
		content, loadErr := d.loadEmailContent(ctx, notificationID)
		if loadErr != nil {
			d.logger.Error("load email content failed", "error", loadErr, "notification_id", notificationID)
			d.failRetry(ctx, id, attemptCount, maxAttempts, loadErr.Error())
			return
		}

		// Send.
		// if err := d.email.Send(ctx, *target, content.Subject, content.HTML); err != nil {
		// Send. Use HTML body — the template produces full HTML markup.
		if err := d.email.Send(ctx, email.Message{
			To:      *target,
			Subject: content.Subject,
			HTML:    content.HTML,
		}); err != nil {
			d.logger.Warn("email send failed",
				"error", err,
				"notification_id", notificationID,
				"target", *target,
				"attempt", attemptCount+1,
			)
			// Check if the error is permanent. The email provider interface
			// doesn't distinguish, so we use string heuristics: 4xx errors
			// (invalid email, blocked domain) are permanent; timeouts and
			// 5xx are transient.
			if isPermanentEmailError(err) {
				d.failPermanent(ctx, id, err.Error())
			} else {
				d.failRetry(ctx, id, attemptCount, maxAttempts, err.Error())
			}
			return
		}
		sendErr = nil

	case ChannelSMS, ChannelPush:
		// Not implemented in Phase 2 — skip.
		d.failPermanent(ctx, id, "channel not implemented")
		return

	default:
		d.failPermanent(ctx, id, "unknown channel: "+channel)
		return
	}

	if sendErr != nil {
		d.failRetry(ctx, id, attemptCount, maxAttempts, sendErr.Error())
		return
	}

	// Success.
	_, err := d.db.Exec(ctx, `
		UPDATE elber.notification_deliveries
		SET status = 'sent', sent_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, id)
	if err != nil {
		d.logger.Error("mark sent failed", "error", err, "delivery_id", id)
	}
}

// loadEmailContent loads the notification and renders the appropriate
// template.
func (d *Dispatcher) loadEmailContent(ctx context.Context, notificationID string) (*EmailContent, error) {
	var eventType, title, body string
	var metadata map[string]any

	err := d.db.QueryRow(ctx, `
		SELECT event_type, title, body, metadata
		FROM elber.notifications
		WHERE id = $1
	`, notificationID).Scan(&eventType, &title, &body, &metadata)
	if err != nil {
		return nil, fmt.Errorf("load notification: %w", err)
	}

	// Use the pre-rendered content from templates.
	content := RenderEmail(eventType, metadata)
	// If template didn't produce anything (unlikely), use the raw
	// title+body as a fallback.
	if content.HTML == "" {
		content = EmailContent{
			Subject: title,
			HTML:    BaseEmail(title, title, "<p>"+body+"</p>", ""),
		}
	}
	return &content, nil
}

// failRetry schedules a retry with backoff. If attempts exhausted, mark
// as failed permanently.
func (d *Dispatcher) failRetry(ctx context.Context, id string, attemptCount, maxAttempts int, lastError string) {
	newAttempts := attemptCount + 1

	if newAttempts >= maxAttempts {
		d.failPermanent(ctx, id, lastError)
		return
	}

	// Exponential backoff: 30s, 2m, 8m
	var delay time.Duration
	switch newAttempts {
	case 1:
		delay = 30 * time.Second
	case 2:
		delay = 2 * time.Minute
	default:
		delay = 8 * time.Minute
	}

	_, err := d.db.Exec(ctx, `
		UPDATE elber.notification_deliveries
		SET status = 'pending',
		    attempt_count = $2,
		    next_attempt_at = NOW() + $3::INTERVAL,
		    last_error = $4,
		    updated_at = NOW()
		WHERE id = $1
	`, id, newAttempts, fmt.Sprintf("%d seconds", int(delay.Seconds())), truncate(lastError, 500))
	if err != nil {
		d.logger.Error("mark retry failed", "error", err, "delivery_id", id)
	}
}

// failPermanent marks the delivery as permanently failed. No retries.
func (d *Dispatcher) failPermanent(ctx context.Context, id, lastError string) {
	_, err := d.db.Exec(ctx, `
		UPDATE elber.notification_deliveries
		SET status = 'failed',
		    failed_at = NOW(),
		    last_error = $2,
		    updated_at = NOW()
		WHERE id = $1
	`, id, truncate(lastError, 500))
	if err != nil {
		d.logger.Error("mark failed permanent", "error", err, "delivery_id", id)
	}
}

// reapStale resets in_progress rows that have been stuck for over 5
// minutes (process crash recovery).
func (d *Dispatcher) reapStale(ctx context.Context) error {
	tag, err := d.db.Exec(ctx, `
		UPDATE elber.notification_deliveries
		SET status = 'pending',
		    updated_at = NOW()
		WHERE status = 'in_progress'
		  AND updated_at < NOW() - INTERVAL '5 minutes'
	`)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		d.logger.Warn("reaped stale in_progress deliveries", "count", tag.RowsAffected())
	}
	return nil
}

// isPermanentEmailError classifies an error from the email provider.
// Uses string heuristics — the Provider interface doesn't have structured
// errors yet. In a later phase, wrap provider errors in typed ones.
func isPermanentEmailError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	// Permanent indicators
	permanentPatterns := []string{
		"invalid email",
		"invalid recipient",
		"blocked",
		"hard bounce",
		"does not exist",
		"status 400",  // Resend uses 400 for validation errors
		"status 422",  // Resend uses 422 for unprocessable
	}
	for _, p := range permanentPatterns {
		if strings.Contains(msg, p) {
			return true
		}
	}
	return false
}

// truncate limits a string to n chars to avoid unbounded error columns.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// silence unused import warning
var _ = errors.New
var _ = pgx.ErrNoRows