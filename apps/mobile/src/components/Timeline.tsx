import { View, StyleSheet } from "react-native";
import {
  Package,
  Truck,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  type LucideIcon,
} from "lucide-react-native";
import { colors, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";
import { useRelativeTime } from "@/hooks/useRelativeTime";

// Timeline — a vertical event history. The core of the trip detail.
//
// Each event: a coloured dot on a vertical line, a title describing what
// happened, an optional subtitle (status transition), and a relative
// timestamp. The most recent event is at the top, more prominent (larger
// dot, bolder text).

export interface TimelineEvent {
  id: string;
  eventType: string;
  statusBefore?: string;
  statusAfter?: string;
  occurredAt: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="body" color={colors.text.tertiary}>
          No events yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.map((event, index) => (
        <TimelineItem
          key={event.id}
          event={event}
          isLast={index === events.length - 1}
          isMostRecent={index === 0}
        />
      ))}
    </View>
  );
}

function TimelineItem({
  event,
  isLast,
  isMostRecent,
}: {
  event: TimelineEvent;
  isLast: boolean;
  isMostRecent: boolean;
}) {
  const Icon = getEventIcon(event.eventType);
  const color = getEventColor(event.eventType);
  const relativeTime = useRelativeTime(event.occurredAt);
  const title = formatEventType(event.eventType);

  return (
    <View style={styles.itemRow}>
      {/* Marker column with dot + connecting line */}
      <View style={styles.markerColumn}>
        <View
          style={[
            isMostRecent ? styles.dotOuterActive : styles.dotOuter,
            { backgroundColor: `${color}20` },
          ]}
        >
          <View
            style={[
              isMostRecent ? styles.dotInnerActive : styles.dotInner,
              { backgroundColor: color },
            ]}
          />
        </View>
        {!isLast && <View style={[styles.connectorLine, { backgroundColor: colors.border.subtle }]} />}
      </View>

      {/* Content column */}
      <View style={[styles.contentColumn, isLast && { paddingBottom: 0 }]}>
        <View style={styles.titleRow}>
          <Icon size={14} color={color} strokeWidth={2.5} />
          <Text
            variant={isMostRecent ? "bodyMedium" : "body"}
            color={colors.text.primary}
            style={{ marginLeft: spacing[2] }}
          >
            {title}
          </Text>
        </View>

        {event.statusBefore && event.statusAfter && (
          <Text
            variant="caption"
            color={colors.text.secondary}
            style={{ marginTop: 4 }}
          >
            {humanStatus(event.statusBefore)} → {humanStatus(event.statusAfter)}
          </Text>
        )}

        <Text
          variant="caption"
          color={colors.text.tertiary}
          style={{ marginTop: 4 }}
        >
          {relativeTime}
        </Text>
      </View>
    </View>
  );
}

function getEventIcon(eventType: string): LucideIcon {
  switch (eventType) {
    case "created":
      return Package;
    case "assigned":
      return Truck;
    case "picked_up":
    case "in_transit":
      return MapPin;
    case "delivered":
      return CheckCircle2;
    case "cancelled":
      return XCircle;
    case "failed":
    case "exception":
      return AlertCircle;
    default:
      return Clock;
  }
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case "created":
      return colors.status.info.fg;
    case "assigned":
      return colors.brand.primary;
    case "picked_up":
    case "in_transit":
      return colors.brand.accent;
    case "delivered":
      return colors.status.success.fg;
    case "cancelled":
    case "failed":
      return colors.status.danger.fg;
    default:
      return colors.text.secondary;
  }
}

function formatEventType(eventType: string): string {
  const map: Record<string, string> = {
    created: "Trip created",
    assigned: "Vehicle assigned",
    picked_up: "Picked up",
    in_transit: "In transit",
    delivered: "Delivered",
    cancelled: "Cancelled",
    failed: "Failed",
  };
  return map[eventType] || eventType.replace(/_/g, " ");
}

function humanStatus(status: string): string {
  return status.replace(/_/g, " ");
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing[2],
  },
  emptyContainer: {
    padding: spacing[5],
    alignItems: "center",
  },
  itemRow: {
    flexDirection: "row",
  },
  markerColumn: {
    width: 24,
    alignItems: "center",
    marginRight: spacing[3],
  },
  dotOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  dotOuterActive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotInnerActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  connectorLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    marginBottom: 0,
    minHeight: 16,
  },
  contentColumn: {
    flex: 1,
    paddingBottom: spacing[5],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});