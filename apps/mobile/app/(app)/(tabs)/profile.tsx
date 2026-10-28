import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Bell,
  Shield,
  Smartphone,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  Building2,
  CheckCircle2,
} from "lucide-react-native"; 
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { FadeIn } from "@/components/FadeIn";
import { Avatar } from "@/components/Avatar";
import { Container } from "@/components/Container";
import { useAuth } from "@/lib/auth/context";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";

export default function ProfileTab() {
  const router = useRouter();
  const { user, organisations, signOut, getActiveOrganisation } = useAuth();
  const activeOrg = getActiveOrganisation();

  const handleSignOut = () => {
    Alert.alert(
      "Sign out?",
      "You'll need to sign in again with an OTP.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: signOut },
      ],
    );
  };

  return (
    <Screen padded={false}>
      <Container>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* User card */}
          <FadeIn>
            <View style={styles.userCard}>
              <Avatar name={user?.full_name} size="lg" />
              <View style={{ marginLeft: spacing[4], flex: 1 }}>
                <Text variant="h2" numberOfLines={1}>
                  {user?.full_name ?? "—"}
                </Text>
                <Text
                  variant="bodySmall"
                  color={colors.text.secondary}
                  style={{ marginTop: 2 }}
                  numberOfLines={1}
                >
                  {user?.phone_number ?? ""}
                </Text>
                <Text
                  variant="bodySmall"
                  color={colors.text.tertiary}
                  style={{ marginTop: 2 }}
                  numberOfLines={1}
                >
                  {user?.email ?? ""}
                </Text>
              </View>
            </View>
          </FadeIn>


          {/* Verification status card */}
          <FadeIn delay={80}>
            <Pressable
              onPress={() => router.push("/(app)/verification")}
              style={styles.verificationCard}
            >
              <View style={styles.verificationIcon}>
                {getActiveOrganisation()?.verification_status === "verified" ? (
                  <CheckCircle2 size={20} color={colors.status.success.fg} strokeWidth={2.5} />
                ) : (
                  <Shield size={20} color={colors.brand.primary} strokeWidth={2} />
                )}
              </View>
              <View style={{ flex: 1, marginLeft: spacing[3] }}>
                <Text variant="bodyMedium">
                  {getActiveOrganisation()?.verification_status === "verified"
                    ? "Business verified"
                    : "Verify your business"}
                </Text>
                <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: 2 }}>
                  {getActiveOrganisation()?.verification_status === "verified"
                    ? "You have full access to all features"
                    : "Unlock the full platform in 2 minutes"}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.text.tertiary} />
            </Pressable>
          </FadeIn>







          {/* Active organisation */}
          {activeOrg && (
            <FadeIn delay={80}>
              <View style={styles.orgCard}>
                <View style={styles.orgIcon}>
                  <Building2 size={20} color={colors.brand.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing[3] }}>
                  <Text variant="label" color={colors.text.tertiary}>
                    Active business
                  </Text>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {activeOrg.legal_name}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                    <Text variant="caption" color={colors.text.secondary}>
                      {activeOrg.organisation_type.replace(/_/g, " ")}
                    </Text>
                    {activeOrg.verification_status === "verified" && (
                      <View style={styles.verifiedBadge}>
                        <CheckCircle2 size={10} color={colors.status.success.fg} strokeWidth={2.5} />
                        <Text
                          variant="caption"
                          color={colors.status.success.fg}
                          style={{ marginLeft: 2, fontSize: 10, fontWeight: "600" }}
                        >
                          Verified
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </FadeIn>
          )}

          {/* Sections */}
          <FadeIn delay={160}>
            <Section title="Account">
              <ProfileRow
                icon={<Bell size={18} color={colors.text.secondary} strokeWidth={2} />}
                label="Notifications"
                onPress={() => router.push("/(app)/notifications")}
              />
              <ProfileRow
                icon={<Shield size={18} color={colors.text.secondary} strokeWidth={2} />}
                label="Security"
                subtitle="Change password, sessions"
                onPress={() => {}}
              />
              <ProfileRow
                icon={<Smartphone size={18} color={colors.text.secondary} strokeWidth={2} />}
                label="Devices"
                subtitle="Manage signed-in devices"
                onPress={() => {}}
              />
            </Section>
          </FadeIn>

          <FadeIn delay={240}>
            <Section title="Support">
              <ProfileRow
                icon={<HelpCircle size={18} color={colors.text.secondary} strokeWidth={2} />}
                label="Help & support"
                onPress={() => {}}
              />
              <ProfileRow
                icon={<Info size={18} color={colors.text.secondary} strokeWidth={2} />}
                label="About ELBER MARKET"
                subtitle="Version 0.1.0"
                onPress={() => {}}
              />
            </Section>
          </FadeIn>

          <FadeIn delay={320}>
            <Pressable onPress={handleSignOut} style={styles.signOutButton}>
              <LogOut size={18} color={colors.status.danger.fg} strokeWidth={2} />
              <Text
                variant="bodyMedium"
                color={colors.status.danger.fg}
                style={{ marginLeft: spacing[2] }}
              >
                Sign out
              </Text>
            </Pressable>
          </FadeIn>
        </ScrollView>
      </Container>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text
        variant="overline"
        color={colors.text.tertiary}
        style={{ marginBottom: spacing[2], marginLeft: spacing[2] }}
      >
        {title}
      </Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function ProfileRow({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{label}</Text>
        {subtitle && (
          <Text
            variant="caption"
            color={colors.text.tertiary}
            style={{ marginTop: 2 }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[4],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  orgCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[3],
    padding: spacing[4],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  orgIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: spacing[2],
  },
  section: {
    marginTop: spacing[6],
  },
  sectionCard: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
    ...elevation.subtle,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowIcon: {
    width: 24,
    marginRight: spacing[3],
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[6],
    paddingVertical: spacing[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.status.danger.fg + "30",
    backgroundColor: colors.status.danger.bg,
  },


verificationCard: {
  flexDirection: "row",
  alignItems: "center",
  marginTop: spacing[3],
  padding: spacing[4],
  backgroundColor: colors.surface.raised,
  borderRadius: radii.lg,
  borderWidth: 1,
  borderColor: colors.border.subtle,
  ...elevation.subtle,
},
verificationIcon: {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.brand.primaryMuted,
  alignItems: "center",
  justifyContent: "center",
},







});