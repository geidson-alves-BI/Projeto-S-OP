import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import type {
  AnalyticsV2FinancialScenariosResponse,
  AnalyticsV2MetricContract,
  AnalyticsV2Snapshot,
} from "@/types/analytics";

const { useAnalyticsV2Mock, refreshMock } = vi.hoisted(() => ({
  useAnalyticsV2Mock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/hooks/use-analytics-v2", () => ({
  useAnalyticsV2: () => useAnalyticsV2Mock(),
}));

function makeMetric(
  metricId: string,
  overrides: Partial<AnalyticsV2MetricContract> = {},
): AnalyticsV2MetricContract {
  return {
    metric_id: metricId,
    display_name: metricId,
    value: 1000,
    formatted_value: "1,000.00",
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
      { dataset_id: "production", status: "ready", row_count: 10 },
      { dataset_id: "sales_orders", status: "ready", row_count: 15 },
    ],
    qualidade_por_dataset: {
      production: {
        status: "ready",
        validation_status: "valid",
        quality_score: 90,
        compatibility_score: 92,
        row_count: 10,
        uploaded: true,
        missing_required_columns: [],
      },
    },
    metricas_calculaveis: [
      { metric_id: "production_volume", status: "ready", confianca: "high", decision_grade: "A" },
    ],
    metricas_bloqueadas: [],
    readiness_v2: {
      metrics_ready: 5,
      metrics_partial: 1,
      metrics_unavailable: 2,
      coverage_percent: 75,
      overall_status: "partial",
    },
    resumo_executivo: ["6 de 8 metricas calculaveis na camada v2."],
    engine_version: "2.0.0",
    ...overrides,
  };
}

function makeScenarios(): AnalyticsV2FinancialScenariosResponse {
  const baseRevenue = makeMetric("projected_revenue", { formatted_value: "R$ 100.000,00" });
  const baseMargin = makeMetric("contribution_margin", { formatted_value: "R$ 38.000,00" });
  const baseWc = makeMetric("total_working_capital", { formatted_value: "R$ 48.500,00" });
  const baseCarry = makeMetric("inventory_carrying_cost", { formatted_value: "R$ 8.730,00" });
  const delta = makeMetric("scenario_delta_financial", { formatted_value: "R$ 0,00" });

  const scenario = (id: "base" | "conservador" | "agressivo", displayName: string, deltaValue: string) => ({
    scenario_id: id,
    display_name: displayName,
    assumptions: {
      revenue_factor: 1,
      demand_factor: 1,
      inventory_coverage_factor: 1,
      carrying_cost_rate: 0.18,
      safety_factor: 1,
      notes: "premissa",
    },
    revenue: baseRevenue,
    cogs: { ...makeMetric("projected_cogs", { formatted_value: "R$ 62.000,00" }), components: { material_cost: 36000, conversion_cost: 26000, estimated_cogs: 62000 } },
    contribution_margin: baseMargin,
    contribution_margin_pct: makeMetric("contribution_margin_pct", { formatted_value: "38.00%" }),
    fg_working_capital: makeMetric("fg_working_capital", { formatted_value: "R$ 36.000,00" }),
    rm_working_capital: makeMetric("rm_working_capital", { formatted_value: "US$ 12,500.00" }),
    total_working_capital: baseWc,
    mts_incremental_investment: makeMetric("mts_incremental_investment", { formatted_value: "R$ 14.400,00" }),
    inventory_carrying_cost: baseCarry,
    delta_vs_base: {
      scenario_delta_financial: { ...delta, formatted_value: deltaValue },
      breakdown: {},
    },
    confianca: "medium" as const,
    decision_grade: "B" as const,
    status: "partial" as const,
    missing_data: [],
    limitations: [],
    calculation_method: "scenario_test",
    base_usada: ["finance_documents"],
    engine_version: "2.0.0",
  });

  return {
    base_scenario: "base",
    escopo: "global",
    scenarios: [
      scenario("base", "Base", "R$ 0,00"),
      scenario("conservador", "Conservador", "R$ -5.000,00"),
      scenario("agressivo", "Agressivo", "R$ 7.000,00"),
    ],
    metricas_financeiras_suportadas: [],
    engine_version: "2.0.0",
    generated_at: "2026-03-17T00:00:00Z",
  };
}

describe("HomePage analytics v2 pilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnalyticsV2Mock.mockReturnValue({
      snapshot: makeSnapshot(),
      financialScenarios: makeScenarios(),
      metricsById: {
        production_volume: makeMetric("production_volume", { formatted_value: "10,000.00 kg" }),
        sales_volume: makeMetric("sales_volume", { formatted_value: "9,500.00 kg" }),
        demand_vs_operation_gap: makeMetric("demand_vs_operation_gap", { formatted_value: "5.00%" }),
        raw_material_coverage: makeMetric("raw_material_coverage", { formatted_value: "42.0 dias" }),
        projected_revenue: makeMetric("projected_revenue", { formatted_value: "R$ 100.000,00" }),
        contribution_margin: makeMetric("contribution_margin", { formatted_value: "R$ 38.000,00" }),
        total_working_capital: makeMetric("total_working_capital", { formatted_value: "R$ 48.500,00" }),
      },
      loading: false,
      error: null,
      refresh: refreshMock,
      hasCalculableMetrics: true,
      hasAnyContent: true,
      isPartialState: true,
      isEmptyState: false,
      availability: {
        state: "partial",
        hasContent: true,
        isPartial: true,
        isEmpty: false,
        hasError: false,
        message: null,
      },
    });
  });

  it("renders loading state", () => {
    useAnalyticsV2Mock.mockReturnValue({
      snapshot: null,
      financialScenarios: null,
      metricsById: {},
      loading: true,
      error: null,
      refresh: refreshMock,
      hasCalculableMetrics: false,
      hasAnyContent: false,
      isPartialState: false,
      isEmptyState: false,
      availability: {
        state: "loading",
        hasContent: false,
        isPartial: false,
        isEmpty: false,
        hasError: false,
        message: null,
      },
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Carregando resumo da analise...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar analise" })).toBeDisabled();
  });

  it("renders partial snapshot summary", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Resumo do ciclo atual")).toBeInTheDocument();
    expect(screen.getByText("6 de 8 metricas calculaveis na camada principal.")).toBeInTheDocument();
    expect(screen.getByText("75% de cobertura")).toBeInTheDocument();
  });

  it("renders executive KPI cards with metric values", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Volume de producao")).toBeInTheDocument();
    expect(screen.getByText("10,000.00 kg")).toBeInTheDocument();
    expect(screen.getByText("Receita projetada")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 100.000,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Capital empatado total").length).toBeGreaterThan(0);
  });

  it("renders financial scenarios comparison", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Base vs Conservador vs Agressivo")).toBeInTheDocument();
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Conservador")).toBeInTheDocument();
    expect(screen.getByText("Agressivo")).toBeInTheDocument();
    expect(screen.getByText("R$ -5.000,00")).toBeInTheDocument();
  });

  it("renders specific empty-state when no calculable metrics", () => {
    useAnalyticsV2Mock.mockReturnValue({
      snapshot: makeSnapshot({
        metricas_calculaveis: [],
        readiness_v2: {
          metrics_ready: 0,
          metrics_partial: 0,
          metrics_unavailable: 8,
          coverage_percent: 0,
          overall_status: "unavailable",
        },
      }),
      financialScenarios: { ...makeScenarios(), scenarios: [] },
      metricsById: {},
      loading: false,
      error: null,
      refresh: refreshMock,
      hasCalculableMetrics: false,
      hasAnyContent: true,
      isPartialState: false,
      isEmptyState: true,
      availability: {
        state: "empty",
        hasContent: true,
        isPartial: false,
        isEmpty: true,
        hasError: false,
        message: "Nenhum indicador foi liberado para o recorte atual.",
      },
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Nenhuma metrica calculavel foi encontrada no momento. Carregue bases obrigatorias para liberar os KPIs.")).toBeInTheDocument();
  });

  it("renders fallback message when analytics v2 API fails without breaking navigation", () => {
    useAnalyticsV2Mock.mockReturnValue({
      snapshot: null,
      financialScenarios: null,
      metricsById: {},
      loading: false,
      error: "backend offline",
      refresh: refreshMock,
      hasCalculableMetrics: false,
      hasAnyContent: false,
      isPartialState: false,
      isEmptyState: false,
      availability: {
        state: "unavailable",
        hasContent: false,
        isPartial: false,
        isEmpty: false,
        hasError: true,
        message: "Analise indisponivel: backend offline",
      },
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Analise indisponivel no momento")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload center" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "IA executiva" })).toBeInTheDocument();
  });

  it("refresh action triggers hook refresh", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Atualizar analise" }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("does not expose internal technical wording in visible copy", () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain(" v2");
    expect(text).not.toContain("engine");
    expect(text).not.toContain("registry");
    expect(text).not.toContain("snapshot");
    expect(text).not.toContain("compute");
  });
});
