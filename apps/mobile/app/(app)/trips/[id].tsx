import { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Share,
  Platform,
  Pressable as RNPressable,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronLeft,
  Copy,
  Share2,
  Shield,
  MapPin,
  Truck,
  Package,
  Check,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { FadeIn } from "@/components/FadeIn";
import { RouteVisual } from "@/components/RouteVisual";
import { Timeline } from "@/components/Timeline";
import { DetailRow } from "@/components/DetailRow";
import { Skeleton } from "@/components/Skeleton";
import { Container } from "@/components/Container";
import { api, HttpError } from "@/lib/api/client";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import type { TripDetail } from "@/lib/api/types";

export default function TripDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTrip(id);
      setDetail(result);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 404) {
          setError("Trip not found.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Unable to load trip details.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const trip = detail?.transport_request;
  const policy = detail?.insurance_policy;
  const events = detail?.events ?? [];

  // Copy reference to clipboard
  const handleCopyReference = async () => {
    if (!trip) return;
    try {
      await Clipboard.setStringAsync(trip.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  // Share trip via native share sheet
  const handleShare = async () => {
    if (!trip) return;
    try {
      await Share.share({
        message: `ELBER MARKET trip ${trip.reference}\n${trip.cargo_description}\n${trip.pickup_address} → ${trip.destination_address}`,
      });
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <Container>
          <View style={styles.headerWrap}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <ChevronLeft size={24} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.content}>
            <Skeleton width="40%" height={14} />
            <Skeleton width="90%" height={32} style={{ marginTop: 12 }} />
            <Skeleton width={80} height={28} borderRadius={14} style={{ marginTop: 12 }} />
            <Skeleton width="100%" height={180} style={{ marginTop: 24 }} />
            <Skeleton width="100%" height={120} style={{ marginTop: 16 }} />
            <Skeleton width="100%" height={200} style={{ marginTop: 16 }} />
          </View>
        </Container>
      </Screen>
    );
  }

  if (error || !detail || !trip) {
    return (
      <Screen padded={false}>
        <Container>
          <View style={styles.headerWrap}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <ChevronLeft size={24} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.errorContainer}>
            <Text variant="h2" style={{ textAlign: "center" }}>
              {error === "Trip not found." ? "Trip not found" : "Couldn't load trip"}
            </Text>
            <Text
              variant="body"
              color={colors.text.secondary}
              style={{ marginTop: spacing[2], textAlign: "center" }}
            >
              {error}
            </Text>
            <Pressable onPress={load} style={styles.retryButton}>
              <Text variant="label" color={colors.brand.primary}>
                Retry
              </Text>
            </Pressable>
          </View>
        </Container>
      </Screen>
    );
  }

  // const distanceKm = trip.straight_line_distance_m / 1000;
  const distanceKm = trip.straight_line_distance_m
  ? trip.straight_line_distance_m / 1000
  : 0;
  const pickupDate = new Date(trip.pickup_window_start);
  const statusMeta = getStatusMeta(trip.status);

  // Sort events most recent first
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  return (
    <Screen padded={false}>
      <Container>
        <View style={styles.headerWrap}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text
            variant="label"
            color={colors.text.secondary}
            style={{ marginLeft: spacing[2] }}
          >
            Trip detail
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={handleCopyReference} style={styles.headerAction}>
            {copied ? (
              <Check size={20} color={colors.status.success.fg} strokeWidth={2.5} />
            ) : (
              <Copy size={20} color={colors.text.secondary} strokeWidth={2} />
            )}
          </Pressable>
          <Pressable onPress={handleShare} style={styles.headerAction}>
            <Share2 size={20} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <FadeIn>
            <Text variant="caption" color={colors.text.tertiary}>
              {trip.reference}
            </Text>
            <Text variant="h1" style={{ marginTop: spacing[1] }}>
              {trip.cargo_description}
            </Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusMeta.bg, borderColor: statusMeta.border },
                ]}
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
          </FadeIn>

          {/* Route visualisation */}
          <FadeIn delay={80}>
            <View style={{ marginTop: spacing[6] }}>
              <RouteVisual
                pickupAddress={trip.pickup_address}
                destinationAddress={trip.destination_address}
                distanceKm={distanceKm}
              />
            </View>
          </FadeIn>

          {/* Info grid */}
          <FadeIn delay={160}>
            <View style={styles.card}>
              <Text
                variant="overline"
                color={colors.text.tertiary}
                style={{ marginBottom: spacing[2] }}
              >
                Details
              </Text>
              <DetailRow
                label="Weight"
                value={`${trip.cargo_weight_kg.toLocaleString()} kg`}
              />
              <DetailRow
                label="Declared value"
                value={`${trip.cargo_currency} ${trip.cargo_declared_value.toLocaleString()}`}
              />
              <DetailRow
                label="Pickup window"
                value={`${pickupDate.toLocaleDateString()} ${pickupDate.toLocaleTimeString(
                  [],
                  { hour: "2-digit", minute: "2-digit" },
                )}`}
              />
              <DetailRow
                label="Requested"
                value={new Date(trip.requested_at).toLocaleDateString()}
              />
              {trip.external_reference && (
                <DetailRow label="Your reference" value={trip.external_reference} />
              )}
            </View>
          </FadeIn>

          {/* Insurance card */}
          {policy && (
            <FadeIn delay={240}>
              <View style={styles.insuranceCard}>
                <View style={styles.insuranceHeader}>
                  <View style={styles.insuranceIcon}>
                    <Shield size={18} color={colors.text.inverse} strokeWidth={2.5} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing[3] }}>
                    <Text variant="overline" color="rgba(255,255,255,0.65)">
                      Cargo insurance
                    </Text>
                    <Text
                      variant="bodyMedium"
                      color={colors.text.inverse}
                      style={{ marginTop: 2 }}
                    >
                      {policy.reference}
                    </Text>
                  </View>
                  <View style={styles.insuranceStatus}>
                    <Text
                      variant="caption"
                      color={colors.text.inverse}
                      style={{ fontWeight: "600" }}
                    >
                      {policy.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.insuranceStats}>
                  <View style={styles.insuranceStat}>
                    <Text variant="caption" color="rgba(255,255,255,0.65)">
                      Coverage
                    </Text>
                    <Text
                      variant="numeric"
                      color={colors.text.inverse}
                      style={{ marginTop: 4, fontSize: 20 }}
                    >
                      {policy.currency} {policy.coverage_amount.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.insuranceStat}>
                    <Text variant="caption" color="rgba(255,255,255,0.65)">
                      Premium
                    </Text>
                    <Text
                      variant="numeric"
                      color={colors.text.inverse}
                      style={{ marginTop: 4, fontSize: 20 }}
                    >
                      {policy.currency} {policy.premium_amount.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <Text
                  variant="caption"
                  color="rgba(255,255,255,0.55)"
                  style={{ marginTop: spacing[4] }}
                >
                  Covered from pickup through delivery
                </Text>
              </View>
            </FadeIn>
          )}

          {/* Timeline */}
          <FadeIn delay={320}>
            <View style={{ marginTop: spacing[6] }}>
              <Text variant="h2" style={{ marginBottom: spacing[3] }}>
                Activity
              </Text>
              <Timeline
                events={sortedEvents.map((e) => ({
                  id: e.id,
                  eventType: e.event_type,
                  statusBefore: e.status_before,
                  statusAfter: e.status_after,
                  occurredAt: e.occurred_at,
                }))}
              />
            </View>
          </FadeIn>
        </ScrollView>
      </Container>
    </Screen>
  );
}

function getStatusMeta(status: string): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  switch (status) {
    case "requested":
    case "assignment_pending":
      return {
        label: "Awaiting assignment",
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
      return {
        label: "At pickup",
        bg: colors.brand.accentMuted,
        fg: colors.brand.accent,
        border: colors.brand.accent,
      };
    case "loaded":
    case "in_transit":
      return {
        label: "In transit",
        bg: colors.brand.accentMuted,
        fg: colors.brand.accent,
        border: colors.brand.accent,
      };
    case "at_destination":
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
        label: status.replace(/_/g, " "),
        bg: colors.status.neutral.bg,
        fg: colors.status.neutral.fg,
        border: colors.status.neutral.border,
      };
  }
}

const styles = StyleSheet.create({
  headerWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  headerAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    marginLeft: spacing[1],
  },
  content: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  statusRow: {
    flexDirection: "row",
    marginTop: spacing[3],
  },
  statusBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  card: {
    marginTop: spacing[6],
    padding: spacing[5],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  insuranceCard: {
    marginTop: spacing[4],
    padding: spacing[5],
    backgroundColor: colors.brand.primary,
    borderRadius: radii.lg,
    ...elevation.medium,
  },
  insuranceHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  insuranceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  insuranceStatus: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  insuranceStats: {
    flexDirection: "row",
    marginTop: spacing[4],
    gap: spacing[5],
  },
  insuranceStat: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  retryButton: {
    marginTop: spacing[5],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
});


























































































// import { useCallback, useState } from "react";
// import {
//   View,
//   StyleSheet,
//   ScrollView,
//   Pressable,
//   ActivityIndicator,
// } from "react-native";
// import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
// import { Screen } from "@/components/Screen";
// import { Text } from "@/components/Text";
// import { api } from "@/lib/api/client";
// import { colors, spacing, radii } from "@elbermarket/design-tokens";
// import { TripDetail } from "@/lib/api/types";

// // Trip detail — full information about a single trip, with event timeline.

// export default function TripDetailScreen() {
//   const router = useRouter();
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const [detail, setDetail] = useState<TripDetail | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   const load = useCallback(async () => {
//     if (!id) return;
//     setLoading(true);
//     setError(null);
//     try {
//       const result = await api.getTrip(id);
//       setDetail(result);
//     } catch (err) {
//       setError(
//         err instanceof Error ? err.message : "Unable to load trip details.",
//       );
//     } finally {
//       setLoading(false);
//     }
//   }, [id]);

//   useFocusEffect(
//     useCallback(() => {
//       load();
//     }, [load]),
//   );

//   if (loading) {
//     return (
//       <Screen>
//         <View style={styles.center}>
//           <ActivityIndicator color={colors.brand.primary} />
//         </View>
//       </Screen>
//     );
//   }

//   if (error || !detail) {
//     return (
//       <Screen>
//         <View style={styles.header}>
//           <Pressable onPress={() => router.back()}>
//             <Text variant="label" color={colors.text.secondary}>
//               ← Back
//             </Text>
//           </Pressable>
//         </View>
//         <View style={styles.center}>
//           <Text variant="body" color={colors.status.danger.fg}>
//             {error || "Trip not found."}
//           </Text>
//           <Pressable onPress={load} style={{ marginTop: spacing[4] }}>
//             <Text variant="label" color={colors.brand.primary}>
//               Retry
//             </Text>
//           </Pressable>
//         </View>
//       </Screen>
//     );
//   }

//   const trip = detail.transport_request;
//   const policy = detail.insurance_policy;
//   const distanceKm = (trip.straight_line_distance_m / 1000).toFixed(1);

//   return (
//     <Screen padded={false}>
//       <ScrollView contentContainerStyle={styles.content}>
//         <Pressable onPress={() => router.back()} style={styles.backButton}>
//           <Text variant="label" color={colors.text.secondary}>
//             ← Back
//           </Text>
//         </Pressable>

//         <Text variant="label" color={colors.text.tertiary}>
//           {trip.reference}
//         </Text>
//         <Text variant="h1" style={{ marginTop: spacing[1] }}>
//           {trip.cargo_description}
//         </Text>

//         <View style={styles.statusRow}>
//           <View style={[styles.statusBadge, { backgroundColor: colors.status.info.bg }]}>
//             <Text variant="caption" color={colors.status.info.fg} style={{ fontWeight: "600" }}>
//               {trip.status}
//             </Text>
//           </View>
//         </View>

//         {/* Route */}
//         <View style={styles.section}>
//           <Text variant="overline" color={colors.text.tertiary}>
//             Route
//           </Text>
//           <View style={styles.routeBlock}>
//             <View style={styles.routePoint}>
//               <Text variant="caption" color={colors.text.tertiary}>
//                 From
//               </Text>
//               <Text variant="bodyMedium" style={{ marginTop: spacing[1] }}>
//                 {trip.pickup_address}
//               </Text>
//             </View>
//             <Text variant="body" color={colors.text.tertiary} style={styles.routeArrow}>
//               ↓
//             </Text>
//             <View style={styles.routePoint}>
//               <Text variant="caption" color={colors.text.tertiary}>
//                 To
//               </Text>
//               <Text variant="bodyMedium" style={{ marginTop: spacing[1] }}>
//                 {trip.destination_address}
//               </Text>
//             </View>
//           </View>
//           <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: spacing[3] }}>
//             {distanceKm} km straight-line distance
//           </Text>
//         </View>

//         {/* Cargo */}
//         <View style={styles.section}>
//           <Text variant="overline" color={colors.text.tertiary}>
//             Cargo
//           </Text>
//           <InfoRow
//             label="Weight"
//             value={`${trip.cargo_weight_kg.toLocaleString()} kg`}
//           />
//           <InfoRow
//             label="Declared value"
//             value={`${trip.cargo_currency} ${trip.cargo_declared_value.toLocaleString()}`}
//           />
//           {trip.external_reference && (
//             <InfoRow label="Reference" value={trip.external_reference} />
//           )}
//         </View>

//         {/* Pickup window */}
//         <View style={styles.section}>
//           <Text variant="overline" color={colors.text.tertiary}>
//             Pickup window
//           </Text>
//           <InfoRow
//             label="Start"
//             value={new Date(trip.pickup_window_start).toLocaleString()}
//           />
//           <InfoRow
//             label="End"
//             value={new Date(trip.pickup_window_end).toLocaleString()}
//           />
//         </View>

//         {/* Insurance */}
//         {policy && (
//           <View style={styles.section}>
//             <Text variant="overline" color={colors.text.tertiary}>
//               Insurance
//             </Text>
//             <InfoRow label="Policy" value={policy.reference} />
//             <InfoRow
//               label="Coverage"
//               value={`${policy.currency} ${policy.coverage_amount.toLocaleString()}`}
//             />
//             <InfoRow
//               label="Premium"
//               value={`${policy.currency} ${policy.premium_amount.toLocaleString()}`}
//             />
//             <InfoRow label="Status" value={policy.status} />
//           </View>
//         )}

//         {/* Event timeline */}
//         <View style={styles.section}>
//           <Text variant="overline" color={colors.text.tertiary}>
//             Timeline
//           </Text>
//           <View style={styles.timeline}>
//             {detail.events.map((event, idx) => (
//               <View key={event.id} style={styles.timelineRow}>
//                 <View style={styles.timelineDot} />
//                 <View style={styles.timelineContent}>
//                   <Text variant="bodyMedium" style={{ textTransform: "capitalize" }}>
//                     {event.event_type.replace(/_/g, " ")}
//                   </Text>
//                   {event.status_after && (
//                     <Text variant="bodySmall" color={colors.text.secondary}>
//                       {event.status_before ? `→ ${event.status_after}` : event.status_after}
//                     </Text>
//                   )}
//                   <Text variant="caption" color={colors.text.tertiary}>
//                     {new Date(event.occurred_at).toLocaleString()}
//                   </Text>
//                 </View>
//               </View>
//             ))}
//           </View>
//         </View>
//       </ScrollView>
//     </Screen>
//   );
// }

// function InfoRow({ label, value }: { label: string; value: string }) {
//   return (
//     <View style={styles.infoRow}>
//       <Text variant="bodySmall" color={colors.text.tertiary}>
//         {label}
//       </Text>
//       <Text
//         variant="bodySmall"
//         color={colors.text.primary}
//         style={{ flex: 1, textAlign: "right" }}
//         numberOfLines={2}
//       >
//         {value}
//       </Text>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   content: {
//     padding: spacing[6],
//     paddingBottom: spacing[12],
//   },
//   header: {
//     padding: spacing[6],
//   },
//   backButton: {
//     marginBottom: spacing[6],
//   },
//   center: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   statusRow: {
//     flexDirection: "row",
//     marginTop: spacing[3],
//   },
//   statusBadge: {
//     paddingHorizontal: spacing[3],
//     paddingVertical: spacing[1],
//     borderRadius: 999,
//   },
//   section: {
//     marginTop: spacing[6],
//     padding: spacing[4],
//     backgroundColor: colors.surface.raised,
//     borderRadius: radii.md,
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//   },
//   routeBlock: {
//     marginTop: spacing[3],
//   },
//   routePoint: {},
//   routeArrow: {
//     marginVertical: spacing[1],
//   },
//   infoRow: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "flex-start",
//     paddingVertical: spacing[2],
//   },
//   timeline: {
//     marginTop: spacing[3],
//   },
//   timelineRow: {
//     flexDirection: "row",
//     marginBottom: spacing[4],
//   },
//   timelineDot: {
//     width: 8,
//     height: 8,
//     borderRadius: 4,
//     backgroundColor: colors.brand.primary,
//     marginTop: 6,
//     marginRight: spacing[3],
//   },
//   timelineContent: {
//     flex: 1,
//   },
// });