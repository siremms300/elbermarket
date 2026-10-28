import { View, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing } from "@elbermarket/design-tokens";

// Horizontal rule between sections. Two variants: subtle (default) and
// strong. Optional vertical spacing.

export interface DividerProps {
  spacing?: number;
  variant?: "subtle" | "strong";
  style?: ViewStyle;
}

export function Divider({ spacing: s = 0, variant = "subtle", style }: DividerProps) {
  const color = variant === "strong" ? colors.border.strong : colors.border.subtle;
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: color, marginVertical: s },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    height: 1,
    alignSelf: "stretch",
  },
});