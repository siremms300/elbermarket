// HTTP handlers for the identity package.

package identity

import (
	"encoding/json"
	"net/http"

	"github.com/elbermarket/api/internal/platform/apierror"
)

// MeHandler returns the currently authenticated user.
//
// In Phase 1 this becomes richer: it returns the user plus their
// organisation memberships so the app can populate the "active
// organisation" picker without a second round-trip. In Phase 0 it is
// the simplest possible demonstration of the middleware and the error
// envelope working end to end.
func MeHandler(w http.ResponseWriter, r *http.Request) {
	user := FromContext(r.Context())
	if user == nil {
		// This should be impossible — the middleware guarantees a user
		// is present on any route it protects. If we reach this, something
		// is wrong with the router, not the request, so it is a 500 not a
		// 401.
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{
			"id":           user.ID,
			"full_name":    user.FullName,
			"phone_number": user.PhoneNumber,
			"email":        user.Email,
			"status":       user.Status,
		},
	})
}

// writeJSON is a local helper so this package is self-contained. It
// mirrors the JSON writer used in other platform packages; keeping it
// local avoids an import cycle between identity and httpserver.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}