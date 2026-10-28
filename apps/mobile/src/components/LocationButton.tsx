import { useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import { MapPin, Check, AlertCircle } from "lucide-react-native";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import { Text } from "./Text";
import { Pressable } from "./Pressable";

// LocationButton — captures current GPS coordinates and reverse-geocodes
// them into an address. Used on both pickup and destination fields.
//
// Handles: permission request, loading, error states, and success feedback.

interface LocationResult {
  latitude: number;
  longitude: number;
  address?: string;
}

interface LocationButtonProps {
  onCapture: (result: LocationResult) => void;
  label?: string;
}

export function LocationButton({
  onCapture,
  label = "Use my current location",
}: LocationButtonProps) {
  const [loading, setLoading] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = async () => {
    setLoading(true);
    setError(null);
    setCaptured(false);

    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied. Enable it in your device settings.");
        return;
      }

      // Get current position
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse geocode to get a readable address
      let address: string | undefined;
      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });

        if (geocoded && geocoded.length > 0) {
          const g = geocoded[0];
          const parts = [g.name, g.street, g.district, g.city, g.region, g.country]
            .filter((p): p is string => Boolean(p) && p !== "");
          address = parts.join(", ") || undefined;
        }
      } catch {
        // Reverse geocoding failed — still return coordinates
      }

      onCapture({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        address,
      });
      setCaptured(true);
      setTimeout(() => setCaptured(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not get location.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={capture}
        disabled={loading}
        style={[
          styles.button,
          captured && styles.buttonCaptured,
          loading && styles.buttonLoading,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.brand.primary} />
        ) : captured ? (
          <Check size={16} color={colors.status.success.fg} strokeWidth={2.5} />
        ) : (
          <MapPin size={16} color={colors.brand.primary} strokeWidth={2} />
        )}
        <Text
          variant="label"
          color={captured ? colors.status.success.fg : colors.brand.primary}
          style={{ marginLeft: spacing[2], fontWeight: "600" }}
        >
          {captured ? "Location captured" : label}
        </Text>
      </Pressable>
      {error && (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={colors.status.danger.fg} strokeWidth={2} />
          <Text
            variant="caption"
            color={colors.status.danger.fg}
            style={{ marginLeft: 4, flex: 1 }}
          >
            {error}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing[2] },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primaryMuted,
    alignSelf: "flex-start",
  },
  buttonCaptured: {
    borderColor: colors.status.success.fg,
    backgroundColor: colors.status.success.bg,
  },
  buttonLoading: {
    opacity: 0.7,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[2],
  },
});