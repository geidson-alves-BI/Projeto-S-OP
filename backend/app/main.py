from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi import File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .analytics_v2.engine import analytics_engine_v2
from .ai.ai_router import router as ai_router
from .abcxyz import compute_abcxyz
from .abc_xyz_analysis import build_abc_xyz_analysis
from .bom import normalize_bom_rows
from .context_pack import build_context_pack
from .dataset_contracts import get_contract_registry_payload, get_dataset_contract
from .dataset_validation import (
    TABULAR_FORMATS,
    build_document_validation_report,
    build_forecast_items,
    build_tabular_upload_bundle,
    build_validation_report,
    downgrade_validation_report,
    parse_tabular_bytes,
)
from .demand_forecast_engine import build_demand_forecast
from .forecast import forecast_naive
from .finance_documents import build_finance_documents_summary
from .memory_store import analytics_store
from .raw_material_forecast import build_raw_material_forecast
from .readiness import get_readiness_summary
from .context import build_executive_context
from .planning_engine import (
    export_planning_result_csv,
    export_planning_result_pdf,
    run_planning_analysis,
)
from .schemas import (
    ABCXYZRequest,
    BOMUploadRequest,
    DemandForecastEngineRequest,
    ForecastRequest,
    PlanningProductionExportRequest,
    PlanningProductionRunRequest,
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
    export_strategy_report_pdf,
)
from .utils import ensure_datetime, to_dataframe

app = FastAPI(title="Control Tower Engine", version="0.3.1")

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
    df = parse_tabular_bytes(filename, content)
    return df.to_dict(orient="records")


def _execute_planning_run(req: PlanningProductionRunRequest) -> dict[str, Any]:
    sales_rows = analytics_store.get_dataset_rows("sales_orders")
    customers_rows = analytics_store.get_dataset_rows("customers")
    inventory_rows = analytics_store.get_dataset_rows("raw_material_inventory")

    result = run_planning_analysis(
        sales_rows=sales_rows,
        customers_rows=customers_rows,
        inventory_rows=inventory_rows,
        product_codes=req.filters.product_codes,
        customer_codes=req.filters.customer_codes,
        product_groups=req.filters.product_groups,
        abc_classes=req.filters.abc_classes,
        start_date=req.filters.start_date,
        end_date=req.filters.end_date,
        method=req.method,
        horizon_months=req.horizon_months,
        seasonal_periods=req.seasonal_periods,
        scenario_name=req.scenario_name,
        growth_global_pct=req.growth.global_pct,
        growth_by_product=req.growth.by_product,
        growth_by_customer=req.growth.by_customer,
        growth_by_group=req.growth.by_group,
        growth_by_class=req.growth.by_class,
        mts_coverage_days=req.mts_mtu.mts_coverage_days,
        mtu_coverage_days=req.mts_mtu.mtu_coverage_days,
        excess_multiplier=req.mts_mtu.excess_multiplier,
    )
    analytics_store.set_planning_production_result(result)
    return result


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
    file_format: str | None = Query(default=None),
):
    rows = req.rows if isinstance(req.rows, list) else []
    if len(rows) == 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "rows must contain at least one record. "
                "Send { rows: [...], file_format: 'csv' | 'xlsx' | 'pdf' }."
            ),
        )

    body_file_format = req.file_format if "file_format" in req.model_fields_set else None
    requested_format = (body_file_format or file_format or "csv").strip().lower()
    if requested_format == "excel":
        requested_format = "xlsx"
    if requested_format not in {"csv", "xlsx", "pdf"}:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file_format. Use one of: csv, xlsx, pdf.",
        )

    try:
        report_df = build_strategy_report(
            rows=rows,
            product_code_col=req.product_code_col,
            product_name_col=req.product_name_col,
            sales_col=req.sales_col,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analytics_store.set_strategy_report(report_df)

    if requested_format == "xlsx":
        try:
            file_bytes = export_strategy_report_excel(report_df)
        except ImportError as exc:
            raise HTTPException(
                status_code=500,
                detail="Excel export requires openpyxl installed in backend environment.",
            ) from exc
        filename = "strategy_report.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif requested_format == "pdf":
        file_bytes = export_strategy_report_pdf(report_df)
        filename = "strategy_report.pdf"
        media_type = "application/pdf"
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
            availability_status="unavailable",
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
        availability_status="ready",
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
    analytics_store.set_dataset_rows("forecast_input", [item.model_dump() for item in req.items])
    forecast_df = build_demand_forecast([item.model_dump() for item in req.items])
    analytics_store.set_forecast(forecast_df)
    analytics_store.record_dataset_upload(
        "forecast_input",
        filename=req.source_filename or "forecast_input.json",
        file_format=_build_file_format(req.source_filename or "forecast_input.json"),
        validation_status="valid" if not forecast_df.empty else "partial",
        availability_status="ready" if not forecast_df.empty else "unavailable",
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



@app.get("/analytics/readiness")
def readiness():
    manifest = analytics_store.get_dataset_manifest()
    return get_readiness_summary(manifest)


@app.get("/analytics/executive_context")
def executive_context():
    manifest = analytics_store.get_dataset_manifest()
    return build_executive_context(manifest)


@app.get("/analytics/context_pack")
def context_pack():
    payload = build_context_pack(analytics_store.get_session_snapshot())
    return payload


@app.get("/analytics/dataset_contracts")
def dataset_contracts():
    return get_contract_registry_payload()


@app.get("/analytics/dataset_contracts/{dataset_id}")
def dataset_contract(dataset_id: str):
    try:
        return get_dataset_contract(dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown dataset_id: {dataset_id}") from exc


@app.get("/analytics/dataset_validation/{dataset_id}")
def dataset_validation(dataset_id: str):
    try:
        return analytics_store.get_dataset_validation(dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown dataset_id: {dataset_id}") from exc


@app.get("/analytics/dataset_compatibility")
def dataset_compatibility():
    return analytics_store.get_dataset_compatibility_payload()


@app.get("/analytics/forecast_results")
def forecast_results():
    forecast_df = analytics_store.get_demand_forecast()
    if forecast_df is None or forecast_df.empty:
        return {"items": [], "rowCount": 0}
    return {"items": forecast_df.to_dict(orient="records"), "rowCount": int(len(forecast_df))}


@app.get("/analytics/finance_documents/summary")
def finance_documents_summary():
    manifest = analytics_store.get_dataset_manifest()
    finance_manifest = manifest.get("finance_documents", {})
    rows = analytics_store.get_dataset_rows("finance_documents")
    summary = build_finance_documents_summary(rows)
    return {
        **summary,
        "uploaded": bool(finance_manifest.get("uploaded", False)),
        "availability_status": str(finance_manifest.get("availability_status", "unavailable")),
        "uploaded_at": finance_manifest.get("uploaded_at"),
        "filename": finance_manifest.get("filename"),
        "document_count": int(finance_manifest.get("document_count", 0) or 0),
    }


@app.post("/analytics/planning_production/run")
def planning_production_run(req: PlanningProductionRunRequest):
    try:
        result = _execute_planning_run(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@app.get("/analytics/planning_production/latest")
def planning_production_latest():
    payload = analytics_store.get_planning_production_result()
    if payload is None:
        return {"generated_at": None, "available": False, "data": None}
    return {"generated_at": payload.get("generated_at"), "available": True, "data": payload}


@app.post("/analytics/planning_production/export/csv")
def planning_production_export_csv(req: PlanningProductionExportRequest):
    try:
        if req.use_latest_if_available:
            latest = analytics_store.get_planning_production_result()
            if latest:
                result = latest
            else:
                result = _execute_planning_run(req.request)
        else:
            result = _execute_planning_run(req.request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    file_bytes = export_planning_result_csv(result)
    return StreamingResponse(
        BytesIO(file_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="planning_production.csv"'},
    )


@app.post("/analytics/planning_production/export/pdf")
def planning_production_export_pdf(req: PlanningProductionExportRequest):
    try:
        if req.use_latest_if_available:
            latest = analytics_store.get_planning_production_result()
            if latest:
                result = latest
            else:
                result = _execute_planning_run(req.request)
        else:
            result = _execute_planning_run(req.request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    file_bytes = export_planning_result_pdf(result)
    return StreamingResponse(
        BytesIO(file_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="planning_production.pdf"'},
    )


@app.get("/analytics/upload_center")
def upload_center():
    return analytics_store.get_upload_center_payload()


@app.get("/analytics/app_data_snapshot")
def app_data_snapshot():
    manifest = analytics_store.get_dataset_manifest()
    readiness_payload = get_readiness_summary(manifest)
    dataset_ids = [
        "production",
        "customers",
        "sales_orders",
        "forecast_input",
        "bom",
        "raw_material_inventory",
        "finance_documents",
    ]

    datasets: dict[str, dict[str, Any]] = {}
    for dataset_id in dataset_ids:
        manifest_entry = manifest.get(dataset_id, {})
        rows = analytics_store.get_dataset_rows(dataset_id)
        datasets[dataset_id] = {
            "dataset_id": dataset_id,
            "uploaded": bool(manifest_entry.get("uploaded", False)),
            "available": bool(manifest_entry.get("available", False)),
            "availability_status": str(manifest_entry.get("availability_status", "unavailable")),
            "validation_status": str(manifest_entry.get("validation_status", "missing")),
            "uploaded_at": manifest_entry.get("uploaded_at"),
            "filename": manifest_entry.get("filename"),
            "row_count": int(len(rows)),
            "rows": rows,
        }

    return {
        "datasets": datasets,
        "readiness": readiness_payload,
        "bom_status": analytics_store.get_bom_status(),
    }


@app.post("/analytics/register_structured_upload")
def register_structured_upload(req: StructuredUploadRegistrationRequest):
    availability_status = "ready" if req.validation_status == "valid" else "partial" if req.validation_status == "partial" else "unavailable"
    try:
        analytics_store.record_dataset_upload(
            req.dataset_id,
            filename=req.filename,
            file_format=req.format,
            validation_status=req.validation_status,
            availability_status=availability_status,
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
        definition = get_dataset_contract(dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown dataset_id: {dataset_id}") from exc

    filename = file.filename or f"{dataset_id}_upload"
    file_format = _build_file_format(filename)
    if file_format not in set(definition["accepted_formats"]):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format for {dataset_id}: {file_format}",
        )

    canonical_dataset_id = str(definition["dataset_id"])
    content = await file.read()
    storage_path = _store_uploaded_file(canonical_dataset_id, filename, content)
    validation: dict[str, Any]
    notes = "Arquivo armazenado na central de dados."

    if definition["storage_kind"] == "document" and file_format not in TABULAR_FORMATS:
        analytics_store.set_dataset_rows(canonical_dataset_id, [])
        validation = build_document_validation_report(canonical_dataset_id, filename, file_format)
        notes = validation["summary"]
    else:
        try:
            bundle = build_tabular_upload_bundle(canonical_dataset_id, filename, content)
        except Exception as exc:
            analytics_store.set_dataset_rows(canonical_dataset_id, [])
            validation = downgrade_validation_report(
                build_validation_report(
                    canonical_dataset_id,
                    source_columns=[],
                    row_count=0,
                    file_format=file_format,
                    filename=filename,
                ),
                gap=f"Nao foi possivel ler a base enviada: {exc}",
                validation_status="invalid",
                availability_status="unavailable",
                compatibility_status="incompatible",
            )
            notes = validation["summary"]
        else:
            validation = bundle["validation"]
            notes = validation["summary"]
            analytics_store.set_dataset_rows(canonical_dataset_id, bundle["normalized_rows"])

            if canonical_dataset_id == "forecast_input":
                items = build_forecast_items(bundle["normalized_rows"])
                if not items:
                    validation = downgrade_validation_report(
                        validation,
                        gap="Nenhum SKU com sinal de demanda valido foi encontrado para consolidar o forecast.",
                        validation_status="partial",
                        availability_status="unavailable",
                        compatibility_status="partial",
                    )
                else:
                    forecast_df = build_demand_forecast(items)
                    analytics_store.set_forecast(forecast_df)
                    if forecast_df.empty:
                        validation = downgrade_validation_report(
                            validation,
                            gap="Forecast processado sem registros consolidados.",
                            validation_status="partial",
                            availability_status="unavailable",
                            compatibility_status="partial",
                        )
                    else:
                        notes = f"Forecast consolidado com {len(forecast_df)} registros."

            elif canonical_dataset_id == "bom":
                try:
                    bom_df = normalize_bom_rows(
                        rows=bundle["normalized_rows"],
                        product_code_col="product_code",
                        raw_material_code_col="raw_material_code",
                        raw_material_name_col="raw_material_name",
                        qty_per_unit_col="qty_per_unit",
                        unit_cost_col="unit_cost",
                    )
                except ValueError as exc:
                    validation = downgrade_validation_report(
                        validation,
                        gap=str(exc),
                        validation_status="partial",
                        availability_status="unavailable",
                        compatibility_status="partial",
                    )
                else:
                    if bom_df.empty:
                        validation = downgrade_validation_report(
                            validation,
                            gap="A estrutura enviada nao trouxe combinacoes validas entre produto final e materia-prima.",
                            validation_status="partial",
                            availability_status="unavailable",
                            compatibility_status="partial",
                        )
                    else:
                        analytics_store.set_bom(bom_df)
                        notes = f"{len(bom_df)} linhas validadas para estrutura de produto."

            elif canonical_dataset_id == "sales_orders" and validation["availability_status"] == "ready":
                notes = "Carteira comercial validada e pronta para a camada analitica."
            elif canonical_dataset_id == "customers" and validation["availability_status"] == "ready":
                notes = "Base de clientes validada e preparada para cruzamentos comerciais."
            elif canonical_dataset_id == "production" and validation["availability_status"] == "ready":
                notes = "Historico de producao validado para leitura operacional."
            elif canonical_dataset_id == "raw_material_inventory" and validation["availability_status"] == "ready":
                notes = "Estoque de materia-prima validado para cobertura e criticidade."

    payload = analytics_store.record_dataset_upload(
        canonical_dataset_id,
        filename=filename,
        file_format=file_format,
        validation_status=str(validation["validation_status"]),
        availability_status=str(validation["availability_status"]),
        row_count=int(validation["row_count"]),
        column_count=int(validation["column_count"]),
        columns_detected=list(validation.get("recognized_columns", [])),
        notes=notes,
        storage_path=storage_path,
        validation_report=validation,
    )
    return {
        "dataset": payload,
        "validation": validation,
        "compatibility": payload.get("compatibility_summary"),
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
        "planningProduction": build_snapshot_status("last_planning_production"),
        "mtsSimulation": build_snapshot_status("last_mts_simulation"),
        "rawMaterialForecast": build_snapshot_status("last_raw_material_forecast"),
        "bom": {
            "loaded": bool(bom_status.get("loaded", False)),
            "rowsCount": int(bom_status.get("rows_count", 0) or 0),
            "productsCount": int(bom_status.get("products_count", 0) or 0),
            "updatedAt": bom_status.get("updated_at"),
        },
    }


@app.get("/analytics/abc_xyz")
def analytics_abc_xyz():
    production_rows = analytics_store.get_dataset_rows("production")
    sales_rows = analytics_store.get_dataset_rows("sales_orders")
    return build_abc_xyz_analysis(
        production_rows=production_rows,
        sales_rows=sales_rows,
    )


@app.get("/analytics/v2/snapshot")
def analytics_v2_snapshot(scope: str = Query(default="global")):
    return analytics_engine_v2.build_snapshot(escopo=scope)


@app.get("/analytics/v2/metrics")
def analytics_v2_metrics(scope: str = Query(default="global")):
    return analytics_engine_v2.list_metrics_catalog(escopo=scope)


@app.post("/analytics/v2/metrics/compute")
def analytics_v2_metrics_compute(payload: dict[str, Any] | None = None):
    body = payload if isinstance(payload, dict) else {}
    raw_metric_ids = body.get("metric_ids")
    metric_ids = (
        [str(metric_id).strip() for metric_id in raw_metric_ids if str(metric_id).strip()]
        if isinstance(raw_metric_ids, list)
        else None
    )
    escopo = str(body.get("escopo") or "global")
    filtros = body.get("filtros") if isinstance(body.get("filtros"), dict) else None
    cenario = str(body.get("cenario") or "base")

    result = analytics_engine_v2.compute_metrics(
        metric_ids=metric_ids,
        escopo=escopo,
        filtros=filtros,
        cenario=cenario,
    )
    return {
        "metrics": result["metrics"],
        "metricas_calculaveis": result["metricas_calculaveis"],
        "metricas_bloqueadas": result["metricas_bloqueadas"],
        "engine_version": result["engine_version"],
        "metric_registry_version": result["metric_registry_version"],
    }


@app.get("/analytics/v2/financial_scenarios")
def analytics_v2_financial_scenarios(scope: str = Query(default="global")):
    return analytics_engine_v2.build_financial_scenarios(escopo=scope)
