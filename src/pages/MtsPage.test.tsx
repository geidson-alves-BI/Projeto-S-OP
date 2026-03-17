import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MtsPage from "@/pages/MtsPage";

const { useAppDataMock, useUploadCenterMock, postJSONMock } = vi.hoisted(() => ({
  useAppDataMock: vi.fn(),
  useUploadCenterMock: vi.fn(),
  postJSONMock: vi.fn(),
}));

vi.mock("@/contexts/AppDataContext", () => ({
  useAppData: () => useAppDataMock(),
}));

vi.mock("@/hooks/use-upload-center", () => ({
  useUploadCenter: () => useUploadCenterMock(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    postJSON: postJSONMock,
  };
});

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
  clientes: [],
  hasClientes: false,
} as const;

function buildUploadCenter(hasBom: boolean) {
  return {
    datasets: [
      {
        id: "production",
        name: "production",
        uploaded: true,
        availability_status: "ready",
        last_upload_status: "valid",
      },
      {
        id: "sales_orders",
        name: "sales_orders",
        uploaded: true,
        availability_status: "ready",
        last_upload_status: "valid",
      },
      {
        id: "bom",
        name: "bom",
        uploaded: hasBom,
        availability_status: hasBom ? "ready" : "unavailable",
        last_upload_status: hasBom ? "valid" : "missing",
      },
    ],
    readiness: {
      overall_status: hasBom ? "available" : "partial",
      overall_confidence: hasBom ? "high" : "medium",
      modules: [
        {
          key: "mts_mto",
          label: "MTS/MTO",
          status: hasBom ? "available" : "partial",
          confidence: hasBom ? "high" : "medium",
          datasets: ["production", "bom"],
          missing_datasets: hasBom ? [] : ["BOM"],
          description: "",
        },
      ],
    },
  } as const;
}

describe("MtsPage BOM prerequisites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppDataMock.mockReturnValue({ state: baseState });
  });

  it("keeps simulation blocked when BOM is missing", () => {
    useUploadCenterMock.mockReturnValue({ uploadCenter: buildUploadCenter(false) });

    render(
      <MemoryRouter>
        <MtsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("A tabela MTS/MTO pode ser consultada sem BOM. Para executar a simulacao, carregue a BOM na Central de Upload.")).toBeInTheDocument();
    const simulateButton = screen.getByRole("button", { name: "Carregue BOM para simular" });
    expect(simulateButton).toBeDisabled();
    expect(postJSONMock).not.toHaveBeenCalled();
  });

  it("runs simulation when BOM is available", async () => {
    useUploadCenterMock.mockReturnValue({ uploadCenter: buildUploadCenter(true) });
    postJSONMock.mockResolvedValueOnce({
      items: [
        {
          product_code: "P1",
          production_qty: 150,
          raw_material_code: "RM1",
          raw_material_required: 300,
          raw_material_cost: 500,
          total_production_cost: 700,
        },
      ],
    });

    render(
      <MemoryRouter>
        <MtsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("P001"), {
      target: { value: "P1" },
    });
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "150" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Simular Producao MTS" }));

    await waitFor(() => {
      expect(postJSONMock).toHaveBeenCalledWith("/analytics/simulate_mts_production", {
        items: [{ product_code: "P1", forecast_demand: 150 }],
      });
    });

    expect(await screen.findByText("RM1")).toBeInTheDocument();
  });
});
