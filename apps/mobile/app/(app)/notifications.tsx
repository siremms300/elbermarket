import { useCallback, useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  SectionList,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Bell, Check, CheckCheck } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { EmptyState } from "@/components/EmptyState";
import { Container } from "@/components/Container";
import { FadeIn } from "@/components/FadeIn";
import { api } from "@/lib/api/client";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import type { Notification } from "@/lib/api/types";

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.listNotifications();
      setNotifications(result.notifications ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  // Group notifications by date
  const sections = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const groups: Record<string, Notification[]> = {
      Today: [],
      Yesterday: [],
      "This week": [],
      Older: [],
    };

    for (const notif of notifications) {
      const d = new Date(notif.created_at);
      if (d >= todayStart) groups.Today.push(notif);
      else if (d >= yesterdayStart) groups.Yesterday.push(notif);
      else if (d >= weekStart) groups["This week"].push(notif);
      else groups.Older.push(notif);
    }

    return Object.entries(groups)
      .filter(([_, items]) => items.length > 0)
      .map(([title, data]) => ({ title, data }));
  }, [notifications]);

  async function markRead(notification: Notification) {
    if (notification.read_at) return;

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
    try {
      await api.markNotificationRead(notification.id);
    } catch {
      // Ignore
    }
  }

  async function handlePress(notification: Notification) {
    await markRead(notification);
    if (
      notification.related_entity_type === "transport_request" &&
      notification.related_entity_id
    ) {
      router.push(`/(app)/trips/${notification.related_entity_id}`);
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read_at);
    if (unread.length === 0) return;

    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
    );
    await Promise.all(
      unread.map((n) =>
        api.markNotificationRead(n.id).catch(() => {
          // Ignore individual failures
        }),
      ),
    );
  }

  if (loading) {
    return (
      <Screen padded={false}>
        <Container>
          <View style={styles.header}>
            <Text variant="h1">Notifications</Text>
          </View>
          <View style={styles.listContent}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <View style={styles.skeletonDot} />
                <View style={{ flex: 1, marginLeft: spacing[3] }}>
                  <View style={styles.skeletonLine1} />
                  <View style={styles.skeletonLine2} />
                </View>
              </View>
            ))}
          </View>
        </Container>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Container>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text variant="label" color={colors.text.secondary}>
              ← Back
            </Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {unreadCount > 0 && (
            <Pressable onPress={markAllRead} style={styles.markAllBtn}>
              <CheckCheck size={16} color={colors.brand.primary} strokeWidth={2} />
              <Text
                variant="label"
                color={colors.brand.primary}
                style={{ marginLeft: 4, fontWeight: "600" }}
              >
                Mark all read
              </Text>
            </Pressable>
          )}
        </View>

        <Text variant="h1" style={{ paddingHorizontal: spacing[5], marginBottom: spacing[4] }}>
          Notifications
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text variant="bodySmall" color={colors.status.danger.fg}>
              {error}
            </Text>
          </View>
        )}

        {!error && notifications.length === 0 && (
          <EmptyState
            icon={<Bell size={32} color={colors.brand.primary} strokeWidth={1.5} />}
            title="You're all caught up"
            description="Notifications about your trips and activity will show up here."
          />
        )}

        {notifications.length > 0 && (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.brand.primary}
              />
            }
            renderSectionHeader={({ section }) => (
              <Text
                variant="overline"
                color={colors.text.tertiary}
                style={styles.sectionHeader}
              >
                {section.title}
              </Text>
            )}
            renderItem={({ item, index }) => (
              <FadeIn delay={index * 30} distance={4}>
                <NotificationRow
                  notification={item}
                  onPress={() => handlePress(item)}
                />
              </FadeIn>
            )}
          />
        )}
      </Container>
    </Screen>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: () => void;
}) {
  const isUnread = !notification.read_at;
  const relativeTime = useRelativeTime(notification.created_at);

  return (
    <Pressable onPress={onPress} style={[styles.row, isUnread && styles.rowUnread]}>
      {isUnread && <View style={styles.unreadDot} />}
      <View style={{ flex: 1, marginLeft: isUnread ? spacing[3] : 0 }}>
        <Text
          variant={isUnread ? "bodyMedium" : "body"}
          color={colors.text.primary}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text
          variant="bodySmall"
          color={colors.text.secondary}
          numberOfLines={2}
          style={{ marginTop: 2 }}
        >
          {notification.body}
        </Text>
        <Text
          variant="caption"
          color={colors.text.tertiary}
          style={{ marginTop: 4 }}
        >
          {relativeTime}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  backBtn: { paddingVertical: spacing[1] },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  sectionHeader: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  listContent: {
    paddingBottom: spacing[8],
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowUnread: {
    backgroundColor: colors.surface.raised,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.accent,
    marginTop: 8,
  },
  errorBox: {
    marginHorizontal: spacing[5],
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginBottom: spacing[3],
  },
  skeletonRow: {
    flexDirection: "row",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
  skeletonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border.subtle,
    marginTop: 8,
  },
  skeletonLine1: {
    height: 14,
    width: "70%",
    backgroundColor: colors.surface.sunken,
    borderRadius: 4,
  },
  skeletonLine2: {
    height: 12,
    width: "50%",
    backgroundColor: colors.surface.sunken,
    borderRadius: 4,
    marginTop: 6,
  },
});