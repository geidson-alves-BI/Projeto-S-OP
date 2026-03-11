import type {
  AIIntegrationConfigRequest,
  AIIntegrationConfigResponse,
  AnalyticsDataStatus,
  AIInterpretRequest,
  AIInterpretResponse,
  AITestConnectionResponse,
  ContextPack,
  ExecutiveChatRequest,
  ExecutiveChatContextResponse,
  ExecutiveChatResponse,
  DatasetContract,
  DatasetContractRegistry,
  DatasetCompatibilitySummary,
  ExecutiveContext,
  PlanningProductionExportRequest,
  PlanningProductionLatestResponse,
  PlanningProductionResult,
  PlanningProductionRunRequest,
  Readiness,
  RunSOPPipelineRequest,
  RunSOPPipelineResponse,
  StructuredUploadRegistrationRequest,
  UploadDatasetAliasKey,
  UploadCenterStatus,
  UploadValidationReport,
} from "@/types/analytics";

const rawBaseUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";
export const BASE_URL = rawBaseUrl.replace(/\/+$/, "");
export const API_URL = BASE_URL;

function buildUrl(endpoint: string) {
  if (!endpoint.startsWith("/")) {
    return `${BASE_URL}/${endpoint}`;
  }

  return `${BASE_URL}${endpoint}`;
}

async function parseError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function extractFileName(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]).trim();
  }

  const basicMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  if (basicMatch?.[1]) {
    return basicMatch[1].trim();
  }

  return fallback;
}

export async function getJSON<T = unknown>(endpoint: string): Promise<T> {
  const res = await fetch(buildUrl(endpoint));

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json() as Promise<T>;
}

export async function postJSON<T = unknown>(endpoint: string, payload: unknown): Promise<T> {
  const res = await fetch(buildUrl(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json() as Promise<T>;
}

export async function postMultipart<T = unknown>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(buildUrl(endpoint), {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json() as Promise<T>;
}

export async function downloadFileFromPost(
  endpoint: string,
  payload: unknown,
  filenameFallback: string,
): Promise<string> {
  const res = await fetch(buildUrl(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const blob = await res.blob();
  const fileName = extractFileName(res.headers.get("content-disposition"), filenameFallback);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return fileName;
}

export async function postBlob(endpoint: string, body: unknown) {
  const res = await fetch(buildUrl(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res;
}

export const get = getJSON;
export const post = postJSON;
export const postForm = postMultipart;

export async function health() {
  return getJSON<{ status: string }>("/health");
}

export async function computeSlaMP(payload: {
  sla: number;
  mean: number;
  std: number;
  stock_on_hand?: number;
}) {
  return postJSON<{
    z: number;
    protected_level: number;
    suggested_buy: number;
  }>("/sla/mp", payload);
}

export async function computeABCXYZ(payload: {
  rows: unknown[];
  sku_col?: string;
  qty_col?: string;
  cost_col?: string;
  date_col?: string;
}) {
  return postJSON<{ items: unknown[] }>("/compute/abcxyz", payload);
}

export async function computeForecast(payload: {
  rows: unknown[];
  sku_col?: string;
  qty_col?: string;
  date_col?: string;
  horizon_months: number;
  growth?: number;
}) {
  return postJSON<{ items: unknown[] }>("/compute/forecast", payload);
}

export async function getContextPack() {
  return getJSON<ContextPack>("/analytics/context_pack");
}

export async function getAnalyticsDataStatus() {
  return getJSON<AnalyticsDataStatus>("/analytics/data_status");
}

export async function getUploadCenter() {
  return getJSON<UploadCenterStatus>("/analytics/upload_center");
}


export async function getReadiness() {
  return getJSON<Readiness>("/analytics/readiness");
}

export async function getExecutiveContext() {
  return getJSON<ExecutiveContext>("/analytics/executive_context");
}

export async function getDatasetContracts() {
  return getJSON<DatasetContractRegistry>("/analytics/dataset_contracts");
}

export async function getDatasetContract(datasetId: UploadDatasetAliasKey) {
  return getJSON<DatasetContract>(`/analytics/dataset_contracts/${datasetId}`);
}

export async function getDatasetValidation(datasetId: UploadDatasetAliasKey) {
  return getJSON<{
    dataset_id: string;
    dataset_name: string;
    last_validation: UploadValidationReport | null;
    compatibility_summary: DatasetCompatibilitySummary | null;
    uploaded: boolean;
    uploaded_at: string | null;
    filename: string | null;
    format: string | null;
  }>(`/analytics/dataset_validation/${datasetId}`);
}

export async function getDatasetCompatibility() {
  return getJSON<UploadCenterStatus["compatibility_summary"]>("/analytics/dataset_compatibility");
}

export async function getForecastResults() {
  return getJSON<{ items: unknown[]; rowCount: number }>("/analytics/forecast_results");
}

export async function registerStructuredUpload(payload: StructuredUploadRegistrationRequest) {
  return postJSON<UploadCenterStatus>("/analytics/register_structured_upload", payload);
}

export async function uploadDatasetFile(datasetId: UploadDatasetAliasKey, file: File) {
  const formData = new FormData();
  formData.append("dataset_id", datasetId);
  formData.append("file", file);
  return postMultipart<{
    dataset: unknown;
    validation: UploadValidationReport;
    compatibility: DatasetCompatibilitySummary;
    storagePath: string;
  }>("/analytics/upload_dataset_file", formData);
}

export async function interpretAI(payload: AIInterpretRequest) {
  return postJSON<AIInterpretResponse>("/ai/interpret", payload);
}

export async function getAIConfig() {
  return getJSON<AIIntegrationConfigResponse>("/ai/config");
}

export async function saveAIConfig(payload: AIIntegrationConfigRequest) {
  return postJSON<AIIntegrationConfigResponse>("/ai/config", payload);
}

export async function testAIConnection() {
  return postJSON<AITestConnectionResponse>("/ai/test_connection", {});
}

export async function runSOPPipeline(payload: RunSOPPipelineRequest) {
  return postJSON<RunSOPPipelineResponse>("/analytics/run_sop_pipeline", payload);
}

export async function runPlanningProduction(payload: PlanningProductionRunRequest) {
  return postJSON<PlanningProductionResult>("/analytics/planning_production/run", payload);
}

export async function getLatestPlanningProduction() {
  return getJSON<PlanningProductionLatestResponse>("/analytics/planning_production/latest");
}

export async function exportPlanningProductionCSV(payload: PlanningProductionExportRequest) {
  return downloadFileFromPost(
    "/analytics/planning_production/export/csv",
    payload,
    "planning_production.csv",
  );
}

export async function exportPlanningProductionPDF(payload: PlanningProductionExportRequest) {
  return downloadFileFromPost(
    "/analytics/planning_production/export/pdf",
    payload,
    "planning_production.pdf",
  );
}

export async function sendExecutiveChat(payload: ExecutiveChatRequest) {
  return postJSON<ExecutiveChatResponse>("/ai/executive_chat", payload);
}

export async function getExecutiveChatContext(includePlanningContext = true) {
  const query = includePlanningContext ? "true" : "false";
  return getJSON<ExecutiveChatContextResponse>(
    `/ai/executive_chat_context?include_planning_context=${query}`,
  );
}
