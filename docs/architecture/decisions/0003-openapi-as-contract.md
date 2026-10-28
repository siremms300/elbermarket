# ADR 0003: OpenAPI as the single API contract

**Status:** Accepted
**Date:** Phase 0

## Context

Mobile and (in future) web applications consume the same backend. Without
a machine-readable contract, client and server drift, and breaking
changes are discovered in production.

## Decision

Maintain a versioned OpenAPI document at `services/api/api/openapi.yaml`
as the authoritative contract. Generate client types from it. Run
contract tests in CI. Breaking changes require a new API version and a
migration plan.

## Consequences

- Client SDKs can be generated rather than hand-written.
- Contract tests catch drift before merge.
- The API is documented by construction, not by afterthought.

## Alternatives considered

- **Hand-written client types.** Rejected. They drift.
- **GraphQL.** Deferred. REST with OpenAPI is well suited to this
  domain and to the mobile-first client. GraphQL remains an option for
  the web console if a specific need emerges.