-- +goose Up
-- +goose StatementBegin

-- Users represent authenticated individuals. A user is not a business —
-- that is an organisation. A user can belong to multiple organisations
-- (see organisation_memberships in a later migration). This distinction
-- matters: a person is a person; a business is a business.
CREATE TABLE elber.users (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- External identity provider subject. Unique per provider. In Phase 1
    -- we will use OIDC, but the column exists now so the schema does not
    -- need restructuring later.
    identity_provider      TEXT NOT NULL DEFAULT 'local',
    identity_subject       TEXT,

    -- Contact details. Phone is the primary identifier for Nigerian
    -- businesses. Email is optional at registration but required for
    -- password recovery when available.
    full_name              TEXT NOT NULL,
    phone_number           TEXT NOT NULL,
    email                  TEXT,

    -- Account lifecycle.
    status                 TEXT NOT NULL DEFAULT 'pending_verification'
                              CHECK (status IN ('active', 'suspended', 'pending_verification')),

    -- Audit trail.
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraints. Phone numbers must be globally unique among users —
-- two people cannot share the primary contact identifier. Email is unique
-- only when present (NULL means not provided, multiple users may have none).
CREATE UNIQUE INDEX users_phone_number_unique
    ON elber.users (phone_number);

CREATE UNIQUE INDEX users_email_unique
    ON elber.users (LOWER(email))
    WHERE email IS NOT NULL;

-- External identity lookups during authentication.
CREATE UNIQUE INDEX users_identity_unique
    ON elber.users (identity_provider, identity_subject)
    WHERE identity_subject IS NOT NULL;

-- Sessions represent an active authenticated session. In Phase 0 this
-- table exists but is not populated — Phase 1 adds the session issuance
-- and verification logic. Recording sessions explicitly (rather than only
-- via JWT claims) enables server-side revocation, which is required for
-- account suspension and password-change flows.
CREATE TABLE elber.sessions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES elber.users (id) ON DELETE CASCADE,

    -- A hash of the refresh token, never the token itself. If an attacker
    -- gained read access to this table they still could not impersonate
    -- a session.
    refresh_token_hash     TEXT NOT NULL,

    -- Client metadata for the session list UI ("signed in on iPhone on
    -- 17 October").
    user_agent             TEXT,
    ip_address             INET,

    -- Lifecycle.
    expires_at             TIMESTAMPTZ NOT NULL,
    revoked_at             TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_id_idx ON elber.sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON elber.sessions (expires_at);

-- Trigger to automatically update updated_at on row change. Applied to
-- tables that have an updated_at column so we never forget to set it.
CREATE OR REPLACE FUNCTION elber.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch_updated_at
    BEFORE UPDATE ON elber.users
    FOR EACH ROW
    EXECUTE FUNCTION elber.touch_updated_at();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TRIGGER IF EXISTS users_touch_updated_at ON elber.users;
DROP FUNCTION IF EXISTS elber.touch_updated_at();
DROP TABLE IF EXISTS elber.sessions;
DROP TABLE IF EXISTS elber.users;

-- +goose StatementEnd