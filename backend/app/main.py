from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .schemas import SLARequest, SLAResponse, ABCXYZRequest, ForecastRequest
from .utils import to_dataframe, ensure_datetime
from .sla import compute_sla
from .abcxyz import compute_abcxyz
from .forecast import forecast_naive

app = FastAPI(title="Control Tower Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # depois a gente restringe
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def root():
    return {"message": "Control Tower Engine online. Use /docs"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/sla/mp", response_model=SLAResponse)
def sla_mp(req: SLARequest):
    z, protected_level, suggested_buy = compute_sla(req.mean, req.std, req.sla, req.stock_on_hand or 0.0)
    return SLAResponse(z=z, protected_level=protected_level, suggested_buy=suggested_buy)

@app.post("/compute/abcxyz")
def abcxyz(req: ABCXYZRequest):
    df = to_dataframe(req.rows)
    if req.date_col in df.columns:
        df = ensure_datetime(df, req.date_col)

    agg = compute_abcxyz(df, req.sku_col, req.qty_col, req.cost_col)
    return {"items": agg.to_dict(orient="records")}

@app.post("/compute/forecast")
def forecast(req: ForecastRequest):
    df = to_dataframe(req.rows)
    df = ensure_datetime(df, req.date_col)

    out = forecast_naive(df, req.sku_col, req.qty_col, req.date_col, req.horizon_months, req.growth)
    return {"items": out.to_dict(orient="records")}