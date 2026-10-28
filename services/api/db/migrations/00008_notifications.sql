-- +goose Up
-- +goose StatementBegin

-- ═══════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════
--
-- A notification is an event that a specific user should know about.
-- Every notification is:
--   - Owned by exactly one recipient user
--   - Linked to a source entity (trip, payment, loan, etc.)
--   - Delivered through one or more channels (in-app, email, SMS, push)
--
-- Design:
--   - notifications: the event itself, per recipient
--   - notification_deliveries: per-channel delivery attempt + status
--   - notification_preferences: per-user opt-out per event type
--
-- The `deliveries` table doubles as a QUEUE: rows with status='pending'
-- are picked up by a background worker that dispatches them. Failed
-- deliveries retry with backoff. This avoids introducing Redis/RabbitMQ
-- until volume genuinely requires it.

CREATE TABLE elber.notifications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who should see this.
    recipient_user_id       UUID NOT NULL REFERENCES elber.users(id) ON DELETE CASCADE,

    -- The organisation context in which the notification is meaningful.
    -- (A user who belongs to multiple orgs sees notifications filtered
    -- by their active org.)
    organisation_id         UUID REFERENCES elber.organisations(id),

    -- What happened.
    -- Examples: 'transport_request_created', 'transport_request_assigned',
    --           'transport_request_status_changed', 'payment_confirmed',
    --           'financing_offer_issued'
    event_type              TEXT NOT NULL,

    -- Human-readable summary (short).
    title                   TEXT NOT NULL,
    body                    TEXT NOT NULL,

    -- The underlying entity that triggered this. Used for deep-linking
    -- from the notification (tap → open trip detail, payment detail, etc.).
    related_entity_type     TEXT,
    related_entity_id       UUID,

    -- Structured data for the client to render/route. For trips, this
    -- contains {reference, status, ...}. For payments, {amount, ...}.
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Priority for UI ordering (high priority stays pinned).
    priority                TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Read state — set when the user opens the notification.
    read_at                 TIMESTAMPTZ,

    -- Soft-delete (user can dismiss; we keep for audit).
    dismissed_at            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast access pattern: "my unread notifications, newest first"
CREATE INDEX notifications_user_unread_idx
    ON elber.notifications (recipient_user_id, created_at DESC)
    WHERE read_at IS NULL AND dismissed_at IS NULL;

-- Fast access pattern: "all my notifications, newest first"
CREATE INDEX notifications_user_all_idx
    ON elber.notifications (recipient_user_id, created_at DESC)
    WHERE dismissed_at IS NULL;

-- Lookup by related entity (for "show me all notifications about this trip")
CREATE INDEX notifications_related_idx
    ON elber.notifications (related_entity_type, related_entity_id)
    WHERE related_entity_id IS NOT NULL;

-- Queue + delivery tracking. One row per channel per notification.
-- If a notification is sent through email + in-app, there are two
-- delivery rows for it.
--
-- The dispatcher polls for status='pending' with retry logic. Rows move:
--   pending → sent (success)
--   pending → failed (terminal failure after retries)
--   pending → in_progress (temporarily, while sending)
CREATE TABLE elber.notification_deliveries (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id         UUID NOT NULL REFERENCES elber.notifications(id) ON DELETE CASCADE,

    -- Which channel.
    channel                 TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'push')),

    -- Delivery target — for email, the address; for SMS, the phone;
    -- for in_app, NULL (the notification row IS the in-app delivery).
    target                  TEXT,

    -- Delivery state.
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'sent', 'failed', 'skipped'
    )),

    -- Retry tracking.
    attempt_count           INTEGER NOT NULL DEFAULT 0,
    max_attempts            INTEGER NOT NULL DEFAULT 3,
    next_attempt_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Outcome tracking.
    sent_at                 TIMESTAMPTZ,
    failed_at               TIMESTAMPTZ,
    last_error              TEXT,

    -- Provider reference (Resend message ID, SMS provider ID, etc.)
    provider_reference      TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dispatcher polls this index for work.
CREATE INDEX notification_deliveries_queue_idx
    ON elber.notification_deliveries (next_attempt_at, status)
    WHERE status IN ('pending', 'in_progress');

-- Per-notification lookups for showing delivery status.
CREATE INDEX notification_deliveries_notification_idx
    ON elber.notification_deliveries (notification_id);

CREATE TRIGGER notification_deliveries_touch_updated_at
    BEFORE UPDATE ON elber.notification_deliveries
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Per-user preferences per event type. A row means "I do not want this
-- channel for this event type." Absence of a row means default (all
-- channels enabled).
--
-- Example: user opts out of 'transport_request_status_changed' via email
-- but keeps in-app. That's one row:
--   (user_id, 'transport_request_status_changed', 'email', 'disabled')
CREATE TABLE elber.notification_preferences (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES elber.users(id) ON DELETE CASCADE,
    event_type              TEXT NOT NULL,
    channel                 TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'push')),
    enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, event_type, channel)
);

CREATE TRIGGER notification_preferences_touch_updated_at
    BEFORE UPDATE ON elber.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS elber.notification_preferences;
DROP TABLE IF EXISTS elber.notification_deliveries;
DROP TABLE IF EXISTS elber.notifications;

-- +goose StatementEnd