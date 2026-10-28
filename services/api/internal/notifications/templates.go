// HTML email templates.
//
// One shared layout, event-specific content blocks. Kept as Go constants
// for Phase 2 — when we have more templates, we can move to embedded
// files (go:embed) or a templating system. For now, functions that
// return (subject, htmlBody) are simple and testable.

package notifications

import (
	"fmt"
	"html"
)

// EmailContent is what a template returns.
type EmailContent struct {
	Subject string
	HTML    string
}

// BaseEmail wraps content in the standard ELBER MARKET layout.
// Colors match the design system: deep forest green #003614,
// off-white background, charcoal text.
func BaseEmail(preheader, title, bodyHTML, ctaHTML string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%s</title>
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
            <h1 style="font-size:24px;font-weight:700;margin:0 0 16px 0;color:#0f172a;line-height:1.3;">%s</h1>
            <div style="font-size:16px;line-height:1.6;color:#334155;">
              %s
            </div>
            %s
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;background:#faf9f4;border-top:1px solid #e8e6df;">
            <p style="font-size:12px;line-height:1.6;color:#64748b;margin:0;">
              You are receiving this because you have an ELBER MARKET account.
              You can manage your notification preferences in the app.
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
</html>`, html.EscapeString(title), html.EscapeString(preheader), html.EscapeString(title), bodyHTML, ctaHTML)
}

// renderTransportRequestCreated renders the email for a newly created
// transport request.
func renderTransportRequestCreated(metadata map[string]any) EmailContent {
	reference, _ := metadata["reference"].(string)
	cargo, _ := metadata["cargo"].(string)
	pickup, _ := metadata["pickup_address"].(string)
	destination, _ := metadata["destination_address"].(string)

	distanceM, _ := metadata["distance_m"].(float64)
	distanceKm := distanceM / 1000.0

	premium, _ := metadata["premium"].(float64)

	subject := fmt.Sprintf("Transport request %s created", reference)
	preheader := fmt.Sprintf("Your transport request for %s is now awaiting assignment.", cargo)

	body := fmt.Sprintf(`
<p style="margin:0 0 16px 0;">Your transport request has been created and is now awaiting vehicle assignment. You will receive another notification once a vehicle and driver have been assigned.</p>

<div style="background:#faf9f4;border:1px solid #e8e6df;border-radius:8px;padding:20px;margin:24px 0;">
  <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:8px;">Request details</div>
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
    <tr>
      <td style="color:#64748b;padding:4px 0;width:130px;">Reference</td>
      <td style="color:#0f172a;font-weight:600;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Cargo</td>
      <td style="color:#0f172a;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Pickup</td>
      <td style="color:#0f172a;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Destination</td>
      <td style="color:#0f172a;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Distance</td>
      <td style="color:#0f172a;">%.1f km</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Insurance premium</td>
      <td style="color:#0f172a;">NGN %s</td>
    </tr>
  </table>
</div>

<p style="margin:0;color:#64748b;font-size:14px;">Cargo is covered by insurance from pickup through delivery. The policy is automatically attached to your trip.</p>
`, html.EscapeString(reference), html.EscapeString(cargo), html.EscapeString(pickup), html.EscapeString(destination), distanceKm, formatMoney(premium))

	cta := `
<div style="margin-top:32px;text-align:center;">
  <a href="https://app.elbermarket.com/trips" style="display:inline-block;background:#003614;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">View trip in the app</a>
</div>`

	return EmailContent{
		Subject: subject,
		HTML:    BaseEmail(preheader, "Transport request created", body, cta),
	}
}

// renderTransportRequestCancelled renders the email for a cancelled trip.
func renderTransportRequestCancelled(metadata map[string]any) EmailContent {
	reference, _ := metadata["reference"].(string)
	cargo, _ := metadata["cargo"].(string)
	reason, _ := metadata["reason"].(string)

	subject := fmt.Sprintf("Transport request %s cancelled", reference)
	preheader := "Your transport request has been cancelled."

	body := fmt.Sprintf(`
<p style="margin:0 0 16px 0;">Your transport request has been cancelled. If this was unexpected, please contact support.</p>

<div style="background:#faf9f4;border:1px solid #e8e6df;border-radius:8px;padding:20px;margin:24px 0;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
    <tr>
      <td style="color:#64748b;padding:4px 0;width:130px;">Reference</td>
      <td style="color:#0f172a;font-weight:600;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Cargo</td>
      <td style="color:#0f172a;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Reason</td>
      <td style="color:#0f172a;">%s</td>
    </tr>
  </table>
</div>
`, html.EscapeString(reference), html.EscapeString(cargo), html.EscapeString(reason))

	return EmailContent{
		Subject: subject,
		HTML:    BaseEmail(preheader, "Transport request cancelled", body, ""),
	}
}

// renderTransportRequestStatusChanged renders the email for a status change.
func renderTransportRequestStatusChanged(metadata map[string]any) EmailContent {
	reference, _ := metadata["reference"].(string)
	statusBefore, _ := metadata["status_before"].(string)
	statusAfter, _ := metadata["status_after"].(string)
	cargo, _ := metadata["cargo"].(string)

	subject := fmt.Sprintf("Transport request %s: %s", reference, humanStatus(statusAfter))
	preheader := fmt.Sprintf("Your trip is now %s.", humanStatus(statusAfter))

	body := fmt.Sprintf(`
<p style="margin:0 0 16px 0;">Your transport request has a new status update.</p>

<div style="background:#faf9f4;border:1px solid #e8e6df;border-radius:8px;padding:20px;margin:24px 0;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
    <tr>
      <td style="color:#64748b;padding:4px 0;width:130px;">Reference</td>
      <td style="color:#0f172a;font-weight:600;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Cargo</td>
      <td style="color:#0f172a;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Previous</td>
      <td style="color:#64748b;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;padding:4px 0;">Now</td>
      <td style="color:#0f172a;font-weight:600;">%s</td>
    </tr>
  </table>
</div>
`, html.EscapeString(reference), html.EscapeString(cargo), html.EscapeString(humanStatus(statusBefore)), html.EscapeString(humanStatus(statusAfter)))

	cta := `
<div style="margin-top:32px;text-align:center;">
  <a href="https://app.elbermarket.com/trips" style="display:inline-block;background:#003614;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">View trip in the app</a>
</div>`

	return EmailContent{
		Subject: subject,
		HTML:    BaseEmail(preheader, "Status update", body, cta),
	}
}

// RenderEmail picks the correct template based on event type.
func RenderEmail(eventType string, metadata map[string]any) EmailContent {
	switch eventType {
	case EventTransportRequestCreated:
		return renderTransportRequestCreated(metadata)
	case EventTransportRequestCancelled:
		return renderTransportRequestCancelled(metadata)
	case EventTransportRequestStatusChanged:
		return renderTransportRequestStatusChanged(metadata)
	default:
		// Fallback — plain text for unknown events.
		return EmailContent{
			Subject: "ELBER MARKET notification",
			HTML:    BaseEmail("", "Notification", "<p>You have a new notification in ELBER MARKET.</p>", ""),
		}
	}
}

// humanStatus converts a status code to a human-readable phrase.
func humanStatus(s string) string {
	switch s {
	case "requested":
		return "awaiting assignment"
	case "assigned":
		return "assigned"
	case "shipper_confirmed":
		return "confirmed"
	case "vehicle_en_route":
		return "en route to pickup"
	case "at_pickup":
		return "at pickup"
	case "loaded":
		return "loaded"
	case "in_transit":
		return "in transit"
	case "at_destination":
		return "at destination"
	case "delivered":
		return "delivered"
	case "closed":
		return "completed"
	case "cancelled":
		return "cancelled"
	case "failed":
		return "failed"
	case "disputed":
		return "disputed"
	default:
		return s
	}
}

// formatMoney formats a float as Nigerian currency with comma separators.
func formatMoney(v float64) string {
	// Simple formatting — for NGN values, two decimal places and
	// thousands separators. No need for full i18n here.
	whole := int64(v * 100)
	r := whole % 100
	q := whole / 100
	cents := fmt.Sprintf("%02d", r)

	// Format whole part with commas.
	s := fmt.Sprintf("%d", q)
	if len(s) <= 3 {
		return s + "." + cents
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	return string(out) + "." + cents
}