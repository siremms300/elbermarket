import { Pressable, View, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// A row in a list. Used for menu items, settings rows, notification rows,
// and any tappable list content.
//
// Standard pattern:
//   [leading icon/avatar]  Title              [trailing icon / chevron]
//                          Subtitle

export interface ListItemProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
}

export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  showChevron = false,
  destructive = false,
}: ListItemProps) {
  const content = (
    <View style={styles.row}>
      {leading && <View style={styles.leading}>{leading}</View>}
      <View style={styles.content}>
        <Text
          variant="body"
          color={destructive ? colors.status.danger.fg : colors.text.primary}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            variant="caption"
            color={colors.text.tertiary}
            style={{ marginTop: 2 }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {trailing && <View style={styles.trailing}>{trailing}</View>}
      {showChevron && (
        <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
      )}
    </View>
  );

  if (!onPress) {
    return <View style={styles.container}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: radii.sm,
  },
  pressed: {
    backgroundColor: colors.surface.sunken,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  leading: {
    marginRight: spacing[3],
  },
  content: {
    flex: 1,
  },
  trailing: {
    marginLeft: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
});