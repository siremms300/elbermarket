import { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { HttpError, api } from "../../src/lib/api/client";
import { colors, spacing, radii } from "@elbermarket/design-tokens";

// Sign-in screen.
//
// Existing users enter their email (or phone) and receive an OTP.
// Channel is forced to email until SMS is verified with Termii.
//
// The backend accepts both email and phone identifiers; if the identifier
// resolves to a user with a verified email, the OTP goes to their email.

type Channel = "sms" | "email";
const ACTIVE_CHANNEL: Channel = "email";

export default function SignInScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setError(null);
    setLoading(true);

    try {
      await api.signIn({
        identifier: identifier.trim(),
        channel: ACTIVE_CHANNEL,
      });

      // Navigate to /verify. The target for verification is the identifier
      // the user entered — because that's what the backend used to
      // resolve the user. When the backend defaults to email, and the
      // user entered their email, this matches.
      router.push({
        pathname: "/verify",
        params: {
          target: identifier.trim(),
          channel: ACTIVE_CHANNEL,
          purpose: "signin",
        },
      });
    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    router.back();
  }

  const canSubmit = identifier.trim().length >= 5 && !loading;

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text variant="label" color={colors.text.secondary}>
              ← Back
            </Text>
          </Pressable>

          <Text variant="h1" color={colors.text.primary}>
            Welcome{"\n"}back
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ marginTop: spacing[2] }}
          >
            Sign in with the email you registered with.
          </Text>

          <View style={styles.form}>
            <Field label="Email">
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="you@example.com"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={styles.input}
                editable={!loading}
                autoFocus
              />
            </Field>

            <Text
              variant="caption"
              color={colors.text.tertiary}
              style={styles.hint}
            >
              We'll email you a 6-digit code.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text variant="bodySmall" color={colors.status.danger.fg}>
                  {error}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Button
              label="Send code"
              onPress={handleContinue}
              variant="primary"
              size="lg"
              loading={loading}
              disabled={!canSubmit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing[4] }}>
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: spacing[2] }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing[6],
    paddingBottom: spacing[12],
  },
  backButton: {
    marginBottom: spacing[6],
  },
  form: {
    marginTop: spacing[8],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.surface.raised,
  },
  hint: {
    marginTop: spacing[2],
  },
  errorBox: {
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginTop: spacing[2],
  },
  footer: {
    marginTop: spacing[6],
  },
});