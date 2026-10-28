// Auth middleware for the identity package.
//
// The middleware is intentionally thin: it extracts the bearer token,
// delegates authentication to an Authenticator, and either attaches the
// user to the request context or terminates the request with a
// standard error. This means the middleware itself never contains
// business logic — it is glue.

package identity

import (
	"errors"
	"net/http"
	"strings"

	"github.com/elbermarket/api/internal/platform/apierror"
)

// RequireAuthentication returns middleware that authenticates the caller
// against the provided Authenticator. Requests without a valid token are
// rejected with a 401 in the standard error envelope. Authenticated
// requests have their user attached to the context.
//
// Usage:
//
//   r.Group(func(r chi.Router) {
//       r.Use(identity.RequireAuthentication(authenticator))
//       r.Get("/me", handler.Me)
//   })
func RequireAuthentication(authenticator Authenticator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				apierror.WriteError(w, r, apierror.Unauthorized(
					"Authentication is required for this endpoint.",
				))
				return
			}

			user, err := authenticator.Authenticate(r.Context(), token)
			if err != nil {
				if errors.Is(err, ErrUnauthenticated) {
					apierror.WriteError(w, r, apierror.Unauthorized(
						"Your session is not valid. Please sign in again.",
					))
					return
				}
				// Any other error is treated as a server fault — the
				// authenticator failed for a reason the caller cannot fix.
				apierror.WriteError(w, r, apierror.Internal())
				return
			}

			if user.Status != UserStatusActive {
				apierror.WriteError(w, r, apierror.Forbidden(
					"Your account is not active.",
				))
				return
			}

			ctx := WithUser(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// extractBearerToken parses the Authorization header for a bearer token.
// Returns "" if the header is absent, malformed, or uses a different
// scheme. Case-insensitive on the scheme as required by RFC 6750.
func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 {
		return ""
	}
	if !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}