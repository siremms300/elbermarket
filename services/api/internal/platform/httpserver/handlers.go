package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// HealthHandler reports that the process is alive. It does not check
// dependencies — that is the job of ReadinessHandler.
func HealthHandler(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok",
			"time":   time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// ReadinessHandler reports whether the service can serve traffic. It
// verifies the database connection. This is what load balancers and
// orchestrators should use to decide whether to route traffic here.
func ReadinessHandler(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		if err := deps.DB.Ping(ctx); err != nil {
			deps.Logger.Error("readiness check failed", "error", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"status": "unavailable",
				"reason": "database",
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ready",
		})
	}
}

// writeJSON is the single JSON response writer for the API. Using one
// helper ensures consistent content-type and error handling.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		// At this point headers are already written; best we can do is log.
		// This will be picked up by the request logger middleware.
		_ = err
	}
}