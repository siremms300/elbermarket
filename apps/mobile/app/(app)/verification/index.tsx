import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Shield,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ChevronRight,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Header } from "@/components/Header";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { FadeIn } from "@/components/FadeIn";
import { Container } from "@/components/Container";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import type { VerificationStatusResponse } from "@/lib/api/verification-types";

export default function VerificationHomeScreen() {
  const router = useRouter();
  const { organisations, getActiveOrganisation } = useAuth();
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
      // Ignore — keep last known
    } finally {
      setLoading(false);
    }
  }, [activeOrg]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!activeOrg) {
    return (
      <Screen>
        <Header title="Verification" showBack />
        <Text variant="body" color={colors.text.secondary}>
          No active organisation. Please set up a business first.
        </Text>
      </Screen>
    );
  }

  if (loading || !status) {
    return (
      <Screen>
        <Header title="Verification" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }

  // Determine visual state based on status
  const isVerified = status.verification_status === "verified";
  const isSubmitted =
    status.verification_status === "submitted" ||
    status.verification_status === "under_review";
  const isRejected = status.verification_status === "rejected";
  const needsMoreInfo =
    status.verification_status === "additional_info_required";
  const notStarted =
    status.verification_status === "not_started" ||
    status.verification_status === "draft";

  return (
    <Screen padded={false}>
      <Container>
        <Header title="Verification" showBack />
        <ScrollView contentContainerStyle={styles.content}>
          {/* Status hero card */}
          <FadeIn>
            <View style={[styles.heroCard, { backgroundColor: getHeroBg(status.verification_status) }]}>
              <View style={styles.heroIconWrap}>
                {getHeroIcon(status.verification_status)}
              </View>
              <Text variant="h2" style={{ marginTop: spacing[3], textAlign: "center" }}>
                {getHeroTitle(status.verification_status)}
              </Text>
              <Text
                variant="body"
                color={colors.text.secondary}
                style={{ marginTop: spacing[2], textAlign: "center" }}
              >
                {getHeroSubtitle(status)}
              </Text>
              {isVerified && (
                <Badge
                  label={`Tier: ${formatTier(status.verification_tier)}`}
                  variant="success"
                  style={{ marginTop: spacing[3] }}
                />
              )}
            </View>
          </FadeIn>

          {/* Current tier info */}
          {isVerified && (
            <FadeIn delay={80}>
              <View style={styles.section}>
                <Text variant="overline" color={colors.text.tertiary}>
                  Your tier
                </Text>
                <Text variant="h3" style={{ marginTop: spacing[2] }}>
                  {formatTier(status.verification_tier)}
                </Text>
                <Text
                  variant="bodySmall"
                  color={colors.text.secondary}
                  style={{ marginTop: spacing[2] }}
                >
                  You can create trips, receive payments, and access all core features.
                </Text>
                {status.verification_tier !== "fleet_owner" && (
                  <Pressable
                    onPress={() => router.push("/(app)/verification/select-tier")}
                    style={styles.upgradeCard}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">Upgrade your tier</Text>
                      <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: 2 }}>
                        Unlock more capabilities
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.text.tertiary} />
                  </Pressable>
                )}
              </View>
            </FadeIn>
          )}

          {/* Rejection reason */}
          {isRejected && status.current_case?.decision_reason && (
            <FadeIn delay={80}>
              <View style={styles.rejectionBox}>
                <Text variant="overline" color={colors.status.danger.fg}>
                  Reason for rejection
                </Text>
                <Text variant="body" color={colors.text.primary} style={{ marginTop: spacing[2] }}>
                  {status.current_case.decision_reason}
                </Text>
              </View>
            </FadeIn>
          )}

          {/* Additional info requested */}
          {needsMoreInfo && status.current_case?.decision_reason && (
            <FadeIn delay={80}>
              <View style={styles.infoBox}>
                <Text variant="overline" color={colors.status.warning.fg}>
                  More information required
                </Text>
                <Text variant="body" color={colors.text.primary} style={{ marginTop: spacing[2] }}>
                  {status.current_case.decision_reason}
                </Text>
              </View>
            </FadeIn>
          )}

          {/* Action button */}
          <FadeIn delay={160}>
            <View style={styles.actionSection}>
              {notStarted && (
                <Button
                  label="Start verification"
                  onPress={() => router.push("/(app)/verification/select-tier")}
                  size="lg"
                />
              )}
              {isRejected && (
                <Button
                  label="Resubmit verification"
                  onPress={() => router.push("/(app)/verification/select-tier")}
                  size="lg"
                />
              )}
              {needsMoreInfo && (
                <Button
                  label="Provide additional info"
                  onPress={() => router.push("/(app)/verification/select-tier")}
                  size="lg"
                />
              )}
              {isSubmitted && (
                <Button
                  label="View submitted documents"
                  onPress={() => router.push("/(app)/verification/status")}
                  size="lg"
                  variant="secondary"
                />
              )}
            </View>
          </FadeIn>

          {/* Info section */}
          {notStarted && (
            <FadeIn delay={240}>
              <View style={styles.infoSection}>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  Verification is required to access the full platform.
                  The process typically takes 1-2 business days after submission.
                </Text>
              </View>
            </FadeIn>
          )}
        </ScrollView>
      </Container>
    </Screen>
  );
}

function getHeroIcon(status: string) {
  if (status === "verified") return <CheckCircle2 size={40} color={colors.status.success.fg} strokeWidth={2} />;
  if (status === "submitted" || status === "under_review")
    return <Clock size={40} color={colors.status.info.fg} strokeWidth={2} />;
  if (status === "rejected") return <XCircle size={40} color={colors.status.danger.fg} strokeWidth={2} />;
  if (status === "additional_info_required")
    return <AlertCircle size={40} color={colors.status.warning.fg} strokeWidth={2} />;
  return <Shield size={40} color={colors.brand.primary} strokeWidth={2} />;
}

function getHeroBg(status: string): string {
  if (status === "verified") return colors.status.success.bg;
  if (status === "submitted" || status === "under_review") return colors.status.info.bg;
  if (status === "rejected") return colors.status.danger.bg;
  if (status === "additional_info_required") return colors.status.warning.bg;
  return colors.brand.primaryMuted;
}

function getHeroTitle(status: string): string {
  switch (status) {
    case "verified": return "Business verified";
    case "submitted": return "Under review";
    case "under_review": return "Under review";
    case "rejected": return "Verification rejected";
    case "additional_info_required": return "More info needed";
    default: return "Verify your business";
  }
}

function getHeroSubtitle(status: VerificationStatusResponse): string {
  switch (status.verification_status) {
    case "verified":
      return "Your business is verified. You have full access to the platform.";
    case "submitted":
      return "We received your documents. Our team will review them shortly.";
    case "under_review":
      return "Our team is reviewing your documents. You'll be notified when it's done.";
    case "rejected":
      return "Unfortunately, your verification was not successful.";
    case "additional_info_required":
      return "We need a bit more information to complete your verification.";
    default:
      return "Verify your business to unlock the full platform. It takes about 2 minutes.";
  }
}

function formatTier(tier: string): string {
  switch (tier) {
    case "basic": return "Basic";
    case "business": return "Business";
    case "fleet_owner": return "Fleet Owner";
    default: return "Unverified";
  }
}

const styles = StyleSheet.create({
  content: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  heroCard: {
    padding: spacing[6],
    borderRadius: radii.lg,
    alignItems: "center",
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginTop: spacing[6],
    padding: spacing[5],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  rejectionBox: {
    marginTop: spacing[6],
    padding: spacing[5],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.status.danger.border,
  },
  infoBox: {
    marginTop: spacing[6],
    padding: spacing[5],
    backgroundColor: colors.status.warning.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.status.warning.border,
  },
  actionSection: {
    marginTop: spacing[6],
  },
  infoSection: {
    marginTop: spacing[6],
    padding: spacing[4],
    alignItems: "center",
  },
});