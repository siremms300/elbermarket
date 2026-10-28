import { useEffect, useRef, ReactNode } from "react";
import { Animated, ViewStyle, Easing } from "react-native";

// FadeIn — content that fades in and rises subtly on mount.
//
// The animation: 8px translateY + opacity 0→1 over 250ms ease-out.
// This is the "content arriving" motion that makes lists feel alive
// without being distracting.
//
// Stagger: pass `delay` to sequence multiple items on the same screen.
// Example: three cards with delay 0, 80, 160 enter in sequence.

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  style?: ViewStyle;
}

export function FadeIn({
  children,
  delay = 0,
  duration = 250,
  distance = 8,
  style,
}: FadeInProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, duration, opacity, translateY]);

  return (
    <Animated.View
      style={[
        { opacity, transform: [{ translateY }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}