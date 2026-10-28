// Organisation service. The domain layer for business profiles.
//
// Design principles:
//
//   - Every write is transactional. Creating an organisation involves three
//     inserts (org, membership, location). If any fails, all roll back.
//
//   - Membership is the source of truth for authorisation. There is no
//     implicit permission from being a "creator" — the creator becomes the
//     first owner membership, but authorisation checks always go through
//     the memberships table.
//
//   - Organisation IDs are client-visible UUIDs. Users supply them in
//     requests. Every endpoint that takes an organisation ID MUST verify
//     the caller's membership before proceeding. This file exposes the
//     primitive that makes that safe.

package organisation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
)

// Organisation types. The canonical list, used in validation and in the
// mobile app's type picker.
const (
	TypeFarmer      = "farmer"
	TypeTrader      = "trader"
	TypeBuyer       = "buyer"
	TypeTransporter = "transporter"
	TypeWarehouse   = "warehouse"
	TypeInspector   = "inspector"
)

// Membership roles.
const (
	RoleOwner   = "owner"
	RoleAdmin   = "admin"
	RoleManager = "manager"
	RoleMember  = "member"
	RoleViewer  = "viewer"
)

// Verification statuses (mirror the DB constraint).
const (
	VerificationNotStarted           = "not_started"
	VerificationDraft                = "draft"
	VerificationSubmitted            = "submitted"
	VerificationUnderReview          = "under_review"
	VerificationAdditionalInfo       = "additional_info_required"
	VerificationVerified             = "verified"
	VerificationRejected             = "rejected"
	VerificationSuspended            = "suspended"
)

// Errors.
var (
	ErrNotFound          = errors.New("organisation not found")
	ErrNotMember         = errors.New("not a member of this organisation")
	ErrInvalidType       = errors.New("invalid organisation type")
	ErrDuplicateName     = errors.New("an organisation with this name already exists for you")
)

// AllOrganisationTypes returns the canonical list, used by the mobile app
// to populate the type picker.
func AllOrganisationTypes() []string {
	return []string{
		TypeFarmer,
		TypeTrader,
		TypeBuyer,
		TypeTransporter,
		TypeWarehouse,
		TypeInspector,
	}
}

// Organisation is the read model. Returned by read operations.
type Organisation struct {
	ID                 string    `json:"id"`
	LegalName          string    `json:"legal_name"`
	TradingName        *string   `json:"trading_name,omitempty"`
	OrganisationType   string    `json:"organisation_type"`
	PrimaryPhone       *string   `json:"primary_phone,omitempty"`
	PrimaryEmail       *string   `json:"primary_email,omitempty"`
	VerificationStatus string    `json:"verification_status"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`

	// Role is the current user's role in this organisation. Populated by
	// ListForUser and GetForUser. Not stored on the row itself.
	Role string `json:"role,omitempty"`
}

// Location is the read model for a primary location.
type Location struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	AddressLine *string `json:"address_line,omitempty"`
	Locality    *string `json:"locality,omitempty"`
	State       *string `json:"state,omitempty"`
	CountryCode string  `json:"country_code"`
}

// CreateInput is the payload required to create an organisation.
type CreateInput struct {
	LegalName        string
	TradingName      string
	OrganisationType string
	PrimaryPhone     string
	PrimaryEmail     string

	// Primary location. Required at creation time — every business must
	// be located somewhere.
	LocationName  string
	AddressLine   string
	Locality      string
	State         string
}

// Service is the organisation domain service.
type Service struct {
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewService constructs the service.
func NewService(db *pgxpool.Pool, logger *slog.Logger) *Service {
	return &Service{db: db, logger: logger}
}

// ─── Create ─────────────────────────────────────────────────────────────

// CreateResult is the shape returned by Create.
type CreateResult struct {
	Organisation Organisation `json:"organisation"`
	Location     Location     `json:"location"`
}

// Create creates a new organisation, an owner membership for the given
// user, and the primary location — all in one transaction.
//
// The creator becomes the owner. Additional members can be invited later
// (in a future slice).
func (s *Service) Create(ctx context.Context, userID string, input CreateInput) (*CreateResult, error) {
	// Validate organisation type.
	if !isValidType(input.OrganisationType) {
		return nil, ErrInvalidType
	}

	// Begin transaction. All three inserts commit together or roll back.
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Prevent duplicates: one user cannot create two orgs with the same
	// legal name. Different users can — legal names are only unique per
	// creator, not globally.
	var existingID string
	err = tx.QueryRow(ctx, `
		SELECT o.id
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE m.user_id = $1
		  AND LOWER(o.legal_name) = LOWER($2)
		  AND m.status = 'active'
		LIMIT 1
	`, userID, strings.TrimSpace(input.LegalName)).Scan(&existingID)

	if err == nil {
		return nil, ErrDuplicateName
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check duplicate: %w", err)
	}

	orgID := uuid.NewString()

	// Insert organisation.
	_, err = tx.Exec(ctx, `
		INSERT INTO elber.organisations (
			id, legal_name, trading_name, organisation_type,
			primary_phone, primary_email, created_by_user_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`,
		orgID,
		strings.TrimSpace(input.LegalName),
		nullIfEmpty(input.TradingName),
		input.OrganisationType,
		nullIfEmpty(input.PrimaryPhone),
		nullIfEmpty(input.PrimaryEmail),
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert organisation: %w", err)
	}

	// Insert membership — creator becomes owner.
	_, err = tx.Exec(ctx, `
		INSERT INTO elber.organisation_memberships (
			organisation_id, user_id, role, status
		) VALUES ($1, $2, 'owner', 'active')
	`, orgID, userID)
	if err != nil {
		return nil, fmt.Errorf("insert membership: %w", err)
	}

	// Insert primary location.
	locationID := uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO elber.locations (
			id, organisation_id, name, address_line, locality, state,
			country_code, location_type
		) VALUES ($1, $2, $3, $4, $5, $6, 'NG', 'primary')
	`,
		locationID,
		orgID,
		strings.TrimSpace(input.LocationName),
		nullIfEmpty(input.AddressLine),
		nullIfEmpty(input.Locality),
		nullIfEmpty(input.State),
	)
	if err != nil {
		return nil, fmt.Errorf("insert location: %w", err)
	}

	// Commit.
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	// Read back for the response. Uses a fresh query so what we return is
	// exactly what's in the database, not what we think we wrote.
	return s.GetForUser(ctx, userID, orgID)
}

// ─── Read ───────────────────────────────────────────────────────────────

// ListForUser returns every organisation the user is an active member of.
func (s *Service) ListForUser(ctx context.Context, userID string) ([]Organisation, error) {
	rows, err := s.db.Query(ctx, `
		SELECT o.id, o.legal_name, o.trading_name, o.organisation_type,
		       o.primary_phone, o.primary_email, o.verification_status,
		       o.status, o.created_at, o.updated_at, m.role
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE m.user_id = $1
		  AND m.status = 'active'
		  AND o.status = 'active'
		ORDER BY o.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list organisations: %w", err)
	}
	defer rows.Close()

	var orgs []Organisation
	for rows.Next() {
		var o Organisation
		if err := rows.Scan(
			&o.ID, &o.LegalName, &o.TradingName, &o.OrganisationType,
			&o.PrimaryPhone, &o.PrimaryEmail, &o.VerificationStatus,
			&o.Status, &o.CreatedAt, &o.UpdatedAt, &o.Role,
		); err != nil {
			return nil, fmt.Errorf("scan org: %w", err)
		}
		orgs = append(orgs, o)
	}
	return orgs, nil
}

// GetForUser returns a single organisation, verifying the caller is a
// member. Returns ErrNotFound if the org doesn't exist OR the caller is
// not a member — deliberately ambiguous so a probe cannot distinguish
// "exists but you can't see it" from "doesn't exist".
func (s *Service) GetForUser(ctx context.Context, userID, orgID string) (*CreateResult, error) {
	var (
		org      Organisation
		location Location
	)

	err := s.db.QueryRow(ctx, `
		SELECT o.id, o.legal_name, o.trading_name, o.organisation_type,
		       o.primary_phone, o.primary_email, o.verification_status,
		       o.status, o.created_at, o.updated_at, m.role
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1
		  AND m.user_id = $2
		  AND m.status = 'active'
		  AND o.status = 'active'
	`, orgID, userID).Scan(
		&org.ID, &org.LegalName, &org.TradingName, &org.OrganisationType,
		&org.PrimaryPhone, &org.PrimaryEmail, &org.VerificationStatus,
		&org.Status, &org.CreatedAt, &org.UpdatedAt, &org.Role,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("load org: %w", err)
	}

	// Load primary location.
	err = s.db.QueryRow(ctx, `
		SELECT id, name, address_line, locality, state, country_code
		FROM elber.locations
		WHERE organisation_id = $1
		  AND location_type = 'primary'
		  AND status = 'active'
		LIMIT 1
	`, orgID).Scan(
		&location.ID, &location.Name, &location.AddressLine,
		&location.Locality, &location.State, &location.CountryCode,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("load primary location: %w", err)
	}

	return &CreateResult{
		Organisation: org,
		Location:     location,
	}, nil
}

// ─── Membership primitive ───────────────────────────────────────────────

// Membership is the answer to "is this user part of this org, and what
// can they do".
type Membership struct {
	OrganisationID string
	UserID         string
	Role           string
}

// CheckMembership verifies the user is an active member of the org and
// returns their role. Used by every endpoint that operates on an org's
// resources.
//
// Returns ErrNotFound if the org doesn't exist OR the user isn't a member.
// Callers should treat these identically to avoid leaking org existence.
func (s *Service) CheckMembership(ctx context.Context, userID, orgID string) (*Membership, error) {
	var m Membership
	err := s.db.QueryRow(ctx, `
		SELECT m.organisation_id, m.user_id, m.role
		FROM elber.organisation_memberships m
		JOIN elber.organisations o ON o.id = m.organisation_id
		WHERE m.organisation_id = $1
		  AND m.user_id = $2
		  AND m.status = 'active'
		  AND o.status = 'active'
	`, orgID, userID).Scan(&m.OrganisationID, &m.UserID, &m.Role)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("check membership: %w", err)
	}

	return &m, nil
}

// RequireRole checks membership AND that the role is at least as privileged
// as required. Role hierarchy: owner > admin > manager > member > viewer.
func (s *Service) RequireRole(ctx context.Context, userID, orgID, minRole string) (*Membership, error) {
	m, err := s.CheckMembership(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	if !roleAtLeast(m.Role, minRole) {
		return nil, ErrNotMember
	}
	return m, nil
}

// ─── Helpers ────────────────────────────────────────────────────────────

func isValidType(t string) bool {
	for _, valid := range AllOrganisationTypes() {
		if t == valid {
			return true
		}
	}
	return false
}

func roleRank(role string) int {
	switch role {
	case RoleOwner:
		return 5
	case RoleAdmin:
		return 4
	case RoleManager:
		return 3
	case RoleMember:
		return 2
	case RoleViewer:
		return 1
	default:
		return 0
	}
}

func roleAtLeast(actual, required string) bool {
	return roleRank(actual) >= roleRank(required)
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}