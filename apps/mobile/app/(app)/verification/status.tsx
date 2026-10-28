import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Header } from "@/components/Header";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { FadeIn } from "@/components/FadeIn";
import { Container } from "@/components/Container";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import type { VerificationStatusResponse } from "@/lib/api/verification-types";

export default function VerificationStatusScreen() {
  const router = useRouter();
  const { getActiveOrganisation } = useAuth();
  const activeOrg = getActiveOrganisation();
  const [status, setStatus] = useState<VerificationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const result = await api.getVerificationStatus(activeOrg.id);
      setStatus(result);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [activeOrg]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading || !status) {
    return (
      <Screen>
        <Header title="Verification status" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }

  const c = status.current_case;
  const isVerified = status.verification_status === "verified";
  const isPending =
    status.verification_status === "submitted" ||
    status.verification_status === "under_review";
  const isRejected = status.verification_status === "rejected";
  const needsMore = status.verification_status === "additional_info_required";

  return (
    <Screen padded={false}>
      <Container>
        <Header title="Verification status" showBack />
        <ScrollView contentContainerStyle={styles.content}>
          <FadeIn>
            <View style={styles.iconBox}>
              {isVerified && <CheckCircle2 size={56} color={colors.status.success.fg} strokeWidth={2} />}
              {isPending && <Clock size={56} color={colors.status.info.fg} strokeWidth={2} />}
              {isRejected && <XCircle size={56} color={colors.status.danger.fg} strokeWidth={2} />}
              {needsMore && <AlertCircle size={56} color={colors.status.warning.fg} strokeWidth={2} />}
            </View>

            <Text variant="h2" style={{ marginTop: spacing[4], textAlign: "center" }}>
              {isVerified && "Verification approved"}
              {isPending && "Verification submitted"}
              {isRejected && "Verification rejected"}
              {needsMore && "Additional information required"}
            </Text>

            <Text
              variant="body"
              color={colors.text.secondary}
              style={{ marginTop: spacing[2], textAlign: "center" }}
            >
              {isVerified && "Your business is now verified."}
              {isPending && "Our team will review your documents within 1-2 business days."}
              {isRejected && "Unfortunately your verification was not successful."}
              {needsMore && "We need more information to complete your verification."}
            </Text>
          </FadeIn>

          {c && (
            <FadeIn delay={100}>
              <View style={styles.card}>
                <Text variant="overline" color={colors.text.tertiary}>
                  Reference
                </Text>
                <Text variant="numeric" style={{ marginTop: spacing[2] }}>
                  {c.case_reference}
                </Text>

                <View style={styles.divider} />

                <Text variant="overline" color={colors.text.tertiary}>
                  Requested tier
                </Text>
                <Text variant="bodyMedium" style={{ marginTop: spacing[2] }}>
                  {formatTier(c.requested_tier)}
                </Text>

                {c.submitted_at && (
                  <>
                    <View style={styles.divider} />
                    <Text variant="overline" color={colors.text.tertiary}>
                      Submitted
                    </Text>
                    <Text variant="bodySmall" style={{ marginTop: spacing[2] }}>
                      {new Date(c.submitted_at).toLocaleString()}
                    </Text>
                  </>
                )}

                {c.decision && (
                  <>
                    <View style={styles.divider} />
                    <Text variant="overline" color={colors.text.tertiary}>
                      Decision
                    </Text>
                    <Badge
                      label={c.decision === "approved" ? "Approved" : c.decision === "rejected" ? "Rejected" : "More info required"}
                      variant={
                        c.decision === "approved" ? "success" : c.decision === "rejected" ? "danger" : "warning"
                      }
                      style={{ marginTop: spacing[2] }}
                    />
                  </>
                )}

                {c.decision_reason && (
                  <>
                    <View style={styles.divider} />
                    <Text variant="overline" color={colors.text.tertiary}>
                      Reviewer notes
                    </Text>
                    <Text variant="bodySmall" style={{ marginTop: spacing[2] }}>
                      {c.decision_reason}
                    </Text>
                  </>
                )}
              </View>
            </FadeIn>
          )}

          <View style={styles.actions}>
            {(isRejected || needsMore) && (
              <Button
                label="Resubmit documents"
                onPress={() => router.push("/(app)/verification/select-tier")}
                size="lg"
              />
            )}
            {isVerified && (
              <Button
                label="Back to profile"
                onPress={() => router.push("/(app)/profile")}
                variant="secondary"
                size="lg"
              />
            )}
          </View>
        </ScrollView>
      </Container>
    </Screen>
  );
}

function formatTier(tier: string): string {
  switch (tier) {
    case "basic": return "Basic";
    case "business": return "Business";
    case "fleet_owner": return "Fleet Owner";
    default: return tier;
  }
}

const styles = StyleSheet.create({
  content: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  iconBox: {
    alignItems: "center",
  },
  card: {
    marginTop: spacing[6],
    padding: spacing[5],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing[4],
  },
  actions: {
    marginTop: spacing[6],
    gap: spacing[3],
  },
});