import { useEffect, useRef, ReactNode } from "react";
import { Animated, ViewStyle, Easing } from "react-native";

// SlideUp — content that slides up from below (for sheets, modals, bottom
// action menus).
//
// Animation: 100% translateY → 0 over 300ms ease-out. Used with fade on
// the backdrop.

interface SlideUpProps {
  children: ReactNode;
  visible: boolean;
  duration?: number;
  style?: ViewStyle;
}

export function SlideUp({ children, visible, duration = 300, style }: SlideUpProps) {
  const translateY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration * 0.6,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 300,
          duration: duration * 0.7,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: duration * 0.5,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, duration, opacity, translateY]);

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