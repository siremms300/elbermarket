// Verification service.
//
// Manages verification cases: the document submission lifecycle, tier
// requirements, and review decisions.
//
// The tier model:
//   Tier 1 (basic)       — individual, government ID + selfie + phone ref
//   Tier 2 (business)    — Tier 1 + CAC cert + proof of address
//   Tier 3 (fleet_owner) — Tier 2 + per-vehicle + per-driver docs
//
// Financing (Phase 4) requires Tier 2 or above. That rule lives in the
// financing domain, not here — but it's worth knowing.

package verification

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
)

// Tier constants.
const (
	TierUnverified = "unverified"
	TierBasic      = "basic"
	TierBusiness   = "business"
	TierFleetOwner = "fleet_owner"
)

// TierInfo describes what a tier is and what it requires.
type TierInfo struct {
	Key         string          `json:"key"`
	Label       string          `json:"label"`
	Description string          `json:"description"`
	Requires    []string        `json:"requires"` // document types
	Unlocks     []string        `json:"unlocks"`  // capability labels
}

// TierRequirements returns the requirements for each tier.
// Configuration is hardcoded for Phase 1. Will become configurable later.
func TierRequirements() []TierInfo {
	return []TierInfo{
		{
			Key:         TierBasic,
			Label:       "Basic",
			Description: "For individual farmers, traders, and informal sellers.",
			Requires: []string{
				"national_id",
				"selfie",
				// "phone_reference",
			},
			Unlocks: []string{
				"Create transport requests",
				"Receive payments",
				"Full app access",
			},
		},
		{
			Key:         TierBusiness,
			Label:       "Business",
			Description: "For registered businesses and institutional buyers.",
			Requires: []string{
				"national_id",
				"selfie",
				"cac_certificate",
				"proof_of_address",
			},
			Unlocks: []string{
				"Everything in Basic",
				"Act as institutional buyer",
				"Eligible for financing (Phase 4)",
			},
		},
		{
			Key:         TierFleetOwner,
			Label:       "Fleet Owner",
			Description: "For fleet operators and vehicle owners.",
			Requires: []string{
				"national_id",
				"selfie",
				"cac_certificate",
				"proof_of_address",
				"vehicle_registration",
				"vehicle_insurance",
				"driver_license",
			},
			Unlocks: []string{
				"Everything in Business",
				"Register vehicles in the fleet",
				"Receive fleet assignments",
				"Eligible for fleet financing (Phase 4)",
			},
		},
	}
}

// Errors.
var (
	ErrNotFound          = errors.New("verification case not found")
	ErrNotMember         = errors.New("not a member of this organisation")
	ErrInvalidTier       = errors.New("invalid tier")
	ErrAlreadyPending    = errors.New("a verification case is already pending")
	ErrMissingDocuments  = errors.New("missing required documents")
)

// Service manages verification cases.
type Service struct {
	db     *pgxpool.Pool
	logger *slog.Logger
}

func NewService(db *pgxpool.Pool, logger *slog.Logger) *Service {
	return &Service{db: db, logger: logger}
}

// SubmitInput is the payload for submitting a verification case.
type SubmitInput struct {
	UserID         string
	OrganisationID string
	RequestedTier  string
	DocumentIDs    []string // one per required document type
}

// SubmitResult is the response.
type SubmitResult struct {
	CaseID        string    `json:"case_id"`
	CaseReference string    `json:"case_reference"`
	Status        string    `json:"status"`
	RequestedTier string    `json:"requested_tier"`
	SubmittedAt   time.Time `json:"submitted_at"`
}

// Submit creates a verification case in 'submitted' state.
func (s *Service) Submit(ctx context.Context, input SubmitInput) (*SubmitResult, error) {
	// Validate tier
	if !isValidTier(input.RequestedTier) {
		return nil, ErrInvalidTier
	}

	// Authorization
	var orgStatus string
	err := s.db.QueryRow(ctx, `
		SELECT o.status
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1 AND m.user_id = $2 AND m.status = 'active'
	`, input.OrganisationID, input.UserID).Scan(&orgStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, fmt.Errorf("check membership: %w", err)
	}

	// Ensure no pending case
	var existingID string
	err = s.db.QueryRow(ctx, `
		SELECT id FROM elber.verification_cases
		WHERE subject_type = 'organisation'
		  AND subject_id = $1
		  AND status IN ('submitted', 'under_review')
	`, input.OrganisationID).Scan(&existingID)
	if err == nil {
		return nil, ErrAlreadyPending
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check pending: %w", err)
	}

	// Verify required documents are provided and match the tier requirements
	tier := tierByKey(input.RequestedTier)
	if tier == nil {
		return nil, ErrInvalidTier
	}
	providedCount := len(input.DocumentIDs)
	requiredCount := len(tier.Requires)
	if providedCount < requiredCount {
		return nil, fmt.Errorf("%w: expected %d documents, got %d", ErrMissingDocuments, requiredCount, providedCount)
	}

	// Transaction: create verification case + link documents
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	caseID := uuid.NewString()
	caseRef := "VER-" + caseID[:8]
	now := time.Now()

	_, err = tx.Exec(ctx, `
		INSERT INTO elber.verification_cases (
			id, subject_type, subject_id, verification_type,
			status, requested_tier, submitted_at, created_at, updated_at
		) VALUES (
			$1, 'organisation', $2, 'business',
			'submitted', $3, $4, $4, $4
		)
	`, caseID, input.OrganisationID, input.RequestedTier, now)
	if err != nil {
		return nil, fmt.Errorf("insert case: %w", err)
	}

	// Update org verification status to 'submitted'
	_, err = tx.Exec(ctx, `
		UPDATE elber.organisations
		SET verification_status = 'submitted', updated_at = NOW()
		WHERE id = $1
	`, input.OrganisationID)
	if err != nil {
		return nil, fmt.Errorf("update org status: %w", err)
	}

	// Link each document to the case
	for i, docID := range input.DocumentIDs {
		var docType string
		if i < len(tier.Requires) {
			docType = tier.Requires[i]
		} else {
			docType = "extra"
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO elber.verification_documents (
				verification_case_id, document_id, document_type
			) VALUES ($1, $2, $3)
		`, caseID, docID, docType)
		if err != nil {
			return nil, fmt.Errorf("link document: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &SubmitResult{
		CaseID:        caseID,
		CaseReference: caseRef,
		Status:        "submitted",
		RequestedTier: input.RequestedTier,
		SubmittedAt:   now,
	}, nil
}

// StatusResult is the response for GET verification status.
type StatusResult struct {
	VerificationStatus string     `json:"verification_status"`
	VerificationTier   string     `json:"verification_tier"`
	CurrentCase        *CaseInfo  `json:"current_case,omitempty"`
}

type CaseInfo struct {
	CaseID        string     `json:"case_id"`
	CaseReference string     `json:"case_reference"`
	Status        string     `json:"status"`
	RequestedTier string     `json:"requested_tier"`
	ApprovedTier  *string    `json:"approved_tier,omitempty"`
	Decision      *string    `json:"decision,omitempty"`
	DecisionReason *string   `json:"decision_reason,omitempty"`
	SubmittedAt   *time.Time `json:"submitted_at,omitempty"`
	DecidedAt     *time.Time `json:"decided_at,omitempty"`
}

// GetStatus returns the current verification status for an organisation.
func (s *Service) GetStatus(ctx context.Context, userID, orgID string) (*StatusResult, error) {
	// Authorization
	var orgStatus, verifStatus, verifTier string
	err := s.db.QueryRow(ctx, `
		SELECT o.status, o.verification_status, o.verification_tier
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1 AND m.user_id = $2 AND m.status = 'active'
	`, orgID, userID).Scan(&orgStatus, &verifStatus, &verifTier)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, fmt.Errorf("check membership: %w", err)
	}

	result := &StatusResult{
		VerificationStatus: verifStatus,
		VerificationTier:   verifTier,
	}

	// Load most recent case
	var c CaseInfo
	var submittedAt, decidedAt *time.Time
	var approvedTier, decision, decisionReason *string
	err = s.db.QueryRow(ctx, `
		SELECT id, status, requested_tier, approved_tier, decision,
		       decision_reason, submitted_at, decided_at
		FROM elber.verification_cases
		WHERE subject_type = 'organisation' AND subject_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, orgID).Scan(
		&c.CaseID, &c.Status, &c.RequestedTier, &approvedTier, &decision,
		&decisionReason, &submittedAt, &decidedAt,
	)
	if err == nil {
		c.CaseReference = "VER-" + c.CaseID[:8]
		c.ApprovedTier = approvedTier
		c.Decision = decision
		c.DecisionReason = decisionReason
		c.SubmittedAt = submittedAt
		c.DecidedAt = decidedAt
		result.CurrentCase = &c
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("load case: %w", err)
	}

	return result, nil
}

// DecideInput is the payload for a staff decision on a case.
type DecideInput struct {
	StaffUserID string
	CaseID      string
	Decision    string // 'approved' | 'rejected' | 'more_info'
	Reason      string
}

// Decide applies a staff decision to a verification case.
func (s *Service) Decide(ctx context.Context, input DecideInput) error {
	if input.Decision != "approved" && input.Decision != "rejected" && input.Decision != "more_info" {
		return fmt.Errorf("invalid decision: %s", input.Decision)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	// Load case
	var (
		orgID         string
		requestedTier string
		currentStatus string
	)
	err = tx.QueryRow(ctx, `
		SELECT subject_id, requested_tier, status
		FROM elber.verification_cases
		WHERE id = $1
	`, input.CaseID).Scan(&orgID, &requestedTier, &currentStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("load case: %w", err)
	}

	now := time.Now()

	if input.Decision == "approved" {
		// Update case
		_, err = tx.Exec(ctx, `
			UPDATE elber.verification_cases
			SET status = 'verified',
			    decision = 'approved',
			    approved_tier = requested_tier,
			    decision_reason = $2,
			    reviewer_user_id = $3,
			    decided_at = $4,
			    reviewed_at = $4,
			    updated_at = $4
			WHERE id = $1
		`, input.CaseID, input.Reason, input.StaffUserID, now)
		if err != nil {
			return fmt.Errorf("update case: %w", err)
		}

		// Update org
		_, err = tx.Exec(ctx, `
			UPDATE elber.organisations
			SET verification_status = 'verified',
			    verification_tier = $2,
			    updated_at = $3
			WHERE id = $1
		`, orgID, requestedTier, now)
		if err != nil {
			return fmt.Errorf("update org: %w", err)
		}

		// Mark all linked documents as accepted
		_, _ = tx.Exec(ctx, `
			UPDATE elber.verification_documents
			SET review_status = 'accepted'
			WHERE verification_case_id = $1
		`, input.CaseID)
	} else if input.Decision == "rejected" {
		_, err = tx.Exec(ctx, `
			UPDATE elber.verification_cases
			SET status = 'rejected',
			    decision = 'rejected',
			    decision_reason = $2,
			    reviewer_user_id = $3,
			    decided_at = $4,
			    reviewed_at = $4,
			    updated_at = $4
			WHERE id = $1
		`, input.CaseID, input.Reason, input.StaffUserID, now)
		if err != nil {
			return fmt.Errorf("update case: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE elber.organisations
			SET verification_status = 'rejected', updated_at = $2
			WHERE id = $1
		`, orgID, now)
		if err != nil {
			return fmt.Errorf("update org: %w", err)
		}
	} else if input.Decision == "more_info" {
		_, err = tx.Exec(ctx, `
			UPDATE elber.verification_cases
			SET status = 'additional_info_required',
			    decision = 'more_info',
			    decision_reason = $2,
			    reviewer_user_id = $3,
			    decided_at = $4,
			    reviewed_at = $4,
			    updated_at = $4
			WHERE id = $1
		`, input.CaseID, input.Reason, input.StaffUserID, now)
		if err != nil {
			return fmt.Errorf("update case: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE elber.organisations
			SET verification_status = 'additional_info_required', updated_at = $2
			WHERE id = $1
		`, orgID, now)
		if err != nil {
			return fmt.Errorf("update org: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// ─── Helpers ────────────────────────────────────────────────────────────

func isValidTier(t string) bool {
	return t == TierBasic || t == TierBusiness || t == TierFleetOwner
}

func tierByKey(key string) *TierInfo {
	for _, t := range TierRequirements() {
		if t.Key == key {
			return &t
		}
	}
	return nil
}