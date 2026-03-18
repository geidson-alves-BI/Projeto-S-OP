from typing import List, Optional, Dict, Any, Literal

from pydantic import BaseModel, Field


class SLARequest(BaseModel):
    sla: float = Field(..., ge=0.5, le=0.999)
    mean: float = Field(..., ge=0)
    std: float = Field(..., ge=0)
    stock_on_hand: Optional[float] = Field(default=0, ge=0)


class SLAResponse(BaseModel):
    z: float
    protected_level: float
    suggested_buy: float


class ABCXYZRequest(BaseModel):
    rows: List[Dict[str, Any]]
    sku_col: str = "sku"
    qty_col: str = "volume"
    cost_col: str = "preco_custo"
    date_col: str = "data"


class ForecastRequest(BaseModel):
    rows: List[Dict[str, Any]]
    sku_col: str = "sku"
    qty_col: str = "volume"
    date_col: str = "data"
    horizon_months: int = Field(..., ge=1, le=24)
    growth: float = Field(default=0.0, ge=-0.5, le=2.0)


class StrategyReportRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(default_factory=list)
    file_format: Literal["xlsx", "csv", "pdf", "excel"] = "csv"
    product_code_col: str = "product_code"
    product_name_col: str = "product_name"
    sales_col: str = "sales"


class BOMUploadRequest(BaseModel):
    rows: List[Dict[str, Any]]
    product_code_col: str = "product_code"
    raw_material_code_col: str = "raw_material_code"
    raw_material_name_col: str = "raw_material_name"
    qty_per_unit_col: str = "qty_per_unit"
    unit_cost_col: str = "unit_cost"
    source_filename: Optional[str] = None


class MTSProductionSimulationItem(BaseModel):
    product_code: str
    forecast_demand: float = Field(..., ge=0)


class MTSProductionSimulationRequest(BaseModel):
    items: List[MTSProductionSimulationItem]
    enforce_mts_from_latest_report: bool = True


class DemandForecastItem(BaseModel):
    product_code: str
    last_30_days: float = Field(default=0, ge=0)
    last_90_days: float = Field(default=0, ge=0)
    last_180_days: float = Field(default=0, ge=0)
    last_365_days: float = Field(default=0, ge=0)
    monthly_history: Optional[List[float]] = None


class DemandForecastEngineRequest(BaseModel):
    items: List[DemandForecastItem]
    source_filename: Optional[str] = None


class RawMaterialForecastItem(BaseModel):
    product_code: str
    forecast_demand: Optional[float] = Field(default=None, ge=0)
    final_forecast: Optional[float] = Field(default=None, ge=0)


class RawMaterialForecastRequest(BaseModel):
    items: List[RawMaterialForecastItem]


UploadValidationStatus = Literal["valid", "partial", "invalid", "pending", "missing"]


class StructuredUploadRegistrationRequest(BaseModel):
    dataset_id: str
    filename: str
    format: str
    validation_status: UploadValidationStatus = "valid"
    row_count: int = Field(default=0, ge=0)
    column_count: int = Field(default=0, ge=0)
    columns_detected: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class AIEvidence(BaseModel):
    path: str
    value: Any


class AIRisk(BaseModel):
    title: str
    severity: Literal["low", "medium", "high"]
    evidence: List[AIEvidence]


class AIAction(BaseModel):
    title: str
    horizon: Literal["0-7d", "7-30d", "30-90d"]
    impact: Literal["low", "medium", "high"]
    evidence: List[AIEvidence]


class AIOpportunity(BaseModel):
    title: str
    impact: Literal["low", "medium", "high"]
    evidence: List[AIEvidence]


AIProvider = Literal["openai", "deterministic"]
AIConnectionStatus = Literal[
    "success",
    "invalid_key",
    "model_not_found",
    "network_error",
    "provider_not_configured",
    "fallback_only",
    "openai_error",
]
AIPersona = Literal["SUPPLY", "CFO", "CEO", "COO"]


class AIInterpretRequest(BaseModel):
    persona: AIPersona
    context_pack: Optional[Dict[str, Any]] = None
    language: str = "pt-BR"


class AIInterpretResponse(BaseModel):
    persona: AIPersona
    executive_summary: List[str]
    risks: List[AIRisk]
    opportunities: List[AIOpportunity]
    actions: List[AIAction]
    limitations: List[str]
    analysisScope: str
    inputsAvailable: List[str]
    inputsMissing: List[str]
    appImprovementTitle: str
    appImprovementSuggestions: List[str]
    questions_to_validate: List[str]
    data_quality_flags: List[str]
    disclaimer: str
    providerUsed: AIProvider
    modelUsed: str
    usedFallback: bool
    reasonFallback: Optional[str] = None


class AIConfigRequest(BaseModel):
    provider: AIProvider
    model: str = "gpt-4o-mini"
    apiKey: Optional[str] = None
    keepExistingKey: bool = True


class AIConfigResponse(BaseModel):
    provider: AIProvider
    providerActive: AIProvider
    model: str
    modelActive: str
    hasApiKey: bool
    apiKeyMasked: Optional[str] = None
    usingEnvironmentKey: bool = False
    connectionStatus: Optional[AIConnectionStatus] = None
    lastTestedAt: Optional[str] = None
    lastTestMessage: Optional[str] = None


class AITestConnectionResponse(BaseModel):
    success: bool
    status: AIConnectionStatus
    message: str
    providerActive: AIProvider
    modelActive: str
    lastTestedAt: Optional[str] = None


class RunSOPPipelineRequest(BaseModel):
    forecast_inputs: Optional[List[Dict[str, Any]]] = None
    file_format: Literal["none", "csv", "excel"] = "none"
    simulate_mts: bool = True


class RunSOPPipelineResponse(BaseModel):
    context_pack_2_0: Dict[str, Any]
    execution_summary: Dict[str, Any]


ForecastMethodName = Literal[
    "auto",
    "moving_average",
    "weighted_moving_average",
    "simple_exponential_smoothing",
    "holt_trend",
    "holt_winters_additive",
    "holt_winters_multiplicative",
    "historical_baseline_growth",
]


class PlanningFiltersRequest(BaseModel):
    product_codes: List[str] = Field(default_factory=list)
    customer_codes: List[str] = Field(default_factory=list)
    product_groups: List[str] = Field(default_factory=list)
    abc_classes: List[str] = Field(default_factory=list)
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class PlanningGrowthRequest(BaseModel):
    global_pct: float = Field(default=0.0, ge=-95.0, le=500.0)
    by_product: Dict[str, float] = Field(default_factory=dict)
    by_customer: Dict[str, float] = Field(default_factory=dict)
    by_group: Dict[str, float] = Field(default_factory=dict)
    by_class: Dict[str, float] = Field(default_factory=dict)


class PlanningMtsMtuRequest(BaseModel):
    mts_coverage_days: int = Field(default=45, ge=1, le=365)
    mtu_coverage_days: int = Field(default=20, ge=1, le=365)
    excess_multiplier: float = Field(default=1.35, ge=1.0, le=5.0)


class PlanningProductionRunRequest(BaseModel):
    scenario_name: str = "Cenario principal"
    method: ForecastMethodName = "auto"
    horizon_months: int = Field(default=6, ge=1, le=24)
    seasonal_periods: int = Field(default=12, ge=2, le=24)
    filters: PlanningFiltersRequest = Field(default_factory=PlanningFiltersRequest)
    growth: PlanningGrowthRequest = Field(default_factory=PlanningGrowthRequest)
    mts_mtu: PlanningMtsMtuRequest = Field(default_factory=PlanningMtsMtuRequest)


class PlanningProductionExportRequest(BaseModel):
    request: PlanningProductionRunRequest
    use_latest_if_available: bool = False


class ExecutiveChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ExecutiveChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[ExecutiveChatHistoryItem] = Field(default_factory=list)
    include_planning_context: bool = True
    mode: Literal["short", "detailed"] = "short"


class ExecutiveChatResponse(BaseModel):
    answer: str
    response_mode: Literal["short", "detailed"] = "short"
    blocks: Dict[str, Any] = Field(default_factory=dict)
    confidence: Literal["high", "medium", "low"]
    confidence_explainer: Dict[str, Any] = Field(default_factory=dict)
    partial: bool
    limitations: List[str]
    missing_data: List[str]
    data_points: List[Dict[str, Any]]
    suggestions: List[str]
    context_used: Dict[str, Any]
    context_summary: Dict[str, Any] = Field(default_factory=dict)
    execution_meta: Dict[str, Any] = Field(default_factory=dict)
    generated_at: str


class ExecutiveChatContextResponse(BaseModel):
    generated_at: str
    context_summary: Dict[str, Any]
    suggestions: List[str]
