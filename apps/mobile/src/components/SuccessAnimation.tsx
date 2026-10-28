import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Easing } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "@elbermarket/design-tokens";

export function SuccessAnimation() {
  const circleScale = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(circleScale, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
      Animated.timing(checkScale, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.circle, { transform: [{ scale: circleScale }] }]}>
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Check size={56} color={colors.text.inverse} strokeWidth={3} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.status.success.fg,
    alignItems: "center",
    justifyContent: "center",
  },
});