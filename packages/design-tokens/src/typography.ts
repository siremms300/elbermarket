// ELBER MARKET typography system.
//
// One family (Inter), four weights, used with architectural discipline.
// Every variant defines size, line-height, weight, letter-spacing.
//
// Special note on `numeric` variants: they use tabular figure settings so
// numbers align vertically in lists, tables, and financial displays. This
// is what makes a statement "₦1,234,567.00" line up cleanly against
// "₦56.00" above it in a list. Without tabular figures, the digits shift.
//
// Weight is a string because React Native registers each weight as a
// separate font family name (see _layout.tsx).

export const fontFamilies = {
  regular: "InterRegular",
  medium: "InterMedium",
  semibold: "InterSemiBold",
  bold: "InterBold",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const textVariants = {
  // Display — for the biggest moments: splash, empty states, hero
  display: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: fontWeight.bold,
    letterSpacing: -1.2,
  },
  // h1 — screen titles
  h1: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.8,
  },
  // h2 — section headers, prominent labels
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.4,
  },
  // h3 — card titles, list headers
  h3: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.2,
  },
  // body — primary content
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeight.regular,
    letterSpacing: 0,
  },
  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeight.medium,
    letterSpacing: 0,
  },
  // bodySmall — secondary text
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeight.regular,
    letterSpacing: 0,
  },
  // label — form labels, button text
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeight.medium,
    letterSpacing: 0,
  },
  // caption — timestamps, metadata
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.regular,
    letterSpacing: 0.1,
  },
  // overline — small uppercase labels above sections
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
  },

  // ─── Numeric variants — for money, quantities, distances ────────
  // These use tabular figure settings so digits align in lists.
  // The `numeric` variant is for standard list amounts. `numericDisplay`
  // is for hero amounts (e.g., "₦1,234,567" on a balance card).
  numeric: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"] as const,
  },
  numericDisplay: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"] as const,
  },
  numericSmall: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: fontWeight.medium,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"] as const,
  },
} as const;

export type TextVariant = keyof typeof textVariants;