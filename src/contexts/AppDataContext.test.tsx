import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AppDataProvider, useAppData } from "@/contexts/AppDataContext";

const { getAppDataSnapshotMock } = vi.hoisted(() => ({
  getAppDataSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getAppDataSnapshot: getAppDataSnapshotMock,
  };
});

function Probe() {
  const {
    state,
    rmData,
    loading,
    hydrationStatus,
    hydrationError,
    lastHydratedAt,
    lastFGImportAt,
    lastClientesImportAt,
    lastRMImportAt,
  } = useAppData();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="hydration-status">{hydrationStatus}</div>
      <div data-testid="hydration-error">{hydrationError ?? ""}</div>
      <div data-testid="hydrated-at">{lastHydratedAt ?? ""}</div>
      <div data-testid="products">{state?.products.length ?? 0}</div>
      <div data-testid="has-clientes">{String(state?.hasClientes ?? false)}</div>
      <div data-testid="clientes">{state?.clientes.length ?? 0}</div>
      <div data-testid="rm-count">{rmData?.length ?? 0}</div>
      <div data-testid="fg-ts">{lastFGImportAt ?? ""}</div>
      <div data-testid="cli-ts">{lastClientesImportAt ?? ""}</div>
      <div data-testid="rm-ts">{lastRMImportAt ?? ""}</div>
    </div>
  );
}

describe("AppDataProvider hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates initial state from backend snapshot on mount", async () => {
    getAppDataSnapshotMock.mockResolvedValueOnce({
      datasets: {
        production: {
          dataset_id: "production",
          uploaded: true,
          available: true,
          availability_status: "ready",
          validation_status: "valid",
          uploaded_at: "2026-03-16T10:00:00Z",
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
              trade_name: "Cliente 1",
            },
            {
              month: 2,
              reference_year: 2026,
              product_code: "P1",
              product_description: "Produto 1",
              produced_quantity: 120,
              customer_name: "Cliente 1",
              customer_code: "C1",
              trade_name: "Cliente 1",
            },
          ],
        },
        customers: {
          dataset_id: "customers",
          uploaded: true,
          available: true,
          availability_status: "ready",
          validation_status: "valid",
          uploaded_at: "2026-03-16T10:05:00Z",
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
        raw_material_inventory: {
          dataset_id: "raw_material_inventory",
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

    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("products")).toHaveTextContent("1");
    });

    expect(getAppDataSnapshotMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("has-clientes")).toHaveTextContent("true");
    expect(screen.getByTestId("clientes")).toHaveTextContent("1");
    expect(screen.getByTestId("rm-count")).toHaveTextContent("0");
    expect(screen.getByTestId("fg-ts")).toHaveTextContent("2026-03-16T10:00:00Z");
    expect(screen.getByTestId("cli-ts")).toHaveTextContent("2026-03-16T10:05:00Z");
    expect(screen.getByTestId("hydration-status")).toHaveTextContent("success");
    expect(screen.getByTestId("hydration-error")).toHaveTextContent("");
    expect(screen.getByTestId("hydrated-at").textContent).not.toBe("");
  });

  it("exposes hydration error status when backend snapshot fails", async () => {
    getAppDataSnapshotMock.mockRejectedValueOnce(new Error("falha de snapshot"));

    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("hydration-status")).toHaveTextContent("error");
    });

    expect(screen.getByTestId("products")).toHaveTextContent("0");
    expect(screen.getByTestId("hydration-error")).toHaveTextContent("falha de snapshot");
  });
});
