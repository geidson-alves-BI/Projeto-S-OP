import { useCallback, useEffect, useState } from "react";
import { getReadiness } from "@/lib/api";
import type { Readiness } from "@/types/analytics";

export function useReadiness(autoLoad = true) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await getReadiness();
      setReadiness(payload);
      return payload;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void refresh();
  }, [autoLoad, refresh]);

  return {
    readiness,
    setReadiness,
    loading,
    error,
    refresh,
  };
}
