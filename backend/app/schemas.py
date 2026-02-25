from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal

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


class AISnapshotMetric(BaseModel):
    sku: Optional[str] = None
    tc: Optional[float] = None
    pp: Optional[float] = None
    es: Optional[float] = None
    sla: Optional[float] = Field(default=None, ge=0, le=1)
    cobertura: Optional[float] = None
    tr: Optional[float] = None
    additional_metrics: Dict[str, Any] = Field(default_factory=dict)


class AIAuditRequest(BaseModel):
    snapshots: List[AISnapshotMetric]
    context: Dict[str, Any] = Field(default_factory=dict)


class AIAuditIssue(BaseModel):
    code: str
    severity: Literal["p0", "p1", "p2"]
    message: str
    sku: Optional[str] = None
    field: Optional[str] = None


class AIAuditResponse(BaseModel):
    bugs_provaveis: List[AIAuditIssue]
    inconsistencias: List[AIAuditIssue]
    validacoes_ausentes: List[AIAuditIssue]


class AIInsightsRequest(BaseModel):
    metrics: Dict[str, float]
    context: Dict[str, Any] = Field(default_factory=dict)


class AIInsightItem(BaseModel):
    insight: str
    recomendacao_executiva: str
    justificativa: str
    impacto: Literal["alto", "medio", "baixo"]


class AIInsightsResponse(BaseModel):
    top_insights_operacionais: List[AIInsightItem]


class AIProductImprovementsRequest(BaseModel):
    modulos: List[str] = Field(default_factory=list)
    indicadores_atuais: List[str]
    objetivo: Optional[str] = None
    validacoes_atuais: List[str] = Field(default_factory=list)
    contexto: Dict[str, Any] = Field(default_factory=dict)


class AIProductImprovementsResponse(BaseModel):
    metricas_sem_valor: List[str]
    novas_validacoes_necessarias: List[str]
    melhorias_produto_comercial: List[str]
    melhorias_ux_confiabilidade: List[str]
