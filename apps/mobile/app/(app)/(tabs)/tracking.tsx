import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  Easing,
  Alert,
  Dimensions,
} from "react-native";
import {
  Phone,
  MessageSquare,
  Shield,
  AlertTriangle,
  MapPin,
  Navigation,
  Truck,
  Package,
  CheckCircle2,
  Clock,
  ChevronRight,
  Star,
  Info,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { FadeIn } from "@/components/FadeIn";
import { Container } from "@/components/Container";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";

// Tracking screen — investor preview.
//
// This screen is a mock. It shows what live shipment tracking will look like
// when Phase 2's driver app feeds real GPS coordinates. The truck animation,
// the ETA countdown, and the driver card are illustrative. The screen is
// labelled "Preview" in the UI.
//
// No backend call is made on this screen. When we wire live tracking, the
// driver app posts location pings that the backend broadcasts over a
// WebSocket; this screen subscribes to those pings and animates the truck
// accordingly. The animation you see here is the same animation.

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MAP_HEIGHT = 260;
const MAP_PADDING = spacing[5];
const ROUTE_WIDTH = SCREEN_WIDTH - MAP_PADDING * 2 - spacing[10];

const DRIVER = {
  name: "Musa Ibrahim",
  initials: "MI",
  rating: 4.9,
  trips: 342,
  phone: "+234 803 456 7890",
  vehicle: "Toyota Hilux",
  plate: "KAD-472-XY",
  photoColor: "#8B5A2B",
};

const TRIP = {
  reference: "TRP-A3K9M2X7",
  cargo: "Grade A maize · 5,000 kg",
  pickup: "Kaduna Central Market",
  destination: "Mile 12 Market, Lagos",
  distanceKm: 588,
  remainingKm: 142,
};

const EVENTS = [
  { id: "e1", label: "Dispatched from Kaduna", time: "07:12", done: true },
  { id: "e2", label: "Picked up at Kaduna Central", time: "08:04", done: true },
  { id: "e3", label: "Passed Kafanchan checkpoint", time: "09:48", done: true },
  { id: "e4", label: "Crossed into Oyo State", time: "12:30", done: true },
  { id: "e5", label: "Approaching Lagos", time: "now", done: false },
];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function TrackingTab() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [etaMinutes, setEtaMinutes] = useState(142);

  // Truck position animation. 0 → 1 over 8 seconds, then loop.
  // In the real app this value comes from server-sent GPS updates.
  const truckProgress = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(truckProgress, {
        toValue: 0.92,
        duration: 12000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [truckProgress]);

  // ETA countdown — ticks every 30 seconds in the mock.
  useEffect(() => {
    const interval = setInterval(() => {
      setEtaMinutes((prev) => Math.max(1, prev - 1));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setIsRefreshing(false);
  }, []);

  const truckLeft = truckProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, ROUTE_WIDTH - 8],
  });

  const progressPercent = Math.round((1 - TRIP.remainingKm / TRIP.distanceKm) * 100);

  return (
    <Screen padded={false}>
      <Container>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand.primary}
            />
          }
        >
          {/* Header */}
          <FadeIn>
            <View style={styles.header}>
              <View>
                <Text variant="h1">Tracking</Text>
                <Text
                  variant="bodySmall"
                  color={colors.text.secondary}
                  style={{ marginTop: 2 }}
                >
                  {TRIP.reference} · live
                </Text>
              </View>
              <View style={styles.previewPill}>
                <Text
                  variant="caption"
                  color={colors.status.accent.fg}
                  style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}
                >
                  PREVIEW
                </Text>
              </View>
            </View>
          </FadeIn>

          {/* Live map card */}
          <FadeIn delay={60}>
            <View style={styles.mapCard}>
              {/* Map background — abstract terrain-like layers */}
              <View style={styles.mapBackground}>
                <View style={styles.terrainLayer1} />
                <View style={styles.terrainLayer2} />
                <View style={styles.terrainLayer3} />
                {/* Route dots */}
                <View style={styles.routeDotsRow}>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.routeDot,
                        i / 20 < 1 - TRIP.remainingKm / TRIP.distanceKm
                          ? { backgroundColor: colors.brand.primary, opacity: 1 }
                          : { backgroundColor: colors.border.strong, opacity: 0.4 },
                      ]}
                    />
                  ))}
                </View>

                {/* Pickup pin */}
                <View style={[styles.pin, { left: 4 }]}>
                  <View style={styles.pinDot} />
                  <View style={styles.pinLabel}>
                    <Text
                      variant="caption"
                      color={colors.text.primary}
                      style={{ fontSize: 10, fontWeight: "600" }}
                    >
                      Kaduna
                    </Text>
                  </View>
                </View>

                {/* Destination pin */}
                <View style={[styles.pin, { right: 4, left: undefined }]}>
                  <View style={[styles.pinDot, { backgroundColor: colors.brand.accent }]} />
                  <View style={styles.pinLabel}>
                    <Text
                      variant="caption"
                      color={colors.text.primary}
                      style={{ fontSize: 10, fontWeight: "600" }}
                    >
                      Lagos
                    </Text>
                  </View>
                </View>

                {/* Animated truck */}
                <Animated.View
                  style={[
                    styles.truckMarker,
                    {
                      left: truckLeft,
                    },
                  ]}
                >
                  <View style={styles.truckPulse} />
                  <View style={styles.truckIconWrap}>
                    <Truck size={16} color={colors.text.inverse} strokeWidth={2.5} />
                  </View>
                </Animated.View>
              </View>

              {/* Live status strip */}
              <View style={styles.liveStrip}>
                <View style={styles.liveDot} />
                <Text
                  variant="bodyMedium"
                  color={colors.text.inverse}
                  style={{ flex: 1, marginLeft: spacing[2] }}
                >
                  In transit — {TRIP.remainingKm} km to go
                </Text>
                <View style={styles.etaChip}>
                  <Clock size={11} color={colors.text.inverse} strokeWidth={2.5} />
                  <Text
                    variant="caption"
                    color={colors.text.inverse}
                    style={{ marginLeft: 4, fontWeight: "600" }}
                  >
                    {Math.floor(etaMinutes / 60)}h {etaMinutes % 60}m
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercent}%` },
                  ]}
                />
              </View>
              <View style={styles.progressMeta}>
                <Text variant="caption" color={colors.text.tertiary}>
                  {progressPercent}% complete
                </Text>
                <Text variant="caption" color={colors.text.tertiary}>
                  {TRIP.distanceKm} km total
                </Text>
              </View>
            </View>
          </FadeIn>

          {/* Driver card */}
          <FadeIn delay={140}>
            <View style={styles.driverCard}>
              <View
                style={[styles.driverAvatar, { backgroundColor: DRIVER.photoColor }]}
              >
                <Text
                  variant="h2"
                  color={colors.text.inverse}
                  style={{ fontSize: 20, lineHeight: 24 }}
                >
                  {DRIVER.initials}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing[3] }}>
                <Text variant="bodyMedium">{DRIVER.name}</Text>
                <View style={styles.driverMeta}>
                  <Star size={11} color={colors.brand.accent} fill={colors.brand.accent} />
                  <Text
                    variant="caption"
                    color={colors.text.secondary}
                    style={{ marginLeft: 3 }}
                  >
                    {DRIVER.rating} · {DRIVER.trips} trips
                  </Text>
                </View>
                <View style={styles.vehicleRow}>
                  <Text variant="caption" color={colors.text.tertiary}>
                    {DRIVER.vehicle}
                  </Text>
                  <View style={styles.vehicleDot} />
                  <Text
                    variant="caption"
                    color={colors.text.primary}
                    style={{ fontWeight: "600" }}
                  >
                    {DRIVER.plate}
                  </Text>
                </View>
              </View>
              <View style={styles.driverActions}>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Call driver",
                      `Calling ${DRIVER.phone} — in-app calling activates in Phase 2.`,
                    )
                  }
                  style={styles.iconAction}
                >
                  <Phone size={18} color={colors.brand.primary} strokeWidth={2} />
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Message driver",
                      "In-app messaging arrives in Phase 2. This is a preview screen.",
                    )
                  }
                  style={styles.iconAction}
                >
                  <MessageSquare size={18} color={colors.brand.primary} strokeWidth={2} />
                </Pressable>
              </View>
            </View>
          </FadeIn>

          {/* Cargo summary */}
          <FadeIn delay={220}>
            <View style={styles.cargoCard}>
              <View style={styles.cargoHeader}>
                <Package size={16} color={colors.text.secondary} strokeWidth={2} />
                <Text
                  variant="overline"
                  color={colors.text.tertiary}
                  style={{ marginLeft: spacing[2], fontSize: 10 }}
                >
                  CARGO
                </Text>
              </View>
              <Text variant="bodyMedium" style={{ marginTop: spacing[2] }}>
                {TRIP.cargo}
              </Text>
              <View style={styles.cargoRoute}>
                <View style={styles.cargoPoint}>
                  <MapPin size={12} color={colors.text.tertiary} strokeWidth={2.5} />
                  <Text
                    variant="caption"
                    color={colors.text.secondary}
                    style={{ marginLeft: 4, flex: 1 }}
                    numberOfLines={1}
                  >
                    {TRIP.pickup}
                  </Text>
                </View>
                <ChevronRight size={12} color={colors.text.tertiary} />
                <View style={styles.cargoPoint}>
                  <MapPin size={12} color={colors.brand.primary} strokeWidth={2.5} />
                  <Text
                    variant="caption"
                    color={colors.text.secondary}
                    style={{ marginLeft: 4, flex: 1 }}
                    numberOfLines={1}
                  >
                    {TRIP.destination}
                  </Text>
                </View>
              </View>
            </View>
          </FadeIn>

          {/* Insurance strip */}
          <FadeIn delay={280}>
            <View style={styles.insuranceStrip}>
              <Shield size={16} color={colors.status.success.fg} strokeWidth={2.5} />
              <View style={{ flex: 1, marginLeft: spacing[2] }}>
                <Text variant="label" color={colors.status.success.fg}>
                  Cargo insured
                </Text>
                <Text
                  variant="caption"
                  color={colors.text.tertiary}
                  style={{ marginTop: 1 }}
                >
                  Coverage ₦500,000 · policy attached
                </Text>
              </View>
              <CheckCircle2 size={18} color={colors.status.success.fg} strokeWidth={2.5} />
            </View>
          </FadeIn>

          {/* Emergency */}
          <FadeIn delay={320}>
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Emergency",
                  "Emergency escalation routes to ELBER ops in Phase 2. In the live app, this immediately notifies the on-call coordinator.",
                )
              }
              style={styles.emergencyButton}
            >
              <AlertTriangle size={16} color={colors.status.danger.fg} strokeWidth={2.5} />
              <Text
                variant="label"
                color={colors.status.danger.fg}
                style={{ marginLeft: spacing[2], fontWeight: "600" }}
              >
                Report an issue
              </Text>
            </Pressable>
          </FadeIn>

          {/* Event timeline */}
          <FadeIn delay={380}>
            <View style={styles.sectionHeader}>
              <Text variant="h2">Trip timeline</Text>
            </View>
          </FadeIn>

          <View style={styles.timelineCard}>
            {EVENTS.map((event, idx) => {
              const isLast = idx === EVENTS.length - 1;
              return (
                <FadeIn key={event.id} delay={420 + idx * 40}>
                  <View style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View
                        style={[
                          styles.timelineDot,
                          event.done && {
                            backgroundColor: colors.brand.primary,
                            borderColor: colors.brand.primary,
                          },
                          isLast &&
                            !event.done && {
                              backgroundColor: colors.brand.accent,
                              borderColor: colors.brand.accent,
                            },
                        ]}
                      />
                      {!isLast && (
                        <View
                          style={[
                            styles.timelineLine,
                            event.done && { backgroundColor: colors.brand.primary },
                          ]}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: isLast ? 0 : spacing[4] }}>
                      <Text
                        variant="bodyMedium"
                        color={event.done ? colors.text.primary : colors.brand.accent}
                      >
                        {event.label}
                      </Text>
                      <Text
                        variant="caption"
                        color={colors.text.tertiary}
                        style={{ marginTop: 2 }}
                      >
                        {event.time}
                      </Text>
                    </View>
                  </View>
                </FadeIn>
              );
            })}
          </View>

          {/* Preview note */}
          <FadeIn delay={700}>
            <View style={styles.previewNote}>
              <Info size={14} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                variant="caption"
                color={colors.text.tertiary}
                style={{ marginLeft: spacing[2], flex: 1, lineHeight: 16 }}
              >
                This screen shows illustrative tracking. Live GPS from the driver
                app arrives in Phase 2, with the same animation and layout.
              </Text>
            </View>
          </FadeIn>
        </ScrollView>
      </Container>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing[5],
  },
  previewPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.status.accent.bg,
    borderWidth: 1,
    borderColor: colors.status.accent.border,
  },

  // Map card
  mapCard: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
    ...elevation.medium,
  },
  mapBackground: {
    height: MAP_HEIGHT,
    backgroundColor: "#EEF1E9",
    position: "relative",
    justifyContent: "center",
    overflow: "hidden",
  },
  terrainLayer1: {
    position: "absolute",
    top: -40,
    left: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#E3E8D5",
    opacity: 0.7,
  },
  terrainLayer2: {
    position: "absolute",
    bottom: -60,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#D8E0C4",
    opacity: 0.55,
  },
  terrainLayer3: {
    position: "absolute",
    top: 40,
    right: 60,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#E8ECDE",
    opacity: 0.6,
  },
  routeDotsRow: {
    position: "absolute",
    left: 8,
    right: 8,
    top: "50%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -1,
  },
  routeDot: {
    width: 5,
    height: 2,
    borderRadius: 1,
  },
  pin: {
    position: "absolute",
    top: "50%",
    alignItems: "center",
    marginTop: -24,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand.primary,
    borderWidth: 2,
    borderColor: colors.text.inverse,
  },
  pinLabel: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surface.raised,
    borderRadius: 4,
    ...elevation.subtle,
  },
  truckMarker: {
    position: "absolute",
    top: "50%",
    marginTop: -14,
  },
  truckPulse: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand.accent,
    opacity: 0.25,
    left: -8,
    top: -8,
  },
  truckIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.text.inverse,
    ...elevation.medium,
  },
  liveStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.brand.primary,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.status.success.fg === "#3D6E04" ? "#22C55E" : "#22C55E",
    borderWidth: 1,
    borderColor: colors.text.inverse,
  },
  etaChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surface.sunken,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brand.accent,
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.surface.raised,
  },

  // Driver card
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[4],
    padding: spacing[4],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  driverMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  vehicleDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.text.tertiary,
    marginHorizontal: 6,
  },
  driverActions: {
    flexDirection: "row",
    gap: spacing[2],
  },
  iconAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },

  // Cargo
  cargoCard: {
    marginTop: spacing[4],
    padding: spacing[4],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  cargoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  cargoRoute: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: spacing[2],
  },
  cargoPoint: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  // Insurance strip
  insuranceStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.status.success.bg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.status.success.border,
  },

  // Emergency
  emergencyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.status.danger.border,
    backgroundColor: colors.status.danger.bg,
  },

  // Timeline
  sectionHeader: {
    marginTop: spacing[6],
    marginBottom: spacing[3],
  },
  timelineCard: {
    padding: spacing[4],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  timelineRow: {
    flexDirection: "row",
  },
  timelineRail: {
    width: 24,
    alignItems: "center",
    marginRight: spacing[3],
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface.sunken,
    borderWidth: 2,
    borderColor: colors.border.strong,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border.subtle,
    marginTop: 4,
    marginBottom: -4,
  },

  // Preview note
  previewNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: spacing[5],
    padding: spacing[3],
    backgroundColor: colors.surface.sunken,
    borderRadius: radii.md,
  },
});