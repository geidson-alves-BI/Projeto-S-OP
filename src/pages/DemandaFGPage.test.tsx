import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import DemandaFGPage from "@/pages/DemandaFGPage";

const { useAppDataMock, useUploadCenterMock } = vi.hoisted(() => ({
  useAppDataMock: vi.fn(),
  useUploadCenterMock: vi.fn(),
}));

vi.mock("@/contexts/AppDataContext", () => ({
  useAppData: () => useAppDataMock(),
}));

vi.mock("@/hooks/use-upload-center", () => ({
  useUploadCenter: () => useUploadCenterMock(),
}));

vi.mock("@/components/Charts", () => ({
  ProductSeriesChart: () => <div data-testid="product-series-chart" />, 
}));

const baseState = {
  products: [
    {
      SKU_LABEL: "P1 - Produto 1",
      codigoProduto: "P1",
      denominacao: "Produto 1",
      classeABC: "A",
      classeXYZ: "X",
      abcXyz: "AX",
      volumeAnual: 1200,
      mediaMensal: 100,
      consumoDiario: 4,
      diasAlvoBase: 30,
      estrategiaBase: "MTS (candidato)",
      prioridadeMTS: 90,
      trendLabel: "estavel",
      monthValues: { "2026-01": 100, "2026-02": 120 },
      cv: 0.2,
      targetKg30: 120,
    },
  ],
  monthCols: ["2026-01", "2026-02"],
  prodLong: [],
  prodConc: [],
  portfolioConc: null,
  clientes: ["C1 - Cliente 1"],
  hasClientes: true,
} as const;

describe("DemandaFGPage", () => {
  beforeEach(() => {
    useAppDataMock.mockReturnValue({ state: baseState });
    useUploadCenterMock.mockReturnValue({
      uploadCenter: {
        datasets: [],
        readiness: {
          overall_status: "available",
          overall_confidence: "high",
          modules: [],
        },
      },
    });
  });

  it("renders operational view when datasets are already loaded", () => {
    render(
      <MemoryRouter>
        <DemandaFGPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Base Operacional - Demanda e historico")).toBeInTheDocument();
    expect(screen.getAllByText("P1 - Produto 1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nenhuma base operacional foi consolidada ainda. Use a central para carregar producao, vendas e clientes.")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("product-series-chart").length).toBeGreaterThan(0);
  });
});
