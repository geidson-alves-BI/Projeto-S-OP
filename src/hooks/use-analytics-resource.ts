import { useCallback, useEffect, useState } from "react";
import { normalizeAnalyticsError } from "@/lib/analytics-consumption";

type UseAnalyticsResourceOptions<T> = {
  autoLoad?: boolean;
  request: () => Promise<T>;
};

export function useAnalyticsResource<T>(options: UseAnalyticsResourceOptions<T>) {
  const { request, autoLoad = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await request();
      setData(payload);
      setLastUpdatedAt(new Date().toISOString());
      return payload;
    } catch (requestError) {
      setError(normalizeAnalyticsError(requestError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void refresh();
  }, [autoLoad, refresh]);

  return {
    data,
    setData,
    loading,
    error,
    refresh,
    lastUpdatedAt,
  };
}
