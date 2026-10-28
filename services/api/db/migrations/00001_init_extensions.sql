-- +goose Up
-- +goose StatementBegin

-- Enable PostGIS for geographic queries. The spec requires this for
-- nearby warehouses, supplier locations, pickup and delivery areas and
-- service coverage.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable pgcrypto for gen_random_uuid() where needed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the application schema. Using a dedicated schema (rather than
-- public) makes it explicit which objects belong to the application and
-- simplifies permissions and future multi-schema strategies.
CREATE SCHEMA IF NOT EXISTS elber;

-- Set the default search path for the application role. This is what
-- allows application queries to reference tables without schema prefixes
-- while still keeping them namespaced.
ALTER DATABASE elbermarket SET search_path TO elber, public;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP SCHEMA IF EXISTS elber CASCADE;

-- Note: extensions are not dropped because they may be shared with other
-- schemas or future services.

-- +goose StatementEnd