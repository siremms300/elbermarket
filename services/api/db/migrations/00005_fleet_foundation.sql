-- +goose Up
-- +goose StatementBegin

-- ─── Update organisation types ──────────────────────────────────────────
--
-- Restructuring for the logistics-first order:
--   - Add:    fleet_owner (a business that owns vehicles)
--   - Remove: transporter (replaced by fleet_owner)
--   - Keep:   inspector   (unused until marketplace; retained for schema
--                         continuity so we don't have to re-add it later)
--
-- The existing CHECK constraint must be replaced. There may be rows with
-- organisation_type = 'transporter' from earlier testing — migrate those
-- to 'fleet_owner' as a safety measure before tightening the constraint.

ALTER TABLE elber.organisations
    DROP CONSTRAINT IF EXISTS organisations_organisation_type_check;

UPDATE elber.organisations
SET organisation_type = 'fleet_owner'
WHERE organisation_type = 'transporter';

ALTER TABLE elber.organisations
    ADD CONSTRAINT organisations_organisation_type_check
    CHECK (organisation_type IN (
        'farmer', 'trader', 'buyer', 'warehouse', 'fleet_owner', 'inspector'
    ));

-- ─── Documents ──────────────────────────────────────────────────────────
--
-- Unified document store used by every feature that handles evidence:
--   - Business verification documents (CAC certificate, proof of address)
--   - Driver license scans
--   - Vehicle registration and insurance certificates
--   - Proof of delivery photos and signature images
--   - Insurance claim evidence
--   - Inspection results (Phase 4)
--
-- Files themselves live in S3-compatible object storage. This table stores
-- metadata and a storage key. Access is controlled via short-lived signed
-- URLs; the storage key is never exposed to clients directly.
--
-- The `owner_type` + `owner_id` pattern is deliberately polymorphic —
-- documents can belong to an organisation, a user, a trip, a claim. When
-- we know the specific type, we set both fields; the application layer
-- enforces which combinations are valid.

CREATE TABLE elber.documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What this document belongs to.
    owner_type              TEXT NOT NULL CHECK (owner_type IN (
        'user', 'organisation', 'transport_request', 'transport_claim',
        'insurance_claim', 'verification_case', 'inspection'
    )),
    owner_id                UUID NOT NULL,

    -- Classification.
    -- Examples: 'cac_certificate', 'business_registration', 'proof_of_address',
    --           'national_id', 'driver_license', 'vehicle_registration',
    --           'vehicle_insurance', 'pod_signature', 'pod_photo',
    --           'claim_evidence', 'inspection_result'
    document_type           TEXT NOT NULL,

    -- Storage reference (S3 key or equivalent). Never exposed to clients.
    storage_key             TEXT NOT NULL,
    storage_bucket          TEXT NOT NULL DEFAULT 'elber-documents',

    -- File metadata.
    content_type            TEXT NOT NULL,
    file_size_bytes         BIGINT NOT NULL CHECK (file_size_bytes > 0),
    original_filename       TEXT,
    checksum_sha256         TEXT,

    -- Access control.
    access_classification   TEXT NOT NULL DEFAULT 'private'
        CHECK (access_classification IN ('private', 'internal', 'public')),

    -- Audit.
    uploaded_by_user_id     UUID REFERENCES elber.users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX documents_owner_idx ON elber.documents (owner_type, owner_id);
CREATE INDEX documents_type_idx ON elber.documents (document_type);

CREATE TRIGGER documents_touch_updated_at
    BEFORE UPDATE ON elber.documents
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Spatial helper functions ───────────────────────────────────────────
--
-- These helpers encapsulate the interaction between NUMERIC lat/lon and
-- PostGIS GEOGRAPHY. They exist so that application code never has to
-- think about SRID 4326 (WGS 84) or coordinate ordering, and so that
-- changing the coordinate system later (unlikely but possible) is a
-- one-file change.

-- Point constructor from latitude and longitude in WGS 84.
--
-- Note: ST_MakePoint takes (longitude, latitude) — not (latitude,
-- longitude). This function exists because that's a classic bug source.
-- Application code calls this with (lat, lon) in that order and the
-- function does the swap correctly.
CREATE OR REPLACE FUNCTION elber.make_point(lat NUMERIC, lon NUMERIC)
RETURNS GEOGRAPHY AS $$
BEGIN
    IF lat IS NULL OR lon IS NULL THEN
        RETURN NULL;
    END IF;
    IF lat < -90 OR lat > 90 THEN
        RAISE EXCEPTION 'latitude % out of range [-90, 90]', lat;
    END IF;
    IF lon < -180 OR lon > 180 THEN
        RAISE EXCEPTION 'longitude % out of range [-180, 180]', lon;
    END IF;
    RETURN ST_SetSRID(
        ST_MakePoint(lon::double precision, lat::double precision),
        4326
    )::geography;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Distance in meters between two geography points. Uses the spheroid
-- model (more accurate than sphere for long distances).
CREATE OR REPLACE FUNCTION elber.distance_meters(a GEOGRAPHY, b GEOGRAPHY)
RETURNS NUMERIC AS $$
    SELECT ST_Distance(a, b)::NUMERIC;
$$ LANGUAGE sql IMMUTABLE;

-- ─── Vehicles ───────────────────────────────────────────────────────────
--
-- The physical assets. A vehicle is an object with identity (plate),
-- specifications (make, model, capacity) and lifecycle status. It does
-- not belong to a "transporter" — the ownership is expressed separately
-- in vehicle_owners below, because a vehicle can be jointly owned.
--
-- plate_number is unique per country. We use a composite UNIQUE across
-- (country_code, plate_number) so Nigeria and, say, Ghana can both have
-- the same plate — even though plates are nationally unique, allowing
-- future multi-country operation.
CREATE TABLE elber.vehicles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    plate_number            TEXT NOT NULL,
    country_code            TEXT NOT NULL DEFAULT 'NG',

    -- Specifications
    make                    TEXT,
    model                   TEXT,
    year                    INTEGER,
    vehicle_type            TEXT NOT NULL CHECK (vehicle_type IN (
        'truck', 'van', 'pickup', 'trailer', 'tanker', 'refrigerated', 'other'
    )),
    capacity_kg             NUMERIC(12, 2) NOT NULL CHECK (capacity_kg > 0),
    capacity_m3             NUMERIC(12, 2),

    -- Home base location — used for assignment matching when the vehicle
    -- is idle. May differ from where it currently is (see vehicle_locations).
    home_base_location_id   UUID REFERENCES elber.locations(id),

    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'maintenance', 'retired'
    )),

    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (country_code, plate_number)
);

CREATE INDEX vehicles_type_status_idx ON elber.vehicles (vehicle_type, status)
    WHERE status = 'active';

CREATE TRIGGER vehicles_touch_updated_at
    BEFORE UPDATE ON elber.vehicles
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Vehicle owners ─────────────────────────────────────────────────────
--
-- Polymorphic ownership: a vehicle can be owned by a user (individual
-- owner-driver) or an organisation (fleet company, including ELBER's
-- own fleet). A vehicle can have multiple owners (joint ownership).
--
-- Exactly one of owner_user_id or owner_organisation_id must be non-null.
-- Both null = no owner (invalid). Both set = ambiguous (invalid).
CREATE TABLE elber.vehicle_owners (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id              UUID NOT NULL REFERENCES elber.vehicles(id) ON DELETE CASCADE,

    owner_user_id           UUID REFERENCES elber.users(id) ON DELETE CASCADE,
    owner_organisation_id   UUID REFERENCES elber.organisations(id) ON DELETE CASCADE,

    -- Ownership share. Defaults to 100.00 for sole ownership. Sum across
    -- all owners of a vehicle should equal 100.00 — enforced in application
    -- logic, not the schema (Postgres constraints can't easily express
    -- cross-row sums).
    ownership_percentage    NUMERIC(5, 2) NOT NULL DEFAULT 100.00
        CHECK (ownership_percentage > 0 AND ownership_percentage <= 100),

    -- Whether this owner is the primary point of contact for the vehicle.
    -- Only one per vehicle should be primary — enforced in app logic.
    is_primary              BOOLEAN NOT NULL DEFAULT FALSE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT vehicle_owners_exactly_one_owner CHECK (
        (owner_user_id IS NOT NULL AND owner_organisation_id IS NULL) OR
        (owner_user_id IS NULL AND owner_organisation_id IS NOT NULL)
    )
);

CREATE INDEX vehicle_owners_vehicle_idx ON elber.vehicle_owners (vehicle_id);
CREATE INDEX vehicle_owners_user_idx ON elber.vehicle_owners (owner_user_id)
    WHERE owner_user_id IS NOT NULL;
CREATE INDEX vehicle_owners_org_idx ON elber.vehicle_owners (owner_organisation_id)
    WHERE owner_organisation_id IS NOT NULL;

-- ─── Drivers ────────────────────────────────────────────────────────────
--
-- A driver profile is attached to a user. The user is the person;
-- the driver record carries the driving credentials. A user can only
-- have one driver profile (they're the same person, one license).
CREATE TABLE elber.drivers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES elber.users(id) ON DELETE CASCADE,

    -- License details
    license_number          TEXT NOT NULL,
    license_class           TEXT,
    license_expiry          DATE NOT NULL,

    -- Verification. A driver cannot be assigned to a trip until verified.
    verification_status     TEXT NOT NULL DEFAULT 'not_started' CHECK (verification_status IN (
        'not_started', 'submitted', 'under_review', 'verified', 'rejected', 'suspended'
    )),
    verified_at             TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX drivers_status_idx ON elber.drivers (verification_status);
CREATE INDEX drivers_license_number_idx ON elber.drivers (license_number);

CREATE TRIGGER drivers_touch_updated_at
    BEFORE UPDATE ON elber.drivers
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Fleet company ↔ drivers ────────────────────────────────────────────
--
-- Which drivers are employed by or affiliated with which fleet companies.
-- A driver can be affiliated with multiple fleet companies (rare but
-- possible — e.g., a contractor who works with two companies).
CREATE TABLE elber.fleet_company_drivers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id         UUID NOT NULL REFERENCES elber.organisations(id) ON DELETE CASCADE,
    driver_id               UUID NOT NULL REFERENCES elber.drivers(id) ON DELETE CASCADE,

    relationship_type       TEXT NOT NULL DEFAULT 'employee' CHECK (relationship_type IN (
        'employee', 'contractor', 'temp'
    )),

    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'inactive', 'revoked'
    )),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (organisation_id, driver_id)
);

CREATE INDEX fleet_company_drivers_driver_idx ON elber.fleet_company_drivers (driver_id)
    WHERE status = 'active';

-- ─── Vehicle ↔ driver assignments ───────────────────────────────────────
--
-- Which drivers are authorised to drive which vehicles. Many-to-many:
-- a fleet may have many vehicles and many drivers, with various
-- assignments. An assignment can be primary (regular driver), secondary
-- (backup), or temporary (for a specific trip).
CREATE TABLE elber.vehicle_driver_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id              UUID NOT NULL REFERENCES elber.vehicles(id) ON DELETE CASCADE,
    driver_id               UUID NOT NULL REFERENCES elber.drivers(id) ON DELETE CASCADE,

    assignment_type         TEXT NOT NULL DEFAULT 'primary' CHECK (assignment_type IN (
        'primary', 'secondary', 'temporary'
    )),

    -- For temporary assignments, the window during which the assignment
    -- is valid. NULL means open-ended.
    effective_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until         TIMESTAMPTZ,

    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'expired', 'revoked'
    )),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A driver cannot have two active assignments of the same type to the
    -- same vehicle. They can have a primary and a temporary, for example.
    UNIQUE (vehicle_id, driver_id, assignment_type, status)
);

CREATE INDEX vehicle_driver_assignments_vehicle_idx
    ON elber.vehicle_driver_assignments (vehicle_id) WHERE status = 'active';
CREATE INDEX vehicle_driver_assignments_driver_idx
    ON elber.vehicle_driver_assignments (driver_id) WHERE status = 'active';

-- ─── Geographic boundaries ──────────────────────────────────────────────
--
-- Named geographic regions used for geofencing, reporting, and analytics.
-- Examples: Nigerian states, LGAs, custom service areas, risk zones.
--
-- Each boundary is a PostGIS POLYGON. Queries can:
--   - Check if a point is inside a boundary: ST_Contains
--   - Find all boundaries containing a point: reverse index lookup
--   - Compute area, perimeter: ST_Area, ST_Perimeter
--   - Export as GeoJSON for map rendering: ST_AsGeoJSON
--
-- This table is empty at migration time. Boundaries are seeded via
-- application-managed imports (e.g., from Natural Earth shapefiles for
-- states, or drawn in the admin console for custom zones).
CREATE TABLE elber.geographic_boundaries (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Classification: 'state' | 'lga' | 'service_area' | 'risk_zone' | 'custom'
    boundary_type           TEXT NOT NULL,

    -- Human-readable identity
    name                    TEXT NOT NULL,
    code                    TEXT,        -- e.g., 'NG-KD' for Kaduna State
    country_code            TEXT NOT NULL DEFAULT 'NG',

    -- The boundary polygon. GEOGRAPHY type so distances and containment
    -- are measured on the earth's surface, not in projected space.
    boundary                GEOGRAPHY(POLYGON, 4326) NOT NULL,

    -- Parent boundary for hierarchical geographies (LGA inside state).
    parent_boundary_id      UUID REFERENCES elber.geographic_boundaries(id),

    -- Metadata
    properties              JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'inactive'
    )),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIST index on the boundary — this is what makes ST_Contains and
-- ST_Intersects fast. Without it, containment queries scan every row.
CREATE INDEX geographic_boundaries_gist_idx
    ON elber.geographic_boundaries USING GIST (boundary);

CREATE INDEX geographic_boundaries_type_idx
    ON elber.geographic_boundaries (boundary_type, country_code)
    WHERE status = 'active';

CREATE INDEX geographic_boundaries_parent_idx
    ON elber.geographic_boundaries (parent_boundary_id)
    WHERE parent_boundary_id IS NOT NULL;

CREATE TRIGGER geographic_boundaries_touch_updated_at
    BEFORE UPDATE ON elber.geographic_boundaries
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Vehicle locations ──────────────────────────────────────────────────
--
-- Layered location tracking with full PostGIS integration from day one.
-- Every row is a point in time and space. A vehicle's current location
-- is the latest row by recorded_at; its historical path is all rows.
--
-- Latitude/longitude are stored as NUMERIC for exact arithmetic and
-- auditability. The `location` GEOGRAPHY column is a generated column
-- derived from them — kept in sync by the database, so it can never
-- drift. Application code inserts lat/lon; PostGIS queries use location.
CREATE TABLE elber.vehicle_locations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id              UUID NOT NULL REFERENCES elber.vehicles(id) ON DELETE CASCADE,

    latitude                NUMERIC(10, 7) NOT NULL
        CHECK (latitude >= -90 AND latitude <= 90),
    longitude               NUMERIC(10, 7) NOT NULL
        CHECK (longitude >= -180 AND longitude <= 180),

    -- PostGIS point, generated from lat/lon.
    location                GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(
                ST_MakePoint(longitude::double precision, latitude::double precision),
                4326
            )::geography
        ) STORED,

    -- How we learned this location.
    location_source         TEXT NOT NULL CHECK (location_source IN (
        'gps', 'manual', 'trip_endpoint'
    )),

    -- Accuracy in meters, when known (GPS reports this; manual does not).
    accuracy_meters         NUMERIC(8, 2),

    -- If the location was reported by a user, who.
    recorded_by_user_id     UUID REFERENCES elber.users(id) ON DELETE SET NULL,

    -- If associated with a trip (added FK in migration 00006).
    related_transport_job_id UUID,

    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary access pattern: most recent location of a specific vehicle.
CREATE INDEX vehicle_locations_vehicle_recent_idx
    ON elber.vehicle_locations (vehicle_id, recorded_at DESC);

-- Spatial index for geofencing queries — "which vehicles are currently
-- inside Kaduna state?" and similar. This is the workhorse index.
CREATE INDEX vehicle_locations_gist_idx
    ON elber.vehicle_locations USING GIST (location);

-- ─── Organisation type index refresh ────────────────────────────────────

DROP INDEX IF EXISTS elber.organisations_type_status_idx;
CREATE INDEX organisations_type_status_idx
    ON elber.organisations (organisation_type, status)
    WHERE status = 'active';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS elber.vehicle_locations;
DROP TABLE IF EXISTS elber.geographic_boundaries;
DROP TABLE IF EXISTS elber.vehicle_driver_assignments;
DROP TABLE IF EXISTS elber.fleet_company_drivers;
DROP TABLE IF EXISTS elber.drivers;
DROP TABLE IF EXISTS elber.vehicle_owners;
DROP TABLE IF EXISTS elber.vehicles;
DROP TABLE IF EXISTS elber.documents;

DROP FUNCTION IF EXISTS elber.distance_meters(GEOGRAPHY, GEOGRAPHY);
DROP FUNCTION IF EXISTS elber.make_point(NUMERIC, NUMERIC);

ALTER TABLE elber.organisations
    DROP CONSTRAINT IF EXISTS organisations_organisation_type_check;

UPDATE elber.organisations
SET organisation_type = 'transporter'
WHERE organisation_type = 'fleet_owner';

ALTER TABLE elber.organisations
    ADD CONSTRAINT organisations_organisation_type_check
    CHECK (organisation_type IN (
        'farmer', 'trader', 'buyer', 'transporter', 'warehouse', 'inspector'
    ));

-- +goose StatementEnd