-- +goose Up
-- +goose StatementBegin

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — DOUBLE-ENTRY LEDGER
-- ═══════════════════════════════════════════════════════════════════════
--
-- The ledger is the authoritative record of every financial event. Every
-- movement of value — a trip's freight charge, an insurance premium, a
-- fleet owner payout — is recorded as a balanced journal entry with two
-- or more lines that sum to zero (debits = credits).
--
-- Why this matters:
--   - A single "balance" column that gets incremented on each transaction
--     can drift. A double-entry ledger cannot drift by construction.
--   - Regulators and auditors require this structure. Investors' technical
--     diligence will check for it.
--   - Corrections are made by reversal (a new entry that cancels an old
--     one), never by editing history. This preserves audit trail.
--
-- Ledger accounts are GLOBAL to the platform (a chart of accounts shared
-- across all organisations). Organisation-level balances come from
-- filtering journal lines by the organisation that participated.
--
-- The ledger is INACTIVE in Phase 2 — no rows will be inserted. It is
-- activated in Phase 3 when payment providers integrate and real money
-- movements begin.

-- Chart of accounts. A controlled vocabulary of accounts that every
-- financial event is booked against. Seeded with standard accounts on
-- migration; extended in later phases.
CREATE TABLE elber.ledger_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Stable code (e.g., '1000_cash', '4000_freight_revenue').
    -- Application code references these codes; the UUID is internal.
    code                    TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    description             TEXT,

    -- Standard accounting classification.
    account_type            TEXT NOT NULL CHECK (account_type IN (
        'asset', 'liability', 'equity', 'revenue', 'expense'
    )),

    -- Normal balance direction. Asset and expense accounts are
    -- debit-normal; liability, equity and revenue are credit-normal.
    -- This is used in reporting, not for balance enforcement.
    normal_balance          TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),

    -- Currency. For now only NGN. Future multi-currency scenarios
    -- create separate accounts per currency.
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- Sub-ledger grouping. Helps reporting: "all cash accounts" can be
    -- found by parent_category = 'cash'.
    parent_category         TEXT,

    -- Active accounts can be posted to. Retired accounts cannot.
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'retired'
    )),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ledger_accounts_type_idx ON elber.ledger_accounts (account_type)
    WHERE status = 'active';

CREATE TRIGGER ledger_accounts_touch_updated_at
    BEFORE UPDATE ON elber.ledger_accounts
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Seed the initial chart of accounts. Every financial event will book
-- against these accounts.
INSERT INTO elber.ledger_accounts (code, name, account_type, normal_balance, parent_category) VALUES
    -- Assets (what the platform holds or is owed)
    ('1010_cash_operating',       'Cash — Operating',                  'asset', 'debit',  'cash'),
    ('1020_receivable_shippers',  'Receivable — Shippers',             'asset', 'debit',  'receivables'),
    ('1030_prepaid_insurance',    'Prepaid — Insurance',               'asset', 'debit',  'prepaids'),

    -- Liabilities (what the platform owes)
    ('2010_payable_fleet_owners', 'Payable — Fleet Owners',            'liability', 'credit', 'payables'),
    ('2020_payable_insurers',     'Payable — Insurers',                'liability', 'credit', 'payables'),
    ('2030_payable_drivers',      'Payable — Drivers',                 'liability', 'credit', 'payables'),
    ('2040_unearned_revenue',     'Unearned Revenue',                  'liability', 'credit', 'deferred_revenue'),
    ('2050_lender_payable',       'Payable — Financing Partner',       'liability', 'credit', 'financing'),

    -- Equity (platform net position)
    ('3010_retained_earnings',    'Retained Earnings',                 'equity', 'credit', 'equity'),

    -- Revenue (what the platform earns)
    ('4010_freight_revenue',      'Freight Revenue',                   'revenue', 'credit', 'operating'),
    ('4020_insurance_commission', 'Insurance Commission',              'revenue', 'credit', 'operating'),
    ('4030_financing_origination','Financing Origination Fee',         'revenue', 'credit', 'operating'),
    ('4040_financing_interest',   'Financing Interest Share',          'revenue', 'credit', 'operating'),

    -- Expenses (what the platform spends)
    ('5010_fleet_payouts',        'Fleet Owner Payouts',               'expense', 'debit',  'cost_of_service'),
    ('5020_insurance_premiums',   'Insurance Premiums Paid',           'expense', 'debit',  'cost_of_service'),
    ('5030_fuel_expense',         'Fuel Expense',                      'expense', 'debit',  'cost_of_service'),
    ('5040_driver_payouts',       'Driver Payouts',                    'expense', 'debit',  'cost_of_service'),
    ('5050_refunds_issued',       'Refunds Issued',                    'expense', 'debit',  'cost_of_service'),
    ('5060_claims_paid',          'Insurance Claims Paid',             'expense', 'debit',  'cost_of_service');

-- A journal entry is a balanced financial event. Every entry has two or
-- more lines (see journal_lines) whose debits equal credits, in the same
-- currency. Once POSTED, an entry is immutable.
CREATE TABLE elber.journal_entries (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,

    -- What caused this entry. Free-form so we can extend without
    -- migrations. Examples: 'transport_charge', 'insurance_premium',
    -- 'fleet_payout', 'financing_disbursement'.
    source_type             TEXT NOT NULL,
    source_id               UUID,     -- usually points to a trip, payment, etc.

    description             TEXT NOT NULL,
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- Lifecycle. 'draft' entries can be edited; 'posted' entries are
    -- immutable (enforced by trigger below); 'reversed' entries have been
    -- offset by a reversal entry and no longer affect the balance.
    status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'posted', 'reversed'
    )),

    -- When the entry is effective (accounting period). May differ from
    -- when it was actually created (backdated entries for reconciliation).
    effective_at            TIMESTAMPTZ NOT NULL,

    -- When the entry was posted (moved from draft to posted). Set once.
    -- Nullable while in draft.
    posted_at               TIMESTAMPTZ,

    -- If this entry reverses another, reference the original.
    reverses_entry_id       UUID REFERENCES elber.journal_entries(id),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX journal_entries_status_idx ON elber.journal_entries (status, effective_at DESC);
CREATE INDEX journal_entries_source_idx ON elber.journal_entries (source_type, source_id)
    WHERE source_id IS NOT NULL;
CREATE INDEX journal_entries_effective_idx ON elber.journal_entries (effective_at)
    WHERE status = 'posted';

CREATE TRIGGER journal_entries_touch_updated_at
    BEFORE UPDATE ON elber.journal_entries
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Posted entries are IMMUTABLE. This trigger enforces that.
--
-- Once posted_at is set, the entry's core fields cannot change. Corrections
-- happen by posting a reversal entry that references the original. This
-- is accounting law, not preference: the audit trail must survive.
--
-- Status can transition from posted -> reversed (that's how a reversal
-- marks the original), but nothing else about a posted entry can change.
CREATE OR REPLACE FUNCTION elber.journal_entries_guard_posted()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.posted_at IS NOT NULL THEN
        -- Entry was already posted. Only allow status change to 'reversed'.
        IF NEW.status = 'reversed' AND OLD.status = 'posted' THEN
            -- Allow this specific transition.
            RETURN NEW;
        END IF;

        -- Any other change to a posted entry is forbidden.
        RAISE EXCEPTION 'Posted journal entries are immutable. Post a reversal instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_guard_posted_trigger
    BEFORE UPDATE ON elber.journal_entries
    FOR EACH ROW EXECUTE FUNCTION elber.journal_entries_guard_posted();

-- A journal line is one leg of an entry: either a debit or a credit.
-- Each line references a ledger account and an organisation (which party
-- the debit or credit applies to). Sum of debits = sum of credits per
-- entry, in the same currency.
CREATE TABLE elber.journal_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id        UUID NOT NULL REFERENCES elber.journal_entries(id) ON DELETE RESTRICT,

    ledger_account_id       UUID NOT NULL REFERENCES elber.ledger_accounts(id),

    -- The organisation this line affects. NULL for platform-level accounts
    -- (e.g., '4010_freight_revenue' aggregated across all shippers). Set
    -- when the line is specific to a party (e.g., '2010_payable_fleet_owners'
    -- for a specific fleet owner).
    organisation_id         UUID REFERENCES elber.organisations(id),

    -- Debit and credit amounts. Exactly one of these must be non-zero,
    -- never both. Amounts are positive numbers.
    debit_amount            NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
    credit_amount           NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),

    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    description             TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Exactly one of debit or credit must be non-zero.
    CONSTRAINT journal_lines_debit_or_credit CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (debit_amount = 0 AND credit_amount > 0)
    )
);

CREATE INDEX journal_lines_entry_idx ON elber.journal_lines (journal_entry_id);
CREATE INDEX journal_lines_account_idx ON elber.journal_lines (ledger_account_id);
CREATE INDEX journal_lines_org_idx ON elber.journal_lines (organisation_id)
    WHERE organisation_id IS NOT NULL;

-- Enforce that every posted journal entry is balanced (debits = credits,
-- per currency). This fires when an entry is posted, checking that its
-- lines sum correctly before allowing the transition.
--
-- Why a trigger and not a constraint: Postgres CHECK constraints operate
-- per-row. Balance is a cross-row invariant on journal_lines related to
-- journal_entries.status. A trigger is the correct tool.
CREATE OR REPLACE FUNCTION elber.journal_entries_check_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_debits  NUMERIC(14, 2);
    total_credits NUMERIC(14, 2);
BEGIN
    -- Only check when transitioning to posted.
    IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
        SELECT
            COALESCE(SUM(debit_amount), 0),
            COALESCE(SUM(credit_amount), 0)
        INTO total_debits, total_credits
        FROM elber.journal_lines
        WHERE journal_entry_id = NEW.id;

        IF total_debits <> total_credits THEN
            RAISE EXCEPTION 'Journal entry % is not balanced: debits=% credits=%',
                NEW.id, total_debits, total_credits;
        END IF;

        IF total_debits = 0 THEN
            RAISE EXCEPTION 'Journal entry % has no lines.', NEW.id;
        END IF;

        -- Set posted_at if not already set.
        IF NEW.posted_at IS NULL THEN
            NEW.posted_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_check_balance_trigger
    BEFORE UPDATE ON elber.journal_entries
    FOR EACH ROW EXECUTE FUNCTION elber.journal_entries_check_balance();

-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — FINANCIAL RECORDS
-- ═══════════════════════════════════════════════════════════════════════

-- A materialized view of each organisation's financial position,
-- derived from the ledger. Never written to directly — always
-- refreshed from journal_lines. Uses REFRESH MATERIALIZED VIEW
-- (scheduled job in Phase 3; manual refresh in Phase 2).
CREATE MATERIALIZED VIEW elber.mv_financial_accounts AS
SELECT
    jl.organisation_id,
    la.currency_code,
    la.account_type,
    la.code           AS account_code,
    la.name           AS account_name,
    SUM(jl.debit_amount)  AS total_debits,
    SUM(jl.credit_amount) AS total_credits,
    SUM(CASE
        WHEN la.normal_balance = 'debit'
            THEN jl.debit_amount - jl.credit_amount
        ELSE
            jl.credit_amount - jl.debit_amount
    END) AS balance
FROM elber.journal_lines jl
JOIN elber.journal_entries je ON je.id = jl.journal_entry_id
JOIN elber.ledger_accounts la ON la.id = jl.ledger_account_id
WHERE je.status IN ('posted', 'reversed')   -- include reversed for totals
GROUP BY jl.organisation_id, la.currency_code, la.account_type, la.code, la.name;

CREATE UNIQUE INDEX mv_financial_accounts_pkey
    ON elber.mv_financial_accounts (organisation_id, account_code);

-- Payment intents and outcomes. Every payment is recorded here, whether
-- it succeeded, is pending, failed, or was reversed. The actual provider
-- reference is stored so we can reconcile.
--
-- ACTIVATED IN PHASE 3 — no rows in Phase 2.
CREATE TABLE elber.payment_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,

    -- What's being paid for.
    source_type             TEXT NOT NULL,        -- 'transport_charge', 'insurance_premium', 'refund'
    source_id               UUID,

    -- Who's paying and who's receiving.
    payer_org_id            UUID REFERENCES elber.organisations(id),
    payee_org_id            UUID REFERENCES elber.organisations(id),

    amount                  NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- Payment channel and provider.
    payment_method          TEXT,                  -- 'bank_transfer', 'card', 'ussd', 'cash'
    payment_provider        TEXT,                  -- 'paystack', 'flutterwave', 'monnify'
    provider_reference      TEXT,                  -- provider's transaction ID
    provider_metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Status. A payment is 'confirmed' only after provider confirmation.
    status                  TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN (
        'initiated', 'pending', 'confirmed', 'failed', 'cancelled', 'reversed'
    )),

    -- Timing.
    initiated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at            TIMESTAMPTZ,
    failed_at               TIMESTAMPTZ,
    failure_reason          TEXT,

    -- Idempotency for retry safety.
    idempotency_key         TEXT UNIQUE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_records_payer_idx ON elber.payment_records (payer_org_id, initiated_at DESC);
CREATE INDEX payment_records_status_idx ON elber.payment_records (status, initiated_at DESC);
CREATE INDEX payment_records_source_idx ON elber.payment_records (source_type, source_id);

CREATE TRIGGER payment_records_touch_updated_at
    BEFORE UPDATE ON elber.payment_records
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Settlement records — payouts FROM the platform TO a party.
-- Used for: fleet owner payouts, driver payouts, insurer premium payments,
-- refunds to shippers.
--
-- ACTIVATED IN PHASE 3. In Phase 2, these records are created manually
-- (by ELBER ops) to track what was paid and when, providing an evidence
-- trail even before automatic settlement exists.
CREATE TABLE elber.settlement_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,

    -- What's being settled.
    source_type             TEXT NOT NULL,    -- 'fleet_payout', 'driver_payout', 'insurer_premium', 'shipper_refund'
    source_id               UUID,

    -- Who's receiving.
    payee_org_id            UUID REFERENCES elber.organisations(id),
    payee_user_id           UUID REFERENCES elber.users(id),

    amount                  NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- How it was paid.
    settlement_method       TEXT,              -- 'bank_transfer', 'paystack_transfer'
    provider_reference      TEXT,              -- provider's transfer ID

    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'settled', 'failed', 'reversed'
    )),

    -- Timing.
    expected_at             TIMESTAMPTZ,
    settled_at              TIMESTAMPTZ,

    -- For Phase 2 manual tracking: who confirmed the settlement, and how
    -- (e.g., "bank transfer ref XYZ, confirmed via bank statement").
    manually_confirmed_by   UUID REFERENCES elber.users(id),
    manual_confirmation_notes TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX settlement_records_payee_org_idx ON elber.settlement_records (payee_org_id, created_at DESC)
    WHERE payee_org_id IS NOT NULL;
CREATE INDEX settlement_records_status_idx ON elber.settlement_records (status, created_at DESC);

CREATE TRIGGER settlement_records_touch_updated_at
    BEFORE UPDATE ON elber.settlement_records
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Refund records — refunds against an original payment.
-- Never delete the original payment; always record the refund as a
-- separate transaction that references the original.
CREATE TABLE elber.refund_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,

    original_payment_id     UUID NOT NULL REFERENCES elber.payment_records(id),

    amount                  NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    reason                  TEXT NOT NULL,

    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),

    provider_reference      TEXT,

    requested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    failed_at               TIMESTAMPTZ,

    requested_by_user_id    UUID REFERENCES elber.users(id),
    approved_by_user_id     UUID REFERENCES elber.users(id),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refund_records_payment_idx ON elber.refund_records (original_payment_id);
CREATE INDEX refund_records_status_idx ON elber.refund_records (status, requested_at DESC);

CREATE TRIGGER refund_records_touch_updated_at
    BEFORE UPDATE ON elber.refund_records
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Reconciliation records — how internal records match provider records.
-- Every payment and settlement should eventually reconcile against the
-- provider's authoritative report. Discrepancies go into an exception
-- queue (represented here by reconciliation_status = 'exception').
CREATE TABLE elber.reconciliation_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    provider                TEXT NOT NULL,
    external_reference      TEXT NOT NULL,
    internal_type           TEXT NOT NULL,    -- 'payment', 'settlement', 'refund'
    internal_id             UUID,

    amount                  NUMERIC(14, 2) NOT NULL,
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- Matched — the provider says the same thing our records do.
    -- Exception — there's a difference (unmatched amount, missing record, etc.)
    -- Resolved — the exception was investigated and closed.
    reconciliation_status   TEXT NOT NULL DEFAULT 'unmatched' CHECK (reconciliation_status IN (
        'unmatched', 'matched', 'exception', 'resolved'
    )),

    matched_at              TIMESTAMPTZ,
    exception_reason        TEXT,
    resolved_at             TIMESTAMPTZ,
    resolved_by_user_id     UUID REFERENCES elber.users(id),
    resolution_notes        TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (provider, external_reference)
);

CREATE INDEX reconciliation_records_status_idx
    ON elber.reconciliation_records (reconciliation_status, created_at DESC)
    WHERE reconciliation_status IN ('unmatched', 'exception');

CREATE TRIGGER reconciliation_records_touch_updated_at
    BEFORE UPDATE ON elber.reconciliation_records
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- PART 3 — FINANCING SCAFFOLD
-- ═══════════════════════════════════════════════════════════════════════
--
-- All tables in this section are EMPTY in Phase 2. They exist so that
-- when Phase 4 activates, the code that populates them can be written
-- without any schema migration.
--
-- Per the confirmed model: ELBER is the borrower of record. The lending
-- partner disburses to ELBER, ELBER executes the trade, the buyer pays
-- ELBER (or pays via ELBER's orchestration), ELBER repays the lender.
-- The shipper benefits from the working capital; ELBER bears the
-- counterparty risk.

-- Capital providers. Banks, fintechs, dedicated trade-finance firms.
CREATE TABLE elber.financing_partners (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT NOT NULL,
    -- Brief descriptor — 'bank', 'fintech', 'trade_finance', 'other'
    partner_type            TEXT NOT NULL,
    contact_name            TEXT,
    contact_email           TEXT,
    contact_phone           TEXT,
    -- The partner's terms, limits, requirements, recorded as JSONB so
    -- the schema doesn't need migrations for each partner's custom fields.
    partnership_terms       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'inactive', 'terminated'
    )),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER financing_partners_touch_updated_at
    BEFORE UPDATE ON elber.financing_partners
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Specific loan products offered (by ELBER via one or more partners).
-- Examples: 'transport_working_capital', 'marketplace_order_financing'.
CREATE TABLE elber.financing_products (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id              UUID REFERENCES elber.financing_partners(id),
    product_name            TEXT NOT NULL,
    product_description     TEXT,

    -- Which transaction types this product applies to. 'transport_request'
    -- for freight working capital; 'order' for future marketplace orders.
    applies_to_source_type  TEXT NOT NULL,

    -- Eligibility rules, recorded as JSONB (e.g., min trip history, min
    -- verified business tenure, max loan-to-value ratio).
    eligibility_rules       JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Pricing rules, recorded as JSONB (e.g., interest rate, fees, terms).
    pricing_rules           JSONB NOT NULL DEFAULT '{}'::jsonb,

    currency_code           TEXT NOT NULL DEFAULT 'NGN',
    min_amount              NUMERIC(14, 2),
    max_amount              NUMERIC(14, 2),

    status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'active', 'suspended', 'retired'
    )),
    available_from          TIMESTAMPTZ,
    available_until         TIMESTAMPTZ,

    -- Version tracks rule changes. Applications reference a version so
    -- that changing rules later doesn't affect existing applications.
    rules_version           INTEGER NOT NULL DEFAULT 1,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER financing_products_touch_updated_at
    BEFORE UPDATE ON elber.financing_products
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Eligibility facts per transaction. When a transport request is created
-- (or updated), the eligibility evaluator writes a row here recording
-- whether it passes eligibility rules and, if not, why.
--
-- This is a cache of a computed decision, not a source of truth. The
-- truth is: the eligibility rules (in financing_products) + the
-- transaction's properties (in transport_requests) + the shipper's
-- history. If rules or history change, the fact may become stale.
--
-- Refreshed on each eligibility check.
CREATE TABLE elber.financing_eligibility (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    source_type             TEXT NOT NULL,    -- 'transport_request', 'order'
    source_id               UUID NOT NULL,

    -- Which product this eligibility is evaluated against.
    product_id              UUID NOT NULL REFERENCES elber.financing_products(id),

    -- Outcome.
    is_eligible             BOOLEAN NOT NULL,
    ineligibility_reasons   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of reasons

    -- Reference data considered at evaluation time (for auditability).
    evaluated_with          JSONB NOT NULL DEFAULT '{}'::jsonb,

    evaluated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (source_type, source_id, product_id)
);

CREATE INDEX financing_eligibility_source_idx
    ON elber.financing_eligibility (source_type, source_id);
CREATE INDEX financing_eligibility_eligible_idx
    ON elber.financing_eligibility (product_id, evaluated_at DESC)
    WHERE is_eligible = TRUE;

-- The shipper's application for financing on a specific transaction.
CREATE TABLE elber.financing_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,

    -- Who is applying.
    applicant_org_id        UUID NOT NULL REFERENCES elber.organisations(id),
    applicant_user_id       UUID NOT NULL REFERENCES elber.users(id),

    -- Which transaction is being financed.
    source_type             TEXT NOT NULL,    -- 'transport_request', 'order'
    source_id               UUID NOT NULL,

    -- Which product.
    product_id              UUID NOT NULL REFERENCES elber.financing_products(id),

    -- Amount requested.
    requested_amount        NUMERIC(14, 2) NOT NULL CHECK (requested_amount > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- Purpose, as described by the applicant.
    purpose                 TEXT,
    -- Supporting documents (financial statements, order confirmations, etc.)
    evidence_document_ids   UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],

    -- Status.
    status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'submitted', 'under_review', 'more_info_required',
        'approved', 'declined', 'withdrawn', 'expired'
    )),

    submitted_at            TIMESTAMPTZ,
    reviewed_at             TIMESTAMPTZ,
    decided_at              TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX financing_applications_applicant_idx
    ON elber.financing_applications (applicant_org_id, created_at DESC);
CREATE INDEX financing_applications_status_idx
    ON elber.financing_applications (status, created_at DESC)
    WHERE status IN ('submitted', 'under_review', 'more_info_required');
CREATE INDEX financing_applications_source_idx
    ON elber.financing_applications (source_type, source_id);

CREATE TRIGGER financing_applications_touch_updated_at
    BEFORE UPDATE ON elber.financing_applications
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- The offer that ELBER makes to the applicant (via the partner).
-- Distinct from the application — the offer is the specific terms on
-- the table: amount, fees, repayment terms.
CREATE TABLE elber.financing_offers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,
    application_id          UUID NOT NULL REFERENCES elber.financing_applications(id),

    -- The partner actually funding this.
    partner_id              UUID NOT NULL REFERENCES elber.financing_partners(id),

    -- Terms.
    offered_amount          NUMERIC(14, 2) NOT NULL CHECK (offered_amount > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',
    fee_amount              NUMERIC(14, 2) NOT NULL DEFAULT 0,
    interest_rate           NUMERIC(6, 4),     -- e.g., 0.0250 for 2.5%
    repayment_terms         JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- When the offer expires if not accepted.
    expires_at              TIMESTAMPTZ NOT NULL,

    status                  TEXT NOT NULL DEFAULT 'issued' CHECK (status IN (
        'issued', 'accepted', 'declined', 'expired', 'withdrawn'
    )),

    offered_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX financing_offers_application_idx ON elber.financing_offers (application_id);
CREATE INDEX financing_offers_status_idx
    ON elber.financing_offers (status, expires_at)
    WHERE status = 'issued';

CREATE TRIGGER financing_offers_touch_updated_at
    BEFORE UPDATE ON elber.financing_offers
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- The agreement that formalises the accepted offer. This is the legal
-- contract between ELBER and the partner (with the shipper bound to the
-- transaction terms).
CREATE TABLE elber.financing_agreements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,
    offer_id                UUID NOT NULL UNIQUE REFERENCES elber.financing_offers(id),

    -- The signed agreement document.
    agreement_document_id   UUID NOT NULL REFERENCES elber.documents(id),

    -- Lifecycle.
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'fully_repaid', 'defaulted', 'cancelled'
    )),

    accepted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER financing_agreements_touch_updated_at
    BEFORE UPDATE ON elber.financing_agreements
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Disbursement of the financing. Per the confirmed model: the money
-- goes to ELBER's account (not the shipper's). ELBER then executes the
-- trade. The shipper benefits from the capital being deployed on their
-- behalf; ELBER bears the obligation to the partner.
CREATE TABLE elber.financing_disbursements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,
    agreement_id            UUID NOT NULL REFERENCES elber.financing_agreements(id),

    amount                  NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- Where the money landed.
    received_by_org_id      UUID NOT NULL REFERENCES elber.organisations(id),
    -- Provider (bank or partner) reference.
    provider_reference      TEXT,

    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'confirmed', 'failed', 'reversed'
    )),

    disbursed_at            TIMESTAMPTZ,
    confirmed_at            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER financing_disbursements_touch_updated_at
    BEFORE UPDATE ON elber.financing_disbursements
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Repayment obligations — the schedule of what ELBER owes the partner.
CREATE TABLE elber.repayment_obligations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id            UUID NOT NULL REFERENCES elber.financing_agreements(id),

    -- Schedule position (1, 2, 3... for each installment).
    installment_number      INTEGER NOT NULL CHECK (installment_number > 0),

    due_date                DATE NOT NULL,
    amount_due              NUMERIC(14, 2) NOT NULL CHECK (amount_due > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'partial', 'paid', 'overdue', 'defaulted', 'waived'
    )),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (agreement_id, installment_number)
);

CREATE INDEX repayment_obligations_due_idx
    ON elber.repayment_obligations (due_date, status)
    WHERE status IN ('pending', 'partial', 'overdue');

CREATE TRIGGER repayment_obligations_touch_updated_at
    BEFORE UPDATE ON elber.repayment_obligations
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Repayment records — actual payments received against obligations.
CREATE TABLE elber.repayment_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               TEXT NOT NULL UNIQUE,
    obligation_id           UUID NOT NULL REFERENCES elber.repayment_obligations(id),

    amount_paid             NUMERIC(14, 2) NOT NULL CHECK (amount_paid > 0),
    currency_code           TEXT NOT NULL DEFAULT 'NGN',

    -- The payment that satisfied this obligation (links to payment_records).
    payment_id              UUID REFERENCES elber.payment_records(id),
    -- Or, if paid outside the platform (Phase 4 may have manual repayments).
    external_reference      TEXT,

    paid_at                 TIMESTAMPTZ NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN (
        'confirmed', 'reversed'
    )),

    recorded_by_user_id     UUID REFERENCES elber.users(id),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX repayment_records_obligation_idx ON elber.repayment_records (obligation_id);
CREATE INDEX repayment_records_paid_at_idx ON elber.repayment_records (paid_at DESC);

CREATE TRIGGER repayment_records_touch_updated_at
    BEFORE UPDATE ON elber.repayment_records
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- PART 4 — ACTIVATION TRACKING
-- ═══════════════════════════════════════════════════════════════════════

-- Feature flags table, seeded with the modules whose activation status
-- matters. This table records the truth about which features are live
-- and when they were turned on. The application reads this (in addition
-- to environment flags) to gate features.
--
-- The distinction from environment flags: this table's records persist,
-- so you can look back at "when did we activate financing?" and "who
-- activated it?" That's audit-grade, not just environment noise.
CREATE TABLE elber.feature_activations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name            TEXT NOT NULL UNIQUE,
    description             TEXT,
    status                  TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN (
        'inactive', 'staging', 'active', 'retired'
    )),
    activated_at            TIMESTAMPTZ,
    activated_by_user_id    UUID REFERENCES elber.users(id),
    activation_notes        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER feature_activations_touch_updated_at
    BEFORE UPDATE ON elber.feature_activations
    FOR EACH ROW EXECUTE FUNCTION elber.touch_updated_at();

-- Seed the features with their initial state. Every financial/financing
-- feature starts inactive. When Phase 3 and Phase 4 activate, this table
-- gets updated (which is itself a tracked change).
INSERT INTO elber.feature_activations (feature_name, description, status) VALUES
    ('payment_records',         'Recording of payment intents and outcomes', 'inactive'),
    ('settlement_records',      'Payouts to fleet owners and other parties', 'inactive'),
    ('ledger_entries',          'Double-entry journal entries', 'inactive'),
    ('reconciliation',          'Provider reconciliation and exception handling', 'inactive'),
    ('financing_applications',  'Shipper applications for order-backed financing', 'inactive'),
    ('financing_disbursements', 'Actual disbursement of funds against agreements', 'inactive'),
    ('financing_repayments',    'Repayment tracking and obligation management', 'inactive');

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS elber.feature_activations;
DROP TABLE IF EXISTS elber.repayment_records;
DROP TABLE IF EXISTS elber.repayment_obligations;
DROP TABLE IF EXISTS elber.financing_disbursements;
DROP TABLE IF EXISTS elber.financing_agreements;
DROP TABLE IF EXISTS elber.financing_offers;
DROP TABLE IF EXISTS elber.financing_applications;
DROP TABLE IF EXISTS elber.financing_eligibility;
DROP TABLE IF EXISTS elber.financing_products;
DROP TABLE IF EXISTS elber.financing_partners;
DROP TABLE IF EXISTS elber.reconciliation_records;
DROP TABLE IF EXISTS elber.refund_records;
DROP TABLE IF EXISTS elber.settlement_records;
DROP TABLE IF EXISTS elber.payment_records;

DROP MATERIALIZED VIEW IF EXISTS elber.mv_financial_accounts;

DROP TABLE IF EXISTS elber.journal_lines;

DROP TRIGGER IF EXISTS journal_entries_check_balance_trigger ON elber.journal_entries;
DROP TRIGGER IF EXISTS journal_entries_guard_posted_trigger ON elber.journal_entries;
DROP FUNCTION IF EXISTS elber.journal_entries_check_balance();
DROP FUNCTION IF EXISTS elber.journal_entries_guard_posted();
DROP TABLE IF EXISTS elber.journal_entries;
DROP TABLE IF EXISTS elber.ledger_accounts;

-- +goose StatementEnd