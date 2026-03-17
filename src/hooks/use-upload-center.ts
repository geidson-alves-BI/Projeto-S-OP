import { getUploadCenter } from "@/lib/api";
import { useAnalyticsResource } from "@/hooks/use-analytics-resource";

export function useUploadCenter(autoLoad = true) {
  const { data, setData, loading, error, refresh, lastUpdatedAt } = useAnalyticsResource({
    autoLoad,
    request: getUploadCenter,
  });

  return {
    uploadCenter: data,
    setUploadCenter: setData,
    loading,
    error,
    refresh,
    lastUpdatedAt,
  };
}
