// Fleet domain service.
//
// Manages vehicles and drivers within a fleet owner's organisation.
//
// Tier 3 enforcement: only organisations with verification_tier =
// 'fleet_owner' can register vehicles and drivers. Enforced at the
// service level (backend is authoritative).
//
// Ownership: every vehicle registered by an org gets a vehicle_owners
// row linking it to that org at 100% ownership. This is the schema's
// intended representation of "this org owns this vehicle."

package fleet

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

// Errors returned by the service.
var (
	ErrNotMember       = errors.New("not a member of this organisation")
	ErrNotFleetOwner   = errors.New("organisation must be verified as fleet owner")
	ErrInvalidType     = errors.New("invalid vehicle type")
	ErrVehicleNotFound = errors.New("vehicle not found")
	ErrDriverNotFound  = errors.New("driver not found")
	ErrDuplicatePlate  = errors.New("a vehicle with this plate number already exists")
	ErrDriverNotMember = errors.New("driver must be a member of your organisation")
	ErrLicenseExpired  = errors.New("driver license has expired")
	ErrDriverExists    = errors.New("this user is already registered as a driver")
)

// validVehicleTypes matches the DB CHECK constraint from migration 00005.
var validVehicleTypes = map[string]bool{
	"truck":        true,
	"van":          true,
	"pickup":       true,
	"trailer":      true,
	"tanker":       true,
	"refrigerated": true,
	"other":        true,
}

// Service manages vehicles and drivers.
type Service struct {
	db     *pgxpool.Pool
	logger *slog.Logger
}

func NewService(db *pgxpool.Pool, logger *slog.Logger) *Service {
	return &Service{db: db, logger: logger}
}

// ─── Read models ────────────────────────────────────────────────────────

// Vehicle is the API-facing view.
type Vehicle struct {
	ID                 string     `json:"id"`
	PlateNumber        string     `json:"plate_number"`
	CountryCode        string     `json:"country_code"`
	Make               *string    `json:"make,omitempty"`
	Model              *string    `json:"model,omitempty"`
	Year               *int       `json:"year,omitempty"`
	VehicleType        string     `json:"vehicle_type"`
	CapacityKg         float64    `json:"capacity_kg"`
	CapacityM3         *float64   `json:"capacity_m3,omitempty"`
	HomeBaseLocationID *string    `json:"home_base_location_id,omitempty"`
	Status             string     `json:"status"`
	OwnerOrgID         string     `json:"owner_org_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// Driver is the API-facing view.
type Driver struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	FullName           string     `json:"full_name"`
	PhoneNumber        string     `json:"phone_number"`
	LicenseNumber      string     `json:"license_number"`
	LicenseClass       *string    `json:"license_class,omitempty"`
	LicenseExpiry      string     `json:"license_expiry"` // YYYY-MM-DD
	VerificationStatus string     `json:"verification_status"`
	VerifiedAt         *time.Time `json:"verified_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
}

// ─── Inputs ─────────────────────────────────────────────────────────────

type CreateVehicleInput struct {
	UserID             string
	OrgID              string
	PlateNumber        string
	VehicleType        string
	Make               string
	Model              string
	Year               int
	CapacityKg         float64
	CapacityM3         float64
	HomeBaseLocationID string
}

type UpdateVehicleInput struct {
	UserID     string
	OrgID      string
	VehicleID  string
	Make       *string
	Model      *string
	Year       *int
	CapacityKg *float64
	CapacityM3 *float64
	Status     *string
}

type CreateDriverInput struct {
	UserID        string
	OrgID         string
	DriverUserID  string
	LicenseNumber string
	LicenseClass  string
	LicenseExpiry time.Time
}

// ─── Vehicle operations ─────────────────────────────────────────────────

func (s *Service) CreateVehicle(ctx context.Context, input CreateVehicleInput) (*Vehicle, error) {
	if err := s.requireFleetOwner(ctx, input.UserID, input.OrgID); err != nil {
		return nil, err
	}

	if !validVehicleTypes[input.VehicleType] {
		return nil, ErrInvalidType
	}

	plate := strings.ToUpper(strings.TrimSpace(input.PlateNumber))
	if plate == "" {
		return nil, fmt.Errorf("plate number is required")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	// Duplicate check
	var exists bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM elber.vehicles
			WHERE country_code = 'NG' AND plate_number = $1)
	`, plate).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check plate: %w", err)
	}
	if exists {
		return nil, ErrDuplicatePlate
	}

	vehicleID := uuid.NewString()

	_, err = tx.Exec(ctx, `
		INSERT INTO elber.vehicles (
			id, plate_number, country_code,
			make, model, year,
			vehicle_type, capacity_kg, capacity_m3,
			home_base_location_id, status
		) VALUES (
			$1, $2, 'NG',
			$3, $4, $5,
			$6, $7, $8,
			$9, 'active'
		)
	`, vehicleID, plate,
		nullString(input.Make), nullString(input.Model), nullInt(input.Year),
		input.VehicleType, input.CapacityKg, nullFloat(input.CapacityM3),
		nullString(input.HomeBaseLocationID))
	if err != nil {
		return nil, fmt.Errorf("insert vehicle: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO elber.vehicle_owners (
			vehicle_id, owner_organisation_id, ownership_percentage, is_primary
		) VALUES ($1, $2, 100.00, TRUE)
	`, vehicleID, input.OrgID)
	if err != nil {
		return nil, fmt.Errorf("insert ownership: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return s.GetVehicle(ctx, input.UserID, input.OrgID, vehicleID)
}

func (s *Service) GetVehicle(ctx context.Context, userID, orgID, vehicleID string) (*Vehicle, error) {
	if err := s.requireMember(ctx, userID, orgID); err != nil {
		return nil, err
	}

	return s.scanVehicle(s.db.QueryRow(ctx, `
		SELECT v.id, v.plate_number, v.country_code,
		       v.make, v.model, v.year,
		       v.vehicle_type, v.capacity_kg, v.capacity_m3,
		       v.home_base_location_id, v.status,
		       vo.owner_organisation_id,
		       v.created_at, v.updated_at
		FROM elber.vehicles v
		JOIN elber.vehicle_owners vo ON vo.vehicle_id = v.id
		WHERE v.id = $1 AND vo.owner_organisation_id = $2
	`, vehicleID, orgID))
}

func (s *Service) ListVehicles(ctx context.Context, userID, orgID string) ([]Vehicle, error) {
	if err := s.requireMember(ctx, userID, orgID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT v.id, v.plate_number, v.country_code,
		       v.make, v.model, v.year,
		       v.vehicle_type, v.capacity_kg, v.capacity_m3,
		       v.home_base_location_id, v.status,
		       vo.owner_organisation_id,
		       v.created_at, v.updated_at
		FROM elber.vehicles v
		JOIN elber.vehicle_owners vo ON vo.vehicle_id = v.id
		WHERE vo.owner_organisation_id = $1
		  AND v.status != 'retired'
		ORDER BY v.created_at DESC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list vehicles: %w", err)
	}
	defer rows.Close()

	vehicles := []Vehicle{}
	for rows.Next() {
		v, err := s.scanVehicleRow(rows)
		if err != nil {
			return nil, err
		}
		vehicles = append(vehicles, *v)
	}
	return vehicles, nil
}

func (s *Service) UpdateVehicle(ctx context.Context, input UpdateVehicleInput) (*Vehicle, error) {
	if err := s.requireFleetOwner(ctx, input.UserID, input.OrgID); err != nil {
		return nil, err
	}

	// Verify ownership first
	if _, err := s.GetVehicle(ctx, input.UserID, input.OrgID, input.VehicleID); err != nil {
		return nil, err
	}

	// Build the update
	var setClauses []string
	var args []any
	argIdx := 1

	add := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if input.Make != nil {
		add("make", nullString(*input.Make))
	}
	if input.Model != nil {
		add("model", nullString(*input.Model))
	}
	if input.Year != nil {
		add("year", nullInt(*input.Year))
	}
	if input.CapacityKg != nil {
		add("capacity_kg", *input.CapacityKg)
	}
	if input.CapacityM3 != nil {
		add("capacity_m3", nullFloat(*input.CapacityM3))
	}
	if input.Status != nil {
		switch *input.Status {
		case "active", "maintenance", "retired":
			add("status", *input.Status)
		default:
			return nil, fmt.Errorf("invalid status")
		}
	}

	if len(setClauses) == 0 {
		return s.GetVehicle(ctx, input.UserID, input.OrgID, input.VehicleID)
	}

	args = append(args, input.VehicleID)
	query := fmt.Sprintf(`
		UPDATE elber.vehicles
		SET %s, updated_at = NOW()
		WHERE id = $%d
	`, strings.Join(setClauses, ", "), argIdx)

	if _, err := s.db.Exec(ctx, query, args...); err != nil {
		return nil, fmt.Errorf("update vehicle: %w", err)
	}

	return s.GetVehicle(ctx, input.UserID, input.OrgID, input.VehicleID)
}

func (s *Service) DeleteVehicle(ctx context.Context, userID, orgID, vehicleID string) error {
	if err := s.requireFleetOwner(ctx, userID, orgID); err != nil {
		return err
	}
	if _, err := s.GetVehicle(ctx, userID, orgID, vehicleID); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `
		UPDATE elber.vehicles SET status = 'retired', updated_at = NOW()
		WHERE id = $1
	`, vehicleID)
	return err
}

// ─── Driver operations ──────────────────────────────────────────────────

func (s *Service) CreateDriver(ctx context.Context, input CreateDriverInput) (*Driver, error) {
	if err := s.requireFleetOwner(ctx, input.UserID, input.OrgID); err != nil {
		return nil, err
	}

	if input.LicenseExpiry.Before(time.Now()) {
		return nil, ErrLicenseExpired
	}

	// Verify driver is a member of the org
	var isMember bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM elber.organisation_memberships
			WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'
		)
	`, input.OrgID, input.DriverUserID).Scan(&isMember)
	if err != nil {
		return nil, fmt.Errorf("check membership: %w", err)
	}
	if !isMember {
		return nil, ErrDriverNotMember
	}

	// Prevent duplicate driver profiles
	var existingDriverID string
	err = s.db.QueryRow(ctx, `SELECT id FROM elber.drivers WHERE user_id = $1`,
		input.DriverUserID).Scan(&existingDriverID)
	if err == nil {
		return nil, ErrDriverExists
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check existing driver: %w", err)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	driverID := uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO elber.drivers (
			id, user_id, license_number, license_class, license_expiry,
			verification_status
		) VALUES ($1, $2, $3, $4, $5, 'not_started')
	`, driverID, input.DriverUserID, input.LicenseNumber,
		nullString(input.LicenseClass), input.LicenseExpiry)
	if err != nil {
		return nil, fmt.Errorf("insert driver: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO elber.fleet_company_drivers (
			organisation_id, driver_id, relationship_type, status
		) VALUES ($1, $2, 'employee', 'active')
	`, input.OrgID, driverID)
	if err != nil {
		return nil, fmt.Errorf("link driver to fleet: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return s.GetDriver(ctx, input.UserID, input.OrgID, driverID)
}

func (s *Service) GetDriver(ctx context.Context, userID, orgID, driverID string) (*Driver, error) {
	if err := s.requireMember(ctx, userID, orgID); err != nil {
		return nil, err
	}
	return s.scanDriver(s.db.QueryRow(ctx, `
		SELECT d.id, d.user_id, u.full_name, u.phone_number,
		       d.license_number, d.license_class, d.license_expiry,
		       d.verification_status, d.verified_at, d.created_at
		FROM elber.drivers d
		JOIN elber.users u ON u.id = d.user_id
		JOIN elber.fleet_company_drivers fcd ON fcd.driver_id = d.id
		WHERE d.id = $1 AND fcd.organisation_id = $2 AND fcd.status = 'active'
	`, driverID, orgID))
}

func (s *Service) ListDrivers(ctx context.Context, userID, orgID string) ([]Driver, error) {
	if err := s.requireMember(ctx, userID, orgID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT d.id, d.user_id, u.full_name, u.phone_number,
		       d.license_number, d.license_class, d.license_expiry,
		       d.verification_status, d.verified_at, d.created_at
		FROM elber.drivers d
		JOIN elber.users u ON u.id = d.user_id
		JOIN elber.fleet_company_drivers fcd ON fcd.driver_id = d.id
		WHERE fcd.organisation_id = $1 AND fcd.status = 'active'
		ORDER BY d.created_at DESC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list drivers: %w", err)
	}
	defer rows.Close()

	drivers := []Driver{}
	for rows.Next() {
		d, err := s.scanDriverRow(rows)
		if err != nil {
			return nil, err
		}
		drivers = append(drivers, *d)
	}
	return drivers, nil
}

// ─── Row scanners ───────────────────────────────────────────────────────

type rowScanner interface {
	Scan(dest ...any) error
}

func (s *Service) scanVehicle(row rowScanner) (*Vehicle, error) {
	v, err := s.scanVehicleRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrVehicleNotFound
		}
		return nil, err
	}
	return v, nil
}

func (s *Service) scanVehicleRow(row rowScanner) (*Vehicle, error) {
	var v Vehicle
	if err := row.Scan(
		&v.ID, &v.PlateNumber, &v.CountryCode,
		&v.Make, &v.Model, &v.Year,
		&v.VehicleType, &v.CapacityKg, &v.CapacityM3,
		&v.HomeBaseLocationID, &v.Status,
		&v.OwnerOrgID,
		&v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return nil, fmt.Errorf("scan vehicle: %w", err)
	}
	return &v, nil
}

func (s *Service) scanDriver(row rowScanner) (*Driver, error) {
	d, err := s.scanDriverRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDriverNotFound
		}
		return nil, err
	}
	return d, nil
}

func (s *Service) scanDriverRow(row rowScanner) (*Driver, error) {
	var d Driver
	var expiry time.Time
	if err := row.Scan(
		&d.ID, &d.UserID, &d.FullName, &d.PhoneNumber,
		&d.LicenseNumber, &d.LicenseClass, &expiry,
		&d.VerificationStatus, &d.VerifiedAt, &d.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("scan driver: %w", err)
	}
	d.LicenseExpiry = expiry.Format("2006-01-02")
	return &d, nil
}

// ─── Authorization ──────────────────────────────────────────────────────

func (s *Service) requireMember(ctx context.Context, userID, orgID string) error {
	var exists bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM elber.organisation_memberships m
			JOIN elber.organisations o ON o.id = m.organisation_id
			WHERE m.organisation_id = $1 AND m.user_id = $2
			  AND m.status = 'active' AND o.status = 'active'
		)
	`, orgID, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check membership: %w", err)
	}
	if !exists {
		return ErrNotMember
	}
	return nil
}

func (s *Service) requireFleetOwner(ctx context.Context, userID, orgID string) error {
	var tier string
	err := s.db.QueryRow(ctx, `
		SELECT o.verification_tier
		FROM elber.organisations o
		JOIN elber.organisation_memberships m ON m.organisation_id = o.id
		WHERE o.id = $1 AND m.user_id = $2
		  AND m.status = 'active' AND o.status = 'active'
	`, orgID, userID).Scan(&tier)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return fmt.Errorf("check fleet owner: %w", err)
	}
	if tier != "fleet_owner" {
		return ErrNotFleetOwner
	}
	return nil
}

// ─── Nullable helpers ───────────────────────────────────────────────────

func nullString(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func nullInt(i int) any {
	if i == 0 {
		return nil
	}
	return i
}

func nullFloat(f float64) any {
	if f == 0 {
		return nil
	}
	return f
}