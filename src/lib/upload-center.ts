import type {
  ForecastResult,
  UploadCenterStatus,
  UploadDataset,
  UploadDatasetKey,
  UploadReadinessItem,
  UploadReadinessKey,
  UploadReadinessStatus,
  UploadValidationStatus,
} from "@/types/analytics";

type GenericRow = Record<string, unknown>;
type ReadinessStatusLike = UploadReadinessStatus | "available" | string;

const DATASET_KEYS: UploadDatasetKey[] = [
  "production",
  "sales_orders",
  "customers",
  "forecast_input",
  "bom",
  "raw_material_inventory",
  "finance_documents",
];

const READINESS_LABEL_FALLBACK: Record<UploadReadinessKey, string> = {
  overall: "Base Operacional",
  planning_production: "Analise e Planejamento de Demanda",
  forecast: "Forecast",
  mts_mto: "MTS/MTO",
  raw_material: "Materia-prima",
  finance: "Financeiro",
  executive_ai: "Chat Executivo",
};

const DATASET_USAGE_LABELS: Record<UploadDatasetKey, string> = {
  sales_orders: "Analise e Planejamento de Demanda",
  production: "Base Operacional e MTS/MTO",
  raw_material_inventory: "MTS/MTO e Materia-prima, quando aplicavel",
  customers: "Base Operacional e Analise e Planejamento de Demanda",
  bom: "MTS/MTO (obrigatorio para simulacao)",
  forecast_input: "Forecast e Analise e Planejamento de Demanda",
  finance_documents: "Financeiro e Chat Executivo",
};

export function getDatasetUsageLabel(datasetId: UploadDatasetKey) {
  return DATASET_USAGE_LABELS[datasetId] ?? "Suporte executivo";
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }

  let normalized = raw;
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMonthlyHistory(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => toNumber(item)).filter((item) => item > 0);
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }

  const chunks = raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => toNumber(item))
    .filter((item) => item > 0);

  return chunks.length > 0 ? chunks : undefined;
}

export function formatTimestamp(value: string | null) {
  if (!value) {
    return "Ainda nao registrado";
  }

  return new Date(value).toLocaleString("pt-BR");
}

export function formatValidationStatus(status: UploadValidationStatus) {
  if (status === "valid") {
    return "Validado";
  }
  if (status === "partial") {
    return "Parcial";
  }
  if (status === "invalid") {
    return "Invalido";
  }
  if (status === "pending") {
    return "Pendente";
  }
  return "Sem upload";
}

export function normalizeReadinessStatus(status: unknown): UploadReadinessStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "ready" || normalized === "available") {
    return "ready";
  }
  if (normalized === "partial") {
    return "partial";
  }
  return "unavailable";
}

export function formatReadinessStatus(status: ReadinessStatusLike) {
  const normalized = normalizeReadinessStatus(status);
  if (normalized === "ready") {
    return "Pronta";
  }
  if (normalized === "partial") {
    return "Parcial";
  }
  return "Indisponivel";
}

export function formatAvailabilityStatus(status: ReadinessStatusLike) {
  return formatReadinessStatus(status);
}

export function formatCoveragePercent(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return `${Math.round(safe)}%`;
}

export function getStatusClasses(status: UploadValidationStatus | ReadinessStatusLike) {
  const normalizedReadiness = normalizeReadinessStatus(status);

  if (status === "valid" || normalizedReadiness === "ready") {
    return "border-success/30 bg-success/10 text-foreground";
  }
  if (status === "partial" || status === "pending" || normalizedReadiness === "partial") {
    return "border-warning/30 bg-warning/10 text-foreground";
  }
  if (status === "invalid") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  return "border-border/70 bg-muted/20 text-muted-foreground";
}

export function getDataset(uploadCenter: UploadCenterStatus | null, datasetId: UploadDatasetKey) {
  if (!Array.isArray(uploadCenter?.datasets)) {
    return null;
  }
  return uploadCenter.datasets.find((dataset) => dataset.id === datasetId) ?? null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function toDatasetKeyArray(value: unknown): UploadDatasetKey[] {
  const allowed = new Set<string>(DATASET_KEYS);
  return toStringArray(value).filter((item): item is UploadDatasetKey => allowed.has(item));
}

function normalizeReadinessModule(raw: unknown, fallbackKey: UploadReadinessKey): UploadReadinessItem {
  const node = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const keyRaw = String(node.key ?? fallbackKey).trim();
  const key = (keyRaw || fallbackKey) as UploadReadinessKey;
  const label = String(node.label ?? READINESS_LABEL_FALLBACK[key] ?? READINESS_LABEL_FALLBACK[fallbackKey]).trim();
  const status = normalizeReadinessStatus(node.status);
  const missingDatasets = toStringArray(node.missing_datasets);
  const datasets = toDatasetKeyArray(node.datasets);
  const summaryRaw = String(node.summary ?? node.description ?? "").trim();
  const summary =
    summaryRaw || (missingDatasets.length > 0 ? `Faltando: ${missingDatasets.join(", ")}` : "Cobertura registrada.");

  return {
    key,
    label,
    status,
    summary,
    datasets,
    missing_datasets: missingDatasets,
  };
}

export function resolveReadinessModule(
  uploadCenter: UploadCenterStatus | null,
  moduleKey: UploadReadinessKey,
): UploadReadinessItem | null {
  const readinessNode =
    uploadCenter && typeof uploadCenter === "object"
      ? (uploadCenter as unknown as Record<string, unknown>).readiness
      : null;

  if (!readinessNode || typeof readinessNode !== "object") {
    return null;
  }

  const readinessRecord = readinessNode as Record<string, unknown>;
  if (moduleKey === "overall") {
    const modules = Array.isArray(readinessRecord.modules) ? readinessRecord.modules : [];
    const datasets = toDatasetKeyArray(
      modules.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        return toStringArray((item as Record<string, unknown>).datasets);
      }),
    );
    const missingDatasets = Array.from(
      new Set(
        modules.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }
          return toStringArray((item as Record<string, unknown>).missing_datasets);
        }),
      ),
    );
    const status = normalizeReadinessStatus(readinessRecord.overall_status);
    const summary =
      status === "ready"
        ? "Base Operacional pronta para consumo dos modulos S&OP."
        : status === "partial"
          ? "Base Operacional parcial: ha modulos com cobertura incompleta."
          : "Base Operacional indisponivel: faltam datasets essenciais.";

    return {
      key: "overall",
      label: READINESS_LABEL_FALLBACK.overall,
      status,
      summary,
      datasets,
      missing_datasets: missingDatasets,
    };
  }

  const moduleFromRecord = readinessRecord[moduleKey];
  if (moduleFromRecord && typeof moduleFromRecord === "object") {
    return normalizeReadinessModule(moduleFromRecord, moduleKey);
  }

  const modules = Array.isArray(readinessRecord.modules) ? readinessRecord.modules : [];
  const moduleFromArray = modules.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).key ?? "").trim() === moduleKey;
  });

  if (!moduleFromArray) {
    return null;
  }

  return normalizeReadinessModule(moduleFromArray, moduleKey);
}

export function resolveAIReadinessStatus(uploadCenter: UploadCenterStatus | null): UploadReadinessStatus {
  const moduleStatus = resolveReadinessModule(uploadCenter, "executive_ai");
  if (moduleStatus) {
    return moduleStatus.status;
  }

  const aiReadinessNode =
    uploadCenter && typeof uploadCenter === "object"
      ? (uploadCenter as unknown as Record<string, unknown>).compatibility_summary
      : null;
  const aiReadiness =
    aiReadinessNode && typeof aiReadinessNode === "object"
      ? (aiReadinessNode as Record<string, unknown>).ai_readiness
      : null;

  if (aiReadiness && typeof aiReadiness === "object") {
    const coverage = Number((aiReadiness as Record<string, unknown>).coverage_percent ?? 0);
    if (Number.isFinite(coverage)) {
      if (coverage >= 100) {
        return "ready";
      }
      if (coverage > 0) {
        return "partial";
      }
    }
  }

  return "unavailable";
}

export function getFileFormat(file: File) {
  const ext = file.name.toLowerCase().split(".").pop();
  return ext ? `.${ext}` : ".bin";
}

export function buildStructuredUploadPayload(
  datasetId: Extract<UploadDatasetKey, "production" | "customers" | "raw_material_inventory">,
  file: File,
  rowCount: number,
  columns: string[],
  validationStatus: Exclude<UploadValidationStatus, "missing" | "pending">,
  notes?: string | null,
) {
  return {
    dataset_id: datasetId,
    filename: file.name,
    format: getFileFormat(file),
    validation_status: validationStatus,
    row_count: rowCount,
    column_count: columns.length,
    columns_detected: columns,
    notes: notes ?? null,
  } as const;
}

export function parseForecastInputRows(rows: GenericRow[]) {
  const prepared = rows.map((row) => {
    const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);
    const normalized = Object.fromEntries(normalizedEntries);
    const item = {
      product_code: String(normalized["product code"] ?? normalized["product_code"] ?? "").trim(),
      last_30_days: toNumber(normalized["last 30 days"] ?? normalized["last_30_days"]),
      last_90_days: toNumber(normalized["last 90 days"] ?? normalized["last_90_days"]),
      last_180_days: toNumber(normalized["last 180 days"] ?? normalized["last_180_days"]),
      last_365_days: toNumber(normalized["last 365 days"] ?? normalized["last_365_days"]),
      monthly_history: parseMonthlyHistory(normalized["monthly history"] ?? normalized["monthly_history"]),
    };
    return item;
  });

  return prepared.filter((item) => {
    if (!item.product_code) {
      return false;
    }
    return Boolean(
      item.monthly_history?.length ||
        item.last_30_days ||
        item.last_90_days ||
        item.last_180_days ||
        item.last_365_days,
    );
  });
}

export function parseForecastResults(payload: { items?: unknown[] } | ForecastResult[]) {
  if (Array.isArray(payload)) {
    return payload as ForecastResult[];
  }
  return Array.isArray(payload.items) ? (payload.items as ForecastResult[]) : [];
}

export function summarizeDataset(dataset: UploadDataset | null) {
  if (!dataset) {
    return "Sem upload registrado.";
  }
  if (!dataset.uploaded) {
    return "Sem upload registrado.";
  }
  if (dataset.row_count > 0) {
    return `${dataset.row_count} registros na ultima carga.`;
  }
  if (dataset.document_count > 0) {
    return `${dataset.document_count} arquivo(s) documental(is) registrados.`;
  }
  return dataset.latest_message;
}



