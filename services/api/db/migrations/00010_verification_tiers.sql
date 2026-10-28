-- +goose Up
-- +goose StatementBegin

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION TIERS
-- ═══════════════════════════════════════════════════════════════════════
--
-- Four tiers: unverified (0), basic (1), business (2), fleet_owner (3).
-- Financing requires tier 'business' or higher.
--
-- This migration is self-contained: it creates the verification_cases
-- table (which was supposed to be created in migration 00004 but wasn't)
-- before adding columns to it. That way the migration can run on any
-- database state.

-- ─── Ensure verification_cases exists ────────────────────────────────

CREATE TABLE IF NOT EXISTS elber.verification_cases (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type            TEXT NOT NULL CHECK (subject_type IN (
        'user', 'organisation'
    )),
    subject_id              UUID NOT NULL,
    verification_type       TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
        'not_started', 'draft', 'submitted', 'under_review',
        'additional_info_required', 'verified', 'rejected', 'suspended'
    )),
    assigned_reviewer_id    UUID REFERENCES elber.users(id),
    submitted_at            TIMESTAMPTZ,
    reviewed_at             TIMESTAMPTZ,
    decision_reason         TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verification_cases_subject_idx
    ON elber.verification_cases (subject_type, subject_id);

DROP TRIGGER IF EXISTS verification_cases_touch_updated_at ON elber.verification_cases;
CREATE TRIGGER verification_cases_touch_updated_at
    BEFORE UPDATE ON elber.verification_cases
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ─── Add verification_tier to organisations ──────────────────────────

ALTER TABLE elber.organisations
    ADD COLUMN IF NOT EXISTS verification_tier TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_tier IN (
            'unverified',
            'basic',
            'business',
            'fleet_owner'
        ));

UPDATE elber.organisations
SET verification_tier = 'business'
WHERE verification_status = 'verified' AND verification_tier = 'unverified';

-- ─── Add tier + decision columns to verification_cases ──────────────

ALTER TABLE elber.verification_cases
    ADD COLUMN IF NOT EXISTS requested_tier TEXT NOT NULL DEFAULT 'basic'
        CHECK (requested_tier IN ('basic', 'business', 'fleet_owner')),
    ADD COLUMN IF NOT EXISTS approved_tier TEXT
        CHECK (approved_tier IS NULL OR approved_tier IN ('basic', 'business', 'fleet_owner')),
    ADD COLUMN IF NOT EXISTS reviewer_user_id UUID REFERENCES elber.users(id),
    ADD COLUMN IF NOT EXISTS decision TEXT
        CHECK (decision IS NULL OR decision IN ('approved', 'rejected', 'more_info')),
    ADD COLUMN IF NOT EXISTS decision_reason TEXT,
    ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS verification_cases_queue_idx
    ON elber.verification_cases (status, submitted_at)
    WHERE status IN ('submitted', 'under_review');

-- ─── Verification documents ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS elber.verification_documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_case_id    UUID NOT NULL REFERENCES elber.verification_cases(id) ON DELETE CASCADE,
    document_id             UUID NOT NULL REFERENCES elber.documents(id) ON DELETE CASCADE,
    document_type           TEXT NOT NULL,
    review_status           TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'accepted', 'rejected')),
    review_notes            TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (verification_case_id, document_type)
);

CREATE INDEX IF NOT EXISTS verification_documents_case_idx
    ON elber.verification_documents (verification_case_id);

CREATE INDEX IF NOT EXISTS verification_documents_pending_idx
    ON elber.verification_documents (verification_case_id, review_status)
    WHERE review_status = 'pending';

-- ─── Trust events (foundation) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS elber.trust_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id         UUID NOT NULL REFERENCES elber.organisations(id) ON DELETE CASCADE,
    event_type              TEXT NOT NULL,
    weight                  NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trust_events_org_idx
    ON elber.trust_events (organisation_id, occurred_at DESC);

ALTER TABLE elber.organisations
    ADD COLUMN IF NOT EXISTS trust_score NUMERIC(4, 2) NOT NULL DEFAULT 0
        CHECK (trust_score >= 0 AND trust_score <= 100);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE elber.organisations DROP COLUMN IF EXISTS trust_score;
DROP TABLE IF EXISTS elber.trust_events;

DROP INDEX IF EXISTS verification_documents_pending_idx;
DROP INDEX IF EXISTS verification_documents_case_idx;
DROP TABLE IF EXISTS elber.verification_documents;

DROP INDEX IF EXISTS verification_cases_queue_idx;

ALTER TABLE elber.verification_cases
    DROP COLUMN IF EXISTS decided_at,
    DROP COLUMN IF EXISTS decision_reason,
    DROP COLUMN IF EXISTS decision,
    DROP COLUMN IF EXISTS reviewer_user_id,
    DROP COLUMN IF EXISTS approved_tier,
    DROP COLUMN IF EXISTS requested_tier;

-- Note: we do NOT drop verification_cases in Down because it may have
-- been created by an earlier migration or the app may already depend on
-- it. Only the columns added by this migration are dropped.
DROP TRIGGER IF EXISTS verification_cases_touch_updated_at ON elber.verification_cases;
DROP INDEX IF EXISTS verification_cases_subject_idx;

ALTER TABLE elber.organisations DROP COLUMN IF EXISTS verification_tier;

-- +goose StatementEnd