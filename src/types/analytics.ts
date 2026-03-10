export type ForecastResult = {
  product_code: string;
  moving_average?: number;
  moving_average_forecast?: number;
  seasonal_forecast?: number;
  trend_forecast?: number;
  final_forecast?: number;
  [key: string]: unknown;
};

export type SimulationResult = {
  product_code: string;
  production_qty: number;
  raw_material_code: string;
  raw_material_required: number;
  raw_material_cost?: number;
  total_production_cost: number;
  [key: string]: unknown;
};

export type ContextPack = {
  top_products?: unknown[];
  mts_products?: unknown[];
  mto_products?: unknown[];
  mts_count?: number;
  mto_count?: number;
  forecast_summary?: Record<string, unknown>;
  raw_material_impact?: Record<string, unknown>;
  financial_impact?: Record<string, unknown>;
  data_quality?: {
    flags?: string[];
    status?: string;
    [key: string]: unknown;
  };
  generated_at?: string;
  inputs_available?: {
    strategy_report?: boolean;
    forecast?: boolean;
    bom?: boolean;
    mts_simulation?: boolean;
    raw_material_forecast?: boolean;
    [key: string]: boolean | undefined;
  };
  [key: string]: unknown;
};

export type AIPersona = "SUPPLY" | "CFO" | "CEO" | "COO";
export type AIIntegrationProvider = "openai" | "deterministic";
export type AIConnectionStatus =
  | "success"
  | "invalid_key"
  | "model_not_found"
  | "network_error"
  | "provider_not_configured"
  | "fallback_only"
  | "openai_error";

export type AIEvidence = {
  path: string;
  value: unknown;
};

export type AIRisk = {
  title: string;
  severity: "low" | "medium" | "high";
  evidence: AIEvidence[];
};

export type AIAction = {
  title: string;
  horizon: "0-7d" | "7-30d" | "30-90d";
  impact: "low" | "medium" | "high";
  evidence: AIEvidence[];
};

export type AIOpportunity = {
  title: string;
  impact: "low" | "medium" | "high";
  evidence: AIEvidence[];
};

export type AIInterpretRequest = {
  persona: AIPersona;
  context_pack?: ContextPack;
  language?: string;
};

export type AIInterpretResponse = {
  persona: AIPersona;
  executive_summary: string[];
  risks: AIRisk[];
  opportunities: AIOpportunity[];
  actions: AIAction[];
  limitations: string[];
  analysisScope: string;
  inputsAvailable: string[];
  inputsMissing: string[];
  appImprovementTitle: string;
  appImprovementSuggestions: string[];
  questions_to_validate: string[];
  data_quality_flags: string[];
  disclaimer: string;
  providerUsed: AIIntegrationProvider;
  modelUsed: string;
  usedFallback: boolean;
  reasonFallback: string | null;
};

export type AIIntegrationConfigRequest = {
  provider: AIIntegrationProvider;
  model: string;
  apiKey?: string | null;
  keepExistingKey?: boolean;
};

export type AIIntegrationConfigResponse = {
  provider: AIIntegrationProvider;
  providerActive: AIIntegrationProvider;
  model: string;
  modelActive: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  usingEnvironmentKey: boolean;
  connectionStatus: AIConnectionStatus | null;
  lastTestedAt: string | null;
  lastTestMessage: string | null;
};

export type AITestConnectionResponse = {
  success: boolean;
  status: AIConnectionStatus;
  message: string;
  providerActive: AIIntegrationProvider;
  modelActive: string;
  lastTestedAt: string | null;
};

export type AnalyticsDataStatus = {
  strategyReport: {
    loaded: boolean;
    rowCount: number;
    updatedAt: string | null;
  };
  forecast: {
    loaded: boolean;
    rowCount: number;
    updatedAt: string | null;
  };
  mtsSimulation: {
    loaded: boolean;
    rowCount: number;
    updatedAt: string | null;
  };
  rawMaterialForecast: {
    loaded: boolean;
    rowCount: number;
    updatedAt: string | null;
  };
  bom: {
    loaded: boolean;
    rowsCount: number;
    productsCount: number;
    updatedAt: string | null;
  };
};

export type UploadValidationStatus = "valid" | "partial" | "invalid" | "pending" | "missing";
export type UploadReadinessStatus = "ready" | "partial" | "unavailable";
export type UploadDatasetKey =
  | "production"
  | "sales_orders"
  | "clients"
  | "forecast_input"
  | "bom"
  | "raw_material_inventory"
  | "finance_spreadsheets"
  | "finance_documents";

export type UploadReadinessKey =
  | "overall"
  | "forecast"
  | "mts_mto"
  | "raw_material"
  | "finance"
  | "executive_ai";

export type UploadDataset = {
  id: UploadDatasetKey;
  name: string;
  category: string;
  storage_kind: "structured" | "document";
  objective: string;
  accepted_formats: string[];
  required_columns: string[];
  optional_columns: string[];
  expected_columns: string[];
  readiness_impact: string[];
  uploaded: boolean;
  available: boolean;
  validation_status: UploadValidationStatus;
  uploaded_at: string | null;
  filename: string | null;
  format: string | null;
  row_count: number;
  column_count: number;
  columns_detected: string[];
  latest_message: string;
  history_count: number;
  document_count: number;
  storage_path: string | null;
  last_upload_status: string;
};

export type UploadHistoryItem = {
  dataset_id: UploadDatasetKey;
  dataset_name: string;
  category: string;
  storage_kind: "structured" | "document";
  filename: string;
  uploaded_at: string;
  format: string;
  validation_status: UploadValidationStatus;
  readiness_impact: string[];
  impact_summary: string;
  row_count: number;
  column_count: number;
  notes: string;
};

export type UploadReadinessItem = {
  key: UploadReadinessKey;
  label: string;
  status: UploadReadinessStatus;
  summary: string;
  datasets: UploadDatasetKey[];
  missing_datasets: string[];
};

export type UploadCenterStatus = {
  coverage_percent: number;
  available_dataset_count: number;
  total_dataset_count: number;
  datasets: UploadDataset[];
  readiness: Record<UploadReadinessKey, UploadReadinessItem>;
  history: UploadHistoryItem[];
};

export type StructuredUploadRegistrationRequest = {
  dataset_id: Exclude<UploadDatasetKey, "forecast_input" | "bom" | "finance_spreadsheets" | "finance_documents" | "sales_orders">;
  filename: string;
  format: string;
  validation_status: Exclude<UploadValidationStatus, "missing">;
  row_count?: number;
  column_count?: number;
  columns_detected?: string[];
  notes?: string | null;
};

export type RunSOPPipelineRequest = {
  forecast_inputs?: Record<string, unknown>[];
  file_format?: "none" | "csv" | "excel";
  simulate_mts?: boolean;
};

export type RunSOPPipelineResponse = {
  context_pack_2_0: ContextPack;
  execution_summary: {
    executed_steps: string[];
    skipped_steps: string[];
    simulate_mts: boolean;
    file_format: "none" | "csv" | "excel";
    [key: string]: unknown;
  };
};
