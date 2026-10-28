package httpserver

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elbermarket/api/internal/identity"
	"github.com/elbermarket/api/internal/platform/apierror"
	// "github.com/elbermarket/api/internal/transport"

	"github.com/elbermarket/api/internal/platform/authctx"
)

// RequestLogger logs every request with structured fields.
func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			defer func() {
				logger.Info("http request",
					"request_id", middleware.GetReqID(r.Context()),
					"method", r.Method,
					"path", r.URL.Path,
					"status", ww.Status(),
					"bytes", ww.BytesWritten(),
					"duration_ms", time.Since(start).Milliseconds(),
					"remote_addr", r.RemoteAddr,
				)
			}()

			next.ServeHTTP(ww, r)
		})
	}
}

// OrganisationContext reads X-Organisation-Id, validates the authenticated
// user is an active member of that organisation, and attaches both the
// user ID and org ID to the transport package's context.
//
// This is the tenant-isolation enforcement point. A client can send any
// X-Organisation-Id header, but unless the user is an active member of
// that org, the request is rejected with 403.
//
// Runs after identity.RequireAuthentication and auth.AttachSession.
func OrganisationContext(db *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := identity.FromContext(r.Context())
			if user == nil {
				apierror.WriteError(w, r, apierror.Internal())
				return
			}

			orgID := r.Header.Get("X-Organisation-Id")
			if orgID == "" {
				apierror.WriteError(w, r, apierror.BadRequest(
					"X-Organisation-Id header is required. Specify which organisation you are acting on behalf of.",
				))
				return
			}

			var valid bool
			err := db.QueryRow(r.Context(), `
				SELECT EXISTS (
					SELECT 1
					FROM elber.organisation_memberships m
					JOIN elber.organisations o ON o.id = m.organisation_id
					WHERE m.organisation_id = $1
					  AND m.user_id = $2
					  AND m.status = 'active'
					  AND o.status = 'active'
				)
			`, orgID, user.ID).Scan(&valid)
			if err != nil {
				apierror.WriteError(w, r, apierror.Internal())
				return
			}
			if !valid {
				apierror.WriteError(w, r, apierror.Forbidden(
					"You are not an active member of this organisation.",
				))
				return
			}

			// ctx := transport.WithUserID(r.Context(), user.ID)
			// ctx = transport.WithOrganisationID(ctx, orgID)
			// next.ServeHTTP(w, r.WithContext(ctx))

			ctx := authctx.WithUser(r.Context(), user.ID)
			ctx = authctx.WithOrganisation(ctx, orgID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}





































// package httpserver

// import (
// 	"log/slog"
// 	"net/http"
// 	"time"

// 	"github.com/go-chi/chi/v5/middleware"
// )

// // RequestLogger logs every request with structured fields. The request ID
// // comes from the chi RequestID middleware and is included so that a
// // request can be traced across logs, traces and error reports.
// func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
// 	return func(next http.Handler) http.Handler {
// 		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 			start := time.Now()
// 			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

// 			defer func() {
// 				logger.Info("http request",
// 					"request_id", middleware.GetReqID(r.Context()),
// 					"method", r.Method,
// 					"path", r.URL.Path,
// 					"status", ww.Status(),
// 					"bytes", ww.BytesWritten(),
// 					"duration_ms", time.Since(start).Milliseconds(),
// 					"remote_addr", r.RemoteAddr,
// 				)
// 			}()

// 			next.ServeHTTP(ww, r)
// 		})
// 	}
// }