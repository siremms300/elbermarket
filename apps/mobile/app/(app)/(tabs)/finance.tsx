import { useCallback, useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Headphones,
  TrendingUp,
  TrendingDown,
  Lock,
  ChevronRight,
  Info,
  Building2,
  Truck,
  Shield,
  CheckCircle2,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { FadeIn } from "@/components/FadeIn";
import { Container } from "@/components/Container";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";

// Finance screen — investor preview.
//
// This screen is a mock. It shows what the finance dashboard will look like
// when Phase 3 (financial operations) is complete. The data below is
// illustrative, not real — it is labelled "Preview" in the UI, and the
// transaction entries are fabricated examples chosen to look realistic.
//
// No backend call is made on this screen. When we wire Phase 3, the shape
// of the data below becomes the shape of the API response.

interface Transaction {
  id: string;
  type: "inflow" | "outflow" | "settlement" | "premium";
  title: string;
  subtitle: string;
  amount: number;
  currency: string;
  timestamp: string;
  status: "completed" | "pending" | "failed";
}

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "txn_001",
    type: "settlement",
    title: "Settlement — TRP-A3K9M2X7",
    subtitle: "Kaduna → Lagos · Maize 5,000 kg",
    amount: 145000,
    currency: "NGN",
    timestamp: "2026-10-27T14:22:00Z",
    status: "completed",
  },
  {
    id: "txn_002",
    type: "premium",
    title: "Insurance premium",
    subtitle: "TRP-A3K9M2X7 · cargo value ₦500,000",
    amount: -2625,
    currency: "NGN",
    timestamp: "2026-10-27T09:15:00Z",
    status: "completed",
  },
  {
    id: "txn_003",
    type: "outflow",
    title: "Transport charge",
    subtitle: "TRP-B8F2P1Q4 · Kaduna → Abuja",
    amount: -85000,
    currency: "NGN",
    timestamp: "2026-10-26T16:40:00Z",
    status: "completed",
  },
  {
    id: "txn_004",
    type: "inflow",
    title: "Escrow release",
    subtitle: "PO-2026-1042 · buyer confirmed receipt",
    amount: 420000,
    currency: "NGN",
    timestamp: "2026-10-26T11:05:00Z",
    status: "completed",
  },
  {
    id: "txn_005",
    type: "premium",
    title: "Insurance premium",
    subtitle: "TRP-B8F2P1Q4 · cargo value ₦1,200,000",
    amount: -4800,
    currency: "NGN",
    timestamp: "2026-10-26T10:30:00Z",
    status: "completed",
  },
  {
    id: "txn_006",
    type: "settlement",
    title: "Settlement — TRP-C1N7R5K2",
    subtitle: "Kano → Port Harcourt · Sesame 3,200 kg",
    amount: 92000,
    currency: "NGN",
    timestamp: "2026-10-25T18:12:00Z",
    status: "completed",
  },
  {
    id: "txn_007",
    type: "outflow",
    title: "Transport charge",
    subtitle: "TRP-C1N7R5K2 · awaiting driver assignment",
    amount: -65000,
    currency: "NGN",
    timestamp: "2026-10-25T14:00:00Z",
    status: "pending",
  },
  {
    id: "txn_008",
    type: "inflow",
    title: "Escrow deposit",
    subtitle: "PO-2026-1039 · awaiting seller confirmation",
    amount: 250000,
    currency: "NGN",
    timestamp: "2026-10-24T09:45:00Z",
    status: "pending",
  },
  {
    id: "txn_009",
    type: "premium",
    title: "Insurance premium",
    subtitle: "TRP-C1N7R5K2 · cargo value ₦800,000",
    amount: -3200,
    currency: "NGN",
    timestamp: "2026-10-24T09:50:00Z",
    status: "completed",
  },
  {
    id: "txn_010",
    type: "settlement",
    title: "Settlement — TRP-D4H6T9W3",
    subtitle: "Ibadan → Lagos · Cocoa 2,500 kg",
    amount: 78000,
    currency: "NGN",
    timestamp: "2026-10-23T15:20:00Z",
    status: "completed",
  },
];

function formatNGN(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-NG", { maximumFractionDigits: 0 });
  return `₦${formatted}`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
  });
}

export default function FinanceTab() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Simulate a brief load so the FadeIn animations stagger nicely.
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setIsRefreshing(false);
  }, []);

  const stats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    MOCK_TRANSACTIONS.forEach((t) => {
      if (t.status === "completed") {
        if (t.amount > 0) inflow += t.amount;
        else outflow += Math.abs(t.amount);
      }
    });
    return {
      inflow,
      outflow,
      net: inflow - outflow,
      pending: MOCK_TRANSACTIONS.filter((t) => t.status === "pending").length,
    };
  }, []);

  const balance = 1250450;
  const pendingBalance = 315000;

  return (
    <Screen padded={false}>
      <Container>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand.primary}
            />
          }
        >
          {/* Header */}
          <FadeIn>
            <View style={styles.header}>
              <View>
                <Text variant="h1">Finance</Text>
                <Text
                  variant="bodySmall"
                  color={colors.text.secondary}
                  style={{ marginTop: 2 }}
                >
                  Balances, settlements, statements
                </Text>
              </View>
              <View style={styles.previewPill}>
                <Text
                  variant="caption"
                  color={colors.status.accent.fg}
                  style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}
                >
                  PREVIEW
                </Text>
              </View>
            </View>
          </FadeIn>

          {/* Balance card */}
          <FadeIn delay={60}>
            <View style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <Text
                  variant="overline"
                  color="rgba(255,255,255,0.65)"
                  style={{ letterSpacing: 1.5 }}
                >
                  Available balance
                </Text>
                <Wallet size={18} color="rgba(255,255,255,0.75)" strokeWidth={2} />
              </View>

              <Text
                variant="numeric"
                color={colors.text.inverse}
                style={{ fontSize: 36, lineHeight: 42, marginTop: 6 }}
              >
                {formatNGN(balance)}
              </Text>

              <View style={styles.pendingRow}>
                <Lock size={11} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                <Text
                  variant="caption"
                  color="rgba(255,255,255,0.65)"
                  style={{ marginLeft: 4 }}
                >
                  {formatNGN(pendingBalance)} pending release
                </Text>
              </View>

              <View style={styles.balanceActions}>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Withdrawal preview",
                      "Withdrawals go live in Phase 3 when the payment provider is integrated. This is a preview screen.",
                    )
                  }
                  style={styles.balanceActionPrimary}
                >
                  <ArrowDownLeft size={16} color={colors.brand.primary} strokeWidth={2.5} />
                  <Text
                    variant="label"
                    color={colors.brand.primary}
                    style={{ marginLeft: 6, fontWeight: "600" }}
                  >
                    Withdraw
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Statement preview",
                      "PDF statements are generated in Phase 3. This is a preview screen.",
                    )
                  }
                  style={styles.balanceActionSecondary}
                >
                  <FileText size={16} color="rgba(255,255,255,0.9)" strokeWidth={2} />
                  <Text
                    variant="label"
                    color="rgba(255,255,255,0.9)"
                    style={{ marginLeft: 6, fontWeight: "600" }}
                  >
                    Statement
                  </Text>
                </Pressable>
              </View>
            </View>
          </FadeIn>

          {/* Monthly summary */}
          <FadeIn delay={120}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryIconIn}>
                  <TrendingUp size={14} color={colors.status.success.fg} strokeWidth={2.5} />
                </View>
                <Text
                  variant="overline"
                  color={colors.text.tertiary}
                  style={{ marginTop: spacing[2], fontSize: 10 }}
                >
                  IN THIS MONTH
                </Text>
                <Text
                  variant="numeric"
                  color={colors.status.success.fg}
                  style={{ fontSize: 16, lineHeight: 20, marginTop: 4 }}
                >
                  {formatNGN(stats.inflow)}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <View style={styles.summaryIconOut}>
                  <TrendingDown size={14} color={colors.status.danger.fg} strokeWidth={2.5} />
                </View>
                <Text
                  variant="overline"
                  color={colors.text.tertiary}
                  style={{ marginTop: spacing[2], fontSize: 10 }}
                >
                  OUT THIS MONTH
                </Text>
                <Text
                  variant="numeric"
                  color={colors.text.primary}
                  style={{ fontSize: 16, lineHeight: 20, marginTop: 4 }}
                >
                  {formatNGN(stats.outflow)}
                </Text>
              </View>
            </View>
          </FadeIn>

          {/* Quick actions */}
          <FadeIn delay={180}>
            <View style={styles.quickActionsRow}>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Support preview",
                    "Live support chat opens in Phase 5. This is a preview screen.",
                  )
                }
                style={styles.quickAction}
              >
                <View style={styles.quickActionIcon}>
                  <Headphones size={18} color={colors.brand.primary} strokeWidth={2} />
                </View>
                <Text variant="label" style={{ marginTop: 6, fontSize: 12 }}>
                  Support
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Reconciliation preview",
                    "Reconciliation reports arrive in Phase 3. This is a preview screen.",
                  )
                }
                style={styles.quickAction}
              >
                <View style={styles.quickActionIcon}>
                  <Building2 size={18} color={colors.brand.primary} strokeWidth={2} />
                </View>
                <Text variant="label" style={{ marginTop: 6, fontSize: 12 }}>
                  Bank
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Statement preview",
                    "Statement downloads arrive in Phase 3. This is a preview screen.",
                  )
                }
                style={styles.quickAction}
              >
                <View style={styles.quickActionIcon}>
                  <FileText size={18} color={colors.brand.primary} strokeWidth={2} />
                </View>
                <Text variant="label" style={{ marginTop: 6, fontSize: 12 }}>
                  Statements
                </Text>
              </Pressable>
            </View>
          </FadeIn>

          {/* Transactions */}
          <FadeIn delay={240}>
            <View style={styles.sectionHeader}>
              <Text variant="h2">Transactions</Text>
              {stats.pending > 0 && (
                <View style={styles.pendingChip}>
                  <Text
                    variant="caption"
                    color={colors.status.accent.fg}
                    style={{ fontSize: 11, fontWeight: "600" }}
                  >
                    {stats.pending} pending
                  </Text>
                </View>
              )}
            </View>
          </FadeIn>

          {mounted && (
            <View style={styles.transactionList}>
              {MOCK_TRANSACTIONS.map((txn, idx) => (
                <FadeIn key={txn.id} delay={280 + idx * 25}>
                  <TransactionRow txn={txn} isLast={idx === MOCK_TRANSACTIONS.length - 1} />
                </FadeIn>
              ))}
            </View>
          )}

          {/* Preview note */}
          <FadeIn delay={520}>
            <View style={styles.previewNote}>
              <Info size={14} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                variant="caption"
                color={colors.text.tertiary}
                style={{ marginLeft: spacing[2], flex: 1, lineHeight: 16 }}
              >
                This screen shows illustrative data. Live payments, settlements,
                and statements ship in Phase 3 with a licensed payment provider.
              </Text>
            </View>
          </FadeIn>
        </ScrollView>
      </Container>
    </Screen>
  );
}

function TransactionRow({ txn, isLast }: { txn: Transaction; isLast: boolean }) {
  const iconMeta = getTxnIconMeta(txn.type);
  const isCredit = txn.amount > 0;
  const statusMeta = getStatusMeta(txn.status);

  return (
    <View style={[styles.txnRow, isLast && { borderBottomWidth: 0 }]}>
      <View
        style={[styles.txnIcon, { backgroundColor: `${iconMeta.color}15` }]}
      >
        <iconMeta.Icon size={16} color={iconMeta.color} strokeWidth={2.5} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing[3] }}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {txn.title}
        </Text>
        <Text
          variant="caption"
          color={colors.text.tertiary}
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {txn.subtitle} · {formatRelative(txn.timestamp)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", marginLeft: spacing[2] }}>
        <Text
          variant="numeric"
          color={isCredit ? colors.status.success.fg : colors.text.primary}
          style={{ fontSize: 14, lineHeight: 18 }}
        >
          {isCredit ? "+" : "−"}
          {formatNGN(txn.amount)}
        </Text>
        {txn.status !== "completed" && (
          <View
            style={[
              styles.txnStatusChip,
              { backgroundColor: statusMeta.bg, marginTop: 3 },
            ]}
          >
            <Text
              variant="caption"
              color={statusMeta.fg}
              style={{ fontSize: 9, fontWeight: "700", lineHeight: 12 }}
            >
              {statusMeta.label}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function getTxnIconMeta(type: Transaction["type"]): {
  Icon: typeof ArrowDownLeft;
  color: string;
} {
  switch (type) {
    case "inflow":
      return { Icon: ArrowDownLeft, color: colors.status.success.fg };
    case "outflow":
      return { Icon: ArrowUpRight, color: colors.status.danger.fg };
    case "settlement":
      return { Icon: CheckCircle2, color: colors.status.info.fg };
    case "premium":
      return { Icon: Shield, color: colors.brand.accent };
    default:
      return { Icon: Truck, color: colors.text.secondary };
  }
}

function getStatusMeta(status: Transaction["status"]) {
  switch (status) {
    case "pending":
      return { label: "PENDING", bg: colors.status.accent.bg, fg: colors.status.accent.fg };
    case "failed":
      return { label: "FAILED", bg: colors.status.danger.bg, fg: colors.status.danger.fg };
    default:
      return { label: "DONE", bg: colors.status.success.bg, fg: colors.status.success.fg };
  }
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing[5],
  },
  previewPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.status.accent.bg,
    borderWidth: 1,
    borderColor: colors.status.accent.border,
  },
  balanceCard: {
    backgroundColor: colors.brand.primary,
    borderRadius: radii.xl,
    padding: spacing[5],
    ...elevation.medium,
  },
  balanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[3],
  },
  balanceActions: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[5],
  },
  balanceActionPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[3],
    borderRadius: radii.md,
    backgroundColor: colors.text.inverse,
  },
  balanceActionSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[3],
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[4],
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...elevation.subtle,
  },
  summaryIconIn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.status.success.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryIconOut: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.status.danger.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[4],
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[3],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing[6],
    marginBottom: spacing[3],
  },
  pendingChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: colors.status.accent.bg,
  },
  transactionList: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
    ...elevation.subtle,
  },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txnStatusChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  previewNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: spacing[5],
    padding: spacing[3],
    backgroundColor: colors.surface.sunken,
    borderRadius: radii.md,
  },
});