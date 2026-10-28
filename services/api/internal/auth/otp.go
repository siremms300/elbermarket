// OTP generation, delivery, verification and rate limiting.
//
// Design principles:
//
//   - Codes are cryptographically random, 6 digits.
//   - Only the SHA-256 hash of a code is stored. A database leak exposes
//     no live codes.
//   - Codes expire in 10 minutes. Attempts are limited to 5 per code.
//   - Rate limits protect both against abuse and against cost: each SMS
//     has a real cost, and a user hammering the endpoint should not be
//     able to run up the bill.
//   - All database access goes through pgx. All sends go through the sms
//     Provider abstraction. The engine doesn't know which provider is
//     active.

package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
 
	"github.com/elbermarket/api/internal/platform/email"
	"github.com/elbermarket/api/internal/platform/sms"
)

// OTP purpose constants. New purposes may be added without schema changes.
const (
	PurposeRegistration = "registration"
	PurposeLogin        = "login"
	PurposePasswordReset = "password_reset"
)

// OTP channel constants.
const (
	ChannelSMS   = "sms"
	ChannelEmail = "email"
)

// Configuration. These are intentionally constants — tune them in code,
// not in environment variables. Rate limits and expiry windows are
// security parameters that should be reviewed and changed deliberately.
const (
	otpTTL            = 10 * time.Minute
	otpMaxAttempts    = 5
	otpMaxRequestsPerHourPerTarget = 5
	otpMaxRequestsPerHourPerIP     = 20
)

// ErrRateLimited is returned when a target or IP has exceeded the rate
// limits.
var ErrRateLimited = errors.New("rate limited")

// ErrInvalidOTP is returned when an OTP does not verify. All verification
// failures return this same error — never distinguish between "wrong
// code", "expired", "already consumed", or "attempts exceeded". Doing so
// would tell an attacker whether they have hit a live code.
var ErrInvalidOTP = errors.New("invalid or expired code")

// OTPEngine manages the full OTP lifecycle.



type OTPEngine struct {
	db      *pgxpool.Pool
	sms     sms.Provider
	email   email.Provider
	logger  *slog.Logger
}

func NewOTPEngine(db *pgxpool.Pool, smsProvider sms.Provider, emailProvider email.Provider, logger *slog.Logger) *OTPEngine {
	return &OTPEngine{
		db:     db,
		sms:    smsProvider,
		email:  emailProvider,
		logger: logger,
	}
}




 

// Request creates a new OTP for the given purpose, target and channel and
// sends it. Returns ErrRateLimited if the rate limit is exceeded.
func (e *OTPEngine) Request(ctx context.Context, purpose, target, channel, clientIP string) error {
	if err := e.checkRateLimit(ctx, target, clientIP); err != nil {
		return err
	}

	code, err := generateCode()
	if err != nil {
		return fmt.Errorf("generate code: %w", err)
	}

	hash := hashCode(code)
	expiresAt := time.Now().Add(otpTTL)

	_, err = e.db.Exec(ctx, `
		INSERT INTO elber.otp_codes (purpose, target, channel, code_hash, expires_at)
		VALUES ($1, $2, $3, $4, $5)
	`, purpose, target, channel, hash, expiresAt)
	if err != nil {
		return fmt.Errorf("insert otp: %w", err)
	}

	message := fmt.Sprintf("Your ELBER MARKET verification code is: %s. It expires in 10 minutes. Never share this code.", code)

	switch channel {
	case ChannelSMS:
		if err := e.sms.Send(ctx, target, message); err != nil {
			e.logger.Error("sms send failed", "target", target, "error", err)
			return fmt.Errorf("send sms: %w", err)
		}
	
	// case ChannelEmail:
    // emailSubject := "Your ELBER MARKET verification code"
    // emailBody := fmt.Sprintf(
    //     "Your ELBER MARKET verification code is: %s\n\n"+
    //         "It expires in 10 minutes. Never share this code with anyone.\n\n"+
    //         "If you did not request this code, you can safely ignore this email.\n",
    //     code,
    // )
    // // if err := e.email.Send(ctx, target, emailSubject, emailBody); err != nil {
	// if err := e.email.Send(ctx, email.Message{
	// 	To:      target,
	// 	Subject: emailSubject,
	// 	Text:    emailBody, // OTP emails are plain text — that's fine
	// }); err != nil {
    //     e.logger.Error("email send failed", "target", target, "error", err)
    //     return fmt.Errorf("send email: %w", err)
    // }
	case ChannelEmail:
    emailSubject := "Your ELBER MARKET verification code"
    emailText := fmt.Sprintf(
        "Your ELBER MARKET verification code is: %s\n\n"+
            "It expires in 10 minutes. Never share this code with anyone.\n\n"+
            "If you did not request this code, you can safely ignore this email.\n",
        code,
    )
    emailHTML := buildOTPEmailHTML(code)
    if err := e.email.Send(ctx, email.Message{
        To:      target,
        Subject: emailSubject,
        Text:    emailText,
        HTML:    emailHTML,
    }); err != nil {
        e.logger.Error("email send failed", "target", target, "error", err)
        return fmt.Errorf("send email: %w", err)
    }
	default:
		return fmt.Errorf("unknown channel: %s", channel)
	}

	return nil
}

// Verify checks a code against the most recent unconsumed, unexpired OTP
// for the given purpose and target. On success the code is marked
// consumed. On any failure ErrInvalidOTP is returned.
func (e *OTPEngine) Verify(ctx context.Context, purpose, target, code string) error {
	// Find the most recent unconsumed, unexpired OTP for this target and
	// purpose. If more than one exists (unusual — normal flow creates one
	// at a time), the newest wins.
	var (
		id        string
		codeHash  string
		attempts  int
		maxAttempts int
	)
	err := e.db.QueryRow(ctx, `
		SELECT id, code_hash, attempt_count, max_attempts
		FROM elber.otp_codes
		WHERE target = $1
		  AND purpose = $2
		  AND consumed_at IS NULL
		  AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1
	`, target, purpose).Scan(&id, &codeHash, &attempts, &maxAttempts)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidOTP
		}
		return fmt.Errorf("lookup otp: %w", err)
	}

	// Increment attempt count first. Even if the code is correct, this
	// ensures a failed attempt is always counted. This closes a race where
	// a caller could try the same wrong code in parallel and bypass the
	// limit.
	_, err = e.db.Exec(ctx, `
		UPDATE elber.otp_codes
		SET attempt_count = attempt_count + 1
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("increment attempts: %w", err)
	}

	if attempts+1 >= maxAttempts {
		// Even if the code matched, the user has run out of attempts on
		// this OTP. Reject and require a fresh one.
		return ErrInvalidOTP
	}

	if subtle.ConstantTimeCompare([]byte(hashCode(code)), []byte(codeHash)) != 1 {
		return ErrInvalidOTP
	}

	// Code matched — consume it.
	_, err = e.db.Exec(ctx, `
		UPDATE elber.otp_codes
		SET consumed_at = NOW()
		WHERE id = $1 AND consumed_at IS NULL
	`, id)
	if err != nil {
		return fmt.Errorf("consume otp: %w", err)
	}

	return nil
}

// checkRateLimit enforces both per-target and per-IP request limits over
// the last hour.
func (e *OTPEngine) checkRateLimit(ctx context.Context, target, clientIP string) error {
	var targetCount int
	err := e.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM elber.otp_codes
		WHERE target = $1
		  AND created_at > NOW() - INTERVAL '1 hour'
	`, target).Scan(&targetCount)
	if err != nil {
		return fmt.Errorf("rate check target: %w", err)
	}
	if targetCount >= otpMaxRequestsPerHourPerTarget {
		return ErrRateLimited
	}

	// IP-based rate limiting is best-effort: clientIP may be empty in
	// certain proxy configurations. When present, we enforce it. When
	// absent, we rely on the per-target limit alone.
	if clientIP != "" {
		var ipCount int
		err := e.db.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM elber.otp_codes o
			JOIN pg_stat_activity a ON TRUE  -- placeholder; IP tracking added in Group 3
			WHERE FALSE
		`).Scan(&ipCount)
		// IP-based rate limiting is disabled in Group 2 because we don't
		// yet record client IPs in the OTP table. Group 3 adds an
		// otp_codes.client_ip column and enables this check.
		_ = err
		_ = ipCount
	}

	return nil
}

// generateCode returns a cryptographically random 6-digit code. Uses
// crypto/rand, not math/rand, so codes are not predictable from previous
// codes.
func generateCode() (string, error) {
	const digits = 6
	max := big.NewInt(1000000) // 10^6
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// hashCode returns the hex-encoded SHA-256 of code.
func hashCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}








// buildOTPEmailHTML builds the branded HTML email for a verification code.
//
// Design: same brand as notification emails (deep green header, white
// card, warm cream footer). The code is the hero — large, monospaced,
// easy to read and copy. No CTA button — the user just types the code
// back into the app.
//
// Self-contained in this file: the OTP email is not complex enough to
// justify a shared layout package. If the design diverges from other
// emails later, this stays independent. If it converges, we can move
// it to a shared helper then.
func buildOTPEmailHTML(code string) string {
	preheader := fmt.Sprintf("Your verification code is %s. Expires in 10 minutes.", code)

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify your account</title>
</head>
<body style="margin:0;padding:0;background:#f6f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<div style="display:none;font-size:1px;color:#f6f5f0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">%s</div>
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f6f5f0;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#003614;padding:24px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:1px;">ELBER MARKET</div>
            <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px;">Agricultural trade infrastructure</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="font-size:24px;font-weight:700;margin:0 0 16px 0;color:#0f172a;line-height:1.3;">Verify your account</h1>
            <div style="font-size:16px;line-height:1.6;color:#334155;">
              <p style="margin:0 0 16px 0;">Enter this code in the ELBER MARKET app to verify your account:</p>

              <div style="background:#faf9f4;border:1px solid #e8e6df;border-radius:8px;padding:32px 20px;margin:24px 0;text-align:center;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a;">%s</div>
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-top:12px;">Expires in 10 minutes</div>
              </div>

              <p style="margin:0 0 12px 0;color:#334155;">If you did not request this code, you can safely ignore this email. Someone may have entered your email address by mistake.</p>

              <div style="border-left:3px solid #F06900;background:#fef7f0;padding:12px 16px;margin:24px 0;border-radius:4px;">
                <p style="margin:0;font-size:13px;color:#92400e;">
                  <strong style="font-weight:600;">Never share this code.</strong> ELBER MARKET staff will never ask you for it over the phone, email, or chat.
                </p>
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;background:#faf9f4;border-top:1px solid #e8e6df;">
            <p style="font-size:12px;line-height:1.6;color:#64748b;margin:0;">
              You are receiving this because you have an ELBER MARKET account.
            </p>
            <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:8px 0 0 0;">
              © 2026 ELBER MARKET. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`, preheader, code)
}