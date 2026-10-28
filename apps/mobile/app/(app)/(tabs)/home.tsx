import { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Bell,
  Truck,
  ArrowRight,
  Plus,
  MapPin,
  CheckCircle2,
  Clock,
  Package,
  Activity,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { FadeIn } from "@/components/FadeIn";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Pressable } from "@/components/Pressable";
import { StatCardSkeleton, Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api/client";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import type { TripSummaryResponse, RecentEvent } from "@/lib/api/types";
// import { Container } from "@/components/Container";




export default function HomeTab() {
  const router = useRouter();
  const { user, organisations, status: authStatus } = useAuth();
  const [summary, setSummary] = useState<TripSummaryResponse | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [summaryData, unread] = await Promise.all([
        api.getTripSummary(),
        api.unreadNotificationCount(),
      ]);
      setSummary(summaryData);
      setUnreadCount(unread.unread_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load data.");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const { refresh: manualRefresh, isRefreshing, lastUpdated } = useAutoRefresh(
    loadData,
    30000,
  );

  if (authStatus === "authenticated" && organisations.length === 0) {
    router.replace("/(app)/business/type");
    return null;
  }

  const org = organisations[0];
  const firstName = user?.full_name?.split(" ")[0] || "there";
  const greeting = getGreeting();
  const typeLabel = org
    ? org.organisation_type.charAt(0).toUpperCase() +
      org.organisation_type.replace(/_/g, " ").slice(1)
    : "";

  return (
    <Screen padded={false}>
      {/* <Container> */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={manualRefresh}
              tintColor={colors.brand.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Top bar */}
          <FadeIn>
            <View style={styles.topBar}>
              <View style={styles.greetingWrap}>
                <Text variant="caption" color={colors.text.tertiary}>
                  {greeting}
                </Text>
                <Text variant="h1" style={{ marginTop: 2 }} numberOfLines={1}>
                  {firstName}
                </Text>
                {org && (
                  <Text
                    variant="bodySmall"
                    color={colors.text.secondary}
                    style={{ marginTop: 4 }}
                    numberOfLines={1}
                  >
                    {org.legal_name} · {typeLabel}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => router.push("/(app)/notifications")}
                style={styles.bellButton}
              >
                <Bell size={22} color={colors.text.primary} strokeWidth={2} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text
                      variant="caption"
                      color={colors.text.inverse}
                      style={{ fontSize: 10, fontWeight: "700", lineHeight: 12 }}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </FadeIn>

          {/* Stats row */}
          <FadeIn delay={80}>
            <View style={styles.statsRow}>
              {initialLoading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </>
              ) : summary ? (
                <>
                  <StatCard
                    label="Active"
                    value={summary.active_count}
                    color={colors.status.info.fg}
                  />
                  <StatCard
                    label="Delivered"
                    value={summary.delivered_this_month}
                    color={colors.status.success.fg}
                  />
                  <StatCard
                    label="Spent"
                    value={summary.total_spend_this_month}
                    currency={summary.currency}
                    color={colors.brand.primary}
                  />
                </>
              ) : null}
            </View>
          </FadeIn>

          {/* Quick actions */}
          <FadeIn delay={160}>
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => router.push("/(app)/trips/new")}
                style={styles.primaryAction}
              >
                <View style={styles.actionIconWrap}>
                  <Plus size={20} color={colors.text.inverse} strokeWidth={2.5} />
                </View>
                <Text
                  variant="h3"
                  color={colors.text.inverse}
                  style={{ marginTop: spacing[3] }}
                >
                  New Trip
                </Text>
                <Text
                  variant="caption"
                  color="rgba(255,255,255,0.75)"
                  style={{ marginTop: 2 }}
                >
                  Create a request
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/(app)/requests")}
                style={styles.secondaryAction}
              >
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: colors.brand.primaryMuted },
                  ]}
                >
                  <Truck size={20} color={colors.brand.primary} strokeWidth={2.5} />
                </View>
                <Text variant="h3" style={{ marginTop: spacing[3] }}>
                  All Trips
                </Text>
                <Text
                  variant="caption"
                  color={colors.text.tertiary}
                  style={{ marginTop: 2 }}
                >
                  View all requests
                </Text>
              </Pressable>
            </View>
          </FadeIn>

          {/* Recent activity */}
          <FadeIn delay={240}>
            <View style={styles.sectionHeader}>
              <Text variant="h2">Recent activity</Text>
            </View>

            {initialLoading ? (
              <ActivitySkeleton />
            ) : summary && summary.recent_events.length > 0 ? (
              <View style={styles.activityList}>
                {summary.recent_events.map((event, idx) => (
                  <FadeIn
                    key={`${event.trip_id}-${event.occurred_at}`}
                    delay={280 + idx * 40}
                  >
                    <RecentActivityRow
                      event={event}
                      onPress={() => router.push(`/(app)/trips/${event.trip_id}`)}
                    />
                  </FadeIn>
                ))}
              </View>
            ) : (
              <View style={styles.emptyActivity}>
                <Activity size={32} color={colors.text.tertiary} strokeWidth={1.5} />
                <Text
                  variant="body"
                  color={colors.text.secondary}
                  style={{ marginTop: spacing[3], textAlign: "center" }}
                >
                  No activity yet. Create your first transport request to get
                  started.
                </Text>
              </View>
            )}
          </FadeIn>

          {/* Freshness footer */}
          {lastUpdated && (
            <FadeIn delay={400}>
              <View style={styles.freshness}>
                <Text variant="caption" color={colors.text.tertiary}>
                  Updated <RelativeTimestamp date={lastUpdated} />
                </Text>
              </View>
            </FadeIn>
          )}
        </ScrollView>
      {/* </Container> */}
    
    </Screen>
  );
}

function StatCard({
  label,
  value,
  currency,
  color,
}: {
  label: string;
  value: number;
  currency?: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text variant="overline" color={colors.text.tertiary}>
        {label}
      </Text>
      <View style={{ marginTop: 6 }}>
        <AnimatedCounter
          value={value}
          decimals={0}
          prefix={currency ? `${currency} ` : ""}
          variant="numeric"
          color={color}
          style={{
            fontSize: currency ? 16 : 26,
            lineHeight: currency ? 22 : 32,
          }}
        />
      </View>
    </View>
  );
}

function RecentActivityRow({
  event,
  onPress,
}: {
  event: RecentEvent;
  onPress: () => void;
}) {
  const Icon = getEventIcon(event.event_type);
  const iconColor = getEventColor(event.event_type);
  const relativeTime = useRelativeTime(event.occurred_at);

  return (
    <Pressable onPress={onPress} style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: `${iconColor}15` }]}>
        <Icon size={16} color={iconColor} strokeWidth={2.5} />
      </View>
      <View style={styles.activityContent}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {event.trip_reference}
        </Text>
        <Text
          variant="caption"
          color={colors.text.tertiary}
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {formatEventType(event.event_type)} · {relativeTime}
        </Text>
      </View>
      <ArrowRight size={16} color={colors.text.tertiary} strokeWidth={2} />
    </Pressable>
  );
}

function RelativeTimestamp({ date }: { date: Date }) {
  const relative = useRelativeTime(date.toISOString());
  return (
    <Text variant="caption" color={colors.text.tertiary}>
      {relative}
    </Text>
  );
}

function ActivitySkeleton() {
  return (
    <View style={styles.activityList}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.activityRow}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <View style={{ flex: 1, marginLeft: spacing[3] }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning,";
  if (hour < 17) return "Good afternoon,";
  return "Good evening,";
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "created":
      return Package;
    case "assigned":
      return Truck;
    case "picked_up":
    case "in_transit":
      return MapPin;
    case "delivered":
      return CheckCircle2;
    default:
      return Clock;
  }
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case "created":
      return colors.status.info.fg;
    case "assigned":
      return colors.brand.primary;
    case "picked_up":
    case "in_transit":
      return colors.brand.accent;
    case "delivered":
      return colors.status.success.fg;
    default:
      return colors.text.secondary;
  }
}

function formatEventType(eventType: string): string {
  return eventType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing[6],
  },
  greetingWrap: {
    flex: 1,
    marginRight: spacing[4],
  },
  bellButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    position: "relative",
  },
  bellBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    gap: spacing[3],
    marginBottom: spacing[6],
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  actionsRow: {
    flexDirection: "row",
    width: "100%",
    gap: spacing[3],
    marginBottom: spacing[6],
  },
  primaryAction: {
    flex: 1,
    backgroundColor: colors.brand.primary,
    borderRadius: radii.lg,
    padding: spacing[4],
    ...elevation.subtle,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    marginBottom: spacing[3],
  },
  activityList: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
    marginLeft: spacing[3],
    marginRight: spacing[3],
  },
  emptyActivity: {
    padding: spacing[6],
    alignItems: "center",
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderStyle: "dashed",
  },
  freshness: {
    alignItems: "center",
    marginTop: spacing[6],
  },
});


































// import { useCallback, useState } from "react";
// import {
//   View,
//   StyleSheet,
//   ScrollView,
//   RefreshControl,
//   Pressable as RNPressable,
// } from "react-native";
// import { useRouter } from "expo-router";
// import {
//   Bell,
//   Truck,
//   ArrowRight,
//   Plus,
//   MapPin,
//   CheckCircle2,
//   Clock,
//   Package,
//   Activity,
// } from "lucide-react-native";
// import { Screen } from "@/components/Screen";
// import { Text } from "@/components/Text";
// import { FadeIn } from "@/components/FadeIn";
// import { AnimatedCounter } from "@/components/AnimatedCounter";
// import { Pressable } from "@/components/Pressable";
// import { StatCardSkeleton, Skeleton } from "@/components/Skeleton";
// import { EmptyState } from "@/components/EmptyState";
// import { useAuth } from "@/lib/auth/context";
// import { api } from "@/lib/api/client";
// import { useAutoRefresh } from "@/hooks/useAutoRefresh";
// import { useRelativeTime } from "@/hooks/useRelativeTime";
// import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
// import type {
//   TripSummaryResponse,
//   RecentEvent,
// } from "@/lib/api/types";

// export default function HomeTab() {
//   const router = useRouter();
//   const { user, organisations, status: authStatus } = useAuth();
//   const [summary, setSummary] = useState<TripSummaryResponse | null>(null);
//   const [unreadCount, setUnreadCount] = useState(0);
//   const [initialLoading, setInitialLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   const loadData = useCallback(async () => {
//     setError(null);
//     try {
//       const [summaryData, unread] = await Promise.all([
//         api.getTripSummary(),
//         api.unreadNotificationCount(),
//       ]);
//       setSummary(summaryData);
//       setUnreadCount(unread.unread_count);
//     } catch (err) {
//       setError(
//         err instanceof Error ? err.message : "Unable to load data.",
//       );
//     } finally {
//       setInitialLoading(false);
//     }
//   }, []);

//   const { refresh: manualRefresh, isRefreshing, lastUpdated } = useAutoRefresh(
//     loadData,
//     30000,
//   );

//   // No org → route to create one
//   if (authStatus === "authenticated" && organisations.length === 0) {
//     router.replace("/(app)/business/type");
//     return null;
//   }

//   const org = organisations[0];
//   const firstName = user?.full_name?.split(" ")[0] || "there";
//   const greeting = getGreeting();
//   const typeLabel = org
//     ? org.organisation_type.charAt(0).toUpperCase() +
//       org.organisation_type.replace(/_/g, " ").slice(1)
//     : "";

//   return (
//     <Screen padded={false}>
//       <ScrollView
//         contentContainerStyle={styles.scrollContent}
//         refreshControl={
//           <RefreshControl
//             refreshing={isRefreshing}
//             onRefresh={manualRefresh}
//             tintColor={colors.brand.primary}
//           />
//         }
//         showsVerticalScrollIndicator={false}
//       >
//         {/* Top bar with greeting and notification bell */}
//         <FadeIn>
//           <View style={styles.topBar}>
//             <View style={styles.greetingWrap}>
//               <Text variant="caption" color={colors.text.tertiary}>
//                 {greeting}
//               </Text>
//               <Text variant="h1" style={{ marginTop: 2 }} numberOfLines={1}>
//                 {firstName}
//               </Text>
//               {org && (
//                 <Text
//                   variant="bodySmall"
//                   color={colors.text.secondary}
//                   style={{ marginTop: 4 }}
//                   numberOfLines={1}
//                 >
//                   {org.legal_name} · {typeLabel}
//                 </Text>
//               )}
//             </View>
//             <Pressable
//               onPress={() => router.push("/(app)/notifications")}
//               style={styles.bellButton}
//             >
//               <Bell
//                 size={22}
//                 color={colors.text.primary}
//                 strokeWidth={2}
//               />
//               {unreadCount > 0 && (
//                 <View style={styles.bellBadge}>
//                   <Text
//                     variant="caption"
//                     color={colors.text.inverse}
//                     style={{ fontSize: 10, fontWeight: "700", lineHeight: 12 }}
//                   >
//                     {unreadCount > 9 ? "9+" : unreadCount}
//                   </Text>
//                 </View>
//               )}
//             </Pressable>
//           </View>
//         </FadeIn>

//         {/* Stats row */}
//         <FadeIn delay={80}>
//           <View style={styles.statsRow}>
//             {initialLoading ? (
//               <>
//                 <StatCardSkeleton />
//                 <View style={{ width: spacing[3] }} />
//                 <StatCardSkeleton />
//                 <View style={{ width: spacing[3] }} />
//                 <StatCardSkeleton />
//               </>
//             ) : summary ? (
//               <>
//                 <StatCard
//                   label="Active"
//                   value={summary.active_count}
//                   color={colors.status.info.fg}
//                 />
//                 <View style={{ width: spacing[3] }} />
//                 <StatCard
//                   label="Delivered"
//                   value={summary.delivered_this_month}
//                   color={colors.status.success.fg}
//                 />
//                 <View style={{ width: spacing[3] }} />
//                 <StatCard
//                   label="Spent"
//                   value={summary.total_spend_this_month}
//                   currency={summary.currency}
//                   color={colors.brand.primary}
//                 />
//               </>
//             ) : null}
//           </View>
//         </FadeIn>

//         {/* Quick actions */}
//         <FadeIn delay={160}>
//           <View style={styles.actionsRow}>
//             <Pressable
//               onPress={() => router.push("/(app)/trips/new")}
//               style={styles.primaryAction}
//             >
//               <View style={styles.actionIconWrap}>
//                 <Plus size={20} color={colors.text.inverse} strokeWidth={2.5} />
//               </View>
//               <Text variant="h3" color={colors.text.inverse} style={{ marginTop: spacing[3] }}>
//                 New Trip
//               </Text>
//               <Text
//                 variant="caption"
//                 color="rgba(255,255,255,0.75)"
//                 style={{ marginTop: 2 }}
//               >
//                 Create a request
//               </Text>
//             </Pressable>
//             <View style={{ width: spacing[3] }} />
//             <Pressable
//               onPress={() => router.push("/(app)/requests")}
//               style={styles.secondaryAction}
//             >
//               <View style={[styles.actionIconWrap, { backgroundColor: colors.brand.primaryMuted }]}>
//                 <Truck size={20} color={colors.brand.primary} strokeWidth={2.5} />
//               </View>
//               <Text variant="h3" style={{ marginTop: spacing[3] }}>
//                 All Trips
//               </Text>
//               <Text
//                 variant="caption"
//                 color={colors.text.tertiary}
//                 style={{ marginTop: 2 }}
//               >
//                 View all requests
//               </Text>
//             </Pressable>
//           </View>
//         </FadeIn>

//         {/* Recent activity */}
//         <FadeIn delay={240}>
//           <View style={styles.sectionHeader}>
//             <Text variant="h2">Recent activity</Text>
//           </View>

//           {initialLoading ? (
//             <ActivitySkeleton />
//           ) : summary && summary.recent_events.length > 0 ? (
//             <View style={styles.activityList}>
//               {summary.recent_events.map((event, idx) => (
//                 <FadeIn key={`${event.trip_id}-${event.occurred_at}`} delay={280 + idx * 40}>
//                   <RecentActivityRow
//                     event={event}
//                     onPress={() => router.push(`/(app)/trips/${event.trip_id}`)}
//                   />
//                 </FadeIn>
//               ))}
//             </View>
//           ) : (
//             <View style={styles.emptyActivity}>
//               <Activity size={32} color={colors.text.tertiary} strokeWidth={1.5} />
//               <Text
//                 variant="body"
//                 color={colors.text.secondary}
//                 style={{ marginTop: spacing[3], textAlign: "center" }}
//               >
//                 No activity yet. Create your first transport request to get started.
//               </Text>
//             </View>
//           )}
//         </FadeIn>

//         {/* Freshness footer */}
//         {lastUpdated && (
//           <FadeIn delay={400}>
//             <View style={styles.freshness}>
//               <Text variant="caption" color={colors.text.tertiary}>
//                 Updated <RelativeTimestamp date={lastUpdated} />
//               </Text>
//             </View>
//           </FadeIn>
//         )}
//       </ScrollView>
//     </Screen>
//   );
// }

// // ─── Sub-components ─────────────────────────────────────────────

// function StatCard({
//   label,
//   value,
//   currency,
//   color,
// }: {
//   label: string;
//   value: number;
//   currency?: string;
//   color: string;
// }) {
//   return (
//     <View style={styles.statCard}>
//       <Text variant="overline" color={colors.text.tertiary}>
//         {label}
//       </Text>
//       <View style={{ marginTop: 6 }}>
//         <AnimatedCounter
//           value={value}
//           decimals={0}
//           prefix={currency ? `${currency} ` : ""}
//           variant={currency ? "numeric" : "numeric"}
//           color={color}
//           style={{ fontSize: currency ? 18 : 28, lineHeight: currency ? 24 : 34 }}
//         />
//       </View>
//     </View>
//   );
// }

// function RecentActivityRow({
//   event,
//   onPress,
// }: {
//   event: RecentEvent;
//   onPress: () => void;
// }) {
//   const Icon = getEventIcon(event.event_type);
//   const iconColor = getEventColor(event.event_type);
//   const relativeTime = useRelativeTime(event.occurred_at);

//   return (
//     <Pressable onPress={onPress} style={styles.activityRow}>
//       <View style={[styles.activityIcon, { backgroundColor: `${iconColor}15` }]}>
//         <Icon size={16} color={iconColor} strokeWidth={2.5} />
//       </View>
//       <View style={styles.activityContent}>
//         <Text variant="bodyMedium" numberOfLines={1}>
//           {event.trip_reference}
//         </Text>
//         <Text
//           variant="caption"
//           color={colors.text.tertiary}
//           style={{ marginTop: 2 }}
//           numberOfLines={1}
//         >
//           {formatEventType(event.event_type)} · {relativeTime}
//         </Text>
//       </View>
//       <ArrowRight size={16} color={colors.text.tertiary} strokeWidth={2} />
//     </Pressable>
//   );
// }

// function RelativeTimestamp({ date }: { date: Date }) {
//   const relative = useRelativeTime(date.toISOString());
//   return (
//     <Text variant="caption" color={colors.text.tertiary}>
//       {relative}
//     </Text>
//   );
// }

// function ActivitySkeleton() {
//   return (
//     <View style={styles.activityList}>
//       {[0, 1, 2].map((i) => (
//         <View key={i} style={styles.activityRow}>
//           <Skeleton width={36} height={36} borderRadius={18} />
//           <View style={{ flex: 1, marginLeft: spacing[3] }}>
//             <Skeleton width="60%" height={14} />
//             <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
//           </View>
//         </View>
//       ))}
//     </View>
//   );
// }

// // ─── Helpers ────────────────────────────────────────────────────

// function getGreeting(): string {
//   const hour = new Date().getHours();
//   if (hour < 12) return "Good morning,";
//   if (hour < 17) return "Good afternoon,";
//   return "Good evening,";
// }

// function getEventIcon(eventType: string) {
//   switch (eventType) {
//     case "created":
//       return Package;
//     case "assigned":
//       return Truck;
//     case "picked_up":
//     case "in_transit":
//       return MapPin;
//     case "delivered":
//       return CheckCircle2;
//     default:
//       return Clock;
//   }
// }

// function getEventColor(eventType: string): string {
//   switch (eventType) {
//     case "created":
//       return colors.status.info.fg;
//     case "assigned":
//       return colors.brand.primary;
//     case "picked_up":
//     case "in_transit":
//       return colors.brand.accent;
//     case "delivered":
//       return colors.status.success.fg;
//     default:
//       return colors.text.secondary;
//   }
// }

// function formatEventType(eventType: string): string {
//   return eventType
//     .split("_")
//     .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
//     .join(" ");
// }

// // ─── Styles ─────────────────────────────────────────────────────

// const styles = StyleSheet.create({
//   scrollContent: {
//     paddingHorizontal: spacing[5],
//     paddingTop: spacing[4],
//     paddingBottom: spacing[8],
//   },
//   topBar: {
//     flexDirection: "row",
//     alignItems: "flex-start",
//     justifyContent: "space-between",
//     marginBottom: spacing[6],
//   },
//   greetingWrap: {
//     flex: 1,
//     marginRight: spacing[4],
//   },
//   bellButton: {
//     width: 44,
//     height: 44,
//     alignItems: "center",
//     justifyContent: "center",
//     borderRadius: 22,
//     backgroundColor: colors.surface.raised,
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     position: "relative",
//   },
//   bellBadge: {
//     position: "absolute",
//     top: 2,
//     right: 2,
//     minWidth: 18,
//     height: 18,
//     borderRadius: 9,
//     backgroundColor: colors.brand.accent,
//     alignItems: "center",
//     justifyContent: "center",
//     paddingHorizontal: 4,
//   },
//   statsRow: {
//     flexDirection: "row",
//     marginBottom: spacing[6],
//   },
//   statCard: {
//     flex: 1,
//     backgroundColor: colors.surface.raised,
//     borderRadius: radii.lg,
//     padding: spacing[4],
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     ...elevation.subtle,
//   },
//   // actionsRow: {
//   //   flexDirection: "row",
//   //   marginBottom: spacing[6],
//   // },
//   // primaryAction: {
//   //   flex: 1,
//   //   backgroundColor: colors.brand.primary,
//   //   borderRadius: radii.lg,
//   //   padding: spacing[4],
//   //   ...elevation.subtle,
//   // },
//   // secondaryAction: {
//   //   flex: 1,
//   //   backgroundColor: colors.surface.raised,
//   //   borderRadius: radii.lg,
//   //   padding: spacing[4],
//   //   borderWidth: 1,
//   //   borderColor: colors.border.subtle,
//   //   ...elevation.subtle,
//   // },



//   actionsRow: {
//   flexDirection: "row",
//   width: "100%",
//   gap: spacing[3],
//   marginBottom: spacing[6],
// },
// primaryAction: {
//   flex: 1,
//   backgroundColor: colors.brand.primary,
//   borderRadius: radii.lg,
//   padding: spacing[4],
//   ...elevation.subtle,
// },
// secondaryAction: {
//   flex: 1,
//   backgroundColor: colors.surface.raised,
//   borderRadius: radii.lg,
//   padding: spacing[4],
//   borderWidth: 1,
//   borderColor: colors.border.subtle,
//   ...elevation.subtle,
// },



//   actionIconWrap: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: "rgba(255,255,255,0.15)",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   sectionHeader: {
//     marginBottom: spacing[3],
//   },
//   activityList: {
//     backgroundColor: colors.surface.raised,
//     borderRadius: radii.lg,
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     overflow: "hidden",
//   },
//   activityRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingVertical: spacing[3],
//     paddingHorizontal: spacing[4],
//     borderBottomWidth: 1,
//     borderBottomColor: colors.border.subtle,
//   },
//   activityIcon: {
//     width: 36,
//     height: 36,
//     borderRadius: 18,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   activityContent: {
//     flex: 1,
//     marginLeft: spacing[3],
//     marginRight: spacing[3],
//   },
//   emptyActivity: {
//     padding: spacing[6],
//     alignItems: "center",
//     backgroundColor: colors.surface.raised,
//     borderRadius: radii.lg,
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     borderStyle: "dashed",
//   },
//   freshness: {
//     alignItems: "center",
//     marginTop: spacing[6],
//   },
// });

































// import { Screen } from "@/components/Screen";
// import { Header } from "@/components/Header";
// import { Text } from "@/components/Text";
// import { useAuth } from "@/lib/auth/context";
// import { colors, spacing } from "@elbermarket/design-tokens";

// export default function HomeTab() {
//   const { user } = useAuth();
//   return (
//     <Screen padded={false}>
//       <Header title="Home" />
//       <Text variant="body" color={colors.text.secondary}>
//         Welcome, {user?.full_name ?? "there"}.
//       </Text>
//     </Screen>
//   );
// }