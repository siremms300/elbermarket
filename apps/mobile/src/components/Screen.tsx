import { ReactNode } from "react";
import { View, StyleSheet, ViewStyle, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "@elbermarket/design-tokens";

// The screen wrapper. Every screen sits inside a <Screen>.
//
// Handles:
//   - Safe area insets (top + bottom, or edgeToEdge to skip both)
//   - Background colour (warm cream by default)
//   - Horizontal padding (20px by default, disable for full-bleed content)
//   - Optional scroll behaviour
//
// For screens with forms, use `scroll` to enable scroll-to-focus behaviour.
// For screens with fixed headers, don't use `scroll` and use <FlatList> or
// <ScrollView> inside the screen.

export interface ScreenProps {
  children: ReactNode;
  padded?: boolean;
  edgeToEdge?: boolean;
  scroll?: boolean;
  background?: string;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}

export function Screen({
  children,
  padded = true,
  edgeToEdge = false,
  scroll = false,
  background = colors.surface.base,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        padded && !edgeToEdge && styles.padded,
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.content,
        padded && !edgeToEdge && styles.padded,
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: background }, style]}
      edges={edgeToEdge ? [] : ["top", "bottom"]}
    >
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
  padded: { paddingHorizontal: spacing[5] },
});