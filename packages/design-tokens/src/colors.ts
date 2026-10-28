// ELBER MARKET colour system — "Quiet Trust"
//
// Every colour used in the product comes from here. No inline hex values.
// The palette is small and disciplined: three brand anchors, a warm
// neutral surface system, and semantic status colours.
//
// Colour is used architecturally, not decoratively. Deep forest green
// anchors identity. Leaf green signals growth and success. Harvest
// orange appears rarely — its scarcity is what gives it meaning.

export const colors = {
  // ─── Brand ────────────────────────────────────────────────────────
  brand: {
    primary: "#003614",       // Deep forest green — the anchor
    primaryHover: "#004d1c",  // For interactive states
    primaryPressed: "#001f0a",
    primaryMuted: "#E6F0EA",  // Soft tint background

    secondary: "#519105",     // Leaf green — growth, success
    secondaryPressed: "#3d6e04",
    secondaryMuted: "#EEF6DE",

    accent: "#F06900",        // Harvest orange — used sparingly
    accentPressed: "#c85400",
    accentMuted: "#FEF0E6",
  },

  // ─── Surfaces ─────────────────────────────────────────────────────
  surface: {
    base: "#FAF9F4",          // Warm cream — screen background
    raised: "#FFFFFF",        // Cards, sheets
    sunken: "#F1EFE8",        // Recessed areas, input backgrounds
    inverse: "#003614",       // Dark surfaces (headers on dark screens)
    scrim: "rgba(15, 23, 42, 0.45)", // Modal backdrop
  },

  // ─── Text ─────────────────────────────────────────────────────────
  text: {
    primary: "#1F2937",       // Charcoal — headings, primary content
    secondary: "#64748B",     // Slate — body, labels
    tertiary: "#94A3B8",      // Lighter slate — captions, timestamps
    disabled: "#CBD5E1",
    inverse: "#FFFFFF",       // On dark surfaces
    brand: "#003614",         // Text coloured to brand
    accent: "#F06900",        // Text coloured to accent
  },

  // ─── Borders ──────────────────────────────────────────────────────
  border: {
    subtle: "#E8E6DF",        // Hairlines between list items, card edges
    strong: "#D6D3CC",        // Focus rings, heavier dividers
    focus: "#003614",         // Active input outline
    inverse: "rgba(255,255,255,0.15)",
  },

  // ─── Status ───────────────────────────────────────────────────────
  status: {
    success: {
      fg: "#3D6E04",
      bg: "#EEF6DE",
      border: "#B8D87D",
    },
    warning: {
      fg: "#92400E",
      bg: "#FEF3C7",
      border: "#FCD34D",
    },
    danger: {
      fg: "#991B1B",
      bg: "#FEE2E2",
      border: "#FCA5A5",
    },
    info: {
      fg: "#075985",
      bg: "#E0F2FE",
      border: "#7DD3FC",
    },
    neutral: {
      fg: "#64748B",
      bg: "#F1F5F9",
      border: "#CBD5E1",
    },
    accent: {
      fg: "#C85400",
      bg: "#FEF0E6",
      border: "#FBBF7C",
    },
  },
} as const;

export type Colors = typeof colors;