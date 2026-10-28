import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import { Text } from "./Text";

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  badge?: number;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  variant = "default",
  size = "md",
  badge,
  style,
}: IconButtonProps) {
  const sizeMap = { sm: 36, md: 44, lg: 52 } as const;
  const dim = sizeMap[size];

  const variantStyle = {
    default: {
      backgroundColor: colors.surface.raised,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    primary: { backgroundColor: colors.brand.primary },
    ghost: { backgroundColor: "transparent" },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2 },
        variantStyle,
        pressed && styles.pressed,
        style,
      ]}
      hitSlop={4}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pressed: { opacity: 0.85 },
  badge: {
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
});