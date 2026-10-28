import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";

// useRelativeTime — a relative time string that updates every 30 seconds.
//
// Pass a Date or ISO string. Returns "just now", "2m ago", "3h ago", etc.
// The value re-renders every 30 seconds so it stays accurate without the
// caller having to think about it.

export function useRelativeTime(isoDate: string | Date | null): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isoDate) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [isoDate]);

  if (!isoDate) return "";

  const date = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  const diff = Date.now() - date.getTime();

  if (diff < 10000) return "just now";

  try {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  } catch {
    return "";
  }
}
