from __future__ import annotations

from io import BytesIO

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .ai.ai_router import router as ai_router
from .abcxyz import compute_abcxyz
from .bom import normalize_bom_rows
from .context_pack import build_context_pack
from .demand_forecast_engine import build_demand_forecast
from .forecast import forecast_naive
from .memory_store import analytics_store
from .raw_material_forecast import build_raw_material_forecast
from .schemas import (
    ABCXYZRequest,
    BOMUploadRequest,
    DemandForecastEngineRequest,
    ForecastRequest,
    MTSProductionSimulationRequest,
    RawMaterialForecastRequest,
    RunSOPPipelineRequest,
    RunSOPPipelineResponse,
    SLARequest,
    SLAResponse,
    StrategyReportRequest,
)
from .simulation import simulate_mts_production as run_mts_production_simulation
from .sla import compute_sla
from .strategy_report import (
    build_strategy_report,
    export_strategy_report_csv,
    export_strategy_report_excel,
)
from .utils import ensure_datetime, to_dataframe

app = FastAPI(title="Control Tower Engine", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local desktop mode
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)


@app.get("/")
def root():
    return {"message": "Control Tower Engine online. Use /docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sla/mp", response_model=SLAResponse)
def sla_mp(req: SLARequest):
    z, protected_level, suggested_buy = compute_sla(
        req.mean,
        req.std,
        req.sla,
        req.stock_on_hand or 0.0,
    )
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

    out = forecast_naive(
        df,
        req.sku_col,
        req.qty_col,
        req.date_col,
        req.horizon_months,
        req.growth,
    )
    return {"items": out.to_dict(orient="records")}


@app.post("/analytics/export_strategy_report")
def export_strategy_report(
    req: StrategyReportRequest,
    file_format: str = Query(default="csv", pattern="^(csv|excel)$"),
):
    try:
        report_df = build_strategy_report(
            rows=req.rows,
            product_code_col=req.product_code_col,
            product_name_col=req.product_name_col,
            sales_col=req.sales_col,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analytics_store.set_strategy_report(report_df)

    if file_format == "excel":
        try:
            file_bytes = export_strategy_report_excel(report_df)
        except ImportError as exc:
            raise HTTPException(
                status_code=500,
                detail="Excel export requires openpyxl installed in backend environment.",
            ) from exc
        filename = "strategy_report.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        file_bytes = export_strategy_report_csv(report_df)
        filename = "strategy_report.csv"
        media_type = "text/csv"

    return StreamingResponse(
        BytesIO(file_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/analytics/upload_bom")
def upload_bom(req: BOMUploadRequest):
    try:
        bom_df = normalize_bom_rows(
            rows=req.rows,
            product_code_col=req.product_code_col,
            raw_material_code_col=req.raw_material_code_col,
            raw_material_name_col=req.raw_material_name_col,
            qty_per_unit_col=req.qty_per_unit_col,
            unit_cost_col=req.unit_cost_col,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analytics_store.set_bom(bom_df)
    return {
        "count": int(len(bom_df)),
        "products": int(bom_df["product_code"].nunique() if not bom_df.empty else 0),
        "raw_materials": int(bom_df["raw_material_code"].nunique() if not bom_df.empty else 0),
        "items": bom_df.to_dict(orient="records"),
    }


@app.post("/analytics/simulate_mts_production")
def simulate_mts_production(req: MTSProductionSimulationRequest):
    bom_df = analytics_store.get_bom()
    if bom_df is None:
        raise HTTPException(
            status_code=400,
            detail="BOM not loaded. Upload BOM first using /analytics/upload_bom.",
        )

    mts_codes = None
    if req.enforce_mts_from_latest_report:
        strategy_df = analytics_store.get_strategy_report()
        if strategy_df is not None and not strategy_df.empty:
            mts_codes = set(
                strategy_df[strategy_df["recommended_strategy"] == "MTS"]["product_code"]
                .astype(str)
                .tolist()
            )

    try:
        simulation_df = run_mts_production_simulation(
            items=[item.model_dump() for item in req.items],
            bom_df=bom_df,
            mts_codes=mts_codes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analytics_store.set_mts_simulation(simulation_df)
    return {"items": simulation_df.to_dict(orient="records")}


@app.post("/analytics/forecast_demand")
def forecast_demand(req: DemandForecastEngineRequest):
    forecast_df = build_demand_forecast([item.model_dump() for item in req.items])
    analytics_store.set_forecast(forecast_df)
    return {"items": forecast_df.to_dict(orient="records")}


@app.post("/analytics/raw_material_forecast")
def raw_material_forecast(req: RawMaterialForecastRequest):
    bom_df = analytics_store.get_bom()
    if bom_df is None:
        raise HTTPException(
            status_code=400,
            detail="BOM not loaded. Upload BOM first using /analytics/upload_bom.",
        )

    try:
        raw_forecast_df = build_raw_material_forecast(
            items=[item.model_dump() for item in req.items],
            bom_df=bom_df,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analytics_store.set_raw_material_forecast(raw_forecast_df)
    return {"items": raw_forecast_df.to_dict(orient="records")}


@app.post("/analytics/run_sop_pipeline", response_model=RunSOPPipelineResponse)
def run_sop_pipeline(req: RunSOPPipelineRequest):
    executed_steps: list[str] = []
    skipped_steps: list[str] = []

    if req.forecast_inputs:
        forecast_df = build_demand_forecast(req.forecast_inputs)
        analytics_store.set_forecast(forecast_df)
        if forecast_df.empty:
            skipped_steps.append("forecast_demand: inputs provided but forecast output is empty")
        else:
            executed_steps.append("forecast_demand")
    else:
        cached_forecast = analytics_store.get_demand_forecast()
        if cached_forecast is not None and not cached_forecast.empty:
            executed_steps.append("forecast_reused_from_session")
        else:
            skipped_steps.append("forecast_demand: missing forecast_inputs and no cached forecast")

    bom_df = analytics_store.get_bom()
    forecast_df = analytics_store.get_demand_forecast()

    can_build_raw_material = (
        bom_df is not None
        and not bom_df.empty
        and forecast_df is not None
        and not forecast_df.empty
        and "product_code" in forecast_df.columns
        and ("final_forecast" in forecast_df.columns or "forecast_demand" in forecast_df.columns)
    )
    if can_build_raw_material:
        demand_column = "final_forecast" if "final_forecast" in forecast_df.columns else "forecast_demand"
        raw_material_items = forecast_df[["product_code", demand_column]].rename(
            columns={demand_column: "final_forecast"}
        )
        try:
            raw_forecast_df = build_raw_material_forecast(
                items=raw_material_items.to_dict(orient="records"),
                bom_df=bom_df,
            )
            analytics_store.set_raw_material_forecast(raw_forecast_df)
            executed_steps.append("raw_material_forecast")
        except ValueError as exc:
            skipped_steps.append(f"raw_material_forecast: {exc}")
    else:
        skipped_steps.append("raw_material_forecast: missing bom or forecast input")

    if req.simulate_mts:
        can_simulate = (
            bom_df is not None
            and not bom_df.empty
            and forecast_df is not None
            and not forecast_df.empty
            and "product_code" in forecast_df.columns
            and ("final_forecast" in forecast_df.columns or "forecast_demand" in forecast_df.columns)
        )
        if can_simulate:
            demand_column = "final_forecast" if "final_forecast" in forecast_df.columns else "forecast_demand"
            sim_items = (
                forecast_df[["product_code", demand_column]]
                .rename(columns={demand_column: "forecast_demand"})
                .to_dict(orient="records")
            )

            mts_codes = None
            strategy_df = analytics_store.get_strategy_report()
            if strategy_df is not None and not strategy_df.empty and "recommended_strategy" in strategy_df.columns:
                mts_codes = set(
                    strategy_df[strategy_df["recommended_strategy"] == "MTS"]["product_code"]
                    .astype(str)
                    .tolist()
                )

            if mts_codes is not None:
                sim_items = [item for item in sim_items if str(item.get("product_code", "")) in mts_codes]

            if not sim_items:
                skipped_steps.append("simulate_mts_production: no eligible MTS products in available forecast")
            else:
                try:
                    simulation_df = run_mts_production_simulation(
                        items=sim_items,
                        bom_df=bom_df,
                        mts_codes=mts_codes,
                    )
                    analytics_store.set_mts_simulation(simulation_df)
                    executed_steps.append("simulate_mts_production")
                except ValueError as exc:
                    skipped_steps.append(f"simulate_mts_production: {exc}")
        else:
            skipped_steps.append("simulate_mts_production: missing bom or forecast input")
    else:
        skipped_steps.append("simulate_mts_production: disabled by request")

    if req.file_format != "none":
        skipped_steps.append(
            "strategy_export: file generation is not returned by run_sop_pipeline; use /analytics/export_strategy_report."
        )

    context_pack_payload = build_context_pack(analytics_store.get_session_snapshot())
    return {
        "context_pack_2_0": context_pack_payload,
        "execution_summary": {
            "executed_steps": executed_steps,
            "skipped_steps": skipped_steps,
            "simulate_mts": req.simulate_mts,
            "file_format": req.file_format,
        },
    }


@app.get("/analytics/context_pack")
def context_pack():
    payload = build_context_pack(analytics_store.get_session_snapshot())
    return payload
