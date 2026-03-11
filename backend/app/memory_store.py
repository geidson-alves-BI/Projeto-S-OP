from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Optional

import pandas as pd

from .dataset_validation import (
    build_compatibility_summary,
    build_default_compatibility_summary,
)
from .upload_manifest import (
    build_manifest_state,
    build_upload_center_payload,
    get_dataset_definition,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_snapshot() -> dict[str, Any]:
    return {"data": [], "meta": {"generated_at": None, "row_count": 0}}


def _empty_bom_status() -> dict[str, Any]:
    return {
        "loaded": False,
        "products_count": 0,
        "rows_count": 0,
        "updated_at": None,
    }


@dataclass
class AnalyticsMemoryState:
    strategy_report: Optional[pd.DataFrame] = None
    bom: Optional[pd.DataFrame] = None
    demand_forecast: Optional[pd.DataFrame] = None
    raw_material_forecast: Optional[pd.DataFrame] = None
    production_simulation: Optional[pd.DataFrame] = None
    dataset_tables: dict[str, pd.DataFrame] = field(default_factory=dict)
    planning_production_result: Optional[dict[str, Any]] = None
    last_strategy_report: dict[str, Any] = field(default_factory=_empty_snapshot)
    last_forecast: dict[str, Any] = field(default_factory=_empty_snapshot)
    last_mts_simulation: dict[str, Any] = field(default_factory=_empty_snapshot)
    last_raw_material_forecast: dict[str, Any] = field(default_factory=_empty_snapshot)
    last_planning_production: dict[str, Any] = field(default_factory=_empty_snapshot)
    bom_status: dict[str, Any] = field(default_factory=_empty_bom_status)
    user_mts_selection: list[str] = field(default_factory=list)
    upload_manifest: dict[str, dict[str, Any]] = field(default_factory=build_manifest_state)
    upload_history: list[dict[str, Any]] = field(default_factory=list)


class AnalyticsMemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._state = AnalyticsMemoryState()

    def _snapshot_from_df(
        self,
        df: pd.DataFrame,
        totals: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        records = df.to_dict(orient="records") if not df.empty else []
        snapshot: dict[str, Any] = {
            "data": records,
            "meta": {
                "generated_at": _now_iso(),
                "row_count": int(len(records)),
            },
        }
        if totals is not None:
            snapshot["totals"] = totals
        return snapshot

    def _snapshot_from_payload(
        self,
        payload: dict[str, Any] | None,
        row_count: int = 0,
    ) -> dict[str, Any]:
        safe_payload = deepcopy(payload or {})
        return {
            "data": [safe_payload] if safe_payload else [],
            "meta": {
                "generated_at": _now_iso(),
                "row_count": int(row_count),
            },
            "payload": safe_payload,
        }

    def _calculate_mts_totals(self, df: pd.DataFrame) -> dict[str, Any]:
        if df.empty:
            return {
                "products_simulated": 0,
                "rows_count": 0,
                "total_cost": 0.0,
                "average_cost_per_product": 0.0,
                "total_raw_material_cost": 0.0,
            }

        if {"product_code", "total_production_cost"}.issubset(df.columns):
            per_product_cost = df[["product_code", "total_production_cost"]].drop_duplicates()
            total_cost = float(per_product_cost["total_production_cost"].sum())
            avg_cost = (
                float(per_product_cost["total_production_cost"].mean())
                if not per_product_cost.empty
                else 0.0
            )
            product_count = int(per_product_cost["product_code"].nunique())
        else:
            total_cost = 0.0
            avg_cost = 0.0
            product_count = 0

        total_raw_material_cost = (
            float(df["raw_material_cost"].sum())
            if "raw_material_cost" in df.columns
            else 0.0
        )

        return {
            "products_simulated": product_count,
            "rows_count": int(len(df)),
            "total_cost": total_cost,
            "average_cost_per_product": avg_cost,
            "total_raw_material_cost": total_raw_material_cost,
        }

    def set_strategy_report(self, df: pd.DataFrame) -> None:
        with self._lock:
            self._state.strategy_report = df.copy()
            self._state.last_strategy_report = self._snapshot_from_df(df)

    def get_strategy_report(self) -> Optional[pd.DataFrame]:
        with self._lock:
            return None if self._state.strategy_report is None else self._state.strategy_report.copy()

    def set_bom(self, df: pd.DataFrame) -> None:
        with self._lock:
            self._state.bom = df.copy()
            self._state.dataset_tables["bom"] = df.copy()
            self._state.bom_status = {
                "loaded": bool(not df.empty),
                "products_count": int(df["product_code"].nunique() if not df.empty and "product_code" in df.columns else 0),
                "rows_count": int(len(df)),
                "updated_at": _now_iso(),
            }

    def set_bom_status(
        self,
        loaded: bool,
        products_count: int,
        rows_count: int,
        updated_at: str | None = None,
    ) -> None:
        with self._lock:
            self._state.bom_status = {
                "loaded": bool(loaded),
                "products_count": int(products_count),
                "rows_count": int(rows_count),
                "updated_at": updated_at or _now_iso(),
            }

    def get_bom(self) -> Optional[pd.DataFrame]:
        with self._lock:
            return None if self._state.bom is None else self._state.bom.copy()

    def get_bom_status(self) -> dict[str, Any]:
        with self._lock:
            return deepcopy(self._state.bom_status)

    def set_forecast(self, df: pd.DataFrame) -> None:
        with self._lock:
            self._state.demand_forecast = df.copy()
            self._state.last_forecast = self._snapshot_from_df(df)

    def set_demand_forecast(self, df: pd.DataFrame) -> None:
        self.set_forecast(df)

    def get_demand_forecast(self) -> Optional[pd.DataFrame]:
        with self._lock:
            return None if self._state.demand_forecast is None else self._state.demand_forecast.copy()

    def set_raw_material_forecast(self, df: pd.DataFrame) -> None:
        with self._lock:
            self._state.raw_material_forecast = df.copy()
            self._state.last_raw_material_forecast = self._snapshot_from_df(df)

    def get_raw_material_forecast(self) -> Optional[pd.DataFrame]:
        with self._lock:
            return None if self._state.raw_material_forecast is None else self._state.raw_material_forecast.copy()

    def set_mts_simulation(self, df: pd.DataFrame) -> None:
        totals = self._calculate_mts_totals(df)
        with self._lock:
            self._state.production_simulation = df.copy()
            self._state.last_mts_simulation = self._snapshot_from_df(df, totals=totals)

    def set_production_simulation(self, df: pd.DataFrame) -> None:
        self.set_mts_simulation(df)

    def get_production_simulation(self) -> Optional[pd.DataFrame]:
        with self._lock:
            return None if self._state.production_simulation is None else self._state.production_simulation.copy()

    def set_planning_production_result(self, payload: dict[str, Any]) -> None:
        summary = payload.get("summary_by_product", [])
        row_count = len(summary) if isinstance(summary, list) else 0
        with self._lock:
            self._state.planning_production_result = deepcopy(payload)
            self._state.last_planning_production = self._snapshot_from_payload(
                payload,
                row_count=row_count,
            )

    def get_planning_production_result(self) -> dict[str, Any] | None:
        with self._lock:
            return deepcopy(self._state.planning_production_result)

    def set_dataset_rows(self, dataset_id: str, rows: list[dict[str, Any]]) -> None:
        frame = pd.DataFrame(rows if rows else [])
        with self._lock:
            self._state.dataset_tables[str(dataset_id)] = frame

    def get_dataset_frame(self, dataset_id: str) -> pd.DataFrame:
        with self._lock:
            frame = self._state.dataset_tables.get(str(dataset_id))
            return frame.copy() if frame is not None else pd.DataFrame()

    def get_dataset_rows(self, dataset_id: str) -> list[dict[str, Any]]:
        frame = self.get_dataset_frame(dataset_id)
        if frame.empty:
            return []
        return frame.to_dict(orient="records")

    def set_user_mts_selection(self, product_codes: list[str]) -> None:
        with self._lock:
            self._state.user_mts_selection = [
                str(code).strip() for code in product_codes if str(code).strip()
            ]

    def get_user_mts_selection(self) -> list[str]:
        with self._lock:
            return list(self._state.user_mts_selection)

    def record_dataset_upload(
        self,
        dataset_id: str,
        *,
        filename: str,
        file_format: str,
        validation_status: str,
        availability_status: str = "unavailable",
        row_count: int = 0,
        column_count: int = 0,
        columns_detected: list[str] | None = None,
        notes: str | None = None,
        storage_path: str | None = None,
        validation_report: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        definition = get_dataset_definition(dataset_id)
        canonical_dataset_id = str(definition["dataset_id"])
        columns = list(columns_detected or [])
        compatibility_summary = build_compatibility_summary(validation_report, canonical_dataset_id)

        with self._lock:
            current = self._state.upload_manifest.get(canonical_dataset_id)
            if current is None:
                current = {
                    **definition,
                    "compatibility_summary": build_default_compatibility_summary(canonical_dataset_id),
                }

            document_count = int(current.get("document_count", 0))
            history_count = int(current.get("history_count", 0)) + 1
            if definition["storage_kind"] == "document":
                document_count += 1

            latest_message = notes or "Upload registrado na central."
            uploaded_at = _now_iso()

            merged = {
                **current,
                **definition,
                "expected_columns": definition.get("required_columns", [])
                + definition.get("optional_columns", []),
                "uploaded": True,
                "available": availability_status in {"ready", "partial"},
                "validation_status": validation_status,
                "availability_status": availability_status,
                "uploaded_at": uploaded_at,
                "filename": filename,
                "format": file_format,
                "row_count": int(row_count),
                "column_count": int(column_count),
                "columns_detected": columns,
                "latest_message": latest_message,
                "history_count": history_count,
                "document_count": document_count,
                "storage_path": storage_path,
                "last_upload_status": validation_status,
                "last_validation": deepcopy(validation_report),
                "compatibility_summary": compatibility_summary,
            }
            self._state.upload_manifest[canonical_dataset_id] = merged

            history_item = {
                "dataset_id": canonical_dataset_id,
                "dataset_name": definition["name"],
                "category": definition["category"],
                "storage_kind": definition["storage_kind"],
                "filename": filename,
                "uploaded_at": uploaded_at,
                "format": file_format,
                "validation_status": validation_status,
                "availability_status": availability_status,
                "readiness_impact": list(definition["readiness_impact"]),
                "impact_summary": ", ".join(definition["readiness_impact"]),
                "row_count": int(row_count),
                "column_count": int(column_count),
                "compatibility_score": int(compatibility_summary["compatibility_score"]),
                "confidence_score": int(compatibility_summary["confidence_score"]),
                "missing_required_columns": list(
                    compatibility_summary.get("missing_required_columns", [])
                ),
                "notes": latest_message,
            }
            self._state.upload_history.append(history_item)
            return deepcopy(merged)

    def get_dataset_manifest(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return deepcopy(self._state.upload_manifest)

    def get_upload_history(self) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._state.upload_history)

    def get_dataset_validation(self, dataset_id: str) -> dict[str, Any]:
        canonical_id = str(get_dataset_definition(dataset_id)["dataset_id"])
        with self._lock:
            dataset = self._state.upload_manifest.get(canonical_id)
            if dataset is None:
                raise KeyError(dataset_id)
            return {
                "dataset_id": canonical_id,
                "dataset_name": dataset.get("name"),
                "last_validation": deepcopy(dataset.get("last_validation")),
                "compatibility_summary": deepcopy(dataset.get("compatibility_summary")),
                "uploaded": bool(dataset.get("uploaded")),
                "uploaded_at": dataset.get("uploaded_at"),
                "filename": dataset.get("filename"),
                "format": dataset.get("format"),
            }

    def get_dataset_compatibility_payload(self) -> dict[str, Any]:
        with self._lock:
            manifest = deepcopy(self._state.upload_manifest)

        datasets_payload: dict[str, dict[str, Any]] = {}
        confidence_scores: list[int] = []
        compatibility_scores: list[int] = []
        ready = 0
        partial = 0
        unavailable = 0
        missing_datasets: list[str] = []
        largest_gaps: list[str] = []

        for dataset_id, dataset in manifest.items():
            summary = dataset.get("compatibility_summary") or build_default_compatibility_summary(dataset_id)
            datasets_payload[dataset_id] = summary
            confidence_scores.append(int(summary.get("confidence_score", 0)))
            compatibility_scores.append(int(summary.get("compatibility_score", 0)))
            availability = str(summary.get("availability_status", "unavailable"))

            if availability == "ready":
                ready += 1
            elif availability == "partial":
                partial += 1
            else:
                unavailable += 1
                missing_datasets.append(str(dataset.get("name", dataset_id)))

            for gap in summary.get("quality_gaps", [])[:2]:
                largest_gaps.append(f"{dataset.get('name', dataset_id)}: {gap}")

        total = max(len(datasets_payload), 1)
        ai_required = ["production", "bom", "finance_documents"]
        ai_missing = []
        ai_scores = []
        for dataset_id in ai_required:
            summary = datasets_payload.get(dataset_id) or build_default_compatibility_summary(dataset_id)
            ai_scores.append(int(summary.get("confidence_score", 0)))
            if str(summary.get("availability_status", "unavailable")) != "ready":
                ai_missing.append(dataset_id)

        ai_confidence = int(round(sum(ai_scores) / max(len(ai_scores), 1)))
        ai_coverage = int(round(((len(ai_required) - len(ai_missing)) / len(ai_required)) * 100))

        return {
            "average_confidence_score": int(round(sum(confidence_scores) / total)),
            "average_compatibility_score": int(round(sum(compatibility_scores) / total)),
            "ready_datasets": ready,
            "partial_datasets": partial,
            "unavailable_datasets": unavailable,
            "missing_datasets": missing_datasets,
            "largest_gaps": largest_gaps[:8],
            "datasets": datasets_payload,
            "ai_readiness": {
                "coverage_percent": ai_coverage,
                "confidence_score": ai_confidence,
                "quality_gaps": [
                    f"Dataset obrigatorio ausente para IA executiva: {dataset_id}"
                    for dataset_id in ai_missing
                ],
                "missing_datasets": ai_missing,
            },
        }

    def get_upload_center_payload(self) -> dict[str, Any]:
        with self._lock:
            session_snapshot = {
                "last_strategy_report": deepcopy(self._state.last_strategy_report),
                "last_forecast": deepcopy(self._state.last_forecast),
                "last_mts_simulation": deepcopy(self._state.last_mts_simulation),
                "last_raw_material_forecast": deepcopy(self._state.last_raw_material_forecast),
                "last_planning_production": deepcopy(self._state.last_planning_production),
                "bom_status": deepcopy(self._state.bom_status),
                "user_mts_selection": list(self._state.user_mts_selection),
            }
            return build_upload_center_payload(
                dataset_manifest=deepcopy(self._state.upload_manifest),
                history=deepcopy(self._state.upload_history),
                session_snapshot=session_snapshot,
            )

    def get_session_snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "last_strategy_report": deepcopy(self._state.last_strategy_report),
                "last_forecast": deepcopy(self._state.last_forecast),
                "last_mts_simulation": deepcopy(self._state.last_mts_simulation),
                "last_raw_material_forecast": deepcopy(self._state.last_raw_material_forecast),
                "last_planning_production": deepcopy(self._state.last_planning_production),
                "bom_status": deepcopy(self._state.bom_status),
                "user_mts_selection": list(self._state.user_mts_selection),
                "upload_manifest": deepcopy(self._state.upload_manifest),
                "upload_history": deepcopy(self._state.upload_history),
            }


analytics_store = AnalyticsMemoryStore()
