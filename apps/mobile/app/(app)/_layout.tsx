import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth/context";
import { colors } from "@elbermarket/design-tokens";

// The authenticated route group layout. This wraps the tabs AND any
// full-screen sub-screens (trip detail, new trip, business onboarding,
// notifications). The tabs group has the bottom nav; the other screens
// don't. Both are children of this Stack.

export default function AppLayout() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/welcome");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.base },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
      <Stack.Screen name="trips/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="trips/[id]" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="business/type" />
      <Stack.Screen name="business/profile" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.base,
  },
});