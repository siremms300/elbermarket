-- +goose Up
-- +goose StatementBegin

-- OTP codes. This table stores hashed OTP codes issued for any purpose
-- (registration, password reset, sensitive action verification). Never
-- stores the plaintext code.
--
-- Design notes:
--   - Codes are hashed so a database leak does not expose live OTPs.
--   - attempt_count tracks verification attempts and is incremented on
--     each failed attempt. Once it reaches max_attempts, the code is
--     unusable and must be re-issued.
--   - consumed_at is set when the code is successfully verified. A
--     consumed code cannot be used again, even within its TTL.
--   - target is the phone number or email the code was sent to. Combined
--     with purpose, this lets us scope a code to a specific destination.
CREATE TABLE elber.otp_codes (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What this code authorises. Currently: 'registration', 'login',
    -- 'password_reset'. New purposes get added here, no schema change.
    purpose                TEXT NOT NULL,

    -- Where the code was sent. Either a phone number (E.164) or an email.
    target                 TEXT NOT NULL,

    -- Channel used to deliver the code. Recorded so we know how the user
    -- received it, for support and analytics.
    channel                TEXT NOT NULL CHECK (channel IN ('sms', 'email')),

    -- SHA-256 of the code. A hex-encoded hash.
    code_hash              TEXT NOT NULL,

    -- Throttling state.
    attempt_count          INTEGER NOT NULL DEFAULT 0,
    max_attempts           INTEGER NOT NULL DEFAULT 5,

    -- Lifecycle.
    expires_at             TIMESTAMPTZ NOT NULL,
    consumed_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup by target and purpose when verifying.
CREATE INDEX otp_codes_target_purpose_idx
    ON elber.otp_codes (target, purpose)
    WHERE consumed_at IS NULL;

-- Cleanup of expired codes.
CREATE INDEX otp_codes_expires_at_idx
    ON elber.otp_codes (expires_at);

-- Add verification timestamps to users. A user is not "active" until both
-- their phone and email (if provided) are verified — this is enforced in
-- the domain layer, not the schema, because the exact rule may evolve.
ALTER TABLE elber.users
    ADD COLUMN phone_verified_at   TIMESTAMPTZ,
    ADD COLUMN email_verified_at   TIMESTAMPTZ;

-- Two existing columns must become required now that auth is real:
-- the user record must be anchored to a specific phone/email that we
-- verified. Missing values would indicate a broken record.
UPDATE elber.users SET phone_number = 'UNKNOWN' WHERE phone_number = '';
ALTER TABLE elber.users
    ALTER COLUMN phone_number SET NOT NULL;

-- Add updated_at default for sessions so revocation timestamps sort
-- naturally with creation.
ALTER TABLE elber.sessions
    ADD COLUMN last_used_at TIMESTAMPTZ;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE elber.sessions DROP COLUMN IF EXISTS last_used_at;

ALTER TABLE elber.users
    DROP COLUMN IF EXISTS email_verified_at,
    DROP COLUMN IF EXISTS phone_verified_at;

DROP INDEX IF EXISTS otp_codes_expires_at_idx;
DROP INDEX IF EXISTS otp_codes_target_purpose_idx;
DROP TABLE IF EXISTS elber.otp_codes;

-- +goose StatementEnd