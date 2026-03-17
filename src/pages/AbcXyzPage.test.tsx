import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AbcXyzPage from "@/pages/AbcXyzPage";
import type { AbcXyzAnalysisResponse } from "@/types/analytics";

const { useAppDataMock, useAbcXyzAnalysisMock } = vi.hoisted(() => ({
  useAppDataMock: vi.fn(),
  useAbcXyzAnalysisMock: vi.fn(),
}));

vi.mock("@/contexts/AppDataContext", () => ({
  useAppData: () => useAppDataMock(),
}));

vi.mock("@/hooks/use-abc-xyz-analysis", () => ({
  useAbcXyzAnalysis: () => useAbcXyzAnalysisMock(),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="route">{location.pathname}</div>;
}

function makeAnalysis(status: AbcXyzAnalysisResponse["status"]): AbcXyzAnalysisResponse {
  return {
    status,
    generated_at: "2026-03-17T00:00:00Z",
    base_utilizada: ["Historico de producao"],
    abrangencia_analise: {
      escopo: "Base global carregada",
      periodo_inicial: "2026-01",
      periodo_final: "2026-06",
      meses_considerados: 6,
      total_skus: 2,
      linhas_producao: 12,
    },
    confiabilidade: {
      nivel: "media",
      score: 68,
      justificativas: ["Base consolidada para leitura operacional."],
    },
    limitacoes: status === "partial" ? ["Janela historica reduzida."] : [],
    criterio_classificacao: {
      abc: "Regra ABC por acumulado.",
      xyz: "Regra XYZ por variabilidade.",
      combinada: "Combinacao entre ABC e XYZ.",
    },
    indicadores_resumidos: {
      total_skus: 2,
      volume_total: 1900,
      classes_abc: { A: 1, B: 1, C: 0 },
      classes_xyz: { X: 1, Y: 1, Z: 0 },
      matriz_abc_xyz: { AX: 1, AY: 0, AZ: 0, BX: 0, BY: 1, BZ: 0, CX: 0, CY: 0, CZ: 0 },
      concentracao_top10_percent: 100,
      participacao_z_percent: 0,
      priorizacao_executiva: ["Priorizar itens de maior giro."],
    },
    clientes_disponiveis: ["C1 - Cliente 1"],
    produtos: [
      {
        sku: "P1",
        sku_label: "P1 - Produto 1",
        descricao: "Produto 1",
        month_values: {
          "2026-01": 100,
          "2026-02": 110,
          "2026-03": 120,
          "2026-04": 130,
          "2026-05": 140,
          "2026-06": 150,
        },
        volume_anual: 750,
        media_mensal: 125,
        desvio_padrao: 18,
        cv: 0.14,
        percentual_acumulado: 0.65,
        classe_abc: "A",
        classe_xyz: "X",
        classe_combinada: "AX",
        tendencia_percentual: 18,
        tendencia: "Crescimento",
        consumo_diario: 4.16,
        dias_alvo: 60,
        estrategia: "MTS (candidato)",
        prioridade: 9,
        top1_cliente: "C1 - Cliente 1",
        top1_share: 0.72,
        hhi_cliente: 0.54,
        meses_ativos: 6,
      },
      {
        sku: "P2",
        sku_label: "P2 - Produto 2",
        descricao: "Produto 2",
        month_values: {
          "2026-01": 150,
          "2026-02": 150,
          "2026-03": 150,
          "2026-04": 150,
          "2026-05": 150,
          "2026-06": 150,
        },
        volume_anual: 900,
        media_mensal: 150,
        desvio_padrao: 0,
        cv: 0,
        percentual_acumulado: 1,
        classe_abc: "B",
        classe_xyz: "Y",
        classe_combinada: "BY",
        tendencia_percentual: 0,
        tendencia: "Estavel",
        consumo_diario: 5,
        dias_alvo: 30,
        estrategia: "MTS (candidato)",
        prioridade: 5,
        top1_cliente: "",
        top1_share: 0,
        hhi_cliente: 0,
        meses_ativos: 6,
      },
    ],
  };
}

describe("AbcXyzPage hydration and backend states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppDataMock.mockReturnValue({
      hydrationStatus: "success",
      hydrationError: null,
    });
    useAbcXyzAnalysisMock.mockReturnValue({
      analysis: makeAnalysis("ready"),
      loading: false,
      error: null,
      refresh: vi.fn(),
      availability: {
        state: "ready",
        hasContent: true,
        isPartial: false,
        isEmpty: false,
        hasError: false,
        message: null,
      },
    });
  });

  it("does not redirect while hydration is still in progress", () => {
    useAppDataMock.mockReturnValue({
      hydrationStatus: "loading",
      hydrationError: null,
    });
    useAbcXyzAnalysisMock.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
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
      <MemoryRouter initialEntries={["/abc-xyz"]}>
        <Routes>
          <Route
            path="/abc-xyz"
            element={
              <>
                <LocationProbe />
                <AbcXyzPage />
              </>
            }
          />
          <Route path="/upload" element={<div>Upload</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("route")).toHaveTextContent("/abc-xyz");
    expect(screen.getByText("Sincronizando os dados da base principal para liberar a analise.")).toBeInTheDocument();
  });

  it("shows explicit hydration error state", () => {
    useAppDataMock.mockReturnValue({
      hydrationStatus: "error",
      hydrationError: "falha de hidratacao",
    });
    useAbcXyzAnalysisMock.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
      availability: {
        state: "unavailable",
        hasContent: false,
        isPartial: false,
        isEmpty: false,
        hasError: true,
        message: "Analise indisponivel no momento.",
      },
    });

    render(
      <MemoryRouter>
        <AbcXyzPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Falha ao carregar a base")).toBeInTheDocument();
    expect(screen.getByText("falha de hidratacao")).toBeInTheDocument();
  });

  it("renders complete analysis state with backend data", () => {
    useAbcXyzAnalysisMock.mockReturnValue({
      analysis: makeAnalysis("ready"),
      loading: false,
      error: null,
      refresh: vi.fn(),
      availability: {
        state: "ready",
        hasContent: true,
        isPartial: false,
        isEmpty: false,
        hasError: false,
        message: null,
      },
    });

    render(
      <MemoryRouter>
        <AbcXyzPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Classificacao ABC/XYZ")).toBeInTheDocument();
    expect(screen.getByText("Analise completa disponivel para leitura executiva e operacional.")).toBeInTheDocument();
    expect(screen.getByText("SKUs classificados")).toBeInTheDocument();
  });

  it("renders partial analysis state without empty screen", () => {
    useAbcXyzAnalysisMock.mockReturnValue({
      analysis: makeAnalysis("partial"),
      loading: false,
      error: null,
      refresh: vi.fn(),
      availability: {
        state: "partial",
        hasContent: true,
        isPartial: true,
        isEmpty: false,
        hasError: false,
        message: "Atualizacao parcial da analise.",
      },
    });

    render(
      <MemoryRouter>
        <AbcXyzPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Analise parcial disponivel. A tela segue funcional com o que foi consolidado.")).toBeInTheDocument();
    expect(screen.getByText("Limitacoes da analise")).toBeInTheDocument();
  });

  it("does not expose internal technical naming in page copy", () => {
    const { container } = render(
      <MemoryRouter>
        <AbcXyzPage />
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
