import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppDataProvider, useAppData } from "@/contexts/AppDataContext";
import AbcXyzPage from "@/pages/AbcXyzPage";

const { getAppDataSnapshotMock, getAbcXyzAnalysisMock } = vi.hoisted(() => ({
  getAppDataSnapshotMock: vi.fn(),
  getAbcXyzAnalysisMock: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getAppDataSnapshot: getAppDataSnapshotMock,
    getAbcXyzAnalysis: getAbcXyzAnalysisMock,
  };
});

function FlowHarness() {
  const { hydrateFromBackend } = useAppData();
  const [showPage, setShowPage] = useState(false);

  if (showPage) {
    return <AbcXyzPage />;
  }

  return (
    <button
      onClick={async () => {
        const hydrated = await hydrateFromBackend();
        if (hydrated) {
          setShowPage(true);
        }
      }}
    >
      Concluir upload e sincronizar
    </button>
  );
}

describe("Upload to ABC/XYZ hydration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ABC/XYZ after upload handshake triggers snapshot hydration", async () => {
    getAppDataSnapshotMock
      .mockResolvedValueOnce({
        datasets: {
          production: {
            dataset_id: "production",
            uploaded: false,
            available: false,
            availability_status: "unavailable",
            validation_status: "missing",
            uploaded_at: null,
            filename: null,
            row_count: 0,
            rows: [],
          },
        },
        readiness: {
          overall_status: "unavailable",
          overall_confidence: "low",
          modules: [],
        },
        bom_status: {
          loaded: false,
          products_count: 0,
          rows_count: 0,
          updated_at: null,
        },
      })
      .mockResolvedValueOnce({
        datasets: {
          production: {
            dataset_id: "production",
            uploaded: true,
            available: true,
            availability_status: "ready",
            validation_status: "valid",
            uploaded_at: "2026-03-17T10:00:00Z",
            filename: "production.csv",
            row_count: 2,
            rows: [
              {
                month: 1,
                reference_year: 2026,
                product_code: "P1",
                product_description: "Produto 1",
                produced_quantity: 100,
                customer_name: "Cliente 1",
                customer_code: "C1",
              },
              {
                month: 2,
                reference_year: 2026,
                product_code: "P1",
                product_description: "Produto 1",
                produced_quantity: 120,
                customer_name: "Cliente 1",
                customer_code: "C1",
              },
            ],
          },
          customers: {
            dataset_id: "customers",
            uploaded: true,
            available: true,
            availability_status: "ready",
            validation_status: "valid",
            uploaded_at: "2026-03-17T10:05:00Z",
            filename: "customers.csv",
            row_count: 1,
            rows: [
              {
                product_code: "P1",
                customer_code: "C1",
                customer_name: "Cliente 1",
                product_description: "Produto 1",
                price: 10,
                last_purchase_date: "2026-02-28",
              },
            ],
          },
        },
        readiness: {
          overall_status: "available",
          overall_confidence: "high",
          modules: [],
        },
        bom_status: {
          loaded: false,
          products_count: 0,
          rows_count: 0,
          updated_at: null,
        },
      });

    getAbcXyzAnalysisMock.mockResolvedValueOnce({
      status: "ready",
      generated_at: "2026-03-17T10:06:00Z",
      base_utilizada: ["Historico de producao"],
      abrangencia_analise: {
        escopo: "Base global carregada",
        periodo_inicial: "2026-01",
        periodo_final: "2026-02",
        meses_considerados: 2,
        total_skus: 1,
        linhas_producao: 2,
      },
      confiabilidade: {
        nivel: "media",
        score: 60,
        justificativas: ["Leitura com dois meses consolidados."],
      },
      limitacoes: [],
      criterio_classificacao: {
        abc: "Regra ABC",
        xyz: "Regra XYZ",
        combinada: "Regra combinada",
      },
      indicadores_resumidos: {
        total_skus: 1,
        volume_total: 220,
        classes_abc: { A: 1, B: 0, C: 0 },
        classes_xyz: { X: 1, Y: 0, Z: 0 },
        matriz_abc_xyz: { AX: 1, AY: 0, AZ: 0, BX: 0, BY: 0, BZ: 0, CX: 0, CY: 0, CZ: 0 },
        concentracao_top10_percent: 100,
        participacao_z_percent: 0,
        priorizacao_executiva: ["Priorizar revisao semanal."],
      },
      clientes_disponiveis: ["C1 - Cliente 1"],
      produtos: [
        {
          sku: "P1",
          sku_label: "P1 - Produto 1",
          descricao: "Produto 1",
          month_values: { "2026-01": 100, "2026-02": 120 },
          volume_anual: 220,
          media_mensal: 110,
          desvio_padrao: 14,
          cv: 0.12,
          percentual_acumulado: 1,
          classe_abc: "A",
          classe_xyz: "X",
          classe_combinada: "AX",
          tendencia_percentual: 20,
          tendencia: "Crescimento",
          consumo_diario: 3.6,
          dias_alvo: 60,
          estrategia: "MTS (candidato)",
          prioridade: 8,
          top1_cliente: "C1 - Cliente 1",
          top1_share: 1,
          hhi_cliente: 1,
          meses_ativos: 2,
        },
      ],
    });

    render(
      <MemoryRouter>
        <AppDataProvider>
          <FlowHarness />
        </AppDataProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Concluir upload e sincronizar" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "ABC Executivo" })).toBeInTheDocument();
    });

    expect(screen.getByText("Curva ABC Executiva - Volume Produzido (kg)")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Matriz ABC-XYZ" })).toBeInTheDocument();
    expect(getAppDataSnapshotMock).toHaveBeenCalledTimes(2);
    expect(getAbcXyzAnalysisMock).toHaveBeenCalledTimes(1);
  });
});
