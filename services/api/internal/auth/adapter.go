// Adapter bridging auth.Authenticator (which returns auth.User) to
// identity.Authenticator (which returns identity.User).
//
// Why the two types exist separately:
//
//   - identity defines the Authenticator interface that middleware depends
//     on. It owns the contract.
//   - auth implements that interface, but its internal User type carries
//     more fields than the middleware needs.
//   - They cannot import each other directly without creating a cycle
//     (identity imports nothing user-facing; auth imports identity for
//     the interface).
//
// The adapter converts between them at the boundary. This keeps both
// packages independent while satisfying the interface.

package auth

import (
	"context"

	"github.com/elbermarket/api/internal/identity"
)

// IdentityAdapter wraps Authenticator so it satisfies identity.Authenticator.
type IdentityAdapter struct {
	inner *Authenticator
}

// NewIdentityAdapter builds the adapter.
func NewIdentityAdapter(inner *Authenticator) *IdentityAdapter {
	return &IdentityAdapter{inner: inner}
}

// Authenticate implements identity.Authenticator by delegating to the real
// authenticator and converting auth.User to identity.User.
func (a *IdentityAdapter) Authenticate(ctx context.Context, token string) (*identity.User, error) {
	user, err := a.inner.Authenticate(ctx, token)
	if err != nil {
		// Map auth errors to identity errors so the middleware knows what
		// to do without knowing about the auth package.
		switch err {
		case ErrInvalidCredentials:
			return nil, identity.ErrUnauthenticated
		case ErrUserInactive:
			return nil, identity.ErrUnauthenticated
		default:
			return nil, identity.ErrUnauthenticated
		}
	}

	return &identity.User{
		ID:          user.ID,
		FullName:    user.FullName,
		PhoneNumber: user.PhoneNumber,
		Email:       user.Email,
		Status:      identity.UserStatus(user.Status),
	}, nil
}