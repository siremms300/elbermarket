// Package validation provides request-validation primitives shared by every
// endpoint. It exists so that validation logic is consistent across the
// platform and so that validation failures produce errors in the standard
// apierror envelope.
//
// Design choices:
//
//   - No reflection, no struct tags. Validation is written explicitly in
//     each handler. This is more verbose but far easier to reason about
//     and to test. Reflection-based validators become unmaintainable
//     when business rules get complex.
//
//   - Accumulate errors. A single request may have multiple field-level
//     problems. We report all of them in one response rather than forcing
//     the user to fix one, resubmit, fix the next, resubmit...
//
//   - Fail closed. A zero-value field that was never provided fails
//     required checks. Never assume.

package validation

import (
	"strings"

	"github.com/elbermarket/api/internal/platform/apierror"
)

// Errors accumulates field-level problems during validation.
// Callers build one of these, add errors as they check fields, then call
// ToError() to produce the wire-format error.
type Errors struct {
	details []apierror.Detail
}

// Add records a field-level error.
func (e *Errors) Add(field, code, message string) {
	e.details = append(e.details, apierror.Detail{
		Field:   field,
		Code:    code,
		Message: message,
	})
}

// HasErrors reports whether any errors have been accumulated.
func (e *Errors) HasErrors() bool {
	return len(e.details) > 0
}

// ToError converts the accumulated errors into an apierror envelope.
// Returns nil if there are no errors.
func (e *Errors) ToError() *apierror.Error {
	if !e.HasErrors() {
		return nil
	}
	return apierror.Validation("One or more fields failed validation.", e.details...)
}

// ─── Field-level checks ──────────────────────────────────────────────────
//
// These helpers take a fresh *Errors and a field name, and add an error to
// it if the check fails. Handlers use them sequentially:
//
//   var errs validation.Errors
//   validation.RequiredString(&errs, "name", input.Name, 2, 100)
//   validation.RequiredString(&errs, "phone", input.Phone, 10, 20)
//   if apiErr := errs.ToError(); apiErr != nil {
//       apierror.WriteError(w, r, apiErr)
//       return
//   }

// RequiredString validates a non-empty string with length bounds.
func RequiredString(errs *Errors, field, value string, minLen, maxLen int) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		errs.Add(field, "required", "This field is required.")
		return
	}
	if len(trimmed) < minLen {
		errs.Add(field, "min_length", "This field must be at least "+itoa(minLen)+" characters.")
		return
	}
	if len(trimmed) > maxLen {
		errs.Add(field, "max_length", "This field must be at most "+itoa(maxLen)+" characters.")
	}
}

// OptionalString validates a string if it is non-empty. Does nothing if
// the value is empty.
func OptionalString(errs *Errors, field, value string, minLen, maxLen int) {
	if value == "" {
		return
	}
	RequiredString(errs, field, value, minLen, maxLen)
}

// RequiredID validates a non-empty string identifier.
func RequiredID(errs *Errors, field, value string) {
	if strings.TrimSpace(value) == "" {
		errs.Add(field, "required", "This field is required.")
	}
}

// NonNegativeInt validates that an integer value is not negative.
func NonNegativeInt(errs *Errors, field string, value int) {
	if value < 0 {
		errs.Add(field, "invalid", "Must be zero or greater.")
	}
}

// PositiveInt validates that an integer is strictly positive.
func PositiveInt(errs *Errors, field string, value int) {
	if value <= 0 {
		errs.Add(field, "invalid", "Must be greater than zero.")
	}
}

// OneOf validates that a string is one of the allowed values.
func OneOf(errs *Errors, field, value string, allowed ...string) {
	for _, a := range allowed {
		if value == a {
			return
		}
	}
	errs.Add(field, "invalid", "Must be one of: "+strings.Join(allowed, ", ")+".")
}

// itoa is a tiny int-to-string helper so we don't pull fmt into every
// error path. The full fmt package is heavier than needed here.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}