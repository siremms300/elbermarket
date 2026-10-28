import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";

// useAutoRefresh — a hook that:
//   1. Runs a fetch function on screen focus
//   2. Runs it again every `interval` ms while the screen is focused
//   3. Tracks "lastUpdated" time for the caller to display
//
// Usage:
//   const { refresh, lastUpdated, isRefreshing } = useAutoRefresh(loadData, 30000);
//
// Caller shows "Updated {relativeTime}" in a footer.

interface AutoRefreshResult {
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}

export function useAutoRefresh(
  fetchFn: () => Promise<void>,
  intervalMs: number = 30000,
): AutoRefreshResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchFn();
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchFn]);

  useFocusEffect(
    useCallback(() => {
      // Refresh on focus
      refresh();

      // Then on interval
      const interval = setInterval(refresh, intervalMs);

      return () => clearInterval(interval);
    }, [refresh, intervalMs]),
  );

  return { refresh, isRefreshing, lastUpdated };
}