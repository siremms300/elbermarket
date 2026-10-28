import { ReactNode } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// Screen header. Persistent top bar with title, optional back button,
// and optional action buttons on the right.
//
// Used at the top of screens that need persistent context (title, back
// navigation). Screens that are the root of a tab usually don't need a
// back button — they show the title and actions only.

export interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  large?: boolean;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  onBack,
  actions,
  large = false,
}: HeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {showBack && (
          <Pressable
            onPress={onBack ?? (() => router.back())}
            style={styles.backButton}
            hitSlop={8}
          >
            <ChevronLeft size={24} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
        )}
        <View style={[styles.titleWrap, showBack && { marginLeft: spacing[1] }]}>
          <Text variant={large ? "h1" : "h2"} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text
              variant="caption"
              color={colors.text.tertiary}
              style={{ marginTop: 2 }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {actions && <View style={styles.actions}>{actions}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  titleWrap: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
});