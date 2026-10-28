import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Check, ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Header } from "@/components/Header";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { Badge } from "@/components/Badge";
import { FadeIn } from "@/components/FadeIn";
import { Container } from "@/components/Container";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import type { TierInfo, VerificationTier } from "@/lib/api/verification-types";

export default function SelectTierScreen() {
  const router = useRouter();
  const { getActiveOrganisation } = useAuth();
  const activeOrg = getActiveOrganisation();
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [currentTier, setCurrentTier] = useState<VerificationTier>("unverified");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [tiersResponse, statusResponse] = await Promise.all([
          api.listVerificationTiers(),
          activeOrg ? api.getVerificationStatus(activeOrg.id) : Promise.resolve(null),
        ]);
        setTiers(tiersResponse.tiers);
        if (statusResponse) setCurrentTier(statusResponse.verification_tier);
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeOrg]);

  if (loading) {
    return (
      <Screen>
        <Header title="Choose verification level" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Container>
        <Header title="Choose verification level" showBack />
        <ScrollView contentContainerStyle={styles.content}>
          <FadeIn>
            <Text variant="h2">How do you operate?</Text>
            <Text
              variant="body"
              color={colors.text.secondary}
              style={{ marginTop: spacing[2], marginBottom: spacing[6] }}
            >
              Choose the verification level that fits your business. You can upgrade later.
            </Text>
          </FadeIn>

          {tiers.map((tier, idx) => {
            const isCurrent = tier.key === currentTier;
            const isUpgrade = tierRank(tier.key) > tierRank(currentTier);

            return (
              <FadeIn key={tier.key} delay={80 + idx * 60}>
                <Pressable
                  onPress={() => {
                    router.push({
                      pathname: "/(app)/verification/upload/[tier]",
                      params: { tier: tier.key },
                    });
                  }}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <Text variant="h3">{tier.label}</Text>
                    {isCurrent && <Badge label="Current" variant="success" size="sm" />}
                    {!isCurrent && isUpgrade && (
                      <Badge label="Upgrade" variant="info" size="sm" />
                    )}
                  </View>

                  <Text
                    variant="bodySmall"
                    color={colors.text.secondary}
                    style={{ marginTop: spacing[2] }}
                  >
                    {tier.description}
                  </Text>

                  <View style={styles.section}>
                    <Text variant="overline" color={colors.text.tertiary}>
                      Requires
                    </Text>
                    {tier.requires.map((doc) => (
                      <View key={doc} style={styles.bullet}>
                        <Check size={12} color={colors.text.tertiary} strokeWidth={2.5} />
                        <Text
                          variant="bodySmall"
                          color={colors.text.secondary}
                          style={{ marginLeft: 6 }}
                        >
                          {doc.replace(/_/g, " ")}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.section}>
                    <Text variant="overline" color={colors.text.tertiary}>
                      Unlocks
                    </Text>
                    {tier.unlocks.map((item) => (
                      <View key={item} style={styles.bullet}>
                        <Check size={12} color={colors.status.success.fg} strokeWidth={2.5} />
                        <Text
                          variant="bodySmall"
                          color={colors.text.secondary}
                          style={{ marginLeft: 6 }}
                        >
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.cardFooter}>
                    <Text variant="label" color={colors.brand.primary}>
                      {isCurrent ? "Add more documents" : "Start verification"}
                    </Text>
                    <ChevronRight size={18} color={colors.brand.primary} />
                  </View>
                </Pressable>
              </FadeIn>
            );
          })}
        </ScrollView>
      </Container>
    </Screen>
  );
}

function tierRank(tier: string): number {
  return { unverified: 0, basic: 1, business: 2, fleet_owner: 3 }[tier] ?? 0;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  card: {
    padding: spacing[5],
    marginBottom: spacing[4],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  section: {
    marginTop: spacing[4],
  },
  bullet: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[1],
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
});