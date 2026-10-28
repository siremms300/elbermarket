// Package identity owns authentication and the mapping between a
// verified caller and their user record.
//
// This package intentionally does NOT own:
//
//   - Business profile data (that is organisations).
//   - Verification of business documents (that is verification).
//   - Permission checks on resources (that is the caller's responsibility,
//     using the identity returned here).
//
// Its job is narrow: given an HTTP request, either establish who the
// caller is or reject the request. That is what makes it a clean
// boundary.
//
// In Phase 0 this package is a skeleton. It defines the interfaces and
// the middleware. In Phase 1 we add the concrete implementations:
// registration, login, session issuance, MFA, recovery.

package identity

import (
	"context"
	"errors"
)

// User is the authenticated identity of a caller. It intentionally does not
// carry organisation memberships — those are looked up on demand by the
// endpoints that need them, so this value stays small and cheap to attach
// to a context.
type User struct {
	ID          string
	FullName    string
	PhoneNumber string
	Email       string
	Status      UserStatus
}

// UserStatus reflects account state. A user in any status other than Active
// must not pass through authenticated endpoints.
type UserStatus string

const (
	UserStatusActive    UserStatus = "active"
	UserStatusSuspended UserStatus = "suspended"
	UserStatusPending   UserStatus = "pending_verification"
)

// Authenticator resolves an authorization token to a User. Implementations
// in Phase 1 will verify tokens against the identity provider and load the
// user record from the database. In Phase 0 the interface exists but has
// no production implementation yet.
type Authenticator interface {
	// Authenticate takes a bearer token and returns the user it identifies.
	// Returns ErrUnauthenticated if the token is missing, malformed,
	// expired or revoked.
	Authenticate(ctx context.Context, token string) (*User, error)
}

// ErrUnauthenticated is returned by Authenticator.Authenticate when the
// provided token cannot be trusted. Callers must not distinguish between
// "token expired" and "token was never valid" in the response they give
// the client — that distinction helps attackers.
var ErrUnauthenticated = errors.New("unauthenticated")

// ErrForbidden is returned when a caller is authenticated but lacks the
// specific permission required. In Phase 1 this becomes a richer error
// type carrying the missing permission. For now, a sentinel is enough.
var ErrForbidden = errors.New("forbidden")

// ─── Context helpers ─────────────────────────────────────────────────────
//
// The authenticated user is carried in the request context. Endpoints
// retrieve it with FromContext. Handlers should NEVER trust a user ID
// supplied in a query parameter, body or header — always use the one
// attached here by middleware.

type userContextKey struct{}

// WithUser returns a copy of ctx with the user attached.
func WithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, userContextKey{}, u)
}

// FromContext retrieves the authenticated user from ctx. Returns nil if
// no user is present. Callers that require a user MUST check for nil and
// respond with an authentication error — never proceed with a nil user.
func FromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userContextKey{}).(*User)
	return u
}