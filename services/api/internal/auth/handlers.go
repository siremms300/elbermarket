// HTTP handlers for the auth package.
//
// Every handler follows the same pattern:
//   1. Parse and validate the request.
//   2. Call the service.
//   3. On success, return JSON.
//   4. On error, convert to apierror and return via apierror.WriteError.
//
// This pattern is deliberate. New handlers should look like these.

package auth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/elbermarket/api/internal/platform/apierror"
	"github.com/elbermarket/api/internal/platform/validation"
)

// Handlers wraps the auth service.
type Handlers struct {
	svc *Service
}

// NewHandlers constructs the handlers with the service.
func NewHandlers(svc *Service) *Handlers {
	return &Handlers{svc: svc}
}

// ─── Register ──────────────────────────────────────────────────────────

type registerRequest struct {
	FullName    string `json:"full_name"`
	PhoneNumber string `json:"phone_number"`
	Email       string `json:"email"`
	Channel     string `json:"channel"` // "sms" or "email"
}

type registerResponse struct {
	UserID  string `json:"user_id"`
	Channel string `json:"channel"`
	Target  string `json:"target"`
	Message string `json:"message"`
}

func (h *Handlers) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "full_name", req.FullName, 2, 200)
	validation.RequiredString(&errs, "phone_number", req.PhoneNumber, 10, 20)
	validation.OptionalString(&errs, "email", req.Email, 3, 254)
	validation.OneOf(&errs, "channel", req.Channel, ChannelSMS, ChannelEmail)
	if req.Channel == ChannelEmail && strings.TrimSpace(req.Email) == "" {
		errs.Add("email", "required", "Email is required when channel is email.")
	}
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	result, err := h.svc.Register(r.Context(), RegisterInput{
		FullName:    req.FullName,
		PhoneNumber: req.PhoneNumber,
		Email:       req.Email,
		Channel:     req.Channel,
	}, clientIP(r))

	if err != nil {
		switch {
		case errors.Is(err, ErrUserExists):
			apierror.WriteError(w, r, apierror.Conflict(
				apierror.CodeConflict,
				"An account with this phone number or email already exists. Please sign in instead.",
			))
		case errors.Is(err, ErrRateLimited):
			apierror.WriteError(w, r, apierror.New(
				apierror.CodeRateLimited,
				"Too many requests. Please wait a few minutes before trying again.",
				http.StatusTooManyRequests,
			))
		default:
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusOK, registerResponse{
		UserID:  result.UserID,
		Channel: result.Channel,
		Target:  result.Target,
		Message: "We sent a verification code to your " + result.Channel + ".",
	})
}

// ─── Register Verify ────────────────────────────────────────────────────

type verifyRequest struct {
	Target string `json:"target"`
	Channel string `json:"channel"`
	Code   string `json:"code"`
}

type sessionResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    string `json:"expires_at"`
	UserID       string `json:"user_id"`
}

func (h *Handlers) RegisterVerify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := decodeJSON(r, &req); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "target", req.Target, 3, 254)
	validation.RequiredString(&errs, "code", req.Code, 4, 10)
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	result, err := h.svc.VerifyRegistration(r.Context(), VerifyRegistrationInput{
		Target:    req.Target,
		Channel:   req.Channel,
		Code:      req.Code,
		UserAgent: r.UserAgent(),
		ClientIP:  clientIP(r),
	})

	if err != nil {
		switch {
		case errors.Is(err, ErrVerificationFailed):
			apierror.WriteError(w, r, apierror.Validation(
				"The verification code is invalid or has expired.",
				apierror.Detail{Field: "code", Code: "invalid", Message: "Invalid or expired code."},
			))
		case errors.Is(err, ErrUserNotFound):
			apierror.WriteError(w, r, apierror.NotFound("User not found."))
		default:
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusOK, sessionResponse{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresAt:    result.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
		UserID:       result.UserID,
	})
}

// ─── Sign-in ────────────────────────────────────────────────────────────

type signinRequest struct {
	Identifier string `json:"identifier"`
	Channel    string `json:"channel,omitempty"`
}

func (h *Handlers) SignIn(w http.ResponseWriter, r *http.Request) {
	var req signinRequest
	if err := decodeJSON(r, &req); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "identifier", req.Identifier, 3, 254)
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	if err := h.svc.SignInRequest(r.Context(), SignInRequestInput{
		Identifier: req.Identifier,
		Channel:    req.Channel,
	}, clientIP(r)); err != nil {
		if errors.Is(err, ErrRateLimited) {
			apierror.WriteError(w, r, apierror.New(
				apierror.CodeRateLimited,
				"Too many requests. Please wait a few minutes.",
				http.StatusTooManyRequests,
			))
			return
		}
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	// Always return success. The response does not reveal whether the
	// identifier corresponds to a real user.
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "If an account exists, we sent a verification code.",
	})
}

func (h *Handlers) SignInVerify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := decodeJSON(r, &req); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	var errs validation.Errors
	validation.RequiredString(&errs, "target", req.Target, 3, 254)
	validation.RequiredString(&errs, "code", req.Code, 4, 10)
	if apiErr := errs.ToError(); apiErr != nil {
		apierror.WriteError(w, r, apiErr)
		return
	}

	result, err := h.svc.VerifySignIn(r.Context(), VerifySignInInput{
		Target:    req.Target,
		Code:      req.Code,
		UserAgent: r.UserAgent(),
		ClientIP:  clientIP(r),
	})

	if err != nil {
		switch {
		case errors.Is(err, ErrVerificationFailed), errors.Is(err, ErrUserNotFound):
			apierror.WriteError(w, r, apierror.Validation(
				"The verification code is invalid or has expired.",
				apierror.Detail{Field: "code", Code: "invalid", Message: "Invalid or expired code."},
			))
		default:
			apierror.WriteError(w, r, apierror.Internal())
		}
		return
	}

	writeJSON(w, http.StatusOK, sessionResponse{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresAt:    result.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
		UserID:       result.UserID,
	})
}

// ─── Refresh ────────────────────────────────────────────────────────────

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *Handlers) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := decodeJSON(r, &req); err != nil {
		apierror.WriteError(w, r, apierror.BadRequest("Invalid request body."))
		return
	}

	if strings.TrimSpace(req.RefreshToken) == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Refresh token is required."))
		return
	}

	result, err := h.svc.Refresh(r.Context(), RefreshInput{
		RefreshToken: req.RefreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     clientIP(r),
	})

	if err != nil {
		if errors.Is(err, ErrSessionInvalid) {
			apierror.WriteError(w, r, apierror.Unauthorized(
				"Your session has expired. Please sign in again.",
			))
			return
		}
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, sessionResponse{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresAt:    result.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
		UserID:       result.UserID,
	})
}

// ─── Sign-out ───────────────────────────────────────────────────────────

func (h *Handlers) SignOut(w http.ResponseWriter, r *http.Request) {
	// Protected route — user and session come from middleware.
	user := userFromContext(r.Context())
	sessionID := sessionFromContext(r.Context())
	if user == nil || sessionID == "" {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	if err := h.svc.RevokeSession(r.Context(), user.ID, sessionID, sessionID); err != nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Sessions ───────────────────────────────────────────────────────────

func (h *Handlers) ListSessions(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r.Context())
	sessionID := sessionFromContext(r.Context())
	if user == nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	sessions, err := h.svc.ListSessions(r.Context(), user.ID, sessionID)
	if err != nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (h *Handlers) RevokeSession(w http.ResponseWriter, r *http.Request) {
	user := userFromContext(r.Context())
	currentSessionID := sessionFromContext(r.Context())
	if user == nil {
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	targetID := chi.URLParam(r, "id")
	if targetID == "" {
		apierror.WriteError(w, r, apierror.BadRequest("Session ID is required."))
		return
	}

	if err := h.svc.RevokeSession(r.Context(), user.ID, targetID, currentSessionID); err != nil {
		if errors.Is(err, ErrSessionInvalid) {
			apierror.WriteError(w, r, apierror.NotFound("Session not found."))
			return
		}
		apierror.WriteError(w, r, apierror.Internal())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Context helpers ────────────────────────────────────────────────────
//
// These are how handlers get the current user and session. Middleware
// populates them; handlers read them. Never trust these from client input.

type userCtxKey struct{}
type sessionCtxKey struct{}

// WithIdentity attaches the authenticated user and session to the context.
func WithIdentity(ctx context.Context, user *User, sessionID string) context.Context {
	ctx = context.WithValue(ctx, userCtxKey{}, user)
	ctx = context.WithValue(ctx, sessionCtxKey{}, sessionID)
	return ctx
}

func userFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userCtxKey{}).(*User)
	return u
}

func sessionFromContext(ctx context.Context) string {
	s, _ := ctx.Value(sessionCtxKey{}).(string)
	return s
}

// ─── Utilities ──────────────────────────────────────────────────────────

func decodeJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20)) // 1 MB
	dec.DisallowUnknownFields()
	return dec.Decode(dest)
}

// func clientIP(r *http.Request) string {
// 	// RealIP middleware already set this correctly.
// 	if ip := r.Header.Get("X-Real-IP"); ip != "" {
// 		return ip
// 	}
// 	return strings.Split(r.RemoteAddr, ":")[0]
// }




func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" && net.ParseIP(ip) != nil {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return ""
	}
	if net.ParseIP(host) == nil {
		return ""
	}
	return host
}



func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}