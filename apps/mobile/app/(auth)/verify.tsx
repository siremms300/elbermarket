import { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { HttpError, api } from "../../src/lib/api/client";
import { useAuth } from "../../src/lib/auth/context";
import { colors, spacing, radii } from "@elbermarket/design-tokens";

// OTP verification screen.
//
// Receives `target`, `channel`, `purpose` (register or signin) as route
// params. Renders a 6-digit input that auto-submits when filled.

export default function VerifyScreen() {
  const router = useRouter();
  const { signInWithSession } = useAuth();
  const params = useLocalSearchParams<{
    target: string;
    channel: "sms" | "email";
    purpose: "register" | "signin";
  }>();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const isEmail = params.channel === "email";
  const channelLabel = isEmail ? "email" : "phone";

  async function handleVerify(inputCode: string) {
    if (inputCode.length !== 6 || loading) return;

    setError(null);
    setLoading(true);

    try {
      const session =
        params.purpose === "signin"
          ? await api.verifySignIn({
              target: params.target,
              channel: params.channel,
              code: inputCode,
            })
          : await api.verifyRegistration({
              target: params.target,
              channel: params.channel,
              code: inputCode,
            });

      await signInWithSession(session);
      router.replace("/(app)/home");
    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError("Verification failed. Please try again.");
      }
      setCode("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(text: string) {
    // Only accept digits, max 6
    const digits = text.replace(/[^0-9]/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      handleVerify(digits);
    }
  }

  function handleBack() {
    router.back();
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text variant="label" color={colors.text.secondary}>
              ← Back
            </Text>
          </Pressable>

          <Text variant="h1" color={colors.text.primary}>
            Enter your code
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ marginTop: spacing[2] }}
          >
            We sent a 6-digit code to your {channelLabel}.{"\n"}
            <Text variant="bodyMedium" color={colors.text.primary}>
              {params.target}
            </Text>
          </Text>

          <View style={styles.codeInputWrapper}>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={handleCodeChange}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.codeInput}
              autoFocus
              editable={!loading}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
            />
            {loading && (
              <Text
                variant="bodySmall"
                color={colors.text.secondary}
                style={{ textAlign: "center", marginTop: spacing[4] }}
              >
                Verifying…
              </Text>
            )}
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text variant="bodySmall" color={colors.status.danger.fg}>
                {error}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing[6],
  },
  backButton: {
    marginBottom: spacing[6],
  },
  codeInputWrapper: {
    marginTop: spacing[10],
  },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    fontSize: 32,
    fontWeight: "600",
    color: colors.text.primary,
    backgroundColor: colors.surface.raised,
    textAlign: "center",
    letterSpacing: 8,
  },
  errorBox: {
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginTop: spacing[4],
  },
});