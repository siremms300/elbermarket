-- +goose Up
-- +goose StatementBegin

-- ─── Transport requests (the trip record) ──────────────────────────────

CREATE TABLE elber.transport_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,

    requester_user_id       UUID NOT NULL REFERENCES elber.users(id),
    requester_org_id        UUID NOT NULL REFERENCES elber.organisations(id),
    external_reference      TEXT,

    -- What's being moved
    cargo_description       TEXT NOT NULL,
    cargo_declared_value    NUMERIC(14, 2) NOT NULL CHECK (cargo_declared_value >= 0),
    cargo_currency          TEXT NOT NULL DEFAULT 'NGN',
    cargo_weight_kg         NUMERIC(12, 2) NOT NULL CHECK (cargo_weight_kg > 0),
    cargo_volume_m3         NUMERIC(12, 2),
    handling_requirements   JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- From where to where
    pickup_location_id      UUID REFERENCES elber.locations(id),
    pickup_address          TEXT NOT NULL,
    pickup_latitude         NUMERIC(10, 7) NOT NULL CHECK (pickup_latitude >= -90 AND pickup_latitude <= 90),
    pickup_longitude        NUMERIC(10, 7) NOT NULL CHECK (pickup_longitude >= -180 AND pickup_longitude <= 180),
    pickup_point            GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(
                ST_MakePoint(pickup_longitude::double precision, pickup_latitude::double precision),
                4326
            )::geography
        ) STORED,

    destination_location_id UUID REFERENCES elber.locations(id),
    destination_address     TEXT NOT NULL,
    destination_latitude    NUMERIC(10, 7) NOT NULL CHECK (destination_latitude >= -90 AND destination_latitude <= 90),
    destination_longitude   NUMERIC(10, 7) NOT NULL CHECK (destination_longitude >= -180 AND destination_longitude <= 180),
    destination_point       GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(
                ST_MakePoint(destination_longitude::double precision, destination_latitude::double precision),
                4326
            )::geography
        ) STORED,

    -- Straight-line distance in meters. Computed inline from raw lat/lon
    -- because Postgres forbids generated columns from referencing other
    -- generated columns.
    straight_line_distance_m NUMERIC(12, 2)
        GENERATED ALWAYS AS (
            ST_Distance(
                ST_SetSRID(
                    ST_MakePoint(pickup_longitude::double precision, pickup_latitude::double precision),
                    4326
                )::geography,
                ST_SetSRID(
                    ST_MakePoint(destination_longitude::double precision, destination_latitude::double precision),
                    4326
                )::geography
            )::NUMERIC
        ) STORED,

    -- When
    pickup_window_start     TIMESTAMPTZ NOT NULL,
    pickup_window_end       TIMESTAMPTZ NOT NULL,
    CONSTRAINT pickup_window_valid CHECK (pickup_window_end > pickup_window_start),

    -- Vehicle requirements
    required_vehicle_type   TEXT CHECK (required_vehicle_type IN (
        'truck', 'van', 'pickup', 'trailer', 'tanker', 'refrigerated', 'other'
    )),
    required_min_capacity_kg NUMERIC(12, 2),

    -- Financial terms (set at assignment, not at request time)
    freight_charge_assigned  NUMERIC(14, 2) CHECK (freight_charge_assigned >= 0),
    freight_charge_final     NUMERIC(14, 2) CHECK (freight_charge_final >= 0),
    freight_currency         TEXT NOT NULL DEFAULT 'NGN',
    charge_amendment_reason  TEXT,

    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN (
            'draft',
            'requested',
            'assignment_pending',
            'assigned',
            'shipper_confirmed',
            'vehicle_en_route',
            'at_pickup',
            'loaded',
            'in_transit',
            'at_destination',
            'delivered',
            'closed',
            'cancelled',
            'failed',
            'disputed'
        )),

    -- Cancellation / failure metadata
    cancellation_reason     TEXT,
    cancelled_at            TIMESTAMPTZ,
    cancelled_by_user_id    UUID REFERENCES elber.users(id),

    -- Audit timestamps
    requested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at             TIMESTAMPTZ,
    shipper_confirmed_at    TIMESTAMPTZ,
    picked_up_at            TIMESTAMPTZ,
    delivered_at            TIMESTAMPTZ,
    closed_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transport_requests_requester_idx
    ON elber.transport_requests (requester_org_id, requested_at DESC);

CREATE INDEX transport_requests_status_idx
    ON elber.transport_requests (status, requested_at DESC)
    WHERE status NOT IN ('closed', 'cancelled', 'failed');

CREATE INDEX transport_requests_pickup_gist_idx
    ON elber.transport_requests USING GIST (pickup_point);
CREATE INDEX transport_requests_destination_gist_idx
    ON elber.transport_requests USING GIST (destination_point);

CREATE TRIGGER transport_requests_touch_updated_at
    BEFORE UPDATE ON elber.transport_requests
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Add the FK on vehicle_locations now that transport_requests exists.
ALTER TABLE elber.vehicle_locations
    ADD CONSTRAINT vehicle_locations_transport_job_fk
    FOREIGN KEY (related_transport_job_id)
    REFERENCES elber.transport_requests(id)
    ON DELETE SET NULL;

-- ─── Transport assignments ──────────────────────────────────────────────

CREATE TABLE elber.transport_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transport_request_id    UUID NOT NULL REFERENCES elber.transport_requests(id) ON DELETE CASCADE,
    vehicle_id              UUID NOT NULL REFERENCES elber.vehicles(id),
    driver_id               UUID NOT NULL REFERENCES elber.drivers(id),
    freight_charge          NUMERIC(14, 2) NOT NULL CHECK (freight_charge >= 0),
    assigned_by_user_id     UUID NOT NULL REFERENCES elber.users(id),
    assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at              TIMESTAMPTZ,
    revoked_by_user_id      UUID REFERENCES elber.users(id),
    revocation_reason       TEXT,
    status                  TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked'))
);

CREATE UNIQUE INDEX transport_assignments_one_active_per_trip
    ON elber.transport_assignments (transport_request_id)
    WHERE status = 'active';

CREATE INDEX transport_assignments_vehicle_idx
    ON elber.transport_assignments (vehicle_id, assigned_at DESC);
CREATE INDEX transport_assignments_driver_idx
    ON elber.transport_assignments (driver_id, assigned_at DESC);

-- ─── Trip events ────────────────────────────────────────────────────────

CREATE TABLE elber.trip_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transport_request_id    UUID NOT NULL REFERENCES elber.transport_requests(id) ON DELETE CASCADE,
    event_type              TEXT NOT NULL,
    status_before           TEXT,
    status_after            TEXT,

    latitude                NUMERIC(10, 7),
    longitude               NUMERIC(10, 7),
    location                GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            CASE
                WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN
                    ST_SetSRID(
                        ST_MakePoint(longitude::double precision, latitude::double precision),
                        4326
                    )::geography
                ELSE NULL
            END
        ) STORED,

    actor_user_id           UUID REFERENCES elber.users(id),
    event_data              JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes                   TEXT,
    attachment_ids          UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    occurred_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trip_events_request_time_idx
    ON elber.trip_events (transport_request_id, occurred_at DESC);
CREATE INDEX trip_events_type_idx
    ON elber.trip_events (event_type, occurred_at DESC);
CREATE INDEX trip_events_gist_idx
    ON elber.trip_events USING GIST (location)
    WHERE location IS NOT NULL;

-- ─── Trip waypoints ─────────────────────────────────────────────────────

CREATE TABLE elber.trip_waypoints (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transport_request_id    UUID NOT NULL REFERENCES elber.transport_requests(id) ON DELETE CASCADE,
    latitude                NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude               NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    location                GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(
                ST_MakePoint(longitude::double precision, latitude::double precision),
                4326
            )::geography
        ) STORED,
    accuracy_meters         NUMERIC(8, 2),
    speed_kmh               NUMERIC(6, 2),
    bearing_degrees         NUMERIC(5, 2),
    recorded_at             TIMESTAMPTZ NOT NULL,
    recorded_by_user_id     UUID REFERENCES elber.users(id),
    source                  TEXT NOT NULL DEFAULT 'gps'
        CHECK (source IN ('gps', 'manual'))
);

CREATE INDEX trip_waypoints_request_time_idx
    ON elber.trip_waypoints (transport_request_id, recorded_at);
CREATE INDEX trip_waypoints_gist_idx
    ON elber.trip_waypoints USING GIST (location);

-- ─── Proof of delivery ──────────────────────────────────────────────────

CREATE TABLE elber.proof_of_delivery (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transport_request_id    UUID NOT NULL UNIQUE
        REFERENCES elber.transport_requests(id) ON DELETE CASCADE,
    receiver_name           TEXT NOT NULL,
    receiver_user_id        UUID REFERENCES elber.users(id),
    signature_document_id   UUID NOT NULL REFERENCES elber.documents(id),
    photo_document_ids      UUID[] NOT NULL CHECK (array_length(photo_document_ids, 1) >= 1),
    delivered_quantity      NUMERIC(12, 2) NOT NULL CHECK (delivered_quantity > 0),
    delivered_quantity_unit TEXT NOT NULL DEFAULT 'kg',
    delivered_weight_kg     NUMERIC(12, 2),
    package_count           INTEGER,
    declared_quantity       NUMERIC(12, 2) NOT NULL,
    quantity_discrepancy    NUMERIC(12, 2)
        GENERATED ALWAYS AS (delivered_quantity - declared_quantity) STORED,
    has_discrepancy         BOOLEAN
        GENERATED ALWAYS AS (delivered_quantity <> declared_quantity) STORED,
    discrepancy_description TEXT,
    condition_notes         TEXT,

    latitude                NUMERIC(10, 7),
    longitude               NUMERIC(10, 7),
    location                GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            CASE
                WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN
                    ST_SetSRID(
                        ST_MakePoint(longitude::double precision, latitude::double precision),
                        4326
                    )::geography
                ELSE NULL
            END
        ) STORED,

    delivered_at            TIMESTAMPTZ NOT NULL,
    captured_by_user_id     UUID NOT NULL REFERENCES elber.users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX proof_of_delivery_request_idx ON elber.proof_of_delivery (transport_request_id);
CREATE INDEX proof_of_delivery_gist_idx ON elber.proof_of_delivery USING GIST (location)
    WHERE location IS NOT NULL;

-- ─── Vehicle odometer readings ──────────────────────────────────────────

CREATE TABLE elber.vehicle_odometer_readings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id              UUID NOT NULL REFERENCES elber.vehicles(id) ON DELETE CASCADE,
    reading_km              NUMERIC(10, 2) NOT NULL CHECK (reading_km >= 0),
    recorded_at             TIMESTAMPTZ NOT NULL,
    recorded_by_user_id     UUID REFERENCES elber.users(id),
    transport_request_id    UUID REFERENCES elber.transport_requests(id) ON DELETE SET NULL,
    source                  TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'assigned_trip', 'maintenance', 'onboarding')),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vehicle_odometer_readings_vehicle_idx
    ON elber.vehicle_odometer_readings (vehicle_id, recorded_at DESC);

-- ─── Transport claims ───────────────────────────────────────────────────

CREATE TABLE elber.transport_claims (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,
    transport_request_id    UUID NOT NULL REFERENCES elber.transport_requests(id) ON DELETE CASCADE,
    claim_type              TEXT NOT NULL CHECK (claim_type IN (
        'damage', 'shortage', 'delay', 'refusal', 'loss', 'other'
    )),
    description             TEXT NOT NULL,
    severity                TEXT NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    claimed_amount          NUMERIC(14, 2) CHECK (claimed_amount >= 0),
    claim_currency          TEXT NOT NULL DEFAULT 'NGN',
    evidence_document_ids   UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    filed_by_user_id        UUID NOT NULL REFERENCES elber.users(id),
    filed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status                  TEXT NOT NULL DEFAULT 'filed'
        CHECK (status IN ('filed', 'under_review', 'approved', 'rejected', 'settled', 'withdrawn')),
    resolution_notes        TEXT,
    approved_amount         NUMERIC(14, 2) CHECK (approved_amount >= 0),
    resolved_at             TIMESTAMPTZ,
    resolved_by_user_id     UUID REFERENCES elber.users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transport_claims_request_idx
    ON elber.transport_claims (transport_request_id);
CREATE INDEX transport_claims_status_idx
    ON elber.transport_claims (status, filed_at DESC)
    WHERE status IN ('filed', 'under_review');

CREATE TRIGGER transport_claims_touch_updated_at
    BEFORE UPDATE ON elber.transport_claims
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Insurance policies ─────────────────────────────────────────────────

CREATE TABLE elber.insurance_policies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,
    transport_request_id    UUID NOT NULL UNIQUE
        REFERENCES elber.transport_requests(id) ON DELETE CASCADE,
    insurer_partner_id      TEXT NOT NULL,
    insurer_policy_ref      TEXT,
    coverage_amount         NUMERIC(14, 2) NOT NULL CHECK (coverage_amount >= 0),
    premium_amount          NUMERIC(14, 2) NOT NULL CHECK (premium_amount >= 0),
    currency                TEXT NOT NULL DEFAULT 'NGN',
    coverage_terms          JSONB NOT NULL DEFAULT '{}'::jsonb,
    exclusions              TEXT[],
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'active', 'expired', 'claimed', 'settled', 'cancelled'
    )),
    effective_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until         TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX insurance_policies_status_idx
    ON elber.insurance_policies (status, effective_from DESC);

CREATE TRIGGER insurance_policies_touch_updated_at
    BEFORE UPDATE ON elber.insurance_policies
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Insurance claims ───────────────────────────────────────────────────

CREATE TABLE elber.insurance_claims (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,
    insurance_policy_id     UUID NOT NULL REFERENCES elber.insurance_policies(id) ON DELETE CASCADE,
    transport_claim_id      UUID REFERENCES elber.transport_claims(id) ON DELETE SET NULL,
    description             TEXT NOT NULL,
    claimed_amount          NUMERIC(14, 2) NOT NULL CHECK (claimed_amount >= 0),
    currency                TEXT NOT NULL DEFAULT 'NGN',
    evidence_document_ids   UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    status                  TEXT NOT NULL DEFAULT 'filed' CHECK (status IN (
        'filed', 'under_review', 'approved', 'rejected', 'paid', 'withdrawn'
    )),
    assessed_amount         NUMERIC(14, 2) CHECK (assessed_amount >= 0),
    assessed_at             TIMESTAMPTZ,
    payout_amount           NUMERIC(14, 2) CHECK (payout_amount >= 0),
    payout_at               TIMESTAMPTZ,
    insurer_reference       TEXT,
    resolution_notes        TEXT,
    filed_by_user_id        UUID NOT NULL REFERENCES elber.users(id),
    filed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX insurance_claims_policy_idx ON elber.insurance_claims (insurance_policy_id);
CREATE INDEX insurance_claims_status_idx
    ON elber.insurance_claims (status, filed_at DESC)
    WHERE status IN ('filed', 'under_review', 'approved');

CREATE TRIGGER insurance_claims_touch_updated_at
    BEFORE UPDATE ON elber.insurance_claims
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Trip metrics ───────────────────────────────────────────────────────

CREATE TABLE elber.trip_metrics (
    transport_request_id    UUID PRIMARY KEY
        REFERENCES elber.transport_requests(id) ON DELETE CASCADE,
    actual_distance_km      NUMERIC(10, 2),
    straight_line_km        NUMERIC(10, 2),
    route_deviation_km      NUMERIC(10, 2),
    actual_duration_minutes INTEGER,
    on_time                 BOOLEAN,
    delay_minutes           INTEGER,
    fuel_liters             NUMERIC(10, 2),
    fuel_cost               NUMERIC(12, 2),
    toll_cost               NUMERIC(12, 2),
    other_cost              NUMERIC(12, 2),
    total_cost              NUMERIC(12, 2),
    revenue                 NUMERIC(12, 2),
    margin                  NUMERIC(12, 2),
    actual_cargo_weight_kg  NUMERIC(12, 2),
    load_factor             NUMERIC(5, 4),
    average_speed_kmh       NUMERIC(6, 2),
    max_speed_kmh           NUMERIC(6, 2),
    stops_count             INTEGER,
    idle_minutes            INTEGER,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trip_metrics_on_time_idx ON elber.trip_metrics (on_time);

-- ─── Analytics views ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW elber.v_vehicle_current_location AS
SELECT DISTINCT ON (v.id)
    v.id AS vehicle_id,
    v.plate_number,
    vl.latitude,
    vl.longitude,
    vl.location,
    vl.location_source,
    vl.recorded_at,
    ST_AsGeoJSON(vl.location)::jsonb AS geojson
FROM elber.vehicles v
LEFT JOIN elber.vehicle_locations vl ON vl.vehicle_id = v.id
WHERE v.status = 'active'
ORDER BY v.id, vl.recorded_at DESC NULLS LAST;

CREATE OR REPLACE VIEW elber.v_vehicle_utilization_30d AS
SELECT
    v.id AS vehicle_id,
    v.plate_number,
    v.vehicle_type,
    COUNT(DISTINCT DATE_TRUNC('day', tr.delivered_at)) AS days_active,
    COUNT(tr.id) AS trips_completed,
    COALESCE(SUM(tm.actual_distance_km), 0) AS distance_km,
    COALESCE(SUM(tm.revenue), 0) AS revenue
FROM elber.vehicles v
LEFT JOIN elber.transport_assignments ta
    ON ta.vehicle_id = v.id AND ta.status = 'active'
LEFT JOIN elber.transport_requests tr
    ON tr.id = ta.transport_request_id
    AND tr.status = 'closed'
    AND tr.delivered_at >= NOW() - INTERVAL '30 days'
LEFT JOIN elber.trip_metrics tm ON tm.transport_request_id = tr.id
WHERE v.status = 'active'
GROUP BY v.id, v.plate_number, v.vehicle_type;

CREATE OR REPLACE VIEW elber.v_driver_performance_30d AS
SELECT
    d.id AS driver_id,
    u.full_name AS driver_name,
    COUNT(tr.id) AS trips_completed,
    COUNT(tr.id) FILTER (WHERE tm.on_time = TRUE) AS on_time_count,
    COUNT(tr.id) FILTER (WHERE tm.on_time = FALSE) AS late_count,
    CASE
        WHEN COUNT(tr.id) > 0 THEN
            ROUND(100.0 * COUNT(tr.id) FILTER (WHERE tm.on_time = TRUE) / COUNT(tr.id), 2)
        ELSE NULL
    END AS on_time_percentage,
    COALESCE(SUM(tm.actual_distance_km), 0) AS distance_km,
    COALESCE(AVG(tm.average_speed_kmh), 0) AS avg_speed_kmh
FROM elber.drivers d
JOIN elber.users u ON u.id = d.user_id
LEFT JOIN elber.transport_assignments ta
    ON ta.driver_id = d.id AND ta.status = 'active'
LEFT JOIN elber.transport_requests tr
    ON tr.id = ta.transport_request_id
    AND tr.status = 'closed'
    AND tr.delivered_at >= NOW() - INTERVAL '30 days'
LEFT JOIN elber.trip_metrics tm ON tm.transport_request_id = tr.id
WHERE d.verification_status = 'verified'
GROUP BY d.id, u.full_name;

CREATE OR REPLACE VIEW elber.v_corridor_performance_90d AS
SELECT
    COALESCE(pl.state, 'unknown') AS origin_state,
    COALESCE(dl.state, 'unknown') AS destination_state,
    COUNT(tr.id) AS trips,
    COALESCE(AVG(tm.actual_duration_minutes), 0) AS avg_duration_minutes,
    COALESCE(AVG(tm.actual_distance_km), 0) AS avg_distance_km,
    COALESCE(SUM(tm.revenue), 0) AS total_revenue,
    COALESCE(SUM(tm.margin), 0) AS total_margin,
    CASE
        WHEN SUM(tm.revenue) > 0 THEN
            ROUND(100.0 * SUM(tm.margin) / SUM(tm.revenue), 2)
        ELSE NULL
    END AS margin_percentage
FROM elber.transport_requests tr
LEFT JOIN elber.locations pl ON pl.id = tr.pickup_location_id
LEFT JOIN elber.locations dl ON dl.id = tr.destination_location_id
LEFT JOIN elber.trip_metrics tm ON tm.transport_request_id = tr.id
WHERE tr.status = 'closed'
  AND tr.delivered_at >= NOW() - INTERVAL '90 days'
GROUP BY pl.state, dl.state;

CREATE OR REPLACE VIEW elber.v_shipper_activity AS
SELECT
    o.id AS organisation_id,
    o.legal_name,
    o.organisation_type,
    COUNT(tr.id) AS total_trips,
    COUNT(tr.id) FILTER (WHERE tr.status = 'closed') AS completed_trips,
    COUNT(tr.id) FILTER (WHERE tr.status IN ('cancelled', 'failed')) AS failed_trips,
    COALESCE(SUM(tr.freight_charge_final), 0) AS total_spend,
    MIN(tr.requested_at) AS first_trip_at,
    MAX(tr.requested_at) AS last_trip_at
FROM elber.organisations o
LEFT JOIN elber.transport_requests tr ON tr.requester_org_id = o.id
WHERE o.status = 'active'
GROUP BY o.id, o.legal_name, o.organisation_type;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP VIEW IF EXISTS elber.v_shipper_activity;
DROP VIEW IF EXISTS elber.v_corridor_performance_90d;
DROP VIEW IF EXISTS elber.v_driver_performance_30d;
DROP VIEW IF EXISTS elber.v_vehicle_utilization_30d;
DROP VIEW IF EXISTS elber.v_vehicle_current_location;

DROP TABLE IF EXISTS elber.trip_metrics;
DROP TABLE IF EXISTS elber.insurance_claims;
DROP TABLE IF EXISTS elber.insurance_policies;
DROP TABLE IF EXISTS elber.transport_claims;
DROP TABLE IF EXISTS elber.vehicle_odometer_readings;
DROP TABLE IF EXISTS elber.proof_of_delivery;
DROP TABLE IF EXISTS elber.trip_waypoints;
DROP TABLE IF EXISTS elber.trip_events;
DROP TABLE IF EXISTS elber.transport_assignments;
DROP TABLE IF EXISTS elber.transport_requests;

ALTER TABLE elber.vehicle_locations
    DROP CONSTRAINT IF EXISTS vehicle_locations_transport_job_fk;

-- +goose StatementEnd