import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Database,
  LineChart,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { useAnalyticsV2 } from "@/hooks/use-analytics-v2";
import {
  analyticsV2ConfidenceLabel,
  analyticsV2EstimateTypeLabel,
  ANALYTICS_V2_STATUS_BADGE_CLASS,
  ANALYTICS_V2_STATUS_LABEL,
  getMainAnalyticsV2Limitation,
  summarizeAnalyticsV2Base,
} from "@/lib/analytics-v2-presenters";
import type {
  AnalyticsV2FinancialScenario,
  AnalyticsV2MetricContract,
  AnalyticsV2Status,
} from "@/types/analytics";

type PilotMetricDefinition = {
  metricId: string;
  title: string;
  guidance: string;
};

const PILOT_KPIS: PilotMetricDefinition[] = [
  {
    metricId: "production_volume",
    title: "Volume de producao",
    guidance: "Leitura operacional consolidada no escopo atual.",
  },
  {
    metricId: "sales_volume",
    title: "Volume vendido",
    guidance: "Sinal comercial para comparacao com capacidade.",
  },
  {
    metricId: "demand_vs_operation_gap",
    title: "Gap demanda x operacao",
    guidance: "Diferenca percentual entre demanda e execucao.",
  },
  {
    metricId: "raw_material_coverage",
    title: "Cobertura de materia-prima",
    guidance: "Dias medios de cobertura para risco de abastecimento.",
  },
  {
    metricId: "projected_revenue",
    title: "Receita projetada",
    guidance: "Receita do cenario base, com rastreabilidade de fonte.",
  },
  {
    metricId: "contribution_margin",
    title: "Margem de contribuicao",
    guidance: "Margem executiva para decisao de politica e mix.",
  },
  {
    metricId: "total_working_capital",
    title: "Capital empatado total",
    guidance: "Soma de FG e MP no capital de giro monitorado.",
  },
];

function StatusPill({ status }: { status: AnalyticsV2Status }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] ${ANALYTICS_V2_STATUS_BADGE_CLASS[status]}`}
    >
      {ANALYTICS_V2_STATUS_LABEL[status]}
    </span>
  );
}

function MetricPilotCard({
  title,
  guidance,
  metric,
  loading,
}: {
  title: string;
  guidance: string;
  metric: AnalyticsV2MetricContract | null;
  loading: boolean;
}) {
  const status: AnalyticsV2Status = metric?.status ?? "unavailable";
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">KPI executivo</p>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        <StatusPill status={status} />
      </div>

      <p className="mt-3 text-2xl font-semibold text-foreground">
        {metric ? metric.formatted_value : loading ? "Carregando..." : "Indisponivel"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{guidance}</p>

      <div className="mt-4 grid gap-2 text-xs text-foreground">
        <p>
          <span className="text-muted-foreground">Confianca:</span>{" "}
          {metric ? analyticsV2ConfidenceLabel(metric.confianca) : "Nao informada"}
        </p>
        <p>
          <span className="text-muted-foreground">Decision grade:</span>{" "}
          {metric?.decision_grade ?? "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Base usada:</span>{" "}
          {metric ? summarizeAnalyticsV2Base(metric.base_usada) : "Sem base"}
        </p>
        <p>
          <span className="text-muted-foreground">Estimate type:</span>{" "}
          {metric ? analyticsV2EstimateTypeLabel(metric.estimate_type) : "-"}
        </p>
        <p className="text-warning">{getMainAnalyticsV2Limitation(metric)}</p>
      </div>

      {metric && (
        <details className="mt-3 rounded-xl border border-border/70 bg-background/30 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Detalhes analiticos</summary>
          <div className="mt-2 space-y-1 leading-5">
            <p>
              <span className="text-foreground">Valor bruto:</span>{" "}
              {metric.value == null ? "n/a" : String(metric.value)}
            </p>
            <p>
              <span className="text-foreground">Escopo:</span> {metric.escopo}
            </p>
            <p>
              <span className="text-foreground">Missing data:</span>{" "}
              {metric.missing_data.length ? metric.missing_data.join(", ") : "nenhum"}
            </p>
            <p>
              <span className="text-foreground">Calculation method:</span> {metric.calculation_method}
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

function ScenarioCard({
  scenario,
}: {
  scenario: AnalyticsV2FinancialScenario;
}) {
  const delta = scenario.delta_vs_base.scenario_delta_financial;
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cenario</p>
          <h3 className="text-lg font-semibold text-foreground">{scenario.display_name}</h3>
        </div>
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
      </div>

      <div className="mt-4 grid gap-2 text-sm">
        <p className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Receita</span>
          <span className="font-medium text-foreground">{scenario.revenue.formatted_value}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Margem de contribuicao</span>
          <span className="font-medium text-foreground">{scenario.contribution_margin.formatted_value}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Capital empatado total</span>
          <span className="font-medium text-foreground">{scenario.total_working_capital.formatted_value}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Custo de carregamento</span>
          <span className="font-medium text-foreground">{scenario.inventory_carrying_cost.formatted_value}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Delta vs base</span>
          <span className="font-medium text-foreground">{delta.formatted_value}</span>
        </p>
      </div>

      <div className="mt-4 text-xs text-foreground">
        <p>
          <span className="text-muted-foreground">Estimate type (margem):</span>{" "}
          {analyticsV2EstimateTypeLabel(scenario.contribution_margin.estimate_type)}
        </p>
        <p>
          <span className="text-muted-foreground">Base usada:</span> {summarizeAnalyticsV2Base(scenario.base_usada)}
        </p>
        <p className="mt-2 text-warning">
          {scenario.limitations[0] ?? "Sem limitacao critica para este cenario."}
        </p>
      </div>

      <details className="mt-3 rounded-xl border border-border/70 bg-background/30 p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Premissas e rastreabilidade</summary>
        <div className="mt-2 space-y-1 leading-5">
          <p>
            <span className="text-foreground">Revenue factor:</span>{" "}
            {String(scenario.assumptions.revenue_factor ?? "-")}
          </p>
          <p>
            <span className="text-foreground">Demand factor:</span>{" "}
            {String(scenario.assumptions.demand_factor ?? "-")}
          </p>
          <p>
            <span className="text-foreground">Inventory coverage factor:</span>{" "}
            {String(scenario.assumptions.inventory_coverage_factor ?? "-")}
          </p>
          <p>
            <span className="text-foreground">Carrying cost rate:</span>{" "}
            {String(scenario.assumptions.carrying_cost_rate ?? "-")}
          </p>
          <p>
            <span className="text-foreground">Safety factor:</span>{" "}
            {String(scenario.assumptions.safety_factor ?? "-")}
          </p>
          <p>
            <span className="text-foreground">Missing data:</span>{" "}
            {scenario.missing_data.length ? scenario.missing_data.join(", ") : "nenhum"}
          </p>
          <p>
            <span className="text-foreground">Calculation method:</span> {scenario.calculation_method}
          </p>
        </div>
      </details>
    </div>
  );
}

export default function HomePage() {
  const {
    snapshot,
    financialScenarios,
    metricsById,
    loading,
    error,
    refresh,
    hasCalculableMetrics,
    hasAnyContent,
    isPartialState,
    isEmptyState,
  } = useAnalyticsV2();

  const scenarios = financialScenarios?.scenarios ?? [];
  const hasSnapshot = Boolean(snapshot);
  const calculableCount = snapshot?.metricas_calculaveis.length ?? 0;
  const blockedCount = snapshot?.metricas_bloqueadas.length ?? 0;
  const summaryLines = snapshot?.resumo_executivo ?? [];

  const heroStatus: AnalyticsV2Status = loading
    ? "partial"
    : error && !hasAnyContent
      ? "unavailable"
      : isPartialState
        ? "partial"
        : "ready";

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-border/70 bg-card/90 px-6 py-8 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.2), transparent 32%), radial-gradient(circle at 85% 20%, rgba(16,185,129,0.14), transparent 24%), linear-gradient(140deg, rgba(15,23,42,0.24), rgba(2,6,23,0.65))",
          }}
        />
        <div className="relative space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
                Home piloto analytics v2
              </span>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground">
                Resumo executivo conectado ao backend v2
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                A Home agora consome snapshot, KPIs e cenarios financeiros diretamente da camada analytics v2.
                Nao ha calculo analitico local nesta tela piloto.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void refresh();
                }}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar v2
              </Button>
              <Button asChild className="gap-2">
                <Link to="/upload">
                  Carregar bases
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/ia">
                  Abrir IA
                  <Bot className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Status da camada v2</p>
              <div className="mt-2">
                <StatusPill status={heroStatus} />
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Metricas calculaveis</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{calculableCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Metricas bloqueadas</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{blockedCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Readiness v2</p>
              <p className="mt-2 text-sm text-foreground">
                {snapshot
                  ? `${snapshot.readiness_v2.coverage_percent}% de cobertura`
                  : loading
                    ? "Carregando..."
                    : "Aguardando camada analitica"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error && !hasAnyContent && (
        <section className="rounded-2xl border border-destructive/35 bg-destructive/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">
                Camada analytics v2 indisponivel no momento
              </h2>
              <p className="text-sm text-muted-foreground">
                A navegacao continua funcional. Tente atualizar novamente ou siga para Upload para validar as bases.
              </p>
              <p className="text-xs text-destructive">{error}</p>
            </div>
          </div>
        </section>
      )}

      {error && hasAnyContent && (
        <section className="rounded-2xl border border-warning/35 bg-warning/10 p-4 text-sm text-foreground">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
            <p>
              Atualizacao parcial da camada v2. Alguns blocos podem estar incompletos neste refresh: {error}
            </p>
          </div>
        </section>
      )}

      <section className="rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Resumo analitico</p>
            <h2 className="text-xl font-semibold text-foreground">Snapshot v2 do ciclo atual</h2>
          </div>
        </div>

        {hasSnapshot ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Datasets disponiveis</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{snapshot.datasets_disponiveis.length}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Metricas parciais</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{snapshot.readiness_v2.metrics_partial}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Metricas bloqueadas</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{snapshot.readiness_v2.metrics_unavailable}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Status geral</p>
                <div className="mt-2">
                  <StatusPill status={snapshot.readiness_v2.overall_status} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Resumo executivo</p>
              <div className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                {summaryLines.length > 0 ? (
                  summaryLines.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>Nenhum resumo textual retornado no snapshot.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            {loading
              ? "Carregando snapshot v2..."
              : "Snapshot v2 ainda nao retornado. A Home segue funcional para navegacao."}
          </div>
        )}
      </section>

      <section className="rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">KPIs executivos</p>
            <h2 className="text-xl font-semibold text-foreground">Leitura v2 sem calculo local</h2>
          </div>
        </div>

        {isEmptyState ? (
          <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
            Nenhuma metrica calculavel foi encontrada no momento. Carregue bases obrigatorias para liberar os KPIs.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PILOT_KPIS.map((definition) => (
              <MetricPilotCard
                key={definition.metricId}
                title={definition.title}
                guidance={definition.guidance}
                metric={metricsById[definition.metricId] ?? null}
                loading={loading}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cenarios financeiros</p>
            <h2 className="text-xl font-semibold text-foreground">Base vs Conservador vs Agressivo</h2>
          </div>
        </div>

        {scenarios.length > 0 ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {scenarios.map((scenario) => (
              <ScenarioCard key={scenario.scenario_id} scenario={scenario} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            {loading
              ? "Carregando cenarios financeiros v2..."
              : "Cenarios financeiros ainda indisponiveis para o recorte atual."}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/90 p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warning" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Explicabilidade</p>
            <h2 className="text-xl font-semibold text-foreground">Transparencia analitica obrigatoria</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-foreground">
            <p className="font-medium">Legenda de estimate type</p>
            <p className="mt-2 text-muted-foreground">
              `Documented` usa dado documental direto, `Hybrid` combina fonte documental e estimativa, `Estimated`
              usa fallback heuristico explicitado.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-foreground">
            <p className="font-medium">Convivencia com camada legada</p>
            <p className="mt-2 text-muted-foreground">
              A Home esta em piloto v2. Outras paginas seguem fluxo legado ate a migracao progressiva da ETAPA 5.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.24)]">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Proximas acoes</p>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Navegacao executiva continua ativa</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Mesmo com falha eventual da camada v2, o restante da aplicacao permanece operacional.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild className="h-auto justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left text-foreground hover:bg-background/70">
              <Link to="/upload">
                <span>Upload center</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild className="h-auto justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left text-foreground hover:bg-background/70">
              <Link to="/financeiro">
                <span>Financeiro</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild className="h-auto justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left text-foreground hover:bg-background/70">
              <Link to="/relatorios">
                <span>Relatorios</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild className="h-auto justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left text-foreground hover:bg-background/70">
              <Link to="/ia">
                <span>IA executiva</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
