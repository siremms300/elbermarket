// HTTP handlers for notifications.

package notifications

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/elbermarket/api/internal/identity"
	"github.com/elbermarket/api/internal/platform/apierror"
)

type Handlers struct {
	svc *Service
}

func NewHandlers(svc *Service) *Handlers {
	return &Handlers{svc: svc}
}

// List handles GET /api/v1/notifications
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	if user == nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	rows, err := h.svc.db.Query(r.Context(), `
		SELECT id, event_type, title, body,
		       related_entity_type, related_entity_id,
		       priority, read_at, created_at, metadata
		FROM elber.notifications
		WHERE recipient_user_id = $1
		  AND dismissed_at IS NULL
		ORDER BY created_at DESC
		LIMIT 100
	`, user.ID)
	if err != nil {
		h.svc.logger.Error("list notifications failed", "error", err)
		apierror.WriteError(w, r, apierror.Internal())
		return
	}
	defer rows.Close()

	type notif struct {
		ID                string         `json:"id"`
		EventType         string         `json:"event_type"`
		Title             string         `json:"title"`
		Body              string         `json:"body"`
		RelatedEntityType *string        `json:"related_entity_type,omitempty"`
		RelatedEntityID   *string        `json:"related_entity_id,omitempty"`
		Priority          string         `json:"priority"`
		ReadAt            *string        `json:"read_at,omitempty"`
		CreatedAt         string         `json:"created_at"`
		Metadata          map[string]any `json:"metadata,omitempty"`
	}

	var notifications []notif
	unread := 0
	for rows.Next() {
		var n notif
		var readAt, createdAt interface{}
		if err := rows.Scan(&n.ID, &n.EventType, &n.Title, &n.Body,
			&n.RelatedEntityType, &n.RelatedEntityID,
			&n.Priority, &readAt, &createdAt, &n.Metadata); err != nil {
			h.svc.logger.Error("scan notification failed", "error", err)
			apierror.WriteError(w, r, apierror.Internal())
			return
		}
		if readAt == nil {
			unread++
		} else {
			s := readAt.(interface{ Format(string) string }).Format("2006-01-02T15:04:05Z07:00")
			n.ReadAt = &s
		}
		n.CreatedAt = createdAt.(interface{ Format(string) string }).Format("2006-01-02T15:04:05Z07:00")
		notifications = append(notifications, n)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"notifications": notifications,
		"total":         len(notifications),
		"unread_count":  unread,
	})
}

// UnreadCount handles GET /api/v1/notifications/unread-count
func (h *Handlers) UnreadCount(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	if user == nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	var count int
	err := h.svc.db.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM elber.notifications
		WHERE recipient_user_id = $1
		  AND read_at IS NULL
		  AND dismissed_at IS NULL
	`, user.ID).Scan(&count)
	if err != nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"unread_count": count})
}

// MarkRead handles POST /api/v1/notifications/{id}/read
func (h *Handlers) MarkRead(w http.ResponseWriter, r *http.Request) {
	user := identity.FromContext(r.Context())
	id := chi.URLParam(r, "id")
	if user == nil || id == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request."))
		return
	}

	_, err := h.svc.db.Exec(r.Context(), `
		UPDATE elber.notifications
		SET read_at = NOW()
		WHERE id = $1 AND recipient_user_id = $2 AND read_at IS NULL
	`, id, user.ID)
	if err != nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}