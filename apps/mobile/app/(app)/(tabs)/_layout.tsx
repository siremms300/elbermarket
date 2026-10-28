import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Slot } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api/client";
import { colors } from "@elbermarket/design-tokens";

// The tabs layout. Wraps all tab screens with:
//   - The bottom nav
//   - Safe area handling for the bottom nav
//   - A single context for badge counts (fetched once per mount)
//
// The tab screens themselves are rendered via <Slot />.

export default function TabsLayout() {
  const { status } = useAuth();
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [activeTripsCount, setActiveTripsCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;

    // Fetch counts. Best-effort — no error state.
    async function loadCounts() {
      try {
        const unread = await api.unreadNotificationCount();
        setNotificationsCount(unread.unread_count);
      } catch {}

      try {
        const active = await api.listTrips({ status: "requested", limit: 100 });
        setActiveTripsCount(active.total);
      } catch {}
    }

    loadCounts();

    // Refresh every 30 seconds while the tab bar is mounted
    const interval = setInterval(loadCounts, 30000);
    return () => clearInterval(interval);
  }, [status]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Slot />
      </View>
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.surface.raised }}>
        <BottomNav
          notificationsCount={notificationsCount}
          activeTripsCount={activeTripsCount}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.base,
  },
  content: {
    flex: 1,
  },
});