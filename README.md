# ELBER MARKET

Integrated agricultural trade infrastructure platform.

Connects producers, traders, buyers, transporters, warehouses and inspectors
through one coordinated system for trade, logistics, verification and
financial records.

**Status:** Phase 0 — Foundation
**Primary interface:** Mobile (React Native + Expo)
**Backend:** Go modular monolith
**Database:** PostgreSQL + PostGIS

## Quick start

See `docs/operations/getting-started.md`.

## Repository layout

- `apps/mobile` — React Native + Expo mobile application
- `apps/web` — Next.js web application (future)
- `services/api` — Go backend (modular monolith)
- `packages/design-tokens` — shared design tokens
- `infrastructure` — Docker, environment configuration
- `docs` — architecture, product, API, operations

## Principles

See `docs/architecture/decisions/` for Architecture Decision Records.