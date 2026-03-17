import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import FinanceiroPage from "@/pages/FinanceiroPage";
import type {
  AnalyticsV2FinancialScenariosResponse,
  AnalyticsV2MetricContract,
  AnalyticsV2Snapshot,
} from "@/types/analytics";

const { useAnalyticsV2Mock, refreshMock, useUploadCenterMock } = vi.hoisted(() => ({
  useAnalyticsV2Mock: vi.fn(),
  refreshMock: vi.fn(),
  useUploadCenterMock: vi.fn(),
}));

vi.mock("@/hooks/use-analytics-v2", () => ({
  useAnalyticsV2: () => useAnalyticsV2Mock(),
}));

vi.mock("@/hooks/use-upload-center", () => ({
  useUploadCenter: () => useUploadCenterMock(),
}));

vi.mock("@/components/AnalysisStatusPanel", () => ({
  default: () => <div data-testid="analysis-status-panel">analysis panel</div>,
}));

function makeMetric(
  metricId: string,
  overrides: Partial<AnalyticsV2MetricContract> = {},
): AnalyticsV2MetricContract {
  return {
    metric_id: metricId,
    display_name: metricId,
    value: 1000,
    formatted_value: "R$ 1.000,00",
    base_usada: ["finance_documents"],
    escopo: "global",
    confianca: "high",
    decision_grade: "A",
    missing_data: [],
    status: "ready",
    observacoes: [],
    limitations: [],
    calculation_method: "test_method",
    estimate_type: "documented",
    reference_date: "2026-03-17T00:00:00Z",
    engine_version: "2.0.0",
    metric_definition_version: "1.0.0",
    blocked_reason: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AnalyticsV2Snapshot> = {}): AnalyticsV2Snapshot {
  return {
    datasets_disponiveis: [
      { dataset_id: "finance_documents", status: "ready", row_count: 12 },
      { dataset_id: "sales_orders", status: "ready", row_count: 20 },
    ],
    qualidade_por_dataset: {
      finance_documents: {
        status: "ready",
        validation_status: "valid",
        quality_score: 90,
        compatibility_score: 92,
        row_count: 12,
        uploaded: true,
        missing_required_columns: [],
      },
    },
    metricas_calculaveis: [
      { metric_id: "projected_revenue", status: "ready", confianca: "high", decision_grade: "A" },
    ],
    metricas_bloqueadas: [],
    readiness_v2: {
      metrics_ready: 8,
      metrics_partial: 1,
      metrics_unavailable: 0,
      coverage_percent: 100,
      overall_status: "ready",
    },
    resumo_executivo: [],
    engine_version: "2.0.0",
    ...overrides,
  };
}

function makeScenarios(): AnalyticsV2FinancialScenariosResponse {
  const revenue = makeMetric("projected_revenue", { formatted_value: "R$ 110.000,00" });
  const cogs = makeMetric("projected_cogs", { formatted_value: "R$ 68.000,00" });
  const margin = makeMetric("contribution_margin", { formatted_value: "R$ 42.000,00" });
  const marginPct = makeMetric("contribution_margin_pct", { formatted_value: "38.18%" });
  const wc = makeMetric("total_working_capital", { formatted_value: "R$ 50.000,00" });
  const carrying = makeMetric("inventory_carrying_cost", { formatted_value: "R$ 9.000,00" });

  const scenario = (id: "base" | "conservador" | "agressivo", label: string, delta: string) => ({
    scenario_id: id,
    display_name: label,
    assumptions: {},
    revenue,
    cogs: { ...cogs, components: { material_cost: 30000, conversion_cost: 38000, estimated_cogs: 68000 } },
    contribution_margin: margin,
    contribution_margin_pct: marginPct,
    fg_working_capital: makeMetric("fg_working_capital", { formatted_value: "R$ 34.000,00" }),
    rm_working_capital: makeMetric("rm_working_capital", { formatted_value: "US$ 3,400.00" }),
    total_working_capital: wc,
    mts_incremental_investment: makeMetric("mts_incremental_investment", { formatted_value: "R$ 7.200,00" }),
    inventory_carrying_cost: carrying,
    delta_vs_base: {
      scenario_delta_financial: makeMetric("scenario_delta_financial", { formatted_value: delta }),
      breakdown: {},
    },
    confianca: "high" as const,
    decision_grade: "A" as const,
    status: "ready" as const,
    missing_data: [],
    limitations: [],
    calculation_method: "scenario_method",
    base_usada: ["finance_documents", "sales_orders"],
    engine_version: "2.0.0",
  });

  return {
    base_scenario: "base",
    escopo: "global",
    scenarios: [
      scenario("base", "Base", "R$ 0,00"),
      scenario("conservador", "Conservador", "R$ -5.000,00"),
      scenario("agressivo", "Agressivo", "R$ 6.500,00"),
    ],
    metricas_financeiras_suportadas: [],
    engine_version: "2.0.0",
    generated_at: "2026-03-17T00:00:00Z",
  };
}

describe("FinanceiroPage analytics v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUploadCenterMock.mockReturnValue({ uploadCenter: {} });
    useAnalyticsV2Mock.mockReturnValue({
      snapshot: makeSnapshot(),
      financialScenarios: makeScenarios(),
      metricsById: {
        projected_revenue: makeMetric("projected_revenue", { formatted_value: "R$ 110.000,00" }),
        projected_cogs: makeMetric("projected_cogs", { formatted_value: "R$ 68.000,00" }),
        contribution_margin: makeMetric("contribution_margin", { formatted_value: "R$ 42.000,00" }),
        contribution_margin_pct: makeMetric("contribution_margin_pct", { formatted_value: "38.18%" }),
        fg_working_capital: makeMetric("fg_working_capital", { formatted_value: "R$ 34.000,00" }),
        rm_working_capital: makeMetric("rm_working_capital", { formatted_value: "US$ 3,400.00" }),
        total_working_capital: makeMetric("total_working_capital", { formatted_value: "R$ 50.000,00" }),
        mts_incremental_investment: makeMetric("mts_incremental_investment", { formatted_value: "R$ 7.200,00" }),
        inventory_carrying_cost: makeMetric("inventory_carrying_cost", { formatted_value: "R$ 9.000,00" }),
      },
      metrics: [
        makeMetric("projected_revenue"),
        makeMetric("projected_cogs"),
        makeMetric("contribution_margin"),
        makeMetric("contribution_margin_pct"),
        makeMetric("fg_working_capital"),
        makeMetric("rm_working_capital"),
        makeMetric("total_working_capital"),
        makeMetric("mts_incremental_investment"),
        makeMetric("inventory_carrying_cost"),
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      hasAnyContent: true,
    });
  });

  it("renders complete financial view from analytics v2", () => {
    render(
      <MemoryRouter>
        <FinanceiroPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Fonte principal unica: analytics v2 (snapshot + metrics + cenarios). Nenhum KPI desta tela e calculado no frontend.")).toBeInTheDocument();
    expect(screen.getByText("Receita projetada")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 110.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Base / Conservador / Agressivo")).toBeInTheDocument();
    expect(screen.getByText("Conservador")).toBeInTheDocument();
  });

  it("renders partial data warning when metrics are partial", () => {
    useAnalyticsV2Mock.mockReturnValue({
      snapshot: makeSnapshot(),
      financialScenarios: makeScenarios(),
      metricsById: {
        projected_revenue: makeMetric("projected_revenue", { status: "partial", decision_grade: "C" }),
      },
      metrics: [
        makeMetric("projected_revenue", {
          status: "partial",
          decision_grade: "C",
          confianca: "medium",
          limitations: ["Receita parcial por ausencia de coluna complementar."],
        }),
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      hasAnyContent: true,
    });

    render(
      <MemoryRouter>
        <FinanceiroPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Algumas metricas vieram parciais. A tela preserva a explicabilidade com base usada, confianca e limitacoes.")).toBeInTheDocument();
  });

  it("renders partial error banner without breaking page", () => {
    useAnalyticsV2Mock.mockReturnValue({
      snapshot: makeSnapshot(),
      financialScenarios: makeScenarios(),
      metricsById: {
        projected_revenue: makeMetric("projected_revenue"),
      },
      metrics: [makeMetric("projected_revenue")],
      loading: false,
      error: "metrics_compute timeout",
      refresh: refreshMock,
      hasAnyContent: true,
    });

    render(
      <MemoryRouter>
        <FinanceiroPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Atualizacao parcial: metrics_compute timeout")).toBeInTheDocument();
    expect(screen.getByText("Receita projetada")).toBeInTheDocument();
  });
});
