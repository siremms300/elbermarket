import { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { api } from "@/lib/api/client";
import {useAuth} from "@/lib/auth/context"; 
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import type { TransportTripSummary } from "@/lib/api/types";

// My Trips — list of the shipper's transport requests.
//
// States handled:
//   - Loading (initial fetch)
//   - Empty (no trips yet)
//   - Error (network / server failure)
//   - Populated (list of trips)
//
// Refreshes on screen focus so newly created trips appear without
// pull-to-refresh. Also supports pull-to-refresh manually.
export default function TripsListScreen() {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const [trips, setTrips] = useState<TransportTripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await api.listTrips({ limit: 50 });
      setTrips(result.transport_requests ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load trips. Check your connection.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      if (authStatus === "authenticated") {
        loadTrips(false);
      }
    }, [authStatus, loadTrips]),
  );

  function openTrip(trip: TransportTripSummary) {
    router.push(`/(app)/trips/${trip.id}`);
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text variant="h1">My Trips</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.headerWrapper}>
        <Text variant="h1">My Trips</Text>
        <Text
          variant="body"
          color={colors.text.secondary}
          style={{ marginTop: spacing[1] }}
        >
          {trips.length} {trips.length === 1 ? "trip" : "trips"}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text variant="bodySmall" color={colors.status.danger.fg}>
            {error}
          </Text>
          <Pressable onPress={() => loadTrips(false)} style={styles.retryButton}>
            <Text variant="label" color={colors.brand.primary}>
              Retry
            </Text>
          </Pressable>
        </View>
      )}

      {!error && trips.length === 0 && (
        <View style={styles.emptyState}>
          <Text variant="h3" color={colors.text.primary}>
            No trips yet
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ marginTop: spacing[2], textAlign: "center" }}
          >
            Create a transport request to get started. It only takes a minute.
          </Text>
        </View>
      )}

      {trips.length > 0 && (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadTrips(true)}
              tintColor={colors.brand.primary}
            />
          }
          renderItem={({ item }) => (
            <TripCard trip={item} onPress={() => openTrip(item)} />
          )}
        />
      )}
    </Screen>
  );
}

function TripCard({
  trip,
  onPress,
}: {
  trip: TransportTripSummary;
  onPress: () => void;
}) {
  const distanceKm = (trip.straight_line_distance_m / 1000).toFixed(0);
  const statusMeta = getStatusMeta(trip.status);
  const pickupDate = new Date(trip.pickup_window_start);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHeader}>
        <Text variant="label" color={colors.text.tertiary}>
          {trip.reference}
        </Text>
        <View
          style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}
        >
          <Text
            variant="caption"
            color={statusMeta.fg}
            style={{ fontWeight: "600" }}
          >
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <Text
        variant="bodyMedium"
        color={colors.text.primary}
        style={{ marginTop: spacing[2] }}
        numberOfLines={1}
      >
        {trip.cargo_description}
      </Text>

      <View style={styles.routeRow}>
        <Text
          variant="bodySmall"
          color={colors.text.secondary}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {trip.pickup_address}
        </Text>
        <Text variant="bodySmall" color={colors.text.tertiary}>
          {" → "}
        </Text>
        <Text
          variant="bodySmall"
          color={colors.text.secondary}
          numberOfLines={1}
          style={{ flex: 1, textAlign: "right" }}
        >
          {trip.destination_address}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Text variant="caption" color={colors.text.tertiary}>
          {distanceKm} km · {trip.cargo_weight_kg.toLocaleString()} kg ·{" "}
          {pickupDate.toLocaleDateString()}
        </Text>
      </View>
    </Pressable>
  );
}

function getStatusMeta(status: TransportTripSummary["status"]): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (status) {
    case "requested":
      return {
        label: "Awaiting",
        bg: colors.status.info.bg,
        fg: colors.status.info.fg,
      };
    case "assigned":
    case "shipper_confirmed":
      return {
        label: "Assigned",
        bg: colors.status.accent.bg,
        fg: colors.status.accent.fg,
      };
    case "vehicle_en_route":
    case "at_pickup":
    case "loaded":
    case "in_transit":
    case "at_destination":
      return {
        label: "In progress",
        bg: colors.brand.accentMuted,
        fg: colors.brand.accent,
      };
    case "delivered":
    case "closed":
      return {
        label: "Delivered",
        bg: colors.status.success.bg,
        fg: colors.status.success.fg,
      };
    case "cancelled":
    case "failed":
    case "disputed":
      return {
        label: "Cancelled",
        bg: colors.status.danger.bg,
        fg: colors.status.danger.fg,
      };
    default:
      return {
        label: status,
        bg: colors.status.neutral.bg,
        fg: colors.status.neutral.fg,
      };
  }
}

const styles = StyleSheet.create({
  headerWrapper: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  header: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  card: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.md,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  cardPressed: {
    backgroundColor: colors.surface.sunken,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[2],
  },
  metaRow: {
    marginTop: spacing[2],
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: spacing[6],
    justifyContent: "center",
    alignItems: "center",
  },
  errorBox: {
    marginHorizontal: spacing[6],
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginBottom: spacing[3],
  },
  retryButton: {
    marginTop: spacing[2],
    paddingVertical: spacing[2],
  },
});