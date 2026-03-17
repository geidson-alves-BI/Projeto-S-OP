import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UploadPage from "@/pages/UploadPage";

const {
  useAppDataMock,
  useUploadCenterMock,
  uploadDatasetFileMock,
  refreshMock,
} = vi.hoisted(() => ({
  useAppDataMock: vi.fn(),
  useUploadCenterMock: vi.fn(),
  uploadDatasetFileMock: vi.fn(),
  refreshMock: vi.fn(),
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
    uploadDatasetFile: uploadDatasetFileMock,
  };
});

vi.mock("@/components/ExecutiveReadinessPanel", () => ({
  ExecutiveReadinessPanel: () => <div data-testid="readiness-panel" />,
}));

vi.mock("@/components/AnalyticCoveragePanel", () => ({
  AnalyticCoveragePanel: () => <div data-testid="coverage-panel" />,
}));

vi.mock("@/components/CriticalGapsPanel", () => ({
  CriticalGapsPanel: () => <div data-testid="gaps-panel" />,
}));

vi.mock("@/components/UploadDatasetCard", () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid={`card-${props.dataset.id}`}>
      <button
        onClick={() => {
          if (!props.file) {
            props.onFileSelect(new File(["csv"], `${props.dataset.id}.csv`, { type: "text/csv" }));
            return;
          }
          void props.onUpload();
        }}
      >
        {props.file ? `Enviar ${props.dataset.id}` : `Selecionar ${props.dataset.id}`}
      </button>
      {props.feedback ? <p>{props.feedback.message}</p> : null}
    </div>
  ),
}));

function makeUploadCenterPayload() {
  return {
    coverage_percent: 100,
    available_dataset_count: 1,
    total_dataset_count: 1,
    datasets: [
      {
        id: "production",
        dataset_id: "production",
        legacy_ids: [],
        name: "Producao",
        friendly_name: "Historico de producao",
        category: "operacoes",
        storage_kind: "structured",
        objective: "Objetivo",
        executive_description: "Descricao",
        accepted_formats: [".csv"],
        required_columns: ["month", "reference_year", "product_code", "product_description", "produced_quantity"],
        optional_columns: [],
        expected_columns: ["month"],
        column_labels: {},
        column_aliases: {},
        expected_types: {},
        validation_rules: [],
        readiness_impact: ["forecast"],
        criticality: "high",
        usage_examples: [],
        contract_registry_version: "2026.03",
        uploaded: true,
        available: true,
        validation_status: "valid",
        availability_status: "ready",
        uploaded_at: "2026-03-17T10:00:00Z",
        filename: "production.csv",
        format: ".csv",
        row_count: 100,
        column_count: 10,
        columns_detected: ["month"],
        latest_message: "ok",
        history_count: 1,
        document_count: 0,
        storage_path: null,
        last_upload_status: "valid",
        last_validation: {
          dataset_id: "production",
          dataset_name: "Producao",
          validation_status: "valid",
          availability_status: "ready",
          compatibility_status: "compatible",
          compatibility_score: 100,
          confidence_score: 100,
          row_count: 100,
          column_count: 10,
          source_columns: [],
          recognized_columns: [],
          missing_required_columns: [],
          ignored_columns: [],
          alias_mapped_columns: [],
          required_coverage: { matched: 5, total: 5, percent: 100 },
          optional_coverage: { matched: 0, total: 0, percent: 100 },
          analytical_impact: { modules: [], summary: "" },
          quality_gaps: [],
          rule_results: [],
          summary: "ok",
          source_format: ".csv",
          source_filename: "production.csv",
          validated_at: "2026-03-17T10:00:00Z",
          source_to_canonical: {},
        },
        compatibility_summary: {
          dataset_id: "production",
          validation_status: "valid",
          availability_status: "ready",
          compatibility_status: "compatible",
          compatibility_score: 100,
          confidence_score: 100,
          missing_required_columns: [],
          quality_gaps: [],
          summary: "ok",
        },
      },
    ],
    readiness: {
      overall_status: "available",
      overall_confidence: "high",
      modules: [],
    },
    history: [],
    compatibility_summary: {
      average_confidence_score: 100,
      average_compatibility_score: 100,
      ready_datasets: 1,
      partial_datasets: 0,
      unavailable_datasets: 0,
      missing_datasets: [],
      largest_gaps: [],
      datasets: {
        production: {
          dataset_id: "production",
          validation_status: "valid",
          availability_status: "ready",
          compatibility_status: "compatible",
          compatibility_score: 100,
          confidence_score: 100,
          missing_required_columns: [],
          quality_gaps: [],
          summary: "ok",
        },
      },
      ai_readiness: {
        coverage_percent: 100,
        confidence_score: 100,
        quality_gaps: [],
        missing_datasets: [],
      },
    },
    contract_registry: {
      version: "2026.03",
      aliases: {},
      datasets: [],
    },
  } as any;
}

describe("UploadPage post-upload hydration handshake", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    refreshMock.mockResolvedValue(makeUploadCenterPayload());
    useUploadCenterMock.mockReturnValue({
      uploadCenter: makeUploadCenterPayload(),
      loading: false,
      error: null,
      refresh: refreshMock,
    });
  });

  it("shows success only when upload and hydration both succeed", async () => {
    uploadDatasetFileMock.mockResolvedValue({
      validation: {
        availability_status: "ready",
        row_count: 120,
      },
    });

    useAppDataMock.mockReturnValue({
      loading: false,
      error: null,
      hydrateFromBackend: vi.fn().mockResolvedValue(true),
    });

    render(<UploadPage />);

    const actionButton = screen.getByRole("button", { name: "Selecionar production" });
    fireEvent.click(actionButton);
    fireEvent.click(screen.getByRole("button", { name: "Enviar production" }));

    await waitFor(() => {
      expect(
        screen.getByText("120 linhas validadas para Base Operacional. Sincronizacao concluida com sucesso."),
      ).toBeInTheDocument();
    });
  });

  it("blocks success and shows explicit sync error when hydration fails", async () => {
    uploadDatasetFileMock.mockResolvedValue({
      validation: {
        availability_status: "ready",
        row_count: 50,
      },
    });

    useAppDataMock.mockReturnValue({
      loading: false,
      error: null,
      hydrateFromBackend: vi.fn().mockResolvedValue(false),
    });

    render(<UploadPage />);

    fireEvent.click(screen.getByRole("button", { name: "Selecionar production" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar production" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "50 linhas validadas para Base Operacional. Upload concluido, mas a sincronizacao pos-upload falhou. A analise permanece bloqueada ate a sincronizacao ser concluida.",
        ),
      ).toBeInTheDocument();
    });
  });
});

