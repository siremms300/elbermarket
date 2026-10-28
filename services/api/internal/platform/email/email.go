// Package email provides the email delivery abstraction for the platform.
//
// Mirrors the sms package: one Provider interface, a stub for development,
// and a real implementation for Resend (the chosen provider).
//
// The interface distinguishes plain-text and HTML bodies so that providers
// can send proper multipart messages. Most email clients render HTML when
// present, falling back to plain text. Passing HTML through the `text`
// field would deliver it as raw source — which is a common bug.

package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Message is what a caller passes to Send. Allows optional HTML, plain
// text, or both. If HTML is empty, only text is sent. If text is empty,
// only HTML is sent. If both are present, the message is multipart —
// clients prefer HTML, fall back to text.
type Message struct {
	To      string
	Subject string
	Text    string // plain-text body
	HTML    string // HTML body (rendered by the client)
}

// Provider is the email delivery interface.
type Provider interface {
	// Send delivers a message. The Message struct allows either text,
	// HTML, or both.
	Send(ctx context.Context, msg Message) error
}

// Config controls provider selection.
type Config struct {
	Provider        string // "stub" or "resend"
	Environment     string
	ResendAPIKey    string
	ResendFromEmail string // e.g. "noreply@elbermarket.com"
	ResendFromName  string // e.g. "ELBER MARKET"
}

// NewProvider returns the configured Provider.
func NewProvider(cfg Config, logger *slog.Logger) (Provider, error) {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "" {
		provider = "stub"
	}

	if provider == "stub" {
		if cfg.Environment == "production" {
			return nil, fmt.Errorf("email provider cannot be 'stub' in production")
		}
		logger.Warn("email provider is set to 'stub' — emails will be logged to console")
		return &Stub{logger: logger}, nil
	}

	if provider == "resend" {
		if cfg.ResendAPIKey == "" {
			return nil, fmt.Errorf("ELBER_RESEND_API_KEY is required when provider is resend")
		}
		if cfg.ResendFromEmail == "" {
			return nil, fmt.Errorf("ELBER_RESEND_FROM_EMAIL is required when provider is resend")
		}
		logger.Info("email provider initialised", "provider", "resend", "from", cfg.ResendFromEmail)
		return &Resend{
			apiKey:    cfg.ResendAPIKey,
			fromEmail: cfg.ResendFromEmail,
			fromName:  cfg.ResendFromName,
			http:      &http.Client{Timeout: 15 * time.Second},
		}, nil
	}

	return nil, fmt.Errorf("unknown email provider: %q", cfg.Provider)
}

// ─── Stub provider ───────────────────────────────────────────────────────

type Stub struct {
	logger *slog.Logger
}

func (s *Stub) Send(ctx context.Context, msg Message) error {
	s.logger.Info("EMAIL (stub — not actually sent)",
		"to", msg.To,
		"subject", msg.Subject,
		"has_text", msg.Text != "",
		"has_html", msg.HTML != "",
	)
	return nil
}

// ─── Resend provider ─────────────────────────────────────────────────────

// Resend is the chosen email provider. Docs: https://resend.com/docs/api-reference
type Resend struct {
	apiKey    string
	fromEmail string
	fromName  string
	http      *http.Client
}

type resendSendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text,omitempty"`
	HTML    string   `json:"html,omitempty"`
}

func (r *Resend) Send(ctx context.Context, msg Message) error {
	from := r.fromEmail
	if r.fromName != "" {
		from = fmt.Sprintf("%s <%s>", r.fromName, r.fromEmail)
	}

	payload := resendSendRequest{
		From:    from,
		To:      []string{msg.To},
		Subject: msg.Subject,
		Text:    msg.Text,
		HTML:    msg.HTML,
	}

	// Resend requires at least one body. If neither provided, use the
	// subject as a minimal fallback.
	if payload.Text == "" && payload.HTML == "" {
		payload.Text = msg.Subject
	}

	buf, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("resend: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("resend: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.http.Do(req)
	if err != nil {
		return fmt.Errorf("resend: send: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend: status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}