import { useCallback, useEffect, useState } from "react";
import { getExecutiveContext } from "@/lib/api";
import type { ExecutiveContext } from "@/types/analytics";

export function useExecutiveContext(autoLoad = true) {
  const [executiveContext, setExecutiveContext] = useState<ExecutiveContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await getExecutiveContext();
      setExecutiveContext(payload);
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
    executiveContext,
    setExecutiveContext,
    loading,
    error,
    refresh,
  };
}
