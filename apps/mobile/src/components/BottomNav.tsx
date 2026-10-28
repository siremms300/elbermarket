import { Pressable, View, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import {
  Home,
  Truck,
  MapPin,
  Wallet,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { colors, spacing, elevation, radii } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// The bottom navigation. Five tabs: Home, Requests, Tracking, Finance,
// Profile. Persistent, always visible in the tabbed section of the app.
//
// Design: white surface, subtle top border, active tab uses brand green
// with a filled icon. Inactive tabs use muted slate. Optional badge on
// any tab (e.g., notifications count, active trips).

interface Tab {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  badgeKey?: "notifications" | "activeTrips";
}

const TABS: Tab[] = [
  { key: "home", label: "Home", icon: Home, path: "/(app)/home" },
  { key: "requests", label: "Requests", icon: Truck, path: "/(app)/requests" },
  { key: "tracking", label: "Tracking", icon: MapPin, path: "/(app)/tracking" },
  { key: "finance", label: "Finance", icon: Wallet, path: "/(app)/finance" },
  { key: "profile", label: "Profile", icon: User, path: "/(app)/profile", badgeKey: "notifications" },
];

export interface BottomNavProps {
  notificationsCount?: number;
  activeTripsCount?: number;
}

export function BottomNav({ notificationsCount = 0, activeTripsCount = 0 }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  function isActive(tab: Tab): boolean {
    // Match the tab path against current pathname. Account for both the
    // full path and the short form (e.g., /home and /(app)/home).
    const normalized = pathname.replace("/(app)", "");
    return normalized === tab.path.replace("/(app)", "");
  }

  function getBadge(tab: Tab): number {
    if (tab.badgeKey === "notifications") return notificationsCount;
    if (tab.badgeKey === "activeTrips") return activeTripsCount;
    return 0;
  }

  return (
    <View style={[styles.container, elevation.medium]}>
      {TABS.map((tab) => {
        const active = isActive(tab);
        const IconComponent = tab.icon;
        const badge = getBadge(tab);

        return (
          <Pressable
            key={tab.key}
            onPress={() => router.push(tab.path as any)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <View style={styles.iconWrap}>
              <IconComponent
                size={22}
                color={active ? colors.brand.primary : colors.text.tertiary}
                strokeWidth={active ? 2.5 : 2}
                fill={active ? colors.brand.primaryMuted : "transparent"}
              />
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text
                    variant="caption"
                    color={colors.text.inverse}
                    style={{ fontSize: 10, fontWeight: "700", lineHeight: 12 }}
                  >
                    {badge > 9 ? "9+" : badge}
                  </Text>
                </View>
              )}
            </View>
            <Text
              variant="caption"
              color={active ? colors.brand.primary : colors.text.tertiary}
              style={{
                fontWeight: active ? "600" : "500",
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surface.raised,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[2],
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[1],
    borderRadius: radii.md,
  },
  tabPressed: {
    opacity: 0.7,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
});