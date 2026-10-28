// Package apierror defines the single error response shape returned by every
// API endpoint.
//
// Every error response in the platform — validation failure, permission
// denial, missing record, conflict, server fault — must be representable as
// one of these types. This is not a recommendation; it is the contract
// between the backend and every client (mobile, web, admin).
//
// Why this matters more than it looks:
//
//   - Clients can write one error handler, not fifty.
//   - Error codes are stable identifiers that do not depend on message text.
//     A mobile app can branch on "ORDER_STATE_CONFLICT" without parsing a
//     human-readable sentence that might change.
//   - Request IDs let support engineers trace a user's report to a specific
//     server log line.
//   - The shape is versioned. Adding fields is safe; removing is not.
//
// See ADR 0004 for the full rationale.

package apierror

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

// Code is a stable, machine-readable identifier for an error category.
// Clients may branch on this value. Codes should be UPPER_SNAKE_CASE and
// must not change once published.
type Code string

const (
	// Client-caused errors (4xx).
	CodeBadRequest    Code = "BAD_REQUEST"
	CodeValidation    Code = "VALIDATION_FAILED"
	CodeUnauthorized  Code = "UNAUTHORIZED"
	CodeForbidden     Code = "FORBIDDEN"
	CodeNotFound      Code = "NOT_FOUND"
	CodeConflict      Code = "CONFLICT"
	CodeUnprocessable Code = "UNPROCESSABLE"
	CodeRateLimited   Code = "RATE_LIMITED"

	// Server-caused errors (5xx).
	CodeInternal    Code = "INTERNAL_ERROR"
	CodeUnavailable Code = "SERVICE_UNAVAILABLE"

	// Domain-specific errors. These are illustrative for Phase 0 and will
	// grow as domains are added. They exist here so the pattern is visible:
	// domain errors are first-class citizens, not fudged into generic ones.
	CodeOrderStateConflict     Code = "ORDER_STATE_CONFLICT"
	CodeListingUnavailable     Code = "LISTING_UNAVAILABLE"
	CodeInsufficientPermission Code = "INSUFFICIENT_PERMISSION"
	CodeVerificationRequired   Code = "VERIFICATION_REQUIRED"
)

// Detail is a per-field or per-issue explanation attached to an error.
// It is used primarily for validation failures where the client needs to
// know which field failed and why.
type Detail struct {
	Field   string `json:"field,omitempty"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
}

// Error is the wire format for every API error response.
type Error struct {
	Code      Code     `json:"code"`
	Message   string   `json:"message"`
	RequestID string   `json:"request_id,omitempty"`
	Details   []Detail `json:"details,omitempty"`

	// HTTPStatus is not serialized. It is set when the error is constructed
	// so the response writer knows which status code to emit. Keeping it
	// internal means clients only ever see the semantic code, not the raw
	// HTTP status, which avoids accidental coupling to numbers.
	HTTPStatus int `json:"-"`
}

// Error satisfies the standard error interface so *Error values can be
// returned, wrapped and matched with errors.As throughout the codebase.
func (e *Error) Error() string {
	return string(e.Code) + ": " + e.Message
}

// New constructs an *Error with the given code, message and HTTP status.
// Prefer the helpers below — they encode common cases correctly.
func New(code Code, message string, status int) *Error {
	return &Error{
		Code:       code,
		Message:    message,
		HTTPStatus: status,
	}
}

// WithDetail returns a copy of e with an additional detail appended.
// Keeps the original untouched, so callers can reuse a base error and add
// field-specific details without side effects.
func (e *Error) WithDetail(d Detail) *Error {
	clone := *e
	clone.Details = append(append([]Detail{}, e.Details...), d)
	return &clone
}

// ─── Helpers for common cases ─────────────────────────────────────────────
//
// Use these instead of New() where possible. They encode the intended
// HTTP status for each semantic code, so nobody has to remember "is
// VALIDATION_FAILED a 400 or a 422?".

// BadRequest returns a 400 error for malformed requests.
func BadRequest(message string) *Error {
	return New(CodeBadRequest, message, http.StatusBadRequest)
}

// Validation returns a 422 error with field-level details.
func Validation(message string, details ...Detail) *Error {
	e := New(CodeValidation, message, http.StatusUnprocessableEntity)
	e.Details = details
	return e
}

// Unauthorized returns a 401 error for missing or invalid authentication.
func Unauthorized(message string) *Error {
	return New(CodeUnauthorized, message, http.StatusUnauthorized)
}

// Forbidden returns a 403 error when the caller is authenticated but lacks
// permission for the specific resource.
func Forbidden(message string) *Error {
	return New(CodeForbidden, message, http.StatusForbidden)
}

// NotFound returns a 404 error for missing resources. Do not leak whether
// a resource exists if the caller is not permitted to know.
func NotFound(message string) *Error {
	return New(CodeNotFound, message, http.StatusNotFound)
}

// Conflict returns a 409 error when the request conflicts with current state
// (e.g., confirming an already-cancelled order).
func Conflict(code Code, message string) *Error {
	return New(code, message, http.StatusConflict)
}

// Unprocessable returns a 422 error for domain-level rejections that are
// not validation issues (e.g., "insufficient stock for this order").
func Unprocessable(code Code, message string) *Error {
	return New(code, message, http.StatusUnprocessableEntity)
}

// Internal returns a 500 error. Use for unexpected failures. Do not include
// internal implementation details in the message.
func Internal() *Error {
	return New(CodeInternal, "An unexpected error occurred.", http.StatusInternalServerError)
}

// FromError extracts an *Error from err if possible, or wraps err in a
// generic internal error. RequestID, if provided, is attached to the
// resulting error so it can be logged and traced. Never expose err.Error()
// to clients — it may contain implementation details.
func FromError(err error, requestID string) *Error {
	var apiErr *Error
	if errors.As(err, &apiErr) {
		clone := *apiErr
		clone.RequestID = requestID
		return &clone
	}
	internal := Internal()
	internal.RequestID = requestID
	return internal
}

// WriteError is the single function that writes an *Error to the HTTP
// response. Every handler should use this — never write an error response
// by hand. It ensures the response shape and status code are consistent
// across the entire platform.
func WriteError(w http.ResponseWriter, r *http.Request, err *Error) {
	// Attach request ID from chi middleware. If absent (e.g., in a test
	// with no middleware), the field is simply omitted.
	if err.RequestID == "" {
		err.RequestID = middleware.GetReqID(r.Context())
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(err.HTTPStatus)
	_ = json.NewEncoder(w).Encode(err)
}