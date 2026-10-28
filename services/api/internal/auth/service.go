// Authentication service. Registration, sign-in, session lifecycle.
//
// Design decisions:
//
//   - Sessions are the unit of authentication. Each session = one device.
//     A user signing in on three devices has three session rows, each with
//     its own refresh token hash. Revoking one does not sign out the others.
//
//   - Refresh tokens are opaque random strings (32 bytes = 256 bits),
//     base64-encoded. Only the SHA-256 hash is stored in the database.
//     The plaintext refresh token is returned to the client exactly once,
//     at session creation. If the client loses it, they sign in again with
//     OTP — there is no "recover the refresh token" path because we never
//     store the plaintext.
//
//   - Refresh rotation: every time a refresh token is used, it is revoked
//     and a new one is issued. This means a stolen refresh token is only
//     useful until the legitimate client uses it (at which point the stolen
//     one is dead). It also lets us detect theft: if a revoked refresh token
//     is presented, we revoke the entire session chain — assuming a breach.
//
//   - Sliding expiry: each rotation extends the session's expiry. A user who
//     opens the app once a month never needs to re-authenticate. A user who
//     leaves the app untouched for 30+ days must sign in again.

package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"

	"github.com/elbermarket/api/internal/platform/email"
	"github.com/elbermarket/api/internal/platform/jwt"
	"github.com/elbermarket/api/internal/platform/sms"
)

// Token lifetimes.
const (
	refreshTokenTTL  = 30 * 24 * time.Hour
	refreshTokenSize = 32 // bytes of randomness
)

// Errors returned by the service. Each maps to a specific HTTP status
// handled in the handlers layer.
var (
	ErrUserExists         = errors.New("user already exists")
	ErrUserNotFound       = errors.New("user not found")
	ErrUserInactive       = errors.New("user is not active")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrSessionInvalid     = errors.New("session invalid or expired")
	ErrVerificationFailed = errors.New("verification failed")
)

// Service is the authentication service.
type Service struct {
	db     *pgxpool.Pool
	otp    *OTPEngine
	jwt    *jwt.Issuer
	sms    sms.Provider
	email  email.Provider
	logger *slog.Logger
}

// NewService constructs the auth service with its dependencies.
func NewService(
	db *pgxpool.Pool,
	otp *OTPEngine,
	jwtIssuer *jwt.Issuer,
	smsProvider sms.Provider,
	emailProvider email.Provider,
	logger *slog.Logger,
) *Service {
	return &Service{
		db:     db,
		otp:    otp,
		jwt:    jwtIssuer,
		sms:    smsProvider,
		email:  emailProvider,
		logger: logger,
	}
}

// ─── Registration ───────────────────────────────────────────────────────

// RegisterInput is the payload required to begin registration.
type RegisterInput struct {
	FullName    string
	PhoneNumber string
	Email       string // optional
	Channel     string // "sms" or "email" — where to send the OTP
}

// RegisterResult is what Register returns on success. It is deliberately
// minimal: the client only needs to know the verification was initiated.
// The user record exists but is inactive until OTP is verified.
type RegisterResult struct {
	UserID string
	// The target is returned so the client can display "We sent a code to
	// 080****6789" or the masked email.
	Channel string
	Target  string
}

// Register begins a new user registration by creating the user record in
// pending_verification state and sending an OTP to the chosen channel.
//
// If a user with the same phone or email already exists, returns
// ErrUserExists. The client should then call SignInRequest instead.
func (s *Service) Register(ctx context.Context, input RegisterInput, clientIP string) (*RegisterResult, error) {
	// Validate channel-specific input.
	channel := strings.ToLower(strings.TrimSpace(input.Channel))
	if channel != ChannelSMS && channel != ChannelEmail {
		return nil, fmt.Errorf("invalid channel: %s", input.Channel)
	}
	if channel == ChannelEmail && input.Email == "" {
		return nil, fmt.Errorf("email is required when channel is email")
	}

	// Check for existing user by phone or email.
	var existingID string
	err := s.db.QueryRow(ctx, `
		SELECT id FROM elber.users
		WHERE phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
		LIMIT 1
	`, input.PhoneNumber, input.Email).Scan(&existingID)

	if err == nil {
		return nil, ErrUserExists
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check existing user: %w", err)
	}

	// Create the user in pending_verification state. The row is immediately
	// usable but the authenticator will reject it until status is 'active',
	// which only happens after OTP verification.
	userID := uuid.NewString()
	_, err = s.db.Exec(ctx, `
		INSERT INTO elber.users (
			id, full_name, phone_number, email, status
		) VALUES ($1, $2, $3, $4, 'pending_verification')
	`, userID, strings.TrimSpace(input.FullName), input.PhoneNumber, nullIfEmpty(input.Email))
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	// Determine OTP target based on channel.
	target := input.PhoneNumber
	if channel == ChannelEmail {
		target = strings.TrimSpace(input.Email)
	}

	// Send the OTP.
	if err := s.otp.Request(ctx, PurposeRegistration, target, channel, clientIP); err != nil {
		if errors.Is(err, ErrRateLimited) {
			return nil, ErrRateLimited
		}
		return nil, fmt.Errorf("send otp: %w", err)
	}

	return &RegisterResult{
		UserID:  userID,
		Channel: channel,
		Target:  maskTarget(target, channel),
	}, nil
}

// ─── Verification (registration) ────────────────────────────────────────

// SessionResult is returned when a session is successfully created. It
// carries the tokens the client needs to make authenticated requests.
type SessionResult struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
	UserID       string
}

// VerifyRegistrationInput verifies the OTP for a pending registration and,
// on success, activates the user and issues a session.
type VerifyRegistrationInput struct {
	Target    string // phone or email the OTP was sent to
	Channel   string // "sms" or "email"
	Code      string
	UserAgent string
	ClientIP  string
}

// VerifyRegistration completes registration. On success, the user is
// activated, a session is created, and tokens are returned.
func (s *Service) VerifyRegistration(ctx context.Context, input VerifyRegistrationInput) (*SessionResult, error) {
	if err := s.otp.Verify(ctx, PurposeRegistration, input.Target, input.Code); err != nil {
		if errors.Is(err, ErrInvalidOTP) {
			return nil, ErrVerificationFailed
		}
		return nil, fmt.Errorf("verify otp: %w", err)
	}

	// Load the user. We look them up by target (phone or email). If both
	// match, phone wins — registration always created the phone.
	var (
		userID      string
		phoneNumber string
		emailAddr   *string
	)
	err := s.db.QueryRow(ctx, `
		SELECT id, phone_number, email FROM elber.users
		WHERE phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($1))
		LIMIT 1
	`, input.Target).Scan(&userID, &phoneNumber, &emailAddr)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("load user: %w", err)
	}

	// Mark the appropriate channel as verified and activate the user. We
	// activate on first verification. Email verification (if the user later
	// adds an email) is a separate flow.
	now := time.Now()
	if input.Channel == ChannelSMS {
		_, err = s.db.Exec(ctx, `
			UPDATE elber.users
			SET phone_verified_at = $1, status = 'active'
			WHERE id = $2
		`, now, userID)
	} else {
		_, err = s.db.Exec(ctx, `
			UPDATE elber.users
			SET email_verified_at = $1, phone_verified_at = COALESCE(phone_verified_at, $1), status = 'active'
			WHERE id = $2
		`, now, userID)
	}
	if err != nil {
		return nil, fmt.Errorf("activate user: %w", err)
	}

	// Create the session.
	return s.createSession(ctx, userID, input.UserAgent, input.ClientIP)
}

// ─── Sign-in (existing users) ───────────────────────────────────────────

// SignInRequestInput asks the server to send an OTP to a verified channel
// for an existing user.
type SignInRequestInput struct {
	// Identifier is the user's phone or email. Both are accepted; the
	// service resolves which it is.
	Identifier string
	// Channel is optional. If omitted, the service uses whichever channel
	// the user has verified (email if they verified email, phone otherwise).
	Channel string
}

// SignInRequest sends an OTP for sign-in. The endpoint is intentionally
// indistinguishable from registration-request from the client's
// perspective — an attacker cannot enumerate users by watching which
// response succeeds.
//
// Channel resolution:
//   - If the client specifies a channel and that channel is verified, it
//     is tried first.
//   - If the preferred channel fails (e.g., provider outage, sender ID
//     rejected), the service falls back to the other verified channel.
//   - This makes sign-in resilient to transient provider issues without
//     exposing which channel succeeded to the client.
func (s *Service) SignInRequest(ctx context.Context, input SignInRequestInput, clientIP string) error {
	var (
		userID        string
		phoneNumber   string
		emailAddr     *string
		phoneVerified *time.Time
		emailVerified *time.Time
		status        string
	)
	err := s.db.QueryRow(ctx, `
		SELECT id, phone_number, email, phone_verified_at, email_verified_at, status
		FROM elber.users
		WHERE phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($1))
		LIMIT 1
	`, input.Identifier).Scan(&userID, &phoneNumber, &emailAddr, &phoneVerified, &emailVerified, &status)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Do NOT reveal that the user doesn't exist. Instead, wait a
			// tiny bit so timing is similar to a real send, then return
			// success. The client sees "code sent" either way.
			time.Sleep(200 * time.Millisecond)
			return nil
		}
		return fmt.Errorf("load user: %w", err)
	}

	if status != "active" {
		// Same treatment — don't reveal status.
		time.Sleep(200 * time.Millisecond)
		return nil
	}

	// Determine the preferred channel from the client's request, then
	// build an ordered list of (channel, target) candidates. The service
	// tries each in order until one succeeds. If the client did not
	// specify a channel, we try email first (primary until SMS is fully
	// verified with Termii), then phone.
	preferred := strings.ToLower(strings.TrimSpace(input.Channel))

	type channelChoice struct {
		channel string
		target  string
	}

	var candidates []channelChoice

	switch {
	case preferred == ChannelEmail && emailVerified != nil && emailAddr != nil:
		candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
		if phoneVerified != nil {
			candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
		}
	case preferred == ChannelSMS && phoneVerified != nil:
		candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
		if emailVerified != nil && emailAddr != nil {
			candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
		}
	default:
		// No preference (or preferred channel is not verified). Try
		// whichever channels are verified. Email is preferred as the
		// primary channel until SMS is fully verified with Termii.
		// Reorder these two blocks when SMS becomes the primary channel.
		if emailVerified != nil && emailAddr != nil {
			candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
		}
		if phoneVerified != nil {
			candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
		}
	}

	if len(candidates) == 0 {
		return fmt.Errorf("no verified channel")
	}

	// Try each candidate in order. The first successful send wins. If a
	// provider fails, fall through to the next. Rate limits are also
	// treated as "try next channel" — a per-target rate limit should not
	// block the other channel if it is available.
	var lastErr error
	for _, c := range candidates {
		err := s.otp.Request(ctx, PurposeLogin, c.target, c.channel, clientIP)
		if err == nil {
			return nil
		}
		s.logger.Warn("sign-in channel send failed, trying next",
			"channel", c.channel,
			"error", err,
		)
		lastErr = err
	}

	return fmt.Errorf("all channels failed: %w", lastErr)
}

// VerifySignInInput verifies an OTP and issues a session.
type VerifySignInInput struct {
	Target    string // phone or email the OTP was sent to
	Code      string
	UserAgent string
	ClientIP  string
}

// VerifySignIn completes sign-in for an existing user and issues a session.
func (s *Service) VerifySignIn(ctx context.Context, input VerifySignInInput) (*SessionResult, error) {
	if err := s.otp.Verify(ctx, PurposeLogin, input.Target, input.Code); err != nil {
		if errors.Is(err, ErrInvalidOTP) {
			return nil, ErrVerificationFailed
		}
		return nil, fmt.Errorf("verify otp: %w", err)
	}

	var userID string
	err := s.db.QueryRow(ctx, `
		SELECT id FROM elber.users
		WHERE (phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($1)))
		  AND status = 'active'
		LIMIT 1
	`, input.Target).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("load user: %w", err)
	}

	return s.createSession(ctx, userID, input.UserAgent, input.ClientIP)
}

// ─── Session management ─────────────────────────────────────────────────

// createSession creates a new session row and issues tokens. Internal —
// called by VerifyRegistration and VerifySignIn.
func (s *Service) createSession(ctx context.Context, userID, userAgent, clientIP string) (*SessionResult, error) {
	sessionID := uuid.NewString()

	refreshToken, refreshHash, err := generateRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	expiresAt := time.Now().Add(refreshTokenTTL)

	// Only persist the IP if it parses as a valid INET. Loopback addresses
	// from IPv6 ("::1") are valid; garbage is dropped rather than causing
	// an insert failure.
	var ip any
	if clientIP != "" && net.ParseIP(clientIP) != nil {
		ip = clientIP
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO elber.sessions (
			id, user_id, refresh_token_hash, user_agent, ip_address, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6)
	`, sessionID, userID, refreshHash, nullIfEmpty(userAgent), ip, expiresAt)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	accessToken, err := s.jwt.IssueAccessToken(userID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("issue access token: %w", err)
	}

	return &SessionResult{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
		UserID:       userID,
	}, nil
}

// RefreshInput exchanges a refresh token for a new access token and a
// rotated refresh token.
type RefreshInput struct {
	RefreshToken string
	UserAgent    string
	ClientIP     string
}

// Refresh rotates the refresh token. If the provided token matches an
// active session, a new access token is issued and the refresh token is
// replaced with a fresh one. If the provided token matches a session that
// has been revoked, the entire session chain is revoked — the assumption
// is that an attacker is presenting a stolen token.
func (s *Service) Refresh(ctx context.Context, input RefreshInput) (*SessionResult, error) {
	hash := hashRefreshToken(input.RefreshToken)

	var (
		sessionID string
		userID    string
		expiresAt time.Time
		revokedAt *time.Time
	)
	err := s.db.QueryRow(ctx, `
		SELECT id, user_id, expires_at, revoked_at
		FROM elber.sessions
		WHERE refresh_token_hash = $1
		LIMIT 1
	`, hash).Scan(&sessionID, &userID, &expiresAt, &revokedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSessionInvalid
		}
		return nil, fmt.Errorf("load session: %w", err)
	}

	// If the session is revoked, an attacker (or a confused client) is
	// presenting a token that should be dead. Revoke the whole chain and
	// refuse. This is the "refresh token reuse detection" pattern.
	if revokedAt != nil {
		_, _ = s.db.Exec(ctx, `
			UPDATE elber.sessions SET revoked_at = NOW()
			WHERE user_id = $1 AND revoked_at IS NULL
		`, userID)
		return nil, ErrSessionInvalid
	}

	if expiresAt.Before(time.Now()) {
		return nil, ErrSessionInvalid
	}

	// Verify user is still active.
	var status string
	err = s.db.QueryRow(ctx, `
		SELECT status FROM elber.users WHERE id = $1
	`, userID).Scan(&status)
	if err != nil || status != "active" {
		return nil, ErrSessionInvalid
	}

	// Rotate: generate new refresh token, update the session row.
	newRefreshToken, newHash, err := generateRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("generate new refresh: %w", err)
	}
	newExpiry := time.Now().Add(refreshTokenTTL)

	_, err = s.db.Exec(ctx, `
		UPDATE elber.sessions
		SET refresh_token_hash = $1,
		    expires_at = $2,
		    last_used_at = NOW()
		WHERE id = $3
	`, newHash, newExpiry, sessionID)
	if err != nil {
		return nil, fmt.Errorf("rotate refresh: %w", err)
	}

	accessToken, err := s.jwt.IssueAccessToken(userID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("issue access token: %w", err)
	}

	return &SessionResult{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresAt:    newExpiry,
		UserID:       userID,
	}, nil
}

// SessionSummary is the shape of a session in the "list sessions" response.
type SessionSummary struct {
	ID         string     `json:"id"`
	UserAgent  *string    `json:"user_agent,omitempty"`
	IPAddress  *string    `json:"ip_address,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt  time.Time  `json:"expires_at"`
	IsCurrent  bool       `json:"is_current"`
}

// ListSessions returns all active sessions for the user. The current
// session (the one used to make this call) is flagged.
func (s *Service) ListSessions(ctx context.Context, userID, currentSessionID string) ([]SessionSummary, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, user_agent, host(ip_address), created_at, last_used_at, expires_at
		FROM elber.sessions
		WHERE user_id = $1
		  AND revoked_at IS NULL
		  AND expires_at > NOW()
		ORDER BY COALESCE(last_used_at, created_at) DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []SessionSummary
	for rows.Next() {
		var (
			id        string
			userAgent *string
			ip        *string
			createdAt time.Time
			lastUsed  *time.Time
			expiresAt time.Time
		)
		if err := rows.Scan(&id, &userAgent, &ip, &createdAt, &lastUsed, &expiresAt); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sessions = append(sessions, SessionSummary{
			ID:         id,
			UserAgent:  userAgent,
			IPAddress:  ip,
			CreatedAt:  createdAt,
			LastUsedAt: lastUsed,
			ExpiresAt:  expiresAt,
			IsCurrent:  id == currentSessionID,
		})
	}
	return sessions, nil
}

// RevokeSession marks one session as revoked. If sessionID belongs to the
// user, revokes it. If sessionID is "*", revokes all sessions except the
// current one (sign out everywhere else).
func (s *Service) RevokeSession(ctx context.Context, userID, sessionID, currentSessionID string) error {
	if sessionID == "*" {
		_, err := s.db.Exec(ctx, `
			UPDATE elber.sessions SET revoked_at = NOW()
			WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL
		`, userID, currentSessionID)
		return err
	}

	cmdTag, err := s.db.Exec(ctx, `
		UPDATE elber.sessions SET revoked_at = NOW()
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
	`, sessionID, userID)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrSessionInvalid
	}
	return nil
}

// ─── Authenticator (implements identity.Authenticator) ──────────────────

// Authenticator verifies JWT access tokens and returns the user. On every
// request it also checks that the session has not been revoked, making
// revocation take effect immediately.
type Authenticator struct {
	db  *pgxpool.Pool
	jwt *jwt.Issuer
}

// NewAuthenticator constructs the authenticator.
func NewAuthenticator(db *pgxpool.Pool, jwtIssuer *jwt.Issuer) *Authenticator {
	return &Authenticator{db: db, jwt: jwtIssuer}
}

// Authenticate verifies the JWT and loads the user. Checks the session is
// still active. Returns ErrUnauthenticated for any failure.
func (a *Authenticator) Authenticate(ctx context.Context, token string) (*User, error) {
	claims, err := a.jwt.VerifyAccessToken(token)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	// Look up the session. It must exist, not be revoked, and not be
	// expired. This is what makes "revoke" instant — the very next request
	// fails.
	var (
		revokedAt *time.Time
		expiresAt time.Time
	)
	err = a.db.QueryRow(ctx, `
		SELECT revoked_at, expires_at FROM elber.sessions WHERE id = $1
	`, claims.SessionID).Scan(&revokedAt, &expiresAt)
	if err != nil || revokedAt != nil || expiresAt.Before(time.Now()) {
		return nil, ErrInvalidCredentials
	}

	// Load the user. Status must be active.
	var (
		userID      string
		fullName    string
		phoneNumber string
		emailAddr   *string
		status      string
	)
	err = a.db.QueryRow(ctx, `
		SELECT id, full_name, phone_number, email, status
		FROM elber.users
		WHERE id = $1
	`, claims.UserID).Scan(&userID, &fullName, &phoneNumber, &emailAddr, &status)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	if status != "active" {
		return nil, ErrUserInactive
	}

	var emailStr string
	if emailAddr != nil {
		emailStr = *emailAddr
	}

	return &User{
		ID:          userID,
		FullName:    fullName,
		PhoneNumber: phoneNumber,
		Email:       emailStr,
		Status:      UserStatus(status),
	}, nil
}

// User is the identity of an authenticated caller. Mirrors identity.User
// but avoids the import cycle (identity imports auth via the interface;
// auth cannot import identity back).
type User struct {
	ID          string
	FullName    string
	PhoneNumber string
	Email       string
	Status      UserStatus
}

type UserStatus string

const (
	UserStatusActive    UserStatus = "active"
	UserStatusSuspended UserStatus = "suspended"
	UserStatusPending   UserStatus = "pending_verification"
)

// ─── Helpers ────────────────────────────────────────────────────────────

func generateRefreshToken() (token string, hash string, err error) {
	buf := make([]byte, refreshTokenSize)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(buf)
	hash = hashRefreshToken(token)
	return token, hash, nil
}

func hashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func maskTarget(target, channel string) string {
	if channel == ChannelEmail {
		parts := strings.SplitN(target, "@", 2)
		if len(parts) != 2 {
			return target
		}
		if len(parts[0]) <= 2 {
			return "**@" + parts[1]
		}
		return string(parts[0][0]) + strings.Repeat("*", len(parts[0])-2) + string(parts[0][len(parts[0])-1]) + "@" + parts[1]
	}
	// Phone: mask the middle. +2348012345678 → +234801****678
	if len(target) < 6 {
		return target
	}
	return target[:len(target)-4] + "****" + target[len(target)-3:]
}









































































// // Authentication service. Registration, sign-in, session lifecycle.
// //
// // Design decisions:
// //
// //   - Sessions are the unit of authentication. Each session = one device.
// //     A user signing in on three devices has three session rows, each with
// //     its own refresh token hash. Revoking one does not sign out the others.
// //
// //   - Refresh tokens are opaque random strings (32 bytes = 256 bits),
// //     base64-encoded. Only the SHA-256 hash is stored in the database.
// //     The plaintext refresh token is returned to the client exactly once,
// //     at session creation. If the client loses it, they sign in again with
// //     OTP — there is no "recover the refresh token" path because we never
// //     store the plaintext.
// //
// //   - Refresh rotation: every time a refresh token is used, it is revoked
// //     and a new one is issued. This means a stolen refresh token is only
// //     useful until the legitimate client uses it (at which point the stolen
// //     one is dead). It also lets us detect theft: if a revoked refresh token
// //     is presented, we revoke the entire session chain — assuming a breach.
// //
// //   - Sliding expiry: each rotation extends the session's expiry. A user who
// //     opens the app once a month never needs to re-authenticate. A user who
// //     leaves the app untouched for 30+ days must sign in again.

// package auth

// import (
// 	"context"
// 	"crypto/rand"
// 	"crypto/sha256"
// 	"encoding/base64"
// 	"encoding/hex"
// 	"errors"
// 	"fmt"
// 	"net"
// 	"strings"
// 	"time"

// 	"github.com/google/uuid"
// 	"github.com/jackc/pgx/v5"
// 	"github.com/jackc/pgx/v5/pgxpool"
// 	"log/slog"

// 	"github.com/elbermarket/api/internal/platform/email"
// 	"github.com/elbermarket/api/internal/platform/jwt"
// 	"github.com/elbermarket/api/internal/platform/sms"
// )

// // Token lifetimes.
// const (
// 	refreshTokenTTL  = 30 * 24 * time.Hour
// 	refreshTokenSize = 32 // bytes of randomness
// )

// // Errors returned by the service. Each maps to a specific HTTP status
// // handled in the handlers layer.
// var (
// 	ErrUserExists         = errors.New("user already exists")
// 	ErrUserNotFound       = errors.New("user not found")
// 	ErrUserInactive       = errors.New("user is not active")
// 	ErrInvalidCredentials = errors.New("invalid credentials")
// 	ErrSessionInvalid     = errors.New("session invalid or expired")
// 	ErrVerificationFailed = errors.New("verification failed")
// )

// // Service is the authentication service.
// type Service struct {
// 	db     *pgxpool.Pool
// 	otp    *OTPEngine
// 	jwt    *jwt.Issuer
// 	sms    sms.Provider
// 	email  email.Provider
// 	logger *slog.Logger
// }

// // NewService constructs the auth service with its dependencies.
// func NewService(
// 	db *pgxpool.Pool,
// 	otp *OTPEngine,
// 	jwtIssuer *jwt.Issuer,
// 	smsProvider sms.Provider,
// 	emailProvider email.Provider,
// 	logger *slog.Logger,
// ) *Service {
// 	return &Service{
// 		db:     db,
// 		otp:    otp,
// 		jwt:    jwtIssuer,
// 		sms:    smsProvider,
// 		email:  emailProvider,
// 		logger: logger,
// 	}
// }

// // ─── Registration ───────────────────────────────────────────────────────

// // RegisterInput is the payload required to begin registration.
// type RegisterInput struct {
// 	FullName    string
// 	PhoneNumber string
// 	Email       string // optional
// 	Channel     string // "sms" or "email" — where to send the OTP
// }

// // RegisterResult is what Register returns on success. It is deliberately
// // minimal: the client only needs to know the verification was initiated.
// // The user record exists but is inactive until OTP is verified.
// type RegisterResult struct {
// 	UserID string
// 	// The target is returned so the client can display "We sent a code to
// 	// 080****6789" or the masked email.
// 	Channel string
// 	Target  string
// }

// // Register begins a new user registration by creating the user record in
// // pending_verification state and sending an OTP to the chosen channel.
// //
// // If a user with the same phone or email already exists, returns
// // ErrUserExists. The client should then call SignInRequest instead.
// func (s *Service) Register(ctx context.Context, input RegisterInput, clientIP string) (*RegisterResult, error) {
// 	// Validate channel-specific input.
// 	channel := strings.ToLower(strings.TrimSpace(input.Channel))
// 	if channel != ChannelSMS && channel != ChannelEmail {
// 		return nil, fmt.Errorf("invalid channel: %s", input.Channel)
// 	}
// 	if channel == ChannelEmail && input.Email == "" {
// 		return nil, fmt.Errorf("email is required when channel is email")
// 	}

// 	// Check for existing user by phone or email.
// 	var existingID string
// 	err := s.db.QueryRow(ctx, `
// 		SELECT id FROM elber.users
// 		WHERE phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
// 		LIMIT 1
// 	`, input.PhoneNumber, input.Email).Scan(&existingID)

// 	if err == nil {
// 		return nil, ErrUserExists
// 	}
// 	if !errors.Is(err, pgx.ErrNoRows) {
// 		return nil, fmt.Errorf("check existing user: %w", err)
// 	}

// 	// Create the user in pending_verification state. The row is immediately
// 	// usable but the authenticator will reject it until status is 'active',
// 	// which only happens after OTP verification.
// 	userID := uuid.NewString()
// 	_, err = s.db.Exec(ctx, `
// 		INSERT INTO elber.users (
// 			id, full_name, phone_number, email, status
// 		) VALUES ($1, $2, $3, $4, 'pending_verification')
// 	`, userID, strings.TrimSpace(input.FullName), input.PhoneNumber, nullIfEmpty(input.Email))
// 	if err != nil {
// 		return nil, fmt.Errorf("create user: %w", err)
// 	}

// 	// Determine OTP target based on channel.
// 	target := input.PhoneNumber
// 	if channel == ChannelEmail {
// 		target = strings.TrimSpace(input.Email)
// 	}

// 	// Send the OTP.
// 	if err := s.otp.Request(ctx, PurposeRegistration, target, channel, clientIP); err != nil {
// 		if errors.Is(err, ErrRateLimited) {
// 			return nil, ErrRateLimited
// 		}
// 		return nil, fmt.Errorf("send otp: %w", err)
// 	}

// 	return &RegisterResult{
// 		UserID:  userID,
// 		Channel: channel,
// 		Target:  maskTarget(target, channel),
// 	}, nil
// }

// // ─── Verification (registration) ────────────────────────────────────────

// // SessionResult is returned when a session is successfully created. It
// // carries the tokens the client needs to make authenticated requests.
// type SessionResult struct {
// 	AccessToken  string
// 	RefreshToken string
// 	ExpiresAt    time.Time
// 	UserID       string
// }

// // VerifyRegistrationInput verifies the OTP for a pending registration and,
// // on success, activates the user and issues a session.
// type VerifyRegistrationInput struct {
// 	Target    string // phone or email the OTP was sent to
// 	Channel   string // "sms" or "email"
// 	Code      string
// 	UserAgent string
// 	ClientIP  string
// }

// // VerifyRegistration completes registration. On success, the user is
// // activated, a session is created, and tokens are returned.
// func (s *Service) VerifyRegistration(ctx context.Context, input VerifyRegistrationInput) (*SessionResult, error) {
// 	if err := s.otp.Verify(ctx, PurposeRegistration, input.Target, input.Code); err != nil {
// 		if errors.Is(err, ErrInvalidOTP) {
// 			return nil, ErrVerificationFailed
// 		}
// 		return nil, fmt.Errorf("verify otp: %w", err)
// 	}

// 	// Load the user. We look them up by target (phone or email). If both
// 	// match, phone wins — registration always created the phone.
// 	var (
// 		userID      string
// 		phoneNumber string
// 		emailAddr   *string
// 	)
// 	err := s.db.QueryRow(ctx, `
// 		SELECT id, phone_number, email FROM elber.users
// 		WHERE phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($1))
// 		LIMIT 1
// 	`, input.Target).Scan(&userID, &phoneNumber, &emailAddr)

// 	if err != nil {
// 		if errors.Is(err, pgx.ErrNoRows) {
// 			return nil, ErrUserNotFound
// 		}
// 		return nil, fmt.Errorf("load user: %w", err)
// 	}

// 	// Mark the appropriate channel as verified and activate the user. We
// 	// activate on first verification. Email verification (if the user later
// 	// adds an email) is a separate flow.
// 	now := time.Now()
// 	if input.Channel == ChannelSMS {
// 		_, err = s.db.Exec(ctx, `
// 			UPDATE elber.users
// 			SET phone_verified_at = $1, status = 'active'
// 			WHERE id = $2
// 		`, now, userID)
// 	} else {
// 		_, err = s.db.Exec(ctx, `
// 			UPDATE elber.users
// 			SET email_verified_at = $1, phone_verified_at = COALESCE(phone_verified_at, $1), status = 'active'
// 			WHERE id = $2
// 		`, now, userID)
// 	}
// 	if err != nil {
// 		return nil, fmt.Errorf("activate user: %w", err)
// 	}

// 	// Create the session.
// 	return s.createSession(ctx, userID, input.UserAgent, input.ClientIP)
// }

// // ─── Sign-in (existing users) ───────────────────────────────────────────

// // SignInRequestInput asks the server to send an OTP to a verified channel
// // for an existing user.
// type SignInRequestInput struct {
// 	// Identifier is the user's phone or email. Both are accepted; the
// 	// service resolves which it is.
// 	Identifier string
// 	// Channel is optional. If omitted, the service uses whichever channel
// 	// the user has verified (email if they verified email, phone otherwise).
// 	Channel string
// }

// // SignInRequest sends an OTP for sign-in. The endpoint is intentionally
// // indistinguishable from registration-request from the client's
// // perspective — an attacker cannot enumerate users by watching which
// // response succeeds.
// //
// // Channel resolution:
// //   - If the client specifies a channel and that channel is verified, it
// //     is tried first.
// //   - If the preferred channel fails (e.g., provider outage, sender ID
// //     rejected), the service falls back to the other verified channel.
// //   - This makes sign-in resilient to transient provider issues without
// //     exposing which channel succeeded to the client.
// func (s *Service) SignInRequest(ctx context.Context, input SignInRequestInput, clientIP string) error {
// 	var (
// 		userID        string
// 		phoneNumber   string
// 		emailAddr     *string
// 		phoneVerified *time.Time
// 		emailVerified *time.Time
// 		status        string
// 	)
// 	err := s.db.QueryRow(ctx, `
// 		SELECT id, phone_number, email, phone_verified_at, email_verified_at, status
// 		FROM elber.users
// 		WHERE phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($1))
// 		LIMIT 1
// 	`, input.Identifier).Scan(&userID, &phoneNumber, &emailAddr, &phoneVerified, &emailVerified, &status)

// 	if err != nil {
// 		if errors.Is(err, pgx.ErrNoRows) {
// 			// Do NOT reveal that the user doesn't exist. Instead, wait a
// 			// tiny bit so timing is similar to a real send, then return
// 			// success. The client sees "code sent" either way.
// 			time.Sleep(200 * time.Millisecond)
// 			return nil
// 		}
// 		return fmt.Errorf("load user: %w", err)
// 	}

// 	if status != "active" {
// 		// Same treatment — don't reveal status.
// 		time.Sleep(200 * time.Millisecond)
// 		return nil
// 	}

// 	// Determine the preferred channel from the client's request, then
// 	// build an ordered list of (channel, target) candidates. The service
// 	// tries each in order until one succeeds. If the client did not
// 	// specify a channel, we try phone first (more common in Nigeria) then
// 	// email.
// 	preferred := strings.ToLower(strings.TrimSpace(input.Channel))

// 	type channelChoice struct {
// 		channel string
// 		target  string
// 	}

// 	var candidates []channelChoice


// 	switch {
// 		case preferred == ChannelEmail && emailVerified != nil && emailAddr != nil:
// 			candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
// 			if phoneVerified != nil {
// 				candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
// 			}
// 		case preferred == ChannelSMS && phoneVerified != nil:
// 			candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
// 			if emailVerified != nil && emailAddr != nil {
// 				candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
// 			}
// 		default:
// 			// No preference (or preferred channel is not verified). Try
// 			// whichever channels are verified. Email is preferred as the
// 			// primary channel until SMS is fully verified with Termii.
// 			// Reorder these two blocks when SMS becomes the primary channel.
// 			if emailVerified != nil && emailAddr != nil {
// 				candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
// 			}
// 			if phoneVerified != nil {
// 				candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
// 			}
// 		}










// 	// switch {
// 	// case preferred == ChannelEmail && emailVerified != nil && emailAddr != nil:
// 	// 	candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
// 	// 	if phoneVerified != nil {
// 	// 		candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
// 	// 	}
// 	// case preferred == ChannelSMS && phoneVerified != nil:
// 	// 	candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
// 	// 	if emailVerified != nil && emailAddr != nil {
// 	// 		candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
// 	// 	}
// 	// default:
// 	// 	// No preference (or preferred channel is not verified). Try
// 	// 	// whichever channels are verified, phone first.
// 	// 	if phoneVerified != nil {
// 	// 		candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
// 	// 	}
// 	// 	if emailVerified != nil && emailAddr != nil {
// 	// 		candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
// 	// 	}
// 	// }





// 	// default:
// 	// 	// No preference (or preferred channel is not verified). Try
// 	// 	// whichever channels are verified. Email is preferred as the
// 	// 	// primary channel until SMS is fully verified with Termii.
// 	// 	// Reorder these two blocks when SMS becomes the primary channel.
// 	// 	if emailVerified != nil && emailAddr != nil {
// 	// 		candidates = append(candidates, channelChoice{ChannelEmail, *emailAddr})
// 	// 	}
// 	// 	if phoneVerified != nil {
// 	// 		candidates = append(candidates, channelChoice{ChannelSMS, phoneNumber})
//     // }







// 	if len(candidates) == 0 {
// 		return fmt.Errorf("no verified channel")
// 	}

// 	// Try each candidate in order. The first successful send wins. If a
// 	// provider fails, fall through to the next. Rate limits are also
// 	// treated as "try next channel" — a per-target rate limit should not
// 	// block the other channel if it is available.
// 	var lastErr error
// 	for _, c := range candidates {
// 		err := s.otp.Request(ctx, PurposeLogin, c.target, c.channel, clientIP)
// 		if err == nil {
// 			return nil
// 		}
// 		s.logger.Warn("sign-in channel send failed, trying next",
// 			"channel", c.channel,
// 			"error", err,
// 		)
// 		lastErr = err
// 	}

// 	return fmt.Errorf("all channels failed: %w", lastErr)
// }

// // VerifySignInInput verifies an OTP and issues a session.
// type VerifySignInInput struct {
// 	Target    string // phone or email the OTP was sent to
// 	Code      string
// 	UserAgent string
// 	ClientIP  string
// }

// // VerifySignIn completes sign-in for an existing user and issues a session.
// func (s *Service) VerifySignIn(ctx context.Context, input VerifySignInInput) (*SessionResult, error) {
// 	if err := s.otp.Verify(ctx, PurposeLogin, input.Target, input.Code); err != nil {
// 		if errors.Is(err, ErrInvalidOTP) {
// 			return nil, ErrVerificationFailed
// 		}
// 		return nil, fmt.Errorf("verify otp: %w", err)
// 	}

// 	var userID string
// 	err := s.db.QueryRow(ctx, `
// 		SELECT id FROM elber.users
// 		WHERE (phone_number = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($1)))
// 		  AND status = 'active'
// 		LIMIT 1
// 	`, input.Target).Scan(&userID)
// 	if err != nil {
// 		if errors.Is(err, pgx.ErrNoRows) {
// 			return nil, ErrUserNotFound
// 		}
// 		return nil, fmt.Errorf("load user: %w", err)
// 	}

// 	return s.createSession(ctx, userID, input.UserAgent, input.ClientIP)
// }

// // ─── Session management ─────────────────────────────────────────────────

// // createSession creates a new session row and issues tokens. Internal —
// // called by VerifyRegistration and VerifySignIn.
// func (s *Service) createSession(ctx context.Context, userID, userAgent, clientIP string) (*SessionResult, error) {
// 	sessionID := uuid.NewString()

// 	refreshToken, refreshHash, err := generateRefreshToken()
// 	if err != nil {
// 		return nil, fmt.Errorf("generate refresh token: %w", err)
// 	}

// 	expiresAt := time.Now().Add(refreshTokenTTL)

// 	// Only persist the IP if it parses as a valid INET. Loopback addresses
// 	// from IPv6 ("::1") are valid; garbage is dropped rather than causing
// 	// an insert failure.
// 	var ip any
// 	if clientIP != "" && net.ParseIP(clientIP) != nil {
// 		ip = clientIP
// 	}

// 	_, err = s.db.Exec(ctx, `
// 		INSERT INTO elber.sessions (
// 			id, user_id, refresh_token_hash, user_agent, ip_address, expires_at
// 		) VALUES ($1, $2, $3, $4, $5, $6)
// 	`, sessionID, userID, refreshHash, nullIfEmpty(userAgent), ip, expiresAt)
// 	if err != nil {
// 		return nil, fmt.Errorf("create session: %w", err)
// 	}

// 	accessToken, err := s.jwt.IssueAccessToken(userID, sessionID)
// 	if err != nil {
// 		return nil, fmt.Errorf("issue access token: %w", err)
// 	}

// 	return &SessionResult{
// 		AccessToken:  accessToken,
// 		RefreshToken: refreshToken,
// 		ExpiresAt:    expiresAt,
// 		UserID:       userID,
// 	}, nil
// }

// // RefreshInput exchanges a refresh token for a new access token and a
// // rotated refresh token.
// type RefreshInput struct {
// 	RefreshToken string
// 	UserAgent    string
// 	ClientIP     string
// }

// // Refresh rotates the refresh token. If the provided token matches an
// // active session, a new access token is issued and the refresh token is
// // replaced with a fresh one. If the provided token matches a session that
// // has been revoked, the entire session chain is revoked — the assumption
// // is that an attacker is presenting a stolen token.
// func (s *Service) Refresh(ctx context.Context, input RefreshInput) (*SessionResult, error) {
// 	hash := hashRefreshToken(input.RefreshToken)

// 	var (
// 		sessionID string
// 		userID    string
// 		expiresAt time.Time
// 		revokedAt *time.Time
// 	)
// 	err := s.db.QueryRow(ctx, `
// 		SELECT id, user_id, expires_at, revoked_at
// 		FROM elber.sessions
// 		WHERE refresh_token_hash = $1
// 		LIMIT 1
// 	`, hash).Scan(&sessionID, &userID, &expiresAt, &revokedAt)

// 	if err != nil {
// 		if errors.Is(err, pgx.ErrNoRows) {
// 			return nil, ErrSessionInvalid
// 		}
// 		return nil, fmt.Errorf("load session: %w", err)
// 	}

// 	// If the session is revoked, an attacker (or a confused client) is
// 	// presenting a token that should be dead. Revoke the whole chain and
// 	// refuse. This is the "refresh token reuse detection" pattern.
// 	if revokedAt != nil {
// 		_, _ = s.db.Exec(ctx, `
// 			UPDATE elber.sessions SET revoked_at = NOW()
// 			WHERE user_id = $1 AND revoked_at IS NULL
// 		`, userID)
// 		return nil, ErrSessionInvalid
// 	}

// 	if expiresAt.Before(time.Now()) {
// 		return nil, ErrSessionInvalid
// 	}

// 	// Verify user is still active.
// 	var status string
// 	err = s.db.QueryRow(ctx, `
// 		SELECT status FROM elber.users WHERE id = $1
// 	`, userID).Scan(&status)
// 	if err != nil || status != "active" {
// 		return nil, ErrSessionInvalid
// 	}

// 	// Rotate: generate new refresh token, update the session row.
// 	newRefreshToken, newHash, err := generateRefreshToken()
// 	if err != nil {
// 		return nil, fmt.Errorf("generate new refresh: %w", err)
// 	}
// 	newExpiry := time.Now().Add(refreshTokenTTL)

// 	_, err = s.db.Exec(ctx, `
// 		UPDATE elber.sessions
// 		SET refresh_token_hash = $1,
// 		    expires_at = $2,
// 		    last_used_at = NOW()
// 		WHERE id = $3
// 	`, newHash, newExpiry, sessionID)
// 	if err != nil {
// 		return nil, fmt.Errorf("rotate refresh: %w", err)
// 	}

// 	accessToken, err := s.jwt.IssueAccessToken(userID, sessionID)
// 	if err != nil {
// 		return nil, fmt.Errorf("issue access token: %w", err)
// 	}

// 	return &SessionResult{
// 		AccessToken:  accessToken,
// 		RefreshToken: newRefreshToken,
// 		ExpiresAt:    newExpiry,
// 		UserID:       userID,
// 	}, nil
// }

// // SessionSummary is the shape of a session in the "list sessions" response.
// type SessionSummary struct {
// 	ID         string     `json:"id"`
// 	UserAgent  *string    `json:"user_agent,omitempty"`
// 	IPAddress  *string    `json:"ip_address,omitempty"`
// 	CreatedAt  time.Time  `json:"created_at"`
// 	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
// 	ExpiresAt  time.Time  `json:"expires_at"`
// 	IsCurrent  bool       `json:"is_current"`
// }

// // ListSessions returns all active sessions for the user. The current
// // session (the one used to make this call) is flagged.
// func (s *Service) ListSessions(ctx context.Context, userID, currentSessionID string) ([]SessionSummary, error) {
// 	rows, err := s.db.Query(ctx, `
// 		SELECT id, user_agent, host(ip_address), created_at, last_used_at, expires_at
// 		FROM elber.sessions
// 		WHERE user_id = $1
// 		  AND revoked_at IS NULL
// 		  AND expires_at > NOW()
// 		ORDER BY COALESCE(last_used_at, created_at) DESC
// 	`, userID)
// 	if err != nil {
// 		return nil, fmt.Errorf("list sessions: %w", err)
// 	}
// 	defer rows.Close()

// 	var sessions []SessionSummary
// 	for rows.Next() {
// 		var (
// 			id        string
// 			userAgent *string
// 			ip        *string
// 			createdAt time.Time
// 			lastUsed  *time.Time
// 			expiresAt time.Time
// 		)
// 		if err := rows.Scan(&id, &userAgent, &ip, &createdAt, &lastUsed, &expiresAt); err != nil {
// 			return nil, fmt.Errorf("scan session: %w", err)
// 		}
// 		sessions = append(sessions, SessionSummary{
// 			ID:         id,
// 			UserAgent:  userAgent,
// 			IPAddress:  ip,
// 			CreatedAt:  createdAt,
// 			LastUsedAt: lastUsed,
// 			ExpiresAt:  expiresAt,
// 			IsCurrent:  id == currentSessionID,
// 		})
// 	}
// 	return sessions, nil
// }

// // RevokeSession marks one session as revoked. If sessionID belongs to the
// // user, revokes it. If sessionID is "*", revokes all sessions except the
// // current one (sign out everywhere else).
// func (s *Service) RevokeSession(ctx context.Context, userID, sessionID, currentSessionID string) error {
// 	if sessionID == "*" {
// 		_, err := s.db.Exec(ctx, `
// 			UPDATE elber.sessions SET revoked_at = NOW()
// 			WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL
// 		`, userID, currentSessionID)
// 		return err
// 	}

// 	cmdTag, err := s.db.Exec(ctx, `
// 		UPDATE elber.sessions SET revoked_at = NOW()
// 		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
// 	`, sessionID, userID)
// 	if err != nil {
// 		return fmt.Errorf("revoke session: %w", err)
// 	}
// 	if cmdTag.RowsAffected() == 0 {
// 		return ErrSessionInvalid
// 	}
// 	return nil
// }

// // ─── Authenticator (implements identity.Authenticator) ──────────────────

// // Authenticator verifies JWT access tokens and returns the user. On every
// // request it also checks that the session has not been revoked, making
// // revocation take effect immediately.
// type Authenticator struct {
// 	db  *pgxpool.Pool
// 	jwt *jwt.Issuer
// }

// // NewAuthenticator constructs the authenticator.
// func NewAuthenticator(db *pgxpool.Pool, jwtIssuer *jwt.Issuer) *Authenticator {
// 	return &Authenticator{db: db, jwt: jwtIssuer}
// }

// // Authenticate verifies the JWT and loads the user. Checks the session is
// // still active. Returns ErrUnauthenticated for any failure.
// func (a *Authenticator) Authenticate(ctx context.Context, token string) (*User, error) {
// 	claims, err := a.jwt.VerifyAccessToken(token)
// 	if err != nil {
// 		return nil, ErrInvalidCredentials
// 	}

// 	// Look up the session. It must exist, not be revoked, and not be
// 	// expired. This is what makes "revoke" instant — the very next request
// 	// fails.
// 	var (
// 		revokedAt *time.Time
// 		expiresAt time.Time
// 	)
// 	err = a.db.QueryRow(ctx, `
// 		SELECT revoked_at, expires_at FROM elber.sessions WHERE id = $1
// 	`, claims.SessionID).Scan(&revokedAt, &expiresAt)
// 	if err != nil || revokedAt != nil || expiresAt.Before(time.Now()) {
// 		return nil, ErrInvalidCredentials
// 	}

// 	// Load the user. Status must be active.
// 	var (
// 		userID      string
// 		fullName    string
// 		phoneNumber string
// 		emailAddr   *string
// 		status      string
// 	)
// 	err = a.db.QueryRow(ctx, `
// 		SELECT id, full_name, phone_number, email, status
// 		FROM elber.users
// 		WHERE id = $1
// 	`, claims.UserID).Scan(&userID, &fullName, &phoneNumber, &emailAddr, &status)
// 	if err != nil {
// 		return nil, ErrInvalidCredentials
// 	}

// 	if status != "active" {
// 		return nil, ErrUserInactive
// 	}

// 	var emailStr string
// 	if emailAddr != nil {
// 		emailStr = *emailAddr
// 	}

// 	return &User{
// 		ID:          userID,
// 		FullName:    fullName,
// 		PhoneNumber: phoneNumber,
// 		Email:       emailStr,
// 		Status:      UserStatus(status),
// 	}, nil
// }

// // User is the identity of an authenticated caller. Mirrors identity.User
// // but avoids the import cycle (identity imports auth via the interface;
// // auth cannot import identity back).
// type User struct {
// 	ID          string
// 	FullName    string
// 	PhoneNumber string
// 	Email       string
// 	Status      UserStatus
// }

// type UserStatus string

// const (
// 	UserStatusActive    UserStatus = "active"
// 	UserStatusSuspended UserStatus = "suspended"
// 	UserStatusPending   UserStatus = "pending_verification"
// )

// // ─── Helpers ────────────────────────────────────────────────────────────

// func generateRefreshToken() (token string, hash string, err error) {
// 	buf := make([]byte, refreshTokenSize)
// 	if _, err := rand.Read(buf); err != nil {
// 		return "", "", err
// 	}
// 	token = base64.RawURLEncoding.EncodeToString(buf)
// 	hash = hashRefreshToken(token)
// 	return token, hash, nil
// }

// func hashRefreshToken(token string) string {
// 	sum := sha256.Sum256([]byte(token))
// 	return hex.EncodeToString(sum[:])
// }

// func nullIfEmpty(s string) any {
// 	if strings.TrimSpace(s) == "" {
// 		return nil
// 	}
// 	return s
// }

// func maskTarget(target, channel string) string {
// 	if channel == ChannelEmail {
// 		parts := strings.SplitN(target, "@", 2)
// 		if len(parts) != 2 {
// 			return target
// 		}
// 		if len(parts[0]) <= 2 {
// 			return "**@" + parts[1]
// 		}
// 		return string(parts[0][0]) + strings.Repeat("*", len(parts[0])-2) + string(parts[0][len(parts[0])-1]) + "@" + parts[1]
// 	}
// 	// Phone: mask the middle. +2348012345678 → +234801****678
// 	if len(target) < 6 {
// 		return target
// 	}
// 	return target[:len(target)-4] + "****" + target[len(target)-3:]
// }