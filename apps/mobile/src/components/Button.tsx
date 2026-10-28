import { Pressable, View, ActivityIndicator, StyleSheet } from "react-native";
import { colors, spacing, radii, motion } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// The button primitive. Four variants, three sizes, three states.
//
// Design: physical, restrained. Pressed state uses opacity + scale.
// Loading shows the activity indicator in place of the label with the
// same height maintained. Disabled uses muted colour, never pure opacity
// (opacity on brand green looks green-grey, which is unintentional).

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = true,
  icon,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const sizeStyles = {
    sm: { paddingVertical: spacing[2], paddingHorizontal: spacing[4], minHeight: 36 },
    md: { paddingVertical: spacing[3], paddingHorizontal: spacing[5], minHeight: 48 },
    lg: { paddingVertical: spacing[3] + 2, paddingHorizontal: spacing[6], minHeight: 56 },
  }[size];

  const variantStyles = {
    primary: {
      container: {
        backgroundColor: isDisabled ? "#B8C0BA" : colors.brand.primary,
      },
      textColor: colors.text.inverse,
    },
    secondary: {
      container: {
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: isDisabled ? colors.border.subtle : colors.border.strong,
      },
      textColor: isDisabled ? colors.text.disabled : colors.text.primary,
    },
    ghost: {
      container: { backgroundColor: "transparent" },
      textColor: isDisabled ? colors.text.disabled : colors.brand.primary,
    },
    danger: {
      container: {
        backgroundColor: isDisabled ? "#E5B8B8" : colors.status.danger.fg,
      },
      textColor: colors.text.inverse,
    },
  }[variant];

  const textSize = size === "lg" ? 17 : size === "sm" ? 14 : 15;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.container,
        sizeStyles,
        variantStyles.container,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
      ]}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.textColor} />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text
            variant="label"
            color={variantStyles.textColor}
            style={{ fontSize: textSize, fontWeight: "600" }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    marginRight: spacing[2],
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
});