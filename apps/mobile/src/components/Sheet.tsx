import { ReactNode } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// Bottom sheet. Modal that slides up from the bottom.
//
// Use for: action menus (tap a card → show actions), filters, quick
// confirmations. Not for full-screen flows — those should be screens.

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  style?: ViewStyle;
}

export function Sheet({ visible, onClose, title, children, footer, style }: SheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.safe}>
          <View style={[styles.sheet, elevation.strong, style]}>
            <View style={styles.handle} />
            {title && (
              <View style={styles.header}>
                <Text variant="h2">{title}</Text>
              </View>
            )}
            <View style={styles.body}>{children}</View>
            {footer && <View style={styles.footer}>{footer}</View>}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface.scrim,
  },
  safe: {
    backgroundColor: "transparent",
  },
  sheet: {
    backgroundColor: colors.surface.raised,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing[2],
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    alignSelf: "center",
    marginBottom: spacing[3],
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  body: {
    paddingHorizontal: spacing[5],
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
});