import { useMemo } from "react";
import { DollarSign, Download, RefreshCw } from "lucide-react";
import AnalysisStatusPanel from "@/components/AnalysisStatusPanel";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { useAnalyticsV2 } from "@/hooks/use-analytics-v2";
import { useUploadCenter } from "@/hooks/use-upload-center";
import {
  analyticsV2ConfidenceLabel,
  analyticsV2EstimateTypeLabel,
  ANALYTICS_V2_STATUS_BADGE_CLASS,
  ANALYTICS_V2_STATUS_LABEL,
  getMainAnalyticsV2Limitation,
  summarizeAnalyticsV2Base,
} from "@/lib/analytics-v2-presenters";
import { downloadCSV } from "@/lib/downloadCSV";
import type { AnalyticsV2MetricContract, AnalyticsV2Status } from "@/types/analytics";

const FINANCIAL_METRIC_IDS = [
  "projected_revenue",
  "projected_cogs",
  "contribution_margin",
  "contribution_margin_pct",
  "fg_working_capital",
  "rm_working_capital",
  "total_working_capital",
  "mts_incremental_investment",
  "inventory_carrying_cost",
] as const;

const KPI_DEFINITIONS = [
  {
    metricId: "projected_revenue",
    title: "Receita projetada",
    description: "Receita consolidada no cenario base.",
  },
  {
    metricId: "projected_cogs",
    title: "COGS projetado",
    description: "Custo consolidado para suportar margem.",
  },
  {
    metricId: "contribution_margin",
    title: "Margem de contribuicao",
    description: "Diferenca entre receita e COGS.",
  },
  {
    metricId: "contribution_margin_pct",
    title: "Margem (%)",
    description: "Margem percentual no escopo atual.",
  },
  {
    metricId: "total_working_capital",
    title: "Capital empatado total",
    description: "Soma de FG + MP no ciclo atual.",
  },
  {
    metricId: "inventory_carrying_cost",
    title: "Custo de carregamento",
    description: "Custo anual estimado de carregar estoque.",
  },
] as const;

function StatusPill({ status }: { status: AnalyticsV2Status }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] ${ANALYTICS_V2_STATUS_BADGE_CLASS[status]}`}
    >
      {ANALYTICS_V2_STATUS_LABEL[status]}
    </span>
  );
}

function FinancialMetricDetail({
  title,
  metric,
  loading,
}: {
  title: string;
  metric: AnalyticsV2MetricContract | null;
  loading: boolean;
}) {
  const status = metric?.status ?? "unavailable";
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <StatusPill status={status} />
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">
        {metric ? metric.formatted_value : loading ? "Carregando..." : "Indisponivel"}
      </p>
      <div className="mt-3 space-y-1 text-xs text-foreground">
        <p>
          <span className="text-muted-foreground">Confianca:</span>{" "}
          {metric ? analyticsV2ConfidenceLabel(metric.confianca) : "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Decision grade:</span>{" "}
          {metric?.decision_grade ?? "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Base usada:</span>{" "}
          {metric ? summarizeAnalyticsV2Base(metric.base_usada) : "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Estimate type:</span>{" "}
          {metric ? analyticsV2EstimateTypeLabel(metric.estimate_type) : "-"}
        </p>
        <p className="text-warning">{getMainAnalyticsV2Limitation(metric)}</p>
      </div>
    </div>
  );
}

export default function FinanceiroPage() {
  const { uploadCenter } = useUploadCenter(true);
  const {
    snapshot,
    financialScenarios,
    metricsById,
    metrics,
    loading,
    error,
    refresh,
    hasAnyContent,
  } = useAnalyticsV2({
    scope: "global",
    metricIds: [...FINANCIAL_METRIC_IDS],
  });

  const scenarios = financialScenarios?.scenarios ?? [];
  const scenarioById = useMemo(
    () => Object.fromEntries(scenarios.map((scenario) => [scenario.scenario_id, scenario])),
    [scenarios],
  );
  const baseScenario = scenarioById.base ?? scenarios[0] ?? null;
  const hasPartialMetrics = metrics.some((metric) => metric.status === "partial");
  const blockedMetrics = metrics.filter((metric) => metric.status === "unavailable").length;
  const financeDataset = snapshot?.qualidade_por_dataset.finance_documents;

  const handleExportScenarioComparison = () => {
    if (!scenarios.length) {
      return;
    }
    const header = [
      "Cenario",
      "Status",
      "Confianca",
      "Decision grade",
      "Receita",
      "COGS",
      "Margem",
      "Margem (%)",
      "Capital empatado total",
      "Custo de carregamento",
      "Delta vs base",
      "Base usada",
      "Limitacao principal",
    ];
    const rows = scenarios.map((scenario) => [
      scenario.display_name,
      scenario.status,
      scenario.confianca,
      scenario.decision_grade,
      scenario.revenue.formatted_value,
      scenario.cogs.formatted_value,
      scenario.contribution_margin.formatted_value,
      scenario.contribution_margin_pct.formatted_value,
      scenario.total_working_capital.formatted_value,
      scenario.inventory_carrying_cost.formatted_value,
      scenario.delta_vs_base.scenario_delta_financial.formatted_value,
      scenario.base_usada.join(" | "),
      scenario.limitations[0] ?? "sem limitacao critica",
    ]);
    downloadCSV([header, ...rows], "financeiro_v2_scenarios.csv");
  };

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="page-header">
        <h2>
          <DollarSign className="h-5 w-5 text-primary" /> Financeiro
        </h2>
        <p>
          Fonte principal unica: analytics v2 (snapshot + metrics + cenarios). Nenhum KPI desta tela e calculado no frontend.
        </p>
      </section>

      <AnalysisStatusPanel
        uploadCenter={uploadCenter}
        moduleKey="finance"
        title="Prontidao financeira"
        description="A tela Financeiro usa a camada analytics v2 para KPI, explicabilidade e comparacao de cenarios."
        datasetIds={["finance_documents", "raw_material_inventory", "bom", "sales_orders", "production"]}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            void refresh();
          }}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar analytics v2
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleExportScenarioComparison}
          disabled={!scenarios.length}
        >
          <Download className="h-4 w-4" />
          Exportar cenarios
        </Button>
      </div>

      {error && !hasAnyContent && (
        <section className="rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Camada analytics v2 indisponivel para Financeiro: {error}
        </section>
      )}
      {error && hasAnyContent && (
        <section className="rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Atualizacao parcial: {error}
        </section>
      )}
      {hasPartialMetrics && (
        <section className="rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Algumas metricas vieram parciais. A tela preserva a explicabilidade com base usada, confianca e limitacoes.
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Metricas v2 prontas"
          value={metrics.filter((metric) => metric.status === "ready").length}
          sub={`Parciais: ${metrics.filter((metric) => metric.status === "partial").length}`}
          accent
        />
        <MetricCard label="Metricas bloqueadas" value={blockedMetrics} />
        <MetricCard
          label="Dataset financeiro"
          value={financeDataset?.uploaded ? "Ativo" : "Nao enviado"}
          sub={financeDataset ? `${financeDataset.row_count} linhas` : "sem snapshot"}
        />
        <MetricCard
          label="Cenario base"
          value={baseScenario?.display_name ?? "Indisponivel"}
          sub={baseScenario ? `Decision grade ${baseScenario.decision_grade}` : "sem cenario"}
        />
      </div>

      <section className="rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">KPIs financeiros v2</p>
          <h3 className="text-xl font-semibold text-foreground">Metrica calculada no backend com explicabilidade completa</h3>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {KPI_DEFINITIONS.map((definition) => (
            <FinancialMetricDetail
              key={definition.metricId}
              title={definition.title}
              metric={metricsById[definition.metricId] ?? null}
              loading={loading}
            />
          ))}
        </div>
      </section>

      <section className="rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Comparativo de cenarios</p>
          <h3 className="text-xl font-semibold text-foreground">Base / Conservador / Agressivo</h3>
        </div>
        {scenarios.length > 0 ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {scenarios.map((scenario) => (
              <div key={scenario.scenario_id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-lg font-semibold text-foreground">{scenario.display_name}</h4>
                  <StatusPill status={scenario.status} />
                </div>
                <div className="mt-3 space-y-1 text-xs text-foreground">
                  <p>
                    <span className="text-muted-foreground">Confianca:</span>{" "}
                    {analyticsV2ConfidenceLabel(scenario.confianca)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Decision grade:</span> {scenario.decision_grade}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Base usada:</span>{" "}
                    {summarizeAnalyticsV2Base(scenario.base_usada)}
                  </p>
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Receita</span>
                    <span className="font-medium text-foreground">{scenario.revenue.formatted_value}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Margem</span>
                    <span className="font-medium text-foreground">{scenario.contribution_margin.formatted_value}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Capital empatado</span>
                    <span className="font-medium text-foreground">{scenario.total_working_capital.formatted_value}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Delta vs base</span>
                    <span className="font-medium text-foreground">
                      {scenario.delta_vs_base.scenario_delta_financial.formatted_value}
                    </span>
                  </p>
                </div>
                <p className="mt-3 text-xs text-warning">
                  {scenario.limitations[0] ?? "Sem limitacao critica para este cenario."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            {loading
              ? "Carregando cenarios financeiros v2..."
              : "Cenarios financeiros indisponiveis para o escopo atual."}
          </div>
        )}
      </section>

      <section className="rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Explicabilidade</p>
          <h3 className="text-xl font-semibold text-foreground">Contrato analitico de cada metrica</h3>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Metrica</th>
                <th>Status</th>
                <th>Confianca</th>
                <th>Decision grade</th>
                <th>Valor</th>
                <th>Base usada</th>
                <th>Escopo</th>
                <th>Estimate type</th>
                <th>Limitacao principal</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.metric_id}>
                  <td className="font-mono text-xs">{metric.display_name}</td>
                  <td>
                    <StatusPill status={metric.status} />
                  </td>
                  <td className="text-xs">{analyticsV2ConfidenceLabel(metric.confianca)}</td>
                  <td className="text-xs font-semibold">{metric.decision_grade}</td>
                  <td className="text-xs font-mono">{metric.formatted_value}</td>
                  <td className="text-xs">{summarizeAnalyticsV2Base(metric.base_usada)}</td>
                  <td className="text-xs">{metric.escopo}</td>
                  <td className="text-xs">{analyticsV2EstimateTypeLabel(metric.estimate_type)}</td>
                  <td className="text-xs text-warning">{getMainAnalyticsV2Limitation(metric)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageTransition>
  );
}
