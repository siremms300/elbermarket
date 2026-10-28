import { Stack } from "expo-router";
import { colors } from "@elbermarket/design-tokens";

// The auth flow. Uses a plain Stack — no tab bar, no persistent chrome.
// Full-screen stack screens with fade transitions.

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.base },
        animation: "fade",
      }}
    />
  );
}