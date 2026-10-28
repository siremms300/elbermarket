import { ReactNode } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

// Container — constrains content to a readable max-width on wide screens
// (web) while filling the full screen on mobile. This is the standard
// pattern for apps that run on both web and native.
//
// On mobile (width < 640), Container is a no-op: it just passes through.
// On web (width >= 640), it centers the content with a max-width so
// text lines don't stretch to 1400px, forms look reasonable, and cards
// don't feel empty.
//
// The 640px breakpoint is where "small tablet" begins. Below that we
// assume mobile behavior.

const MAX_CONTENT_WIDTH = 640;

interface ContainerProps {
  children: ReactNode;
  style?: ViewStyle;
  maxWidth?: number;
}

export function Container({ children, style, maxWidth = MAX_CONTENT_WIDTH }: ContainerProps) {
  return (
    <View style={styles.outer}>
      <View style={[styles.inner, { maxWidth }, style]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  inner: {
    flex: 1,
    width: "100%",
  },
});