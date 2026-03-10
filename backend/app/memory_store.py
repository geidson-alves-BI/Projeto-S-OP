from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Optional

import pandas as pd

from .upload_manifest import build_manifest_state, build_upload_center_payload, get_dataset_definition


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
    last_strategy_report: dict[str, Any] = field(default_factory=_empty_snapshot)
    last_forecast: dict[str, Any] = field(default_factory=_empty_snapshot)
    last_mts_simulation: dict[str, Any] = field(default_factory=_empty_snapshot)
    last_raw_material_forecast: dict[str, Any] = field(default_factory=_empty_snapshot)
    bom_status: dict[str, Any] = field(default_factory=_empty_bom_status)
    user_mts_selection: list[str] = field(default_factory=list)
    upload_manifest: dict[str, dict[str, Any]] = field(default_factory=build_manifest_state)
    upload_history: list[dict[str, Any]] = field(default_factory=list)


class AnalyticsMemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._state = AnalyticsMemoryState()

    def _snapshot_from_df(self, df: pd.DataFrame, totals: dict[str, Any] | None = None) -> dict[str, Any]:
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
            avg_cost = float(per_product_cost["total_production_cost"].mean()) if not per_product_cost.empty else 0.0
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

    def set_user_mts_selection(self, product_codes: list[str]) -> None:
        with self._lock:
            self._state.user_mts_selection = [str(code).strip() for code in product_codes if str(code).strip()]

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
        row_count: int = 0,
        column_count: int = 0,
        columns_detected: list[str] | None = None,
        notes: str | None = None,
        storage_path: str | None = None,
    ) -> dict[str, Any]:
        definition = get_dataset_definition(dataset_id)
        columns = list(columns_detected or [])
        with self._lock:
            current = self._state.upload_manifest.get(dataset_id)
            if current is None:
                current = {**definition, "expected_columns": definition.get("expected_columns", [])}

            document_count = int(current.get("document_count", 0))
            history_count = int(current.get("history_count", 0)) + 1
            if definition["storage_kind"] == "document":
                document_count += 1

            latest_message = notes or "Upload registrado na central."
            uploaded_at = _now_iso()

            merged = {
                **current,
                **definition,
                "expected_columns": definition.get("expected_columns", []),
                "uploaded": True,
                "validation_status": validation_status,
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
            }
            self._state.upload_manifest[dataset_id] = merged

            self._state.upload_history.append(
                {
                    "dataset_id": dataset_id,
                    "dataset_name": definition["name"],
                    "category": definition["category"],
                    "storage_kind": definition["storage_kind"],
                    "filename": filename,
                    "uploaded_at": uploaded_at,
                    "format": file_format,
                    "validation_status": validation_status,
                    "readiness_impact": list(definition["readiness_impact"]),
                    "impact_summary": ", ".join(definition["readiness_impact"]),
                    "row_count": int(row_count),
                    "column_count": int(column_count),
                    "notes": latest_message,
                }
            )
            return deepcopy(merged)

    def get_upload_manifest(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return deepcopy(self._state.upload_manifest)

    def get_upload_history(self) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._state.upload_history)

    def get_upload_center_payload(self) -> dict[str, Any]:
        with self._lock:
            session_snapshot = {
                "last_strategy_report": deepcopy(self._state.last_strategy_report),
                "last_forecast": deepcopy(self._state.last_forecast),
                "last_mts_simulation": deepcopy(self._state.last_mts_simulation),
                "last_raw_material_forecast": deepcopy(self._state.last_raw_material_forecast),
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
                "bom_status": deepcopy(self._state.bom_status),
                "user_mts_selection": list(self._state.user_mts_selection),
                "upload_manifest": deepcopy(self._state.upload_manifest),
                "upload_history": deepcopy(self._state.upload_history),
            }


analytics_store = AnalyticsMemoryStore()
