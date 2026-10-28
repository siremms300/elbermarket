import { useCallback, useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Truck,
  ArrowRight,
  Package,
  MapPin,
  Clock,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { TripCardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { FadeIn } from "@/components/FadeIn";
import { Container } from "@/components/Container";
import { api } from "@/lib/api/client";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import type { TransportTripSummary } from "@/lib/api/types";

type FilterKey = "all" | "awaiting" | "in_progress" | "delivered";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting" },
  { key: "in_progress", label: "In Progress" },
  { key: "delivered", label: "Delivered" },
];

export default function RequestsTab() {
  const router = useRouter();
  const [trips, setTrips] = useState<TransportTripSummary[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    setError(null);
    try {
      const result = await api.listTrips({ limit: 100 });
      setTrips(result.transport_requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load trips.");
    } finally {
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [loadTrips]),
  );

  const filteredTrips = useMemo(() => {
    if (filter === "all") return trips;
    if (filter === "awaiting") {
      return trips.filter(
        (t) =>
          t.status === "requested" ||
          t.status === "assignment_pending" ||
          t.status === "assigned" ||
          t.status === "shipper_confirmed",
      );
    }
    if (filter === "in_progress") {
      return trips.filter(
        (t) =>
          t.status === "vehicle_en_route" ||
          t.status === "at_pickup" ||
          t.status === "loaded" ||
          t.status === "in_transit" ||
          t.status === "at_destination",
      );
    }
    if (filter === "delivered") {
      return trips.filter((t) => t.status === "delivered" || t.status === "closed");
    }
    return trips;
  }, [trips, filter]);

  const counts = useMemo(() => {
    return {
      all: trips.length,
      awaiting: trips.filter(
        (t) =>
          t.status === "requested" ||
          t.status === "assignment_pending" ||
          t.status === "assigned" ||
          t.status === "shipper_confirmed",
      ).length,
      in_progress: trips.filter(
        (t) =>
          t.status === "vehicle_en_route" ||
          t.status === "at_pickup" ||
          t.status === "loaded" ||
          t.status === "in_transit" ||
          t.status === "at_destination",
      ).length,
      delivered: trips.filter((t) => t.status === "delivered" || t.status === "closed")
        .length,
    };
  }, [trips]);

  if (initialLoading) {
    return (
      <Screen padded={false}>
        <Container>
          <View style={styles.headerWrap}>
            <Text variant="h1">Requests</Text>
            <Text
              variant="body"
              color={colors.text.secondary}
              style={{ marginTop: 2 }}
            >
              All your transport requests
            </Text>
          </View>
          <View style={styles.listContent}>
            <TripCardSkeleton />
            <TripCardSkeleton />
            <TripCardSkeleton />
          </View>
        </Container>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Container>
        <View style={styles.headerWrap}>
          <Text variant="h1">Requests</Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ marginTop: 2 }}
          >
            {trips.length} {trips.length === 1 ? "trip" : "trips"} total
          </Text>
        </View>

        <View style={styles.filterBar}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count = counts[f.key];
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  variant="caption"
                  color={active ? colors.text.inverse : colors.text.secondary}
                  style={{ fontWeight: "600", fontSize: 13 }}
                >
                  {f.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.filterCount,
                      active
                        ? { backgroundColor: "rgba(255,255,255,0.25)" }
                        : { backgroundColor: colors.surface.sunken },
                    ]}
                  >
                    <Text
                      variant="caption"
                      color={active ? colors.text.inverse : colors.text.tertiary}
                      style={{ fontSize: 10, fontWeight: "700", lineHeight: 12 }}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text variant="bodySmall" color={colors.status.danger.fg}>
              {error}
            </Text>
            <Pressable
              onPress={() => loadTrips()}
              style={{ marginTop: spacing[2] }}
            >
              <Text variant="label" color={colors.brand.primary}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {!error && filteredTrips.length === 0 ? (
          <View style={{ flex: 1 }}>
            {trips.length === 0 ? (
              <EmptyState
                icon={
                  <Truck size={32} color={colors.brand.primary} strokeWidth={1.5} />
                }
                title="No trips yet"
                description="Create your first transport request and it will appear here."
                actionLabel="Create a trip"
                onAction={() => router.push("/(app)/trips/new")}
              />
            ) : (
              <EmptyState
                icon={
                  <Package
                    size={32}
                    color={colors.brand.primary}
                    strokeWidth={1.5}
                  />
                }
                title="Nothing here"
                description={`You have no ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} trips right now.`}
                actionLabel="Show all trips"
                onAction={() => setFilter("all")}
              />
            )}
          </View>
        ) : (
          <FlatList
            data={filteredTrips}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadTrips(true)}
                tintColor={colors.brand.primary}
              />
            }
            renderItem={({ item, index }) => (
              <FadeIn delay={index * 30} distance={6}>
                <TripCard
                  trip={item}
                  onPress={() => router.push(`/(app)/trips/${item.id}`)}
                />
              </FadeIn>
            )}
          />
        )}
      </Container>
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
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text variant="caption" color={colors.text.tertiary}>
          {trip.reference}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusMeta.bg, borderColor: statusMeta.border },
          ]}
        >
          <Text
            variant="caption"
            color={statusMeta.fg}
            style={{ fontSize: 11, fontWeight: "600", lineHeight: 14 }}
          >
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <Text
        variant="bodyMedium"
        color={colors.text.primary}
        style={{ marginTop: spacing[2] }}
        numberOfLines={2}
      >
        {trip.cargo_description}
      </Text>

      <View style={styles.routeRow}>
        <View style={styles.routePoint}>
          <MapPin size={12} color={colors.text.tertiary} strokeWidth={2.5} />
          <Text
            variant="caption"
            color={colors.text.secondary}
            numberOfLines={1}
            style={{ flex: 1, marginLeft: 4 }}
          >
            {trip.pickup_address}
          </Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <MapPin size={12} color={colors.brand.primary} strokeWidth={2.5} />
          <Text
            variant="caption"
            color={colors.text.secondary}
            numberOfLines={1}
            style={{ flex: 1, marginLeft: 4 }}
          >
            {trip.destination_address}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.metaItem}>
          <Text variant="caption" color={colors.text.tertiary}>
            {distanceKm} km
          </Text>
        </View>
        <View style={styles.metaDot} />
        <View style={styles.metaItem}>
          <Text variant="caption" color={colors.text.tertiary}>
            {trip.cargo_weight_kg.toLocaleString()} kg
          </Text>
        </View>
        <View style={styles.metaDot} />
        <View style={styles.metaItem}>
          <Clock size={11} color={colors.text.tertiary} strokeWidth={2} />
          <Text
            variant="caption"
            color={colors.text.tertiary}
            style={{ marginLeft: 3 }}
          >
            {pickupDate.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <ArrowRight size={16} color={colors.text.tertiary} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

function getStatusMeta(status: TransportTripSummary["status"]): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  switch (status) {
    case "requested":
    case "assignment_pending":
      return {
        label: "Awaiting",
        bg: colors.status.info.bg,
        fg: colors.status.info.fg,
        border: colors.status.info.border,
      };
    case "assigned":
    case "shipper_confirmed":
      return {
        label: "Assigned",
        bg: colors.status.accent.bg,
        fg: colors.status.accent.fg,
        border: colors.status.accent.border,
      };
    case "vehicle_en_route":
    case "at_pickup":
    case "loaded":
      return {
        label: "Pickup",
        bg: colors.brand.accentMuted,
        fg: colors.brand.accent,
        border: colors.brand.accent,
      };
    case "in_transit":
    case "at_destination":
      return {
        label: "In transit",
        bg: colors.brand.accentMuted,
        fg: colors.brand.accent,
        border: colors.brand.accent,
      };
    case "delivered":
    case "closed":
      return {
        label: "Delivered",
        bg: colors.status.success.bg,
        fg: colors.status.success.fg,
        border: colors.status.success.border,
      };
    case "cancelled":
    case "failed":
    case "disputed":
      return {
        label: "Cancelled",
        bg: colors.status.danger.bg,
        fg: colors.status.danger.fg,
        border: colors.status.danger.border,
      };
    default:
      return {
        label: status,
        bg: colors.status.neutral.bg,
        fg: colors.status.neutral.fg,
        border: colors.status.neutral.border,
      };
  }
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing[5],
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.full,
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  listContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  card: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  routeRow: {
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "center",
  },
  routePoint: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  routeLine: {
    width: 16,
    height: 1,
    backgroundColor: colors.border.strong,
    marginHorizontal: spacing[1],
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.text.tertiary,
    marginHorizontal: spacing[2],
  },
  errorBox: {
    marginHorizontal: spacing[5],
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginBottom: spacing[3],
  },
});


































































// import { useCallback, useState, useMemo } from "react";
// import {
//   View,
//   StyleSheet,
//   FlatList,
//   RefreshControl,
//   ActivityIndicator,
// } from "react-native";
// import { useRouter, useFocusEffect } from "expo-router";
// import {
//   Truck,
//   ArrowRight,
//   Package,
//   MapPin,
//   Clock,
//   CheckCircle2,
//   Plus,
// } from "lucide-react-native";
// import { Screen } from "@/components/Screen";
// import { Text } from "@/components/Text";
// import { Pressable } from "@/components/Pressable";
// import { TripCardSkeleton } from "@/components/Skeleton";
// import { EmptyState } from "@/components/EmptyState";
// import { FadeIn } from "@/components/FadeIn";
// import { api } from "@/lib/api/client";
// import { useRelativeTime } from "@/hooks/useRelativeTime";
// import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
// import type { TransportTripSummary } from "@/lib/api/types";

// type FilterKey = "all" | "awaiting" | "in_progress" | "delivered";

// const FILTERS: { key: FilterKey; label: string }[] = [
//   { key: "all", label: "All" },
//   { key: "awaiting", label: "Awaiting" },
//   { key: "in_progress", label: "In Progress" },
//   { key: "delivered", label: "Delivered" },
// ];

// export default function RequestsTab() {
//   const router = useRouter();
//   const [trips, setTrips] = useState<TransportTripSummary[]>([]);
//   const [filter, setFilter] = useState<FilterKey>("all");
//   const [initialLoading, setInitialLoading] = useState(true);
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const loadTrips = useCallback(async (showRefresh = false) => {
//     if (showRefresh) setIsRefreshing(true);
//     setError(null);
//     try {
//       const result = await api.listTrips({ limit: 100 });
//       setTrips(result.transport_requests ?? []);
//     } catch (err) {
//       setError(err instanceof Error ? err.message : "Unable to load trips.");
//     } finally {
//       setInitialLoading(false);
//       setIsRefreshing(false);
//     }
//   }, []);

//   useFocusEffect(
//     useCallback(() => {
//       loadTrips();
//     }, [loadTrips]),
//   );

//   // Filter trips by the selected segment
//   const filteredTrips = useMemo(() => {
//     if (filter === "all") return trips;
//     if (filter === "awaiting") {
//       return trips.filter(
//         (t) =>
//           t.status === "requested" ||
//           t.status === "assignment_pending" ||
//           t.status === "assigned" ||
//           t.status === "shipper_confirmed",
//       );
//     }
//     if (filter === "in_progress") {
//       return trips.filter(
//         (t) =>
//           t.status === "vehicle_en_route" ||
//           t.status === "at_pickup" ||
//           t.status === "loaded" ||
//           t.status === "in_transit" ||
//           t.status === "at_destination",
//       );
//     }
//     if (filter === "delivered") {
//       return trips.filter((t) => t.status === "delivered" || t.status === "closed");
//     }
//     return trips;
//   }, [trips, filter]);

//   // Counts per filter, for the small count badges on the segmented control
//   const counts = useMemo(() => {
//     return {
//       all: trips.length,
//       awaiting: trips.filter(
//         (t) =>
//           t.status === "requested" ||
//           t.status === "assignment_pending" ||
//           t.status === "assigned" ||
//           t.status === "shipper_confirmed",
//       ).length,
//       in_progress: trips.filter(
//         (t) =>
//           t.status === "vehicle_en_route" ||
//           t.status === "at_pickup" ||
//           t.status === "loaded" ||
//           t.status === "in_transit" ||
//           t.status === "at_destination",
//       ).length,
//       delivered: trips.filter((t) => t.status === "delivered" || t.status === "closed")
//         .length,
//     };
//   }, [trips]);

//   if (initialLoading) {
//     return (
//       <Screen padded={false}>
//         <View style={styles.headerWrap}>
//           <Text variant="h1">Requests</Text>
//           <Text
//             variant="body"
//             color={colors.text.secondary}
//             style={{ marginTop: 2 }}
//           >
//             All your transport requests
//           </Text>
//         </View>
//         <View style={styles.listContent}>
//           <TripCardSkeleton />
//           <TripCardSkeleton />
//           <TripCardSkeleton />
//         </View>
//       </Screen>
//     );
//   }

//   return (
//     <Screen padded={false}>
//       <View style={styles.headerWrap}>
//         <Text variant="h1">Requests</Text>
//         <Text
//           variant="body"
//           color={colors.text.secondary}
//           style={{ marginTop: 2 }}
//         >
//           {trips.length} {trips.length === 1 ? "trip" : "trips"} total
//         </Text>
//       </View>

//       {/* Segmented filter */}
//       <View style={styles.filterBar}>
//         {FILTERS.map((f) => {
//           const active = filter === f.key;
//           const count = counts[f.key];
//           return (
//             <Pressable
//               key={f.key}
//               onPress={() => setFilter(f.key)}
//               style={[
//                 styles.filterChip,
//                 active && styles.filterChipActive,
//               ]}
//             >
//               <Text
//                 variant="caption"
//                 color={active ? colors.text.inverse : colors.text.secondary}
//                 style={{ fontWeight: "600", fontSize: 13 }}
//               >
//                 {f.label}
//               </Text>
//               {count > 0 && (
//                 <View
//                   style={[
//                     styles.filterCount,
//                     active
//                       ? { backgroundColor: "rgba(255,255,255,0.25)" }
//                       : { backgroundColor: colors.surface.sunken },
//                   ]}
//                 >
//                   <Text
//                     variant="caption"
//                     color={active ? colors.text.inverse : colors.text.tertiary}
//                     style={{ fontSize: 10, fontWeight: "700", lineHeight: 12 }}
//                   >
//                     {count}
//                   </Text>
//                 </View>
//               )}
//             </Pressable>
//           );
//         })}
//       </View>

//       {error && (
//         <View style={styles.errorBox}>
//           <Text variant="bodySmall" color={colors.status.danger.fg}>
//             {error}
//           </Text>
//           <Pressable
//             onPress={() => loadTrips()}
//             style={{ marginTop: spacing[2] }}
//           >
//             <Text variant="label" color={colors.brand.primary}>
//               Retry
//             </Text>
//           </Pressable>
//         </View>
//       )}

//       {!error && filteredTrips.length === 0 ? (
//         <View style={{ flex: 1 }}>
//           {trips.length === 0 ? (
//             <EmptyState
//               icon={<Truck size={32} color={colors.brand.primary} strokeWidth={1.5} />}
//               title="No trips yet"
//               description="Create your first transport request and it will appear here."
//               actionLabel="Create a trip"
//               onAction={() => router.push("/(app)/trips/new")}
//             />
//           ) : (
//             <EmptyState
//               icon={<Package size={32} color={colors.brand.primary} strokeWidth={1.5} />}
//               title="Nothing here"
//               description={`You have no ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} trips right now.`}
//               actionLabel="Show all trips"
//               onAction={() => setFilter("all")}
//             />
//           )}
//         </View>
//       ) : (
//         <FlatList
//           data={filteredTrips}
//           keyExtractor={(item) => item.id}
//           contentContainerStyle={styles.listContent}
//           showsVerticalScrollIndicator={false}
//           refreshControl={
//             <RefreshControl
//               refreshing={isRefreshing}
//               onRefresh={() => loadTrips(true)}
//               tintColor={colors.brand.primary}
//             />
//           }
//           renderItem={({ item, index }) => (
//             <FadeIn delay={index * 30} distance={6}>
//               <TripCard
//                 trip={item}
//                 onPress={() => router.push(`/(app)/trips/${item.id}`)}
//               />
//             </FadeIn>
//           )}
//         />
//       )}
//     </Screen>
//   );
// }

// function TripCard({
//   trip,
//   onPress,
// }: {
//   trip: TransportTripSummary;
//   onPress: () => void;
// }) {
//   const distanceKm = (trip.straight_line_distance_m / 1000).toFixed(0);
//   const statusMeta = getStatusMeta(trip.status);
//   const pickupDate = new Date(trip.pickup_window_start);
//   const relativeTime = useRelativeTime(trip.created_at);

//   return (
//     <Pressable onPress={onPress} style={styles.card}>
//       {/* Header row: reference + status badge */}
//       <View style={styles.cardHeader}>
//         <Text variant="caption" color={colors.text.tertiary}>
//           {trip.reference}
//         </Text>
//         <View
//           style={[
//             styles.statusBadge,
//             { backgroundColor: statusMeta.bg, borderColor: statusMeta.border },
//           ]}
//         >
//           <Text
//             variant="caption"
//             color={statusMeta.fg}
//             style={{ fontSize: 11, fontWeight: "600", lineHeight: 14 }}
//           >
//             {statusMeta.label}
//           </Text>
//         </View>
//       </View>

//       {/* Cargo description */}
//       <Text
//         variant="bodyMedium"
//         color={colors.text.primary}
//         style={{ marginTop: spacing[2] }}
//         numberOfLines={2}
//       >
//         {trip.cargo_description}
//       </Text>

//       {/* Route */}
//       <View style={styles.routeRow}>
//         <View style={styles.routePoint}>
//           <MapPin size={12} color={colors.text.tertiary} strokeWidth={2.5} />
//           <Text
//             variant="caption"
//             color={colors.text.secondary}
//             numberOfLines={1}
//             style={{ flex: 1, marginLeft: 4 }}
//           >
//             {trip.pickup_address}
//           </Text>
//         </View>
//         <View style={styles.routeLine} />
//         <View style={styles.routePoint}>
//           <MapPin size={12} color={colors.brand.primary} strokeWidth={2.5} />
//           <Text
//             variant="caption"
//             color={colors.text.secondary}
//             numberOfLines={1}
//             style={{ flex: 1, marginLeft: 4 }}
//           >
//             {trip.destination_address}
//           </Text>
//         </View>
//       </View>

//       {/* Footer metadata */}
//       <View style={styles.cardFooter}>
//         <View style={styles.metaItem}>
//           <Text variant="caption" color={colors.text.tertiary}>
//             {distanceKm} km
//           </Text>
//         </View>
//         <View style={styles.metaDot} />
//         <View style={styles.metaItem}>
//           <Text variant="caption" color={colors.text.tertiary}>
//             {trip.cargo_weight_kg.toLocaleString()} kg
//           </Text>
//         </View>
//         <View style={styles.metaDot} />
//         <View style={styles.metaItem}>
//           <Clock size={11} color={colors.text.tertiary} strokeWidth={2} />
//           <Text
//             variant="caption"
//             color={colors.text.tertiary}
//             style={{ marginLeft: 3 }}
//           >
//             {pickupDate.toLocaleDateString(undefined, {
//               month: "short",
//               day: "numeric",
//             })}
//           </Text>
//         </View>
//         <View style={{ flex: 1 }} />
//         <ArrowRight size={16} color={colors.text.tertiary} strokeWidth={2} />
//       </View>
//     </Pressable>
//   );
// }

// function getStatusMeta(status: TransportTripSummary["status"]): {
//   label: string;
//   bg: string;
//   fg: string;
//   border: string;
// } {
//   switch (status) {
//     case "requested":
//     case "assignment_pending":
//       return {
//         label: "Awaiting",
//         bg: colors.status.info.bg,
//         fg: colors.status.info.fg,
//         border: colors.status.info.border,
//       };
//     case "assigned":
//     case "shipper_confirmed":
//       return {
//         label: "Assigned",
//         bg: colors.status.accent.bg,
//         fg: colors.status.accent.fg,
//         border: colors.status.accent.border,
//       };
//     case "vehicle_en_route":
//     case "at_pickup":
//     case "loaded":
//       return {
//         label: "Pickup",
//         bg: colors.brand.accentMuted,
//         fg: colors.brand.accent,
//         border: colors.brand.accent,
//       };
//     case "in_transit":
//     case "at_destination":
//       return {
//         label: "In transit",
//         bg: colors.brand.accentMuted,
//         fg: colors.brand.accent,
//         border: colors.brand.accent,
//       };
//     case "delivered":
//     case "closed":
//       return {
//         label: "Delivered",
//         bg: colors.status.success.bg,
//         fg: colors.status.success.fg,
//         border: colors.status.success.border,
//       };
//     case "cancelled":
//     case "failed":
//     case "disputed":
//       return {
//         label: "Cancelled",
//         bg: colors.status.danger.bg,
//         fg: colors.status.danger.fg,
//         border: colors.status.danger.border,
//       };
//     default:
//       return {
//         label: status,
//         bg: colors.status.neutral.bg,
//         fg: colors.status.neutral.fg,
//         border: colors.status.neutral.border,
//       };
//   }
// }

// const styles = StyleSheet.create({
//   headerWrap: {
//     paddingHorizontal: spacing[5],
//     paddingTop: spacing[4],
//     paddingBottom: spacing[4],
//   },
//   filterBar: {
//     flexDirection: "row",
//     paddingHorizontal: spacing[5],
//     gap: spacing[2],
//     marginBottom: spacing[4],
//   },
//   filterChip: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingVertical: spacing[2],
//     paddingHorizontal: spacing[3],
//     borderRadius: radii.full,
//     backgroundColor: colors.surface.raised,
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     gap: 4,
//   },
//   filterChipActive: {
//     backgroundColor: colors.brand.primary,
//     borderColor: colors.brand.primary,
//   },
//   filterCount: {
//     minWidth: 18,
//     height: 18,
//     borderRadius: 9,
//     alignItems: "center",
//     justifyContent: "center",
//     paddingHorizontal: 4,
//   },
//   listContent: {
//     paddingHorizontal: spacing[5],
//     paddingBottom: spacing[8],
//     gap: spacing[3],
//   },
//   card: {
//     backgroundColor: colors.surface.raised,
//     borderRadius: radii.lg,
//     padding: spacing[4],
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     ...elevation.subtle,
//   },
//   cardHeader: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   statusBadge: {
//     paddingHorizontal: spacing[2],
//     paddingVertical: 3,
//     borderRadius: radii.full,
//     borderWidth: 1,
//   },
//   routeRow: {
//     marginTop: spacing[3],
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   routePoint: {
//     flex: 1,
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   routeLine: {
//     width: 16,
//     height: 1,
//     backgroundColor: colors.border.strong,
//     marginHorizontal: spacing[1],
//   },
//   cardFooter: {
//     flexDirection: "row",
//     alignItems: "center",
//     marginTop: spacing[3],
//     paddingTop: spacing[3],
//     borderTopWidth: 1,
//     borderTopColor: colors.border.subtle,
//   },
//   metaItem: {
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   metaDot: {
//     width: 3,
//     height: 3,
//     borderRadius: 1.5,
//     backgroundColor: colors.text.tertiary,
//     marginHorizontal: spacing[2],
//   },
//   errorBox: {
//     marginHorizontal: spacing[5],
//     padding: spacing[3],
//     backgroundColor: colors.status.danger.bg,
//     borderRadius: radii.md,
//     marginBottom: spacing[3],
//   },
// });