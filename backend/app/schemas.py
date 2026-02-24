from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

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