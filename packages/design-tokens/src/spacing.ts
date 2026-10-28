// ELBER MARKET spacing, radii, elevation, motion.
//
// Spacing follows a 4-point grid. The list below is the entire system —
// no number outside it should appear in the UI. This discipline is what
// makes layouts feel considered.

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

// Radii — corner treatments. Restrained, not bubbly.
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

// Elevation — the shadow hierarchy.
// In "Quiet Trust", most things are flat. Cards have subtle elevation.
// Sheets and modals have clear elevation. Alerts and floating actions
// have strong elevation. This is a restrained system.
export const elevation = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  // Level 1 — cards
  subtle: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  // Level 2 — sheets, elevated cards
  medium: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  // Level 3 — floating actions, alerts
  strong: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
} as const;

// Motion — the animation timing system.
export const motion = {
  duration: {
    fast: 150,    // Press feedback, small transitions
    normal: 250,  // Screen transitions, standard animations
    slow: 400,    // Entrance animations, brand moments
  },
  easing: {
    // Standard Material-style easing for transitions
    standard: [0.4, 0, 0.2, 1] as const,
    // Decelerate — for things entering the screen
    decelerate: [0, 0, 0.2, 1] as const,
    // Accelerate — for things leaving
    accelerate: [0.4, 0, 1, 1] as const,
  },
} as const;