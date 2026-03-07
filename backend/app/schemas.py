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
    rows: List[Dict[str, Any]]
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


class RawMaterialForecastItem(BaseModel):
    product_code: str
    forecast_demand: Optional[float] = Field(default=None, ge=0)
    final_forecast: Optional[float] = Field(default=None, ge=0)


class RawMaterialForecastRequest(BaseModel):
    items: List[RawMaterialForecastItem]


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


class AIInterpretRequest(BaseModel):
    persona: Literal["SUPPLY", "CFO", "CEO"]
    context_pack: Optional[Dict[str, Any]] = None
    language: str = "pt-BR"


class AIInterpretResponse(BaseModel):
    persona: Literal["SUPPLY", "CFO", "CEO"]
    executive_summary: List[str]
    risks: List[AIRisk]
    actions: List[AIAction]
    questions_to_validate: List[str]
    data_quality_flags: List[str]
    disclaimer: str


class RunSOPPipelineRequest(BaseModel):
    forecast_inputs: Optional[List[Dict[str, Any]]] = None
    file_format: Literal["none", "csv", "excel"] = "none"
    simulate_mts: bool = True


class RunSOPPipelineResponse(BaseModel):
    context_pack_2_0: Dict[str, Any]
    execution_summary: Dict[str, Any]
