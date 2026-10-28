# ADR 0001: Use a modular monolith for the backend

**Status:** Accepted
**Date:** Phase 0
**Deciders:** ELBER MARKET engineering

## Context

ELBER MARKET is a multi-domain platform: identity, marketplace, orders,
inventory, quality, logistics, finance and financing. Each domain has
distinct responsibilities. A naive approach would be to build each as a
separate service from the start.

## Decision

Build the backend as a single Go binary (a modular monolith) with
explicit, well-enforced domain boundaries inside `internal/`. Each
domain owns its tables, its business rules and its application
interface. Domains communicate through Go interfaces and, where useful,
domain events. They do not reach into each other's tables.

## Consequences

Positive:
- Simple deployment: one binary, one database, one pipeline.
- Transactions span domains without distributed-transaction complexity.
- Refactoring boundaries is cheap when the boundary was wrong.
- A small team can move quickly without infrastructure overhead.

Negative:
- Module boundaries must be enforced by discipline and review, since the
  compiler does not enforce them.
- A single process is a single point of failure until we scale
  horizontally behind a load balancer.

## Alternatives considered

- **Microservices from day one.** Rejected. Distributed transactions,
  network failure modes, and independent deployments are operational
  overhead that a seed-stage team cannot afford. Extract services when
  measured load or team boundaries justify it.
- **A single unstructured package.** Rejected. Without domain
  boundaries, the codebase becomes unnavigable and business rules leak
  across responsibilities.

## Review trigger

Revisit this decision when any single domain exhibits load, latency or
deployment-cadence needs that the monolith cannot meet, or when a
domain team grows large enough that shared deployment becomes a
coordination cost. 