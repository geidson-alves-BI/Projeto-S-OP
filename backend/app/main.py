from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi import File, Form, Request, UploadFile
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
    StructuredUploadRegistrationRequest,
    StrategyReportRequest,
)
from .simulation import simulate_mts_production as run_mts_production_simulation
from .sla import compute_sla
from .strategy_report import (
    build_strategy_report,
    export_strategy_report_csv,
    export_strategy_report_excel,
)
from .upload_manifest import get_dataset_definition
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

RUNTIME_UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "runtime_uploads"


def _build_file_format(filename: str) -> str:
    return Path(filename).suffix.lower() or ".bin"


def _sanitize_filename(filename: str) -> str:
    cleaned = Path(filename).name.strip() or "upload.bin"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", cleaned)
    return cleaned or "upload.bin"


def _store_uploaded_file(dataset_id: str, filename: str, content: bytes) -> str:
    target_dir = RUNTIME_UPLOAD_ROOT / dataset_id
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _sanitize_filename(filename)
    final_name = f"{uuid4().hex}_{safe_name}"
    final_path = target_dir / final_name
    final_path.write_bytes(content)
    return str(final_path)


def _read_tabular_upload(filename: str, content: bytes) -> list[dict[str, Any]]:
    ext = _build_file_format(filename)
    buffer = BytesIO(content)
    if ext == ".csv":
        df = pd.read_csv(buffer, sep=None, engine="python")
    elif ext in {".xlsx", ".xls"}:
        df = pd.read_excel(buffer)
    else:
        raise ValueError(f"Unsupported tabular format for upload: {ext}")

    df = df.fillna("")
    return df.to_dict(orient="records")


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
async def upload_bom(request: Request):
    source_filename = "bom_upload.json"
    source_rows: list[dict[str, Any]] = []
    try:
        content_type = request.headers.get("content-type", "").lower()
        if content_type.startswith("multipart/form-data"):
            form = await request.form()
            upload = form.get("file")
            if upload is None or not hasattr(upload, "filename"):
                raise HTTPException(status_code=400, detail="Missing BOM file in multipart payload.")
            upload_file = upload
            source_filename = getattr(upload_file, "filename", None) or "bom_upload.csv"
            source_rows = _read_tabular_upload(source_filename, await upload_file.read())
            req = BOMUploadRequest(
                rows=source_rows,
                product_code_col=str(form.get("product_code_col") or "product_code"),
                raw_material_code_col=str(form.get("raw_material_code_col") or "raw_material_code"),
                raw_material_name_col=str(form.get("raw_material_name_col") or "raw_material_name"),
                qty_per_unit_col=str(form.get("qty_per_unit_col") or "qty_per_unit"),
                unit_cost_col=str(form.get("unit_cost_col") or "unit_cost"),
                source_filename=source_filename,
            )
        else:
            payload = await request.json()
            req = BOMUploadRequest.model_validate(payload)
            source_filename = req.source_filename or source_filename
            source_rows = list(req.rows)

        bom_df = normalize_bom_rows(
            rows=req.rows,
            product_code_col=req.product_code_col,
            raw_material_code_col=req.raw_material_code_col,
            raw_material_name_col=req.raw_material_name_col,
            qty_per_unit_col=req.qty_per_unit_col,
            unit_cost_col=req.unit_cost_col,
        )
    except ValueError as exc:
        analytics_store.record_dataset_upload(
            "bom",
            filename=source_filename,
            file_format=_build_file_format(source_filename),
            validation_status="invalid",
            row_count=len(source_rows),
            column_count=len(source_rows[0].keys()) if source_rows else 0,
            columns_detected=list(source_rows[0].keys()) if source_rows else [],
            notes=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analytics_store.set_bom(bom_df)
    analytics_store.record_dataset_upload(
        "bom",
        filename=source_filename,
        file_format=_build_file_format(source_filename),
        validation_status="valid",
        row_count=int(len(bom_df)),
        column_count=len(list(bom_df.columns)),
        columns_detected=[str(column) for column in bom_df.columns],
        notes=f"{len(bom_df)} linhas validadas para estrutura de produto.",
    )
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
    analytics_store.record_dataset_upload(
        "forecast_input",
        filename=req.source_filename or "forecast_input.json",
        file_format=_build_file_format(req.source_filename or "forecast_input.json"),
        validation_status="valid" if not forecast_df.empty else "partial",
        row_count=len(req.items),
        column_count=len(req.items[0].model_dump().keys()) if req.items else 0,
        columns_detected=list(req.items[0].model_dump().keys()) if req.items else [],
        notes=(
            f"Forecast consolidado com {len(forecast_df)} registros."
            if not forecast_df.empty
            else "Forecast processado, mas sem registros consolidados."
        ),
    )
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


@app.get("/analytics/forecast_results")
def forecast_results():
    forecast_df = analytics_store.get_demand_forecast()
    if forecast_df is None or forecast_df.empty:
        return {"items": [], "rowCount": 0}
    return {"items": forecast_df.to_dict(orient="records"), "rowCount": int(len(forecast_df))}


@app.get("/analytics/upload_center")
def upload_center():
    return analytics_store.get_upload_center_payload()


@app.post("/analytics/register_structured_upload")
def register_structured_upload(req: StructuredUploadRegistrationRequest):
    try:
        analytics_store.record_dataset_upload(
            req.dataset_id,
            filename=req.filename,
            file_format=req.format,
            validation_status=req.validation_status,
            row_count=req.row_count,
            column_count=req.column_count,
            columns_detected=req.columns_detected,
            notes=req.notes,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown dataset_id: {req.dataset_id}") from exc
    return analytics_store.get_upload_center_payload()


@app.post("/analytics/upload_dataset_file")
async def upload_dataset_file(
    dataset_id: str = Form(...),
    file: UploadFile = File(...),
):
    try:
        definition = get_dataset_definition(dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown dataset_id: {dataset_id}") from exc

    filename = file.filename or f"{dataset_id}_upload"
    file_format = _build_file_format(filename)
    if file_format not in set(definition["accepted_formats"]):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format for {dataset_id}: {file_format}",
        )

    content = await file.read()
    storage_path = _store_uploaded_file(dataset_id, filename, content)

    default_notes = {
        "sales_orders": "Arquivo comercial armazenado; integracao analitica preparada para a proxima etapa.",
        "finance_spreadsheets": "Planilha financeira armazenada; leitura estruturada fica preparada para evolucao.",
        "finance_documents": "Documento armazenado para futura leitura inteligente.",
    }
    validation_status = "partial" if dataset_id in {"sales_orders", "finance_spreadsheets", "finance_documents"} else "valid"

    payload = analytics_store.record_dataset_upload(
        dataset_id,
        filename=filename,
        file_format=file_format,
        validation_status=validation_status,
        row_count=0,
        column_count=0,
        columns_detected=[],
        notes=default_notes.get(dataset_id, "Arquivo armazenado na central de dados."),
        storage_path=storage_path,
    )
    return {
        "dataset": payload,
        "storagePath": storage_path,
    }


@app.get("/analytics/data_status")
def analytics_data_status():
    snapshot = analytics_store.get_session_snapshot()

    def build_snapshot_status(key: str) -> dict[str, Any]:
        node = snapshot.get(key, {})
        if not isinstance(node, dict):
            node = {}
        meta = node.get("meta", {})
        if not isinstance(meta, dict):
            meta = {}
        row_count = int(meta.get("row_count", 0) or 0)
        return {
            "loaded": row_count > 0,
            "rowCount": row_count,
            "updatedAt": meta.get("generated_at"),
        }

    bom_status = snapshot.get("bom_status", {})
    if not isinstance(bom_status, dict):
        bom_status = {}

    return {
        "strategyReport": build_snapshot_status("last_strategy_report"),
        "forecast": build_snapshot_status("last_forecast"),
        "mtsSimulation": build_snapshot_status("last_mts_simulation"),
        "rawMaterialForecast": build_snapshot_status("last_raw_material_forecast"),
        "bom": {
            "loaded": bool(bom_status.get("loaded", False)),
            "rowsCount": int(bom_status.get("rows_count", 0) or 0),
            "productsCount": int(bom_status.get("products_count", 0) or 0),
            "updatedAt": bom_status.get("updated_at"),
        },
    }
