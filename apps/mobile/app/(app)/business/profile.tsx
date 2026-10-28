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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { HttpError, api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import type { OrganisationType } from "@/lib/api/types";

export default function BusinessProfileScreen() {
  const router = useRouter();
  const { user, refreshOrganisations } = useAuth();
  const params = useLocalSearchParams<{ type: OrganisationType }>();

  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [phone, setPhone] = useState(user?.phone_number || "");
  const [email, setEmail] = useState(user?.email || "");
  const [locationName, setLocationName] = useState("Main Location");
  const [addressLine, setAddressLine] = useState("");
  const [locality, setLocality] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);

    try {
      await api.createOrganisation({
        legal_name: legalName.trim(),
        trading_name: tradingName.trim() || undefined,
        organisation_type: params.type,
        primary_phone: phone.trim() || undefined,
        primary_email: email.trim() || undefined,
        location_name: locationName.trim(),
        address_line: addressLine.trim() || undefined,
        locality: locality.trim() || undefined,
        state: state.trim() || undefined,
      });

      await refreshOrganisations();
      router.replace("/(app)/home");
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

  const canSubmit = legalName.trim().length >= 2 && locationName.trim().length >= 1;

  const typeLabel = params.type
    ? params.type.charAt(0).toUpperCase() + params.type.slice(1).replace(/_/g, " ")
    : "Business";

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
            Set up your{"\n"}
            {typeLabel.toLowerCase()} business
          </Text>

          <View style={styles.form}>
            <Field label="Business name">
              <TextInput
                value={legalName}
                onChangeText={setLegalName}
                placeholder="e.g. Idoga Farms Ltd"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="words"
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Field label="Trading name (optional)">
              <TextInput
                value={tradingName}
                onChangeText={setTradingName}
                placeholder="The name customers know you by"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="words"
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Field label="Business phone">
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+234 801 234 5678"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="phone-pad"
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Field label="Business email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="business@example.com"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Text
              variant="overline"
              color={colors.text.tertiary}
              style={styles.sectionLabel}
            >
              Primary location
            </Text>

            <Field label="Location name">
              <TextInput
                value={locationName}
                onChangeText={setLocationName}
                placeholder="e.g. Main Farm"
                placeholderTextColor={colors.text.tertiary}
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Field label="Address (optional)">
              <TextInput
                value={addressLine}
                onChangeText={setAddressLine}
                placeholder="Street address"
                placeholderTextColor={colors.text.tertiary}
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing[2] }}>
                <Field label="City / town">
                  <TextInput
                    value={locality}
                    onChangeText={setLocality}
                    placeholder="e.g. Kaduna"
                    placeholderTextColor={colors.text.tertiary}
                    style={styles.input}
                    editable={!loading}
                  />
                </Field>
              </View>
              <View style={{ flex: 1, marginLeft: spacing[2] }}>
                <Field label="State">
                  <TextInput
                    value={state}
                    onChangeText={setState}
                    placeholder="e.g. Kaduna"
                    placeholderTextColor={colors.text.tertiary}
                    style={styles.input}
                    editable={!loading}
                  />
                </Field>
              </View>
            </View>

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
              label="Create business"
              onPress={handleSubmit}
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
    padding: spacing[6],
    paddingBottom: spacing[12],
  },
  backButton: {
    marginBottom: spacing[4],
  },
  form: {
    marginTop: spacing[6],
  },
  sectionLabel: {
    marginTop: spacing[4],
    marginBottom: spacing[3],
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
  row: {
    flexDirection: "row",
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