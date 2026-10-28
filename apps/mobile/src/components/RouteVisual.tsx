import { View, StyleSheet } from "react-native";
import { MapPin, Navigation, Clock } from "lucide-react-native";
import { colors, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// RouteVisual — a vertical pickup → destination visualisation.
//
// Design: two markers on a vertical line. Pickup is a filled dot (the
// starting point). Destination is a ringed dot (the ending point). The
// line between them is dashed, visually distinct from the timeline's
// solid line — this is a route, not a sequence of events.
//
// Below the markers: distance and estimated duration in muted caption.

interface RouteVisualProps {
  pickupAddress: string;
  destinationAddress: string;
  distanceKm: number;
  estimatedDurationHours?: number;
}

export function RouteVisual({
  pickupAddress,
  destinationAddress,
  distanceKm,
  estimatedDurationHours,
}: RouteVisualProps) {
  return (
    <View style={styles.container}>
      {/* Pickup */}
      <View style={styles.stopRow}>
        <View style={styles.markerColumn}>
          <View style={styles.pickupDotOuter}>
            <View style={styles.pickupDotInner} />
          </View>
          <View style={styles.dashedLine} />
        </View>
        <View style={styles.addressColumn}>
          <Text variant="overline" color={colors.text.tertiary}>
            Pickup
          </Text>
          <Text
            variant="body"
            color={colors.text.primary}
            style={{ marginTop: 2 }}
          >
            {pickupAddress}
          </Text>
        </View>
      </View>

      {/* Destination */}
      <View style={styles.stopRow}>
        <View style={styles.markerColumn}>
          <View style={styles.destinationDot} />
        </View>
        <View style={styles.addressColumn}>
          <Text variant="overline" color={colors.text.tertiary}>
            Destination
          </Text>
          <Text
            variant="body"
            color={colors.text.primary}
            style={{ marginTop: 2 }}
          >
            {destinationAddress}
          </Text>
        </View>
      </View>

      {/* Footer: distance + duration */}
      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Navigation size={13} color={colors.text.tertiary} strokeWidth={2} />
          <Text
            variant="caption"
            color={colors.text.tertiary}
            style={{ marginLeft: 4 }}
          >
            {distanceKm.toFixed(0)} km straight-line
          </Text>
        </View>
        {estimatedDurationHours !== undefined && (
          <View style={styles.footerItem}>
            <Clock size={13} color={colors.text.tertiary} strokeWidth={2} />
            <Text
              variant="caption"
              color={colors.text.tertiary}
              style={{ marginLeft: 4 }}
            >
              ~{estimatedDurationHours.toFixed(1)} h estimated
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface.raised,
    borderRadius: 14,
    padding: spacing[5],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  stopRow: {
    flexDirection: "row",
  },
  markerColumn: {
    width: 20,
    alignItems: "center",
    marginRight: spacing[3],
  },
  addressColumn: {
    flex: 1,
    paddingBottom: spacing[4],
  },
  pickupDotOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  pickupDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  dashedLine: {
    flex: 1,
    width: 0,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.border.strong,
    borderStyle: "dashed",
    minHeight: 24,
  },
  destinationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.brand.primary,
    backgroundColor: colors.surface.raised,
    marginTop: 4,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing[2],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
  },
});