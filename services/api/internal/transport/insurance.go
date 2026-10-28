// Insurance premium calculation.
//
// Every transport request is automatically insured. The premium is
// computed from:
//
//   - declared cargo value
//   - straight-line distance (as a proxy for transit risk)
//   - a base minimum (to ensure small shipments are still commercially
//     viable to insure)
//
// The formula is:
//
//   premium = max(
//       MINIMUM_PREMIUM,
//       cargo_value * BASE_RATE + cargo_value * DISTANCE_RATE * distance_km / 100
//   )
//
// Where:
//   - BASE_RATE (0.004 = 0.4%) covers the fixed cost of underwriting
//   - DISTANCE_RATE (0.0001 per 100 km) scales with transit exposure
//   - MINIMUM_PREMIUM covers the administrative cost of any policy
//
// These values are constants, not env vars, because:
//   - Changing insurance pricing is a business decision requiring
//     partner conversation, not a runtime config tweak
//   - Insurance pricing should be reviewed deliberately, not adjusted
//     casually
//
// When this needs to become configurable (rate cards per corridor,
// per vehicle type), that's a schema change (insurance_rate_cards
// table), not a config change.

package transport

import (
	"math"
)

const (
	// Base premium rate: 0.4% of cargo value. Covers fixed underwriting.
	insuranceBaseRate = 0.004

	// Distance premium: additional 0.0001 (0.01%) per 100 km.
	// Scaled by distance_km / 100 in the formula.
	insuranceDistanceRate = 0.0001

	// Minimum premium in NGN. Ensures small shipments are still
	// commercially viable to insure (covers admin cost).
	insuranceMinimumPremium = 1000.0
)

// calculateInsurancePremium computes the premium for a trip given the
// declared cargo value and the straight-line distance between pickup
// and destination.
//
// Both inputs are in their natural units:
//   - cargoValue in the currency (usually NGN)
//   - distanceKm in kilometers
//
// Returns the premium amount rounded to two decimal places.
func calculateInsurancePremium(cargoValue, distanceKm float64) float64 {
	if cargoValue <= 0 {
		return 0
	}

	// Base component: percentage of cargo value.
	baseComponent := cargoValue * insuranceBaseRate

	// Distance component: scaled percentage based on distance.
	// Longer trips expose the cargo to more risk, so premium scales up.
	distanceComponent := cargoValue * insuranceDistanceRate * (distanceKm / 100.0)

	premium := baseComponent + distanceComponent

	// Enforce minimum.
	if premium < insuranceMinimumPremium {
		premium = insuranceMinimumPremium
	}

	// Round to 2 decimal places for currency precision.
	return math.Round(premium*100) / 100
}