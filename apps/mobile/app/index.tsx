import { useEffect, useRef } from "react";
import { View, Image, Animated, Easing, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@elbermarket/design-tokens";
import { useAuth } from "../src/lib/auth/context";

// Splash screen.
//
// Responsibilities:
//   1. Show the brand (deep green, logo, nothing else)
//   2. Wait for auth state to resolve (bootstrap from secure storage)
//   3. Route to /welcome or /(app)/home based on the result
//
// Design intent: authoritative, quiet, centred. The restraint is the
// design. WhatsApp, Cash App, Instagram — none decorate their splash.
export default function SplashScreen() {
  const router = useRouter();
  const { status } = useAuth();

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;

  // Fade the logo in on mount.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Route based on auth status. We give the bootstrap a minimum of 800ms
  // so the logo has time to render before we navigate — otherwise the
  // splash flashes on screen for 50ms and looks like a bug.
  useEffect(() => {
    if (status === "loading") return;

    const timer = setTimeout(() => {
      if (status === "authenticated") {
        router.replace("/(app)/home");
      } else {
        router.replace("/welcome");
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [status, router]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }],
        }}
      >
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#003614",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 200,
    height: 200,
  },
});