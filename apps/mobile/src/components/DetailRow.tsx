import { View, StyleSheet } from "react-native";
import { colors, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// DetailRow — a single key-value pair in a two-column layout. Used in
// info grids and cards. Label on left (muted), value on right (bold,
// right-aligned or left-aligned depending on context).

interface DetailRowProps {
  label: string;
  value: string;
  align?: "left" | "right";
  style?: object;
}

export function DetailRow({ label, value, align = "right", style }: DetailRowProps) {
  return (
    <View style={[styles.row, style]}>
      <Text variant="bodySmall" color={colors.text.tertiary}>
        {label}
      </Text>
      <Text
        variant="bodySmall"
        color={colors.text.primary}
        style={[
          { flex: 1, fontWeight: "500" },
          align === "right"
            ? { textAlign: "right", marginLeft: spacing[3] }
            : { textAlign: "left", marginLeft: spacing[3] },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: spacing[2],
  },
});