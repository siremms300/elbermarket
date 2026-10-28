import { useEffect, useRef } from "react";
import { Text, Animated, Easing } from "react-native";
import type { TextProps } from "./Text";

// AnimatedCounter — a number that smoothly transitions from one value to
// another when it changes.
//
// Used for: money, distances, trip counts, any numeric value that updates.
// The motion: 400ms ease-out. The counter reads as "settling into" the new
// value rather than snapping — which is what makes the app feel alive.
//
// Implementation: uses the JS Animated API rather than Reanimated for this
// specific case because we need to interpolate the numeric value, not a
// style property. Reanimated is better for style animations but the JS API
// is simpler here and equally smooth for one-shot number transitions.

interface AnimatedCounterProps extends Omit<TextProps, "children"> {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  separator?: string;
}

export function AnimatedCounter({
  value,
  duration = 400,
  prefix = "",
  suffix = "",
  decimals = 0,
  separator = ",",
  ...textProps
}: AnimatedCounterProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const prevValue = useRef(0);
  const displayRef = useRef<Text>(null);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    prevValue.current = end;

    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // We need to read the value
    }).start();

    // Subscribe to changes and update the text imperatively. This avoids
    // re-rendering the entire component tree on every frame.
    const listenerId = animatedValue.addListener(({ value: t }) => {
      const interpolated = start + (end - start) * t;
      const formatted = formatNumber(interpolated, decimals, separator);
      displayRef.current?.setNativeProps({
        text: `${prefix}${formatted}${suffix}`,
      });
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [value, duration, prefix, suffix, decimals, separator, animatedValue]);

  // Initial render shows the value immediately (for SSR or first paint).
  const initialFormatted = formatNumber(value, decimals, separator);

  return (
    <Text ref={displayRef} {...textProps}>
      {`${prefix}${initialFormatted}${suffix}`}
    </Text>
  );
}

function formatNumber(n: number, decimals: number, separator: string): string {
  const fixed = n.toFixed(decimals);
  const [whole, frac] = fixed.split(".");
  const withSeparator = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return frac ? `${withSeparator}.${frac}` : withSeparator;
}