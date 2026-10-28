-- +goose Up
-- +goose StatementBegin

-- Organisations represent businesses on the platform.
--
-- A user is not a business. An organisation is a business. One user can
-- belong to many organisations (e.g., someone who runs a farm and also
-- co-owns a trading company). Every business-owned record — listings,
-- orders, inventory, shipments, financial accounts — references an
-- organisation, not a user.
--
-- This is the multi-tenancy foundation. It must be right.
CREATE TABLE elber.organisations (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Business identity.
    legal_name             TEXT NOT NULL,
    trading_name           TEXT,
    organisation_type      TEXT NOT NULL CHECK (organisation_type IN (
        'farmer', 'trader', 'buyer', 'transporter', 'warehouse', 'inspector'
    )),

    -- Contact details. These are business-level; individual users have
    -- their own contact details on elber.users.
    primary_phone          TEXT,
    primary_email          TEXT,

    -- Business verification status. Set to 'not_started' at creation,
    -- advanced through the verification workflow in Slice C.
    verification_status    TEXT NOT NULL DEFAULT 'not_started' CHECK (verification_status IN (
        'not_started', 'draft', 'submitted', 'under_review',
        'additional_info_required', 'verified', 'rejected', 'suspended'
    )),

    -- Account lifecycle.
    status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),

    -- Audit.
    created_by_user_id     UUID NOT NULL REFERENCES elber.users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX organisations_type_status_idx
    ON elber.organisations (organisation_type, status)
    WHERE status = 'active';

CREATE INDEX organisations_created_by_idx
    ON elber.organisations (created_by_user_id);

CREATE TRIGGER organisations_touch_updated_at
    BEFORE UPDATE ON elber.organisations
    FOR EACH ROW
    EXECUTE FUNCTION elber.touch_updated_at();

-- Membership links users to organisations with a role. A user's permission
-- to act on behalf of a business is defined here — never implied by a
-- client-supplied organisation ID.
CREATE TABLE elber.organisation_memberships (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id        UUID NOT NULL REFERENCES elber.organisations(id) ON DELETE CASCADE,
    user_id                UUID NOT NULL REFERENCES elber.users(id) ON DELETE CASCADE,

    -- The user's role within this organisation. Roles are a controlled
    -- vocabulary; adding new ones is a schema change (deliberate).
    role                   TEXT NOT NULL CHECK (role IN (
        'owner', 'admin', 'manager', 'member', 'viewer'
    )),

    status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A user can have only one membership per organisation.
    UNIQUE (organisation_id, user_id)
);

CREATE INDEX organisation_memberships_user_idx
    ON elber.organisation_memberships (user_id, status)
    WHERE status = 'active';

CREATE INDEX organisation_memberships_org_idx
    ON elber.organisation_memberships (organisation_id, status)
    WHERE status = 'active';

CREATE TRIGGER organisation_memberships_touch_updated_at
    BEFORE UPDATE ON elber.organisation_memberships
    FOR EACH ROW
    EXECUTE FUNCTION elber.touch_updated_at();

-- Locations. A business may have multiple locations — warehouses, farms,
-- offices, branches. Even at creation time, we record the primary location.
CREATE TABLE elber.locations (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id        UUID NOT NULL REFERENCES elber.organisations(id) ON DELETE CASCADE,

    name                   TEXT NOT NULL,
    address_line           TEXT,
    locality               TEXT,          -- city/town
    state                  TEXT,          -- Nigerian state
    country_code           TEXT NOT NULL DEFAULT 'NG',
    latitude               NUMERIC(10, 7),
    longitude              NUMERIC(10, 7),

    location_type          TEXT NOT NULL DEFAULT 'primary' CHECK (location_type IN (
        'primary', 'warehouse', 'farm', 'office', 'branch', 'other'
    )),

    status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX locations_organisation_idx
    ON elber.locations (organisation_id, status)
    WHERE status = 'active';

CREATE INDEX locations_state_idx
    ON elber.locations (state)
    WHERE status = 'active';

CREATE TRIGGER locations_touch_updated_at
    BEFORE UPDATE ON elber.locations
    FOR EACH ROW
    EXECUTE FUNCTION elber.touch_updated_at();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TRIGGER IF EXISTS locations_touch_updated_at ON elber.locations;
DROP TABLE IF EXISTS elber.locations;

DROP TRIGGER IF EXISTS organisation_memberships_touch_updated_at ON elber.organisation_memberships;
DROP TABLE IF EXISTS elber.organisation_memberships;

DROP TRIGGER IF EXISTS organisations_touch_updated_at ON elber.organisations;
DROP TABLE IF EXISTS elber.organisations;

-- +goose StatementEnd