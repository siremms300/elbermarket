// Package jwt issues and verifies the access tokens used by the platform.
//
// Design choices:
//
//   - HS256 (symmetric). For a single-backend system this is correct: one
//     key signs and verifies. When we split verification across services in
//     Phase 2, we move to RS256 (asymmetric) so verifiers don't need the
//     signing key. The interface here will not change; only the internals.
//
//   - Access tokens are short-lived (1h by default). They are sent on every
//     API call and are exposed in memory. Short lifespan limits damage if
//     one leaks.
//
//   - Refresh tokens are NOT JWTs. They are opaque 256-bit random strings.
//     Only a hash of the refresh token is stored in the database. This lets
//     us revoke refresh tokens at any time (delete the session row) — a
//     capability JWTs do not have. Refresh token issuance lives in the auth
//     package, not here.
//
//   - Claims carry both the user ID (uid) and the session ID (sid). The
//     authenticator uses sid to check the session is still valid on every
//     request, which is what makes revocation immediate.

package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken is returned for any token that fails verification. It
// intentionally does not distinguish between malformed, expired, or
// tampered tokens — all are equally untrustworthy from the caller's
// perspective.
var ErrInvalidToken = errors.New("invalid token")

// Claims are the custom claims carried in every access token.
//
// The json tags must NOT be "-" — the fields must be serialized into the
// token payload so that verification can read them back. This is the
// critical detail: a claim that is not serialized is a claim that does
// not exist on the verify side.
//
// We use "uid" and "sid" (not "user_id"/"session_id") to keep the token
// payload small. A JWT is sent on every request; every byte counts.
type Claims struct {
	UserID    string `json:"uid"`
	SessionID string `json:"sid"`
	jwt.RegisteredClaims
}

// Issuer signs and verifies access tokens.
type Issuer struct {
	secret    []byte
	accessTTL time.Duration
}

// NewIssuer builds an Issuer with the given secret and access-token TTL.
// The secret must not be empty — production code enforces a minimum length
// at the config layer.
func NewIssuer(secret string, accessTTL time.Duration) *Issuer {
	return &Issuer{
		secret:    []byte(secret),
		accessTTL: accessTTL,
	}
}

// IssueAccessToken creates a signed JWT for the given user and session.
// The returned string is the complete bearer token the client sends in
// the Authorization header.
func (i *Issuer) IssueAccessToken(userID, sessionID string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    "elber-market",
			Audience:  jwt.ClaimStrings{"elber-market-api"},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(i.accessTTL)),
		},
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(i.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

// VerifyAccessToken parses and verifies a token, returning its claims on
// success. Any failure — wrong algorithm, bad signature, expired, wrong
// audience — returns ErrInvalidToken. Never returns the underlying
// parsing error to the caller, to avoid leaking information.
func (i *Issuer) VerifyAccessToken(tokenString string) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (any, error) {
		// Enforce the signing method explicitly. This prevents the classic
		// "alg confusion" attack where an attacker re-signs a token with a
		// different algorithm that verification would otherwise accept.
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return i.secret, nil
	}, jwt.WithAudience("elber-market-api"), jwt.WithIssuer("elber-market"))

	if err != nil || !tok.Valid {
		return nil, ErrInvalidToken
	}

	claims, ok := tok.Claims.(*Claims)
	if !ok {
		return nil, ErrInvalidToken
	}
	if claims.UserID == "" || claims.SessionID == "" {
		return nil, ErrInvalidToken
	}

	return claims, nil
}