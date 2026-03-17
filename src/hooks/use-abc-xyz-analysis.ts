import { getAbcXyzAnalysis } from "@/lib/api";
import { buildAnalyticsAvailability } from "@/lib/analytics-consumption";
import { useAnalyticsResource } from "@/hooks/use-analytics-resource";
import type { AbcXyzAnalysisResponse } from "@/types/analytics";

type UseAbcXyzAnalysisOptions = {
  autoLoad?: boolean;
};

export function useAbcXyzAnalysis(options: UseAbcXyzAnalysisOptions = {}) {
  const autoLoad = options.autoLoad ?? true;
  const { data, loading, error, refresh, lastUpdatedAt } = useAnalyticsResource<AbcXyzAnalysisResponse>({
    autoLoad,
    request: getAbcXyzAnalysis,
  });

  const hasContent = Boolean(data);
  const isPartial = data?.status === "partial";
  const isUnavailable = data?.status === "unavailable";
  const isEmpty = Boolean(data && data.status !== "unavailable" && data.produtos.length === 0);
  const availability = buildAnalyticsAvailability({
    loading,
    error,
    hasContent,
    isPartial: isPartial || isUnavailable,
    isEmpty,
    messages: {
      partial: "Atualizacao parcial da analise. Parte dos indicadores pode estar incompleta.",
      unavailable: "Analise indisponivel no momento. Envie ou revise a base operacional.",
      empty: "A leitura nao trouxe itens suficientes para exibir a classificacao.",
    },
  });

  return {
    analysis: data,
    loading,
    error,
    refresh,
    lastUpdatedAt,
    availability,
    hasContent,
    isPartialState: isPartial,
    isUnavailableState: isUnavailable,
    isEmptyState: isEmpty,
  };
}
