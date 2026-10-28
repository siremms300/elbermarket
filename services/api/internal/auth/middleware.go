// Middleware that sits after identity authentication and attaches the
// session ID to the context.

package auth


import (
	"net/http"
	"strings"

	"github.com/elbermarket/api/internal/identity"
	"github.com/elbermarket/api/internal/organisation"
	"github.com/elbermarket/api/internal/platform/apierror"
	"github.com/elbermarket/api/internal/platform/jwt"
)

// AttachSession extracts the JWT claims again and adds the session ID to
// the context. Runs after identity.RequireAuthentication.
//
// We re-parse the token here instead of stuffing session ID into the
// identity.User because we want to keep the identity.User type stable
// (it doesn't carry session-specific data — a user has many sessions).
//
// This is a small amount of duplicate work per request. If it becomes a
// performance concern, we can have the identity middleware attach the
// raw session ID via a side-channel context value. For now, simplicity
// wins.
// func AttachSession(jwtIssuer *jwt.Issuer) func(http.Handler) http.Handler {
// 	return func(next http.Handler) http.Handler {
// 		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 			user := identity.FromContext(r.Context())
// 			if user == nil {
// 				// Should never happen — AttachSession must run after
// 				// RequireAuthentication.
// 				apierror.WriteError(w, r, apierror.Internal())
// 				return
// 			}

// 			token := extractToken(r)
// 			claims, err := jwtIssuer.VerifyAccessToken(token)
// 			if err != nil {
// 				apierror.WriteError(w, r, apierror.Unauthorized("Session invalid."))
// 				return
// 			}

// 			// Convert identity.User to auth.User (the type used by handlers).
// 			authUser := &User{
// 				ID:          user.ID,
// 				FullName:    user.FullName,
// 				PhoneNumber: user.PhoneNumber,
// 				Email:       user.Email,
// 				Status:      UserStatus(user.Status),
// 			}

// 			ctx := WithIdentity(r.Context(), authUser, claims.SessionID)
// 			next.ServeHTTP(w, r.WithContext(ctx))
// 		})
// 	}
// }


func AttachSession(jwtIssuer *jwt.Issuer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := identity.FromContext(r.Context())
			if user == nil {
				apierror.WriteError(w, r, apierror.Internal())
				return
			}

			token := extractToken(r)
			claims, err := jwtIssuer.VerifyAccessToken(token)
			if err != nil {
				apierror.WriteError(w, r, apierror.Unauthorized("Session invalid."))
				return
			}

			authUser := &User{
				ID:          user.ID,
				FullName:    user.FullName,
				PhoneNumber: user.PhoneNumber,
				Email:       user.Email,
				Status:      UserStatus(user.Status),
			}

			// Attach to auth context (for auth handlers).
			ctx := WithIdentity(r.Context(), authUser, claims.SessionID)

			// Attach to organisation context (for organisation handlers).
			// This is the same user ID; both contexts just provide
			// different accessor functions tailored to each package.
			ctx = organisation.WithUserID(ctx, user.ID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}






func extractToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// silence unused import
// var _ = context.Background