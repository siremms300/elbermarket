# ADR 0002: PostgreSQL with PostGIS as the authoritative data store

**Status:** Accepted
**Date:** Phase 0

## Context

ELBER MARKET handles financial records, inventory, orders and geographic
data. The database must provide transactional integrity, exact numeric
types, geographic queries and reliable migration tooling.

## Decision

Use PostgreSQL as the single authoritative transactional store, with
PostGIS enabled for geographic data. Use `numeric` for monetary and
quantity values. Use `timestamptz` for all timestamps. Use UUID
primary keys. Use versioned migrations via goose.

## Consequences

- Financial invariants are enforced in the database (constraints,
  unique indexes, foreign keys) rather than in application code alone.
- Geographic queries (nearby warehouses, supplier locations, pickup and
  delivery areas) are supported natively via PostGIS.
- The team must be disciplined about schema changes through migrations.

## Alternatives considered

- **MongoDB.** Rejected. Financial integrity and multi-document
  transactional semantics are weaker and less well understood.
- **MySQL.** Rejected. Weaker geographic and JSON support than
  PostgreSQL; no compelling reason to prefer it here.
- **Multiple stores by domain.** Rejected. Introduces consistency
  problems before the team has the operational maturity to manage them.