import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeAnalyticsV2Metrics,
  getAnalyticsV2FinancialScenarios,
  getAnalyticsV2Snapshot,
} from "@/lib/api";
import { buildAnalyticsAvailability, normalizeAnalyticsError } from "@/lib/analytics-consumption";
import type {
  AnalyticsV2FinancialScenariosResponse,
  AnalyticsV2MetricContract,
  AnalyticsV2MetricsComputeResponse,
  AnalyticsV2Snapshot,
} from "@/types/analytics";

const DEFAULT_METRIC_IDS = [
  "production_volume",
  "sales_volume",
  "demand_vs_operation_gap",
  "raw_material_coverage",
  "projected_revenue",
  "contribution_margin",
  "total_working_capital",
] as const;

type UseAnalyticsV2Options = {
  scope?: string;
  metricIds?: string[];
  autoLoad?: boolean;
};

export function useAnalyticsV2(options: UseAnalyticsV2Options = {}) {
  const scope = options.scope ?? "global";
  const metricIds = useMemo(
    () => options.metricIds ?? [...DEFAULT_METRIC_IDS],
    [options.metricIds],
  );
  const autoLoad = options.autoLoad ?? true;
  const metricKey = useMemo(() => metricIds.join("|"), [metricIds]);

  const [snapshot, setSnapshot] = useState<AnalyticsV2Snapshot | null>(null);
  const [financialScenarios, setFinancialScenarios] =
    useState<AnalyticsV2FinancialScenariosResponse | null>(null);
  const [metricsResult, setMetricsResult] = useState<AnalyticsV2MetricsComputeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [snapshotResult, scenariosResult, metricsResultRequest] = await Promise.allSettled([
        getAnalyticsV2Snapshot(scope),
        getAnalyticsV2FinancialScenarios(scope),
        computeAnalyticsV2Metrics({
          metric_ids: metricIds,
          escopo: scope,
          cenario: "base",
        }),
      ]);
      const failures: string[] = [];
      let hasAnySuccess = false;
      let nextSnapshot: AnalyticsV2Snapshot | null = null;
      let nextScenarios: AnalyticsV2FinancialScenariosResponse | null = null;
      let nextMetrics: AnalyticsV2MetricsComputeResponse | null = null;

      if (snapshotResult.status === "fulfilled") {
        nextSnapshot = snapshotResult.value;
        setSnapshot(snapshotResult.value);
        hasAnySuccess = true;
      } else {
        failures.push(`resumo_geral: ${normalizeAnalyticsError(snapshotResult.reason)}`);
      }

      if (scenariosResult.status === "fulfilled") {
        nextScenarios = scenariosResult.value;
        setFinancialScenarios(scenariosResult.value);
        hasAnySuccess = true;
      } else {
        failures.push(`cenarios_financeiros: ${normalizeAnalyticsError(scenariosResult.reason)}`);
      }

      if (metricsResultRequest.status === "fulfilled") {
        nextMetrics = metricsResultRequest.value;
        setMetricsResult(metricsResultRequest.value);
        hasAnySuccess = true;
      } else {
        failures.push(`metricas: ${normalizeAnalyticsError(metricsResultRequest.reason)}`);
      }

      if (failures.length > 0) {
        setError(
          hasAnySuccess
            ? `Atualizacao parcial da analise: ${failures.join(" | ")}`
            : `Analise indisponivel: ${failures.join(" | ")}`,
        );
      } else {
        setError(null);
      }

      if (!hasAnySuccess) {
        return null;
      }
      return {
        snapshot: nextSnapshot,
        financialScenarios: nextScenarios,
        metricsResult: nextMetrics,
      };
    } catch (requestError) {
      setError(normalizeAnalyticsError(requestError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [metricIds, scope]);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void refresh();
  }, [autoLoad, refresh, metricKey, scope]);

  const metrics = useMemo(() => metricsResult?.metrics ?? [], [metricsResult]);
  const metricsById = useMemo(() => {
    const entries: Record<string, AnalyticsV2MetricContract> = {};
    metrics.forEach((metric) => {
      entries[metric.metric_id] = metric;
    });
    return entries;
  }, [metrics]);

  const hasCalculableMetrics =
    (snapshot?.metricas_calculaveis.length ?? 0) > 0 ||
    metrics.some((metric) => metric.status === "ready" || metric.status === "partial");
  const hasScenarios = (financialScenarios?.scenarios.length ?? 0) > 0;
  const hasAnyContent = Boolean(snapshot || metricsResult || financialScenarios);
  const isPartialState =
    snapshot?.readiness_v2.overall_status === "partial" ||
    metrics.some((metric) => metric.status === "partial");
  const isEmptyState = !loading && !error && !hasCalculableMetrics && !hasScenarios;
  const availability = buildAnalyticsAvailability({
    loading,
    error,
    hasContent: hasAnyContent,
    isPartial: isPartialState,
    isEmpty: isEmptyState,
    messages: {
      partial: "Atualizacao parcial da analise. Alguns blocos podem estar incompletos.",
      unavailable: "Analise indisponivel no momento. Tente atualizar ou revise as bases.",
      empty: "Nenhum indicador foi liberado para o recorte atual.",
    },
  });

  return {
    snapshot,
    financialScenarios,
    metricsResult,
    metricsById,
    metrics,
    loading,
    error,
    refresh,
    hasCalculableMetrics,
    hasScenarios,
    hasAnyContent,
    isPartialState,
    isEmptyState,
    availability,
    metricIds,
  };
}

export { DEFAULT_METRIC_IDS };
