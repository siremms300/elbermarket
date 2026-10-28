import { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  ViewStyle,
  Easing,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radii } from "@elbermarket/design-tokens";

// Skeleton with shimmer — a gradient moving across the shape.
// Not an opacity pulse (which looks cheap). A proper shimmer gives the
// visual impression of loading, not just "some grey thing".

const SCREEN_WIDTH = Dimensions.get("window").width;

interface SkeletonBaseProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 4,
  style,
}: SkeletonBaseProps) {
  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [translateX]);

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surface.sunken,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.6)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// Pre-composed: trip card skeleton
export function TripCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width="35%" height={12} />
        <Skeleton width={70} height={20} borderRadius={10} />
      </View>
      <Skeleton width="85%" height={18} style={{ marginTop: 12 }} />
      <Skeleton width="60%" height={14} style={{ marginTop: 8 }} />
      <View style={[styles.row, { marginTop: 16 }]}>
        <Skeleton width="45%" height={12} />
        <Skeleton width="30%" height={12} />
      </View>
    </View>
  );
}

// Pre-composed: stat card skeleton (for home)
export function StatCardSkeleton() {
  return (
    <View style={styles.statCard}>
      <Skeleton width="50%" height={12} />
      <Skeleton width="70%" height={28} style={{ marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: 12,
  },
  statCard: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});





















// import { useEffect, useRef } from "react";
// import { View, StyleSheet, Animated, ViewStyle } from "react-native";
// import { colors, radii, motion } from "@elbermarket/design-tokens";

// // Loading skeletons. Use instead of blank screens or generic spinners
// // when the shape of the content is known ahead of time. Skeletons feel
// // instant even when the network is slow.

// interface SkeletonBaseProps {
//   width?: number | `${number}%`;
//   height?: number;
//   borderRadius?: number;
//   style?: ViewStyle;
// }

// export function Skeleton({ width = "100%", height = 16, borderRadius = 4, style }: SkeletonBaseProps) {
//   const opacity = useRef(new Animated.Value(0.4)).current;

//   useEffect(() => {
//     const loop = Animated.loop(
//       Animated.sequence([
//         Animated.timing(opacity, {
//           toValue: 0.8,
//           duration: motion.duration.slow,
//           useNativeDriver: true,
//         }),
//         Animated.timing(opacity, {
//           toValue: 0.4,
//           duration: motion.duration.slow,
//           useNativeDriver: true,
//         }),
//       ]),
//     );
//     loop.start();
//     return () => loop.stop();
//   }, [opacity]);

//   return (
//     <Animated.View
//       style={[
//         { width, height, borderRadius, backgroundColor: colors.surface.sunken, opacity },
//         style,
//       ]}
//     />
//   );
// }

// // Pre-composed skeleton for list cards (used in trips list, notifications)
// export function CardSkeleton() {
//   return (
//     <View style={styles.card}>
//       <Skeleton width="40%" height={12} />
//       <Skeleton width="90%" height={20} style={{ marginTop: 12 }} />
//       <Skeleton width="70%" height={14} style={{ marginTop: 8 }} />
//       <Skeleton width="100%" height={14} style={{ marginTop: 16 }} />
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   card: {
//     backgroundColor: colors.surface.raised,
//     borderRadius: radii.lg,
//     padding: 20,
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     marginBottom: 12,
//   },
// });