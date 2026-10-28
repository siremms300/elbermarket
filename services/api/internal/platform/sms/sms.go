// Package sms provides the SMS delivery abstraction for the platform.
//
// Design:
//
//   - One Provider interface with a single method: Send.
//   - Three implementations: Termii (default, Nigerian), Twilio
//     (alternative, global), and a Stub that logs to the console.
//   - The provider is chosen by the ELBER_SMS_PROVIDER environment
//     variable. Changing providers is one line in .env.
//   - No provider-specific details leak out of this package. Callers
//     depend only on Provider.
//
// The Stub provider exists so local development and CI can run without
// provider credentials. It must never be selected in production — the
// factory enforces this.

package sms

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Provider is the SMS delivery interface. Implementations must be safe
// for concurrent use.
type Provider interface {
	// Send delivers message to the given phone number in E.164 format
	// (e.g. +2348012345678). Returns an error on any delivery failure.
	Send(ctx context.Context, to, message string) error
}

// ─── Factory ─────────────────────────────────────────────────────────────

// Config controls provider selection. Populated from environment variables
// at startup.
type Config struct {
	Provider      string // "termii", "twilio", or "stub"
	Environment   string // "development", "staging", "production"

	TermiiAPIKey    string
	TermiiSenderID  string
	TermiiBaseURL   string

	TwilioAccountSID string
	TwilioAuthToken  string
	TwilioFromNumber string
}

// NewProvider returns the configured Provider. If the provider is "stub"
// and environment is "production", it returns an error rather than
// silently logging OTPs to the console.
func NewProvider(cfg Config, logger *slog.Logger) (Provider, error) {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))

	if provider == "" {
		provider = "stub"
	}

	if provider == "stub" {
		if cfg.Environment == "production" {
			return nil, fmt.Errorf("sms provider cannot be 'stub' in production")
		}
		logger.Warn("sms provider is set to 'stub' — messages will be logged to console")
		return &Stub{logger: logger}, nil
	}

	if provider == "termii" {
		if cfg.TermiiAPIKey == "" {
			return nil, fmt.Errorf("ELBER_TERMII_API_KEY is required when provider is termii")
		}
		baseURL := cfg.TermiiBaseURL
		if baseURL == "" {
			baseURL = "https://api.ng.termii.com"
		}
		logger.Info("sms provider initialised", "provider", "termii")
		return &Termii{
			apiKey:   cfg.TermiiAPIKey,
			senderID: cfg.TermiiSenderID,
			baseURL:  strings.TrimRight(baseURL, "/"),
			http:     &http.Client{Timeout: 15 * time.Second},
		}, nil
	}

	if provider == "twilio" {
		if cfg.TwilioAccountSID == "" || cfg.TwilioAuthToken == "" || cfg.TwilioFromNumber == "" {
			return nil, fmt.Errorf("ELBER_TWILIO_ACCOUNT_SID, ELBER_TWILIO_AUTH_TOKEN and ELBER_TWILIO_FROM_NUMBER are required when provider is twilio")
		}
		logger.Info("sms provider initialised", "provider", "twilio")
		return &Twilio{
			accountSID: cfg.TwilioAccountSID,
			authToken:  cfg.TwilioAuthToken,
			from:       cfg.TwilioFromNumber,
			http:       &http.Client{Timeout: 15 * time.Second},
		}, nil
	}

	return nil, fmt.Errorf("unknown sms provider: %q", cfg.Provider)
}

// ─── Stub provider ───────────────────────────────────────────────────────

// Stub logs messages to the console. Used in development and CI. Never
// selected in production.
type Stub struct {
	logger *slog.Logger
}

func (s *Stub) Send(ctx context.Context, to, message string) error {
	s.logger.Info("SMS (stub — not actually sent)",
		"to", to,
		"message", message,
	)
	return nil
}

// ─── Termii provider ─────────────────────────────────────────────────────

// Termii is the Nigerian SMS provider. Default for production.
// API docs: https://developer.termii.com/
type Termii struct {
	apiKey   string
	senderID string
	baseURL  string
	http     *http.Client
}

type termiiSendRequest struct {
	APIKey    string `json:"api_key"`
	To        string `json:"to"`
	From      string `json:"from"`
	SMS       string `json:"sms"`
	Type      string `json:"type"`
	Channel   string `json:"channel"`
}

func (t *Termii) Send(ctx context.Context, to, message string) error {
	body := termiiSendRequest{
		APIKey:  t.apiKey,
		To:      to,
		From:    t.senderID,
		SMS:     message,
		Type:    "plain",
		Channel: "generic", // 'dnd' would bypass DND registry; 'generic' respects it
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("termii: marshal request: %w", err)
	}

	endpoint := t.baseURL + "/api/sms/send"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("termii: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.http.Do(req)
	if err != nil {
		return fmt.Errorf("termii: send: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("termii: status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// ─── Twilio provider ─────────────────────────────────────────────────────

// Twilio is the global SMS provider. Alternative to Termii, selected by
// setting ELBER_SMS_PROVIDER=twilio.
// API docs: https://www.twilio.com/docs/messaging/api/message-resource
type Twilio struct {
	accountSID string
	authToken  string
	from       string
	http       *http.Client
}

func (t *Twilio) Send(ctx context.Context, to, message string) error {
	endpoint := fmt.Sprintf(
		"https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json",
		url.PathEscape(t.accountSID),
	)

	form := url.Values{}
	form.Set("To", to)
	form.Set("From", t.from)
	form.Set("Body", message)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("twilio: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(t.accountSID, t.authToken)

	resp, err := t.http.Do(req)
	if err != nil {
		return fmt.Errorf("twilio: send: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("twilio: status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}