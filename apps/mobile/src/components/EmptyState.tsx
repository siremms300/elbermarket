import { View, StyleSheet } from "react-native";
import { colors, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";
import { Button } from "./Button";

// Designed empty states. Not "no data" grey text — an actual moment.
// Every empty state has: icon/illustration, title, description, and
// optional primary action.

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <Text variant="h2" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {description && (
        <Text
          variant="body"
          color={colors.text.secondary}
          style={{ textAlign: "center", marginTop: spacing[2], maxWidth: 320 }}
        >
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing[6], width: "100%", maxWidth: 240 }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
  },
  iconWrap: {
    marginBottom: spacing[5],
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
});