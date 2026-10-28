import { ReactNode } from "react";
import { View, StyleSheet, Pressable, ViewStyle } from "react-native";
import { colors, radii, spacing, elevation } from "@elbermarket/design-tokens";

// The card primitive.
//
// Cards are the primary container for grouped content. They have:
//   - Background: white (raised surface)
//   - Border: 1px subtle (for clarity against warm cream background)
//   - Elevation: subtle (level 1)
//   - Radius: 14px
//
// Cards can be pressable (with proper pressed feedback) or static.
// They can have a header, footer, or be pure content.

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  elevated?: boolean;
  style?: ViewStyle;
}

export function Card({
  children,
  onPress,
  padded = true,
  elevated = true,
  style,
}: CardProps) {
  const baseStyle = [
    styles.card,
    padded && styles.padded,
    elevated && elevation.subtle,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...baseStyle,
          pressed && styles.pressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={baseStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
  },
  padded: {
    padding: spacing[5],
  },
  pressed: {
    backgroundColor: colors.surface.sunken,
  },
});