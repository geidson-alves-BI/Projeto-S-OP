import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RelatoriosPage from "@/pages/RelatoriosPage";

const { useAppDataMock, useContextPackMock, downloadFileFromPostMock } = vi.hoisted(() => ({
  useAppDataMock: vi.fn(),
  useContextPackMock: vi.fn(),
  downloadFileFromPostMock: vi.fn(),
}));

vi.mock("@/contexts/AppDataContext", () => ({
  useAppData: () => useAppDataMock(),
}));

vi.mock("@/hooks/use-context-pack", () => ({
  useContextPack: () => useContextPackMock(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    downloadFileFromPost: downloadFileFromPostMock,
  };
});

vi.mock("@/components/ContextPackOverview", () => ({
  default: ({ actions }: { actions?: ReactNode }) => <div data-testid="context-pack-overview">{actions}</div>,
}));

const viewModel = {
  coveragePercent: 60,
  componentsAvailable: [],
  availableComponentsCount: 2,
  totalComponentsCount: 6,
  inputsAvailable: [{ label: "Forecast", available: false }],
} as const;

const emptyState = {
  products: [],
  monthCols: [],
  hasClientes: false,
  portfolioConc: null,
} as const;

const populatedState = {
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
  hasClientes: false,
  portfolioConc: null,
} as const;

describe("RelatoriosPage strategic export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContextPackMock.mockReturnValue({
      refresh: vi.fn(),
      loading: false,
      error: null,
      viewModel,
    });
  });

  it("shows a clear error when there are no rows to export", async () => {
    useAppDataMock.mockReturnValue({
      state: emptyState,
      rmData: null,
      loading: false,
    });

    render(
      <MemoryRouter>
        <RelatoriosPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));

    expect(await screen.findByText("Nao ha linhas para exportar. Carregue a base operacional antes de exportar o relatorio estrategico.")).toBeInTheDocument();
    expect(downloadFileFromPostMock).not.toHaveBeenCalled();
  });

  it("sends rows and file_format in the request body", async () => {
    downloadFileFromPostMock.mockResolvedValueOnce("strategy_report.xlsx");
    useAppDataMock.mockReturnValue({
      state: populatedState,
      rmData: null,
      loading: false,
    });

    render(
      <MemoryRouter>
        <RelatoriosPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Exportar XLSX" }));

    await waitFor(() => {
      expect(downloadFileFromPostMock).toHaveBeenCalledWith(
        "/analytics/export_strategy_report",
        {
          rows: [
            {
              product_code: "P1",
              product_name: "Produto 1",
              sales: 1200,
            },
          ],
          file_format: "xlsx",
        },
        "strategy_report.xlsx",
      );
    });
  });
});
