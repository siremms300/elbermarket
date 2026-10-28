-- +goose Up
-- +goose StatementBegin

-- Destination coordinates become optional. Pickup coordinates remain
-- required (needed for vehicle dispatch). The destination may be
-- described by address text only, in which case distance computation
-- returns NULL and insurance defaults to a value-only premium.
--
-- The generated destination_point column will be NULL when both
-- latitude and longitude are NULL, which is exactly what PostGIS
-- expects (ST_MakePoint with NULL returns NULL, and NULL cast to
-- geography is NULL).

ALTER TABLE elber.transport_requests
    ALTER COLUMN destination_latitude DROP NOT NULL,
    ALTER COLUMN destination_longitude DROP NOT NULL;

-- Drop the CHECK constraints that required non-null (they're implicit
-- from NOT NULL, but the coordinate range checks must allow NULL now).
ALTER TABLE elber.transport_requests
    DROP CONSTRAINT IF EXISTS transport_requests_destination_latitude_check,
    DROP CONSTRAINT IF EXISTS transport_requests_destination_longitude_check;

-- Re-add the range checks, allowing NULL.
ALTER TABLE elber.transport_requests
    ADD CONSTRAINT transport_requests_destination_latitude_check
        CHECK (destination_latitude IS NULL OR (destination_latitude >= -90 AND destination_latitude <= 90)),
    ADD CONSTRAINT transport_requests_destination_longitude_check
        CHECK (destination_longitude IS NULL OR (destination_longitude >= -180 AND destination_longitude <= 180));

-- straight_line_distance_m is a generated column, computed from both
-- pickup and destination points. When destination_point is NULL, the
-- ST_Distance function returns NULL, which is fine — the column becomes
-- NULL and the API treats it as "unknown distance".

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Restore NOT NULL — but only if all rows have coordinates. If any are
-- NULL, this will fail. That's intentional: you can't roll back if data
-- has been created without destination coordinates.

ALTER TABLE elber.transport_requests
    DROP CONSTRAINT IF EXISTS transport_requests_destination_latitude_check,
    DROP CONSTRAINT IF EXISTS transport_requests_destination_longitude_check;

ALTER TABLE elber.transport_requests
    ALTER COLUMN destination_latitude SET NOT NULL,
    ALTER COLUMN destination_longitude SET NOT NULL;

ALTER TABLE elber.transport_requests
    ADD CONSTRAINT transport_requests_destination_latitude_check
        CHECK (destination_latitude >= -90 AND destination_latitude <= 90),
    ADD CONSTRAINT transport_requests_destination_longitude_check
        CHECK (destination_longitude >= -180 AND destination_longitude <= 180);

-- +goose StatementEnd