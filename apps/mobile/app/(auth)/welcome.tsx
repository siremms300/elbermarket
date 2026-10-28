import { View, StyleSheet, Image, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { colors, spacing } from "@elbermarket/design-tokens";

// The signed-out landing screen.
//
// Design intent: brand present but quiet. Two clear actions — Get started
// for new users, Sign in for returning ones.

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        <View style={styles.topSpacer} />

        <View style={styles.brand}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.hero}>
          <Text variant="h1" color={colors.text.primary}>
            Trade with{"\n"}confidence.
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={styles.subtitle}
          >
            Verified businesses. Real records. {"\n"}
            Agricultural trade, coordinated end to end.
          </Text>
        </View>

        <View style={styles.footer}>
          <Button
            label="Get started"
            onPress={() => router.push("/register")}
            variant="primary"
            size="lg"
          />

          <Pressable
            onPress={() => router.push("/signin")}
            style={styles.signInRow}
          >
            <Text variant="bodySmall" color={colors.text.secondary}>
              Already have an account?{" "}
              <Text variant="bodyMedium" color={colors.brand.primary}>
                Sign in
              </Text>
            </Text>
          </Pressable>

          <Text
            variant="caption"
            color={colors.text.tertiary}
            style={styles.terms}
          >
            By continuing, you agree to ELBER MARKET's Terms of Service.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing[6],
  },
  topSpacer: {
    flex: 1,
  },
  brand: {
    alignItems: "flex-start",
    marginBottom: spacing[12],
  },
  logo: {
    width: 72,
    height: 72,
  },
  hero: {
    marginBottom: spacing[12],
  },
  subtitle: {
    marginTop: spacing[4],
    lineHeight: 24,
  },
  footer: {
    paddingBottom: spacing[8],
  },
  signInRow: {
    marginTop: spacing[4],
    alignItems: "center",
    paddingVertical: spacing[2],
  },
  terms: {
    textAlign: "center",
    marginTop: spacing[4],
  },
});