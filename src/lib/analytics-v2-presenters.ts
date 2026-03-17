import type {
  AnalyticsV2Confidence,
  AnalyticsV2MetricContract,
  AnalyticsV2Status,
} from "@/types/analytics";

export const ANALYTICS_V2_STATUS_LABEL: Record<AnalyticsV2Status, string> = {
  ready: "Pronto",
  partial: "Parcial",
  unavailable: "Indisponivel",
};

export const ANALYTICS_V2_STATUS_BADGE_CLASS: Record<AnalyticsV2Status, string> = {
  ready: "border-success/35 bg-success/10 text-success",
  partial: "border-warning/35 bg-warning/10 text-warning",
  unavailable: "border-destructive/35 bg-destructive/10 text-destructive",
};

export function analyticsV2ConfidenceLabel(confidence: AnalyticsV2Confidence | string) {
  if (confidence === "high") return "Alta";
  if (confidence === "medium") return "Media";
  return "Baixa";
}

export function analyticsV2EstimateTypeLabel(estimateType: string) {
  if (estimateType === "documented") return "Documentado";
  if (estimateType === "hybrid") return "Combinado";
  return "Estimado";
}

export function summarizeAnalyticsV2Base(baseUsed: string[]) {
  if (!baseUsed.length) return "Sem base declarada";
  if (baseUsed.length <= 2) return baseUsed.join(", ");
  return `${baseUsed.slice(0, 2).join(", ")} +${baseUsed.length - 2}`;
}

export function getMainAnalyticsV2Limitation(metric: AnalyticsV2MetricContract | null) {
  if (!metric) return "Metrica ainda nao retornada pela camada analitica.";
  if (metric.limitations.length > 0) return metric.limitations[0];
  if (metric.missing_data.length > 0) return `Lacuna principal: ${metric.missing_data[0]}.`;
  return "Sem limitacoes relevantes para este recorte.";
}
