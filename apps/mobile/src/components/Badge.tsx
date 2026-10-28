import { View, StyleSheet, ViewStyle } from "react-native";
import { colors, radii, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// The badge primitive. Used for status indicators throughout the app.
//
// Every badge has a semantic meaning tied to a colour family. The set of
// variants is fixed — new variants require a design decision, not just
// a new colour code.

type Variant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent"
  | "brand";

export interface BadgeProps {
  label: string;
  variant?: Variant;
  size?: "sm" | "md";
  style?: ViewStyle;
}

export function Badge({ label, variant = "neutral", size = "md", style }: BadgeProps) {
  const status =
    variant === "brand"
      ? { fg: colors.brand.primary, bg: colors.brand.primaryMuted, border: colors.brand.primary }
      : colors.status[variant === "neutral" ? "neutral" : variant];

  const sizeStyles = size === "sm"
    ? { paddingVertical: 2, paddingHorizontal: spacing[2] }
    : { paddingVertical: 4, paddingHorizontal: spacing[3] };

  return (
    <View
      style={[
        styles.base,
        sizeStyles,
        { backgroundColor: status.bg, borderColor: status.border },
        style,
      ]}
    >
      <Text
        variant="caption"
        color={status.fg}
        style={{ fontWeight: "600", letterSpacing: 0.2 }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.full,
    borderWidth: 1,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
  },
});