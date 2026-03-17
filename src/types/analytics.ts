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

export type FinanceDocumentsSummary = {
  has_structured_rows: boolean;
  row_count: number;
  column_count: number;
  numeric_columns: string[];
  kpis: Record<string, number>;
  kpi_sources: Record<string, string>;
  notes: string[];
  uploaded: boolean;
  availability_status: UploadReadinessStatus;
  uploaded_at: string | null;
  filename: string | null;
  document_count: number;
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
  planning_production?: Record<string, unknown>;
  data_quality?: {
    flags?: string[];
    status?: string;
    [key: string]: unknown;
  };
  generated_at?: string;
  inputs_available?: {
    strategy_report?: boolean;
    forecast?: boolean;
    planning_production?: boolean;
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
  planningProduction: {
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
export type UploadCompatibilityStatus = "compatible" | "partial" | "incompatible";
export type DatasetCriticality = "critical" | "high" | "medium" | "low";
export type DatasetColumnType = "string" | "integer" | "number" | "date" | "boolean" | "array<number>";
export type UploadDatasetKey =
  | "production"
  | "sales_orders"
  | "customers"
  | "forecast_input"
  | "bom"
  | "raw_material_inventory"
  | "finance_documents";
export type UploadDatasetAliasKey = UploadDatasetKey | "clients";

export type UploadReadinessKey =
  | "overall"
  | "planning_production"
  | "forecast"
  | "mts_mto"
  | "raw_material"
  | "finance"
  | "executive_ai";

export type DatasetContract = {
  id: UploadDatasetKey;
  dataset_id: UploadDatasetKey;
  legacy_ids: string[];
  name: string;
  friendly_name: string;
  category: string;
  storage_kind: "structured" | "document";
  objective: string;
  executive_description: string;
  accepted_formats: string[];
  required_columns: string[];
  optional_columns: string[];
  expected_columns: string[];
  column_labels: Record<string, string>;
  column_aliases: Record<string, string[]>;
  expected_types: Record<string, DatasetColumnType>;
  validation_rules: Array<{
    id: string;
    type: string;
    severity: string;
    description: string;
    value?: number;
    columns?: string[];
  }>;
  readiness_impact: string[];
  criticality: DatasetCriticality;
  usage_examples: string[];
  contract_registry_version: string;
};

export type UploadDataset = DatasetContract & {
  uploaded: boolean;
  available: boolean;
  validation_status: UploadValidationStatus;
  availability_status: UploadReadinessStatus;
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
  last_validation: UploadValidationReport | null;
  compatibility_summary: DatasetCompatibilitySummary;
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
  availability_status: UploadReadinessStatus;
  readiness_impact: string[];
  impact_summary: string;
  row_count: number;
  column_count: number;
  compatibility_score: number;
  confidence_score: number;
  missing_required_columns: string[];
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
  readiness: Readiness;
  history: UploadHistoryItem[];
  compatibility_summary: UploadCompatibilityOverview;
  contract_registry: DatasetContractRegistry;
};

export type AppDataSnapshotDataset = {
  dataset_id: UploadDatasetKey;
  uploaded: boolean;
  available: boolean;
  availability_status: UploadReadinessStatus;
  validation_status: UploadValidationStatus;
  uploaded_at: string | null;
  filename: string | null;
  row_count: number;
  rows: Record<string, unknown>[];
};

export type AppDataSnapshot = {
  datasets: Partial<Record<UploadDatasetKey, AppDataSnapshotDataset>>;
  readiness: Readiness;
  bom_status: {
    loaded: boolean;
    products_count: number;
    rows_count: number;
    updated_at: string | null;
  };
};

export type AbcXyzAnalysisStatus = "ready" | "partial" | "unavailable";

export type AbcXyzAnalysisProduct = {
  sku: string;
  sku_label: string;
  descricao: string;
  month_values: Record<string, number>;
  volume_anual: number;
  media_mensal: number;
  desvio_padrao: number;
  cv: number;
  percentual_acumulado: number;
  classe_abc: "A" | "B" | "C";
  classe_xyz: "X" | "Y" | "Z";
  classe_combinada: string;
  tendencia_percentual: number | null;
  tendencia: string;
  consumo_diario: number;
  dias_alvo: number;
  estrategia: string;
  prioridade: number;
  top1_cliente: string;
  top1_share: number;
  hhi_cliente: number;
  meses_ativos: number;
};

export type AbcXyzAnalysisResponse = {
  status: AbcXyzAnalysisStatus;
  generated_at: string;
  base_utilizada: string[];
  abrangencia_analise: {
    escopo: string;
    periodo_inicial: string | null;
    periodo_final: string | null;
    meses_considerados: number;
    total_skus: number;
    linhas_producao: number;
  };
  confiabilidade: {
    nivel: "alta" | "media" | "baixa";
    score: number;
    justificativas: string[];
  };
  limitacoes: string[];
  criterio_classificacao: {
    abc: string;
    xyz: string;
    combinada: string;
  };
  indicadores_resumidos: {
    total_skus: number;
    volume_total: number;
    classes_abc: Record<"A" | "B" | "C", number>;
    classes_xyz: Record<"X" | "Y" | "Z", number>;
    matriz_abc_xyz: Record<string, number>;
    concentracao_top10_percent: number;
    participacao_z_percent: number;
    priorizacao_executiva: string[];
  };
  clientes_disponiveis: string[];
  produtos: AbcXyzAnalysisProduct[];
};

export type StructuredUploadRegistrationRequest = {
  dataset_id: Extract<UploadDatasetAliasKey, "production" | "customers" | "clients" | "raw_material_inventory">;
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

export type ForecastMethodName =
  | "auto"
  | "moving_average"
  | "weighted_moving_average"
  | "simple_exponential_smoothing"
  | "holt_trend"
  | "holt_winters_additive"
  | "holt_winters_multiplicative"
  | "historical_baseline_growth";

export type PlanningFilters = {
  product_codes?: string[];
  customer_codes?: string[];
  product_groups?: string[];
  abc_classes?: string[];
  start_date?: string | null;
  end_date?: string | null;
};

export type PlanningGrowth = {
  global_pct?: number;
  by_product?: Record<string, number>;
  by_customer?: Record<string, number>;
  by_group?: Record<string, number>;
  by_class?: Record<string, number>;
};

export type PlanningMtsMtuConfig = {
  mts_coverage_days?: number;
  mtu_coverage_days?: number;
  excess_multiplier?: number;
};

export type PlanningProductionRunRequest = {
  scenario_name?: string;
  method?: ForecastMethodName;
  horizon_months?: number;
  seasonal_periods?: number;
  filters?: PlanningFilters;
  growth?: PlanningGrowth;
  mts_mtu?: PlanningMtsMtuConfig;
};

export type PlanningMethodMetric = {
  mae: number | null;
  mape: number | null;
  rmse: number | null;
  bias: number | null;
  support: number;
  products_evaluated: number;
};

export type PlanningSummaryRow = {
  [key: string]: unknown;
};

export type PlanningForecastConfidence = {
  score: number;
  percent: number;
  label: string;
};

export type PlanningForecastVisual = {
  historical_monthly: Array<{
    period: string;
    historical_quantity: number;
    historical_value: number;
  }>;
  forecast_monthly: Array<{
    period: string;
    forecast_base: number;
    forecast_adjusted: number;
  }>;
  by_dimension: Record<
    "product" | "customer" | "group" | "class",
    Array<{
      entity: string;
      historical_quantity: number;
      forecast_base: number;
      forecast_adjusted: number;
      growth_impact_pct: number;
      estimated_revenue: number;
      forecast_confidence: number;
    }>
  >;
};

export type PlanningRiskLevelThreshold = {
  key: string;
  label: string;
  min: number;
  max: number;
  color_token: string;
};

export type PlanningRiskHeatmapCell = {
  score: number;
  level_key: string;
  level_label: string;
  primary_driver_key: string;
  primary_driver_label: string;
  components: Record<string, number>;
  contributions: Record<string, number>;
  metrics: Record<string, unknown>;
  limitations: string[];
  [key: string]: unknown;
};

export type PlanningRiskHeatmap = {
  name: string;
  row_key: string;
  column_key: string;
  row_label: string;
  column_label: string;
  weights: Record<string, number>;
  rows: string[];
  columns: string[];
  cells: PlanningRiskHeatmapCell[];
};

export type PlanningRiskScoring = {
  generated_at: string;
  score_scale: {
    min: number;
    max: number;
  };
  level_thresholds: PlanningRiskLevelThreshold[];
  component_labels: Record<string, string>;
  weights: Record<string, Record<string, number>>;
  operational_heatmap: PlanningRiskHeatmap;
  commercial_heatmap: PlanningRiskHeatmap;
  integrated_heatmap: PlanningRiskHeatmap;
  top_risks: Array<{
    heatmap_type: string;
    group?: string | null;
    abc_class?: string | null;
    customer?: string | null;
    product?: string | null;
    growth_impact_pct: number;
    forecast: number;
    score: number;
    risk_level_key: string;
    risk_level_label: string;
    primary_driver_key: string;
    primary_driver_label: string;
  }>;
  data_limitations: string[];
};

export type PlanningProductionResult = {
  generated_at: string;
  scenario_name: string;
  method_selection_mode: "auto" | "manual";
  selected_method: ForecastMethodName;
  recommended_method: ForecastMethodName;
  available_methods: ForecastMethodName[];
  method_metrics: Record<string, PlanningMethodMetric>;
  forecast_confidence?: PlanningForecastConfidence;
  totals: {
    base_forecast: number;
    final_forecast: number;
    growth_impact_pct: number;
    historical_quantity?: number;
    historical_value?: number;
    estimated_revenue?: number;
    projected_purchase_need_qty?: number;
    projected_purchase_value_usd?: number;
    materials_with_purchase_need?: number;
  };
  filters_applied: Record<string, unknown>;
  growth_parameters: Record<string, unknown>;
  dimension_availability: {
    product_group_available: boolean;
    abc_class_available: boolean;
    abc_class_source: string;
  };
  forecast_visual?: PlanningForecastVisual;
  summary_by_product: PlanningSummaryRow[];
  summary_by_customer: PlanningSummaryRow[];
  summary_by_group: PlanningSummaryRow[];
  summary_by_class: PlanningSummaryRow[];
  summary_by_group_customer?: PlanningSummaryRow[];
  summary_by_group_class?: PlanningSummaryRow[];
  mts_mtu_scenarios: PlanningSummaryRow[];
  risk_scoring?: PlanningRiskScoring;
  risk_alerts: {
    rupture_risk_count: number;
    excess_risk_count: number;
    missing_stock_count: number;
    purchase_need_count?: number;
    total_products_evaluated: number;
  };
  data_warnings: string[];
};

export type PlanningProductionExportRequest = {
  request: PlanningProductionRunRequest;
  use_latest_if_available?: boolean;
};

export type PlanningProductionLatestResponse = {
  generated_at: string | null;
  available: boolean;
  data: PlanningProductionResult | null;
};

export type ExecutiveChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type ExecutiveChatRequest = {
  message: string;
  history?: ExecutiveChatHistoryItem[];
  include_planning_context?: boolean;
  mode?: "short" | "detailed";
};

export type ExecutiveChatResponse = {
  answer: string;
  response_mode: "short" | "detailed";
  blocks: {
    direct_answer?: string;
    evidence?: string[];
    risks_limitations?: string[];
    executive_recommendation?: string[];
    [key: string]: unknown;
  };
  confidence: "high" | "medium" | "low";
  partial: boolean;
  limitations: string[];
  missing_data: string[];
  data_points: Array<{ label: string; value: unknown }>;
  suggestions: string[];
  context_used: Record<string, unknown>;
  context_summary: Record<string, unknown>;
  execution_meta?: Record<string, unknown>;
  generated_at: string;
};

export type ExecutiveChatContextResponse = {
  generated_at: string;
  context_summary: Record<string, unknown>;
  suggestions: string[];
};

export type UploadRuleResult = {
  rule_id: string;
  description: string;
  severity: string;
  type: string;
  passed: boolean;
  missing_columns: string[];
};

export type UploadValidationReport = {
  dataset_id: UploadDatasetKey;
  dataset_name: string;
  validation_status: UploadValidationStatus;
  availability_status: UploadReadinessStatus;
  compatibility_status: UploadCompatibilityStatus;
  compatibility_score: number;
  confidence_score: number;
  row_count: number;
  column_count: number;
  source_columns: string[];
  recognized_columns: string[];
  missing_required_columns: string[];
  ignored_columns: string[];
  alias_mapped_columns: Array<{
    source_column: string;
    canonical_column: string;
    column_label: string;
  }>;
  required_coverage: {
    matched: number;
    total: number;
    percent: number;
  };
  optional_coverage: {
    matched: number;
    total: number;
    percent: number;
  };
  analytical_impact: {
    modules: string[];
    summary: string;
  };
  quality_gaps: string[];
  rule_results: UploadRuleResult[];
  summary: string;
  source_format: string;
  source_filename: string | null;
  validated_at: string | null;
  source_to_canonical: Record<string, string>;
};

export type DatasetCompatibilitySummary = {
  dataset_id: UploadDatasetKey;
  validation_status: UploadValidationStatus;
  availability_status: UploadReadinessStatus;
  compatibility_status: UploadCompatibilityStatus;
  compatibility_score: number;
  confidence_score: number;
  missing_required_columns: string[];
  quality_gaps: string[];
  summary: string;
};

export type UploadCompatibilityOverview = {
  average_confidence_score: number;
  average_compatibility_score: number;
  ready_datasets: number;
  partial_datasets: number;
  unavailable_datasets: number;
  missing_datasets: string[];
  largest_gaps: string[];
  datasets: Record<UploadDatasetKey, DatasetCompatibilitySummary>;
  ai_readiness: {
    coverage_percent: number;
    confidence_score: number;
    quality_gaps: string[];
    missing_datasets: string[];
  };
};

export type DatasetContractRegistry = {
  version: string;
  aliases: Record<string, UploadDatasetKey>;
  datasets: DatasetContract[];
};

export type ReadinessModule = {
  key: string;
  label: string;
  status: "available" | "partial" | "unavailable";
  confidence: "high" | "medium" | "low";
  datasets: string[];
  missing_datasets: string[];
  description: string;
};

export type Readiness = {
  overall_status: "available" | "partial" | "unavailable";
  overall_confidence: "high" | "medium" | "low";
  modules: ReadinessModule[];
};

export type ExecutiveContext = {
  loaded_datasets: string[];
  missing_datasets: string[];
  status_by_module: Record<string, "available" | "partial" | "unavailable">;
  quality_score_by_dataset: Record<string, number>;
  readiness_score_by_module: Record<string, number>;
  key_gaps: string[];
  executive_impact_of_gaps: string[];
  dre_available: boolean;
  limitations_for_future_analysis: string[];
};

export type AnalyticsV2Status = "ready" | "partial" | "unavailable";
export type AnalyticsV2Confidence = "high" | "medium" | "low";
export type AnalyticsV2DecisionGrade = "A" | "B" | "C" | "D";
export type AnalyticsV2EstimateType = "documented" | "estimated" | "hybrid";

export type AnalyticsV2DatasetAvailability = {
  dataset_id: string;
  status: AnalyticsV2Status;
  row_count: number;
};

export type AnalyticsV2DatasetQuality = {
  status: AnalyticsV2Status;
  validation_status: string;
  quality_score: number;
  compatibility_score: number;
  row_count: number;
  uploaded: boolean;
  missing_required_columns: string[];
};

export type AnalyticsV2Snapshot = {
  datasets_disponiveis: AnalyticsV2DatasetAvailability[];
  qualidade_por_dataset: Record<string, AnalyticsV2DatasetQuality>;
  metricas_calculaveis: Array<{
    metric_id: string;
    status: AnalyticsV2Status;
    confianca: AnalyticsV2Confidence;
    decision_grade: AnalyticsV2DecisionGrade;
  }>;
  metricas_bloqueadas: Array<{
    metric_id: string;
    status: AnalyticsV2Status;
    blocked_reason: string | null;
    missing_data: string[];
  }>;
  readiness_v2: {
    metrics_ready: number;
    metrics_partial: number;
    metrics_unavailable: number;
    coverage_percent: number;
    overall_status: AnalyticsV2Status;
  };
  resumo_executivo: string[];
  engine_version: string;
};

export type AnalyticsV2MetricContract = {
  metric_id: string;
  display_name: string;
  value: unknown;
  formatted_value: string;
  base_usada: string[];
  escopo: string;
  confianca: AnalyticsV2Confidence;
  decision_grade: AnalyticsV2DecisionGrade;
  missing_data: string[];
  status: AnalyticsV2Status;
  observacoes: string[];
  limitations: string[];
  calculation_method: string;
  estimate_type: AnalyticsV2EstimateType;
  reference_date: string;
  engine_version: string;
  metric_definition_version: string;
  blocked_reason: string | null;
};

export type AnalyticsV2MetricsComputeRequest = {
  metric_ids?: string[];
  escopo?: string;
  filtros?: Record<string, unknown>;
  cenario?: string;
};

export type AnalyticsV2MetricsComputeResponse = {
  metrics: AnalyticsV2MetricContract[];
  metricas_calculaveis: AnalyticsV2MetricContract[];
  metricas_bloqueadas: AnalyticsV2MetricContract[];
  engine_version: string;
  metric_registry_version: string;
};

export type AnalyticsV2FinancialScenario = {
  scenario_id: "base" | "conservador" | "agressivo" | string;
  display_name: string;
  assumptions: Record<string, unknown>;
  revenue: AnalyticsV2MetricContract;
  cogs: AnalyticsV2MetricContract & {
    components?: {
      material_cost: number;
      conversion_cost: number;
      estimated_cogs: number;
      material_cost_source?: string;
      conversion_cost_source?: string;
      estimated_cogs_source?: string;
    };
  };
  contribution_margin: AnalyticsV2MetricContract;
  contribution_margin_pct: AnalyticsV2MetricContract;
  fg_working_capital: AnalyticsV2MetricContract;
  rm_working_capital: AnalyticsV2MetricContract;
  total_working_capital: AnalyticsV2MetricContract;
  mts_incremental_investment: AnalyticsV2MetricContract;
  inventory_carrying_cost: AnalyticsV2MetricContract;
  delta_vs_base: {
    scenario_delta_financial: AnalyticsV2MetricContract;
    breakdown: Record<string, number>;
  };
  confianca: AnalyticsV2Confidence;
  decision_grade: AnalyticsV2DecisionGrade;
  status: AnalyticsV2Status;
  missing_data: string[];
  limitations: string[];
  calculation_method: string;
  base_usada: string[];
  engine_version: string;
};

export type AnalyticsV2FinancialScenariosResponse = {
  base_scenario: string;
  escopo: string;
  scenarios: AnalyticsV2FinancialScenario[];
  metricas_financeiras_suportadas: string[];
  engine_version: string;
  generated_at: string;
};
