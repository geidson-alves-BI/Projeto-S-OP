import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { buildContextPackViewModel } from "@/lib/context-pack";
import { getContextPack } from "@/lib/api";
import type { ContextPack } from "@/types/analytics";

export function useContextPack(autoLoad = true) {
  const { state, rmData } = useAppData();
  const [contextPack, setContextPack] = useState<ContextPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await getContextPack();
      setContextPack(payload);
      return payload;
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    if (!state && !rmData) {
      setContextPack(null);
      setError(null);
      setLoading(false);
      return;
    }

    void refresh();
  }, [autoLoad, state, rmData]);

  const viewModel = useMemo(
    () => buildContextPackViewModel(contextPack, state, rmData),
    [contextPack, state, rmData],
  );

  return {
    contextPack,
    setContextPack,
    refresh,
    loading,
    error,
    viewModel,
  };
}
