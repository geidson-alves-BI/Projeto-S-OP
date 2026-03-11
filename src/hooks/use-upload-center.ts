import { useCallback, useEffect, useState } from "react";
import { getUploadCenter } from "@/lib/api";
import type { UploadCenterStatus } from "@/types/analytics";

export function useUploadCenter(autoLoad = true) {
  const [uploadCenter, setUploadCenter] = useState<UploadCenterStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await getUploadCenter();
      setUploadCenter(payload);
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
    uploadCenter,
    setUploadCenter,
    loading,
    error,
    refresh,
  };
}
