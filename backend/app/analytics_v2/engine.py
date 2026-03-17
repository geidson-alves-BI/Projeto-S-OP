from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any, Callable

import pandas as pd

from ..memory_store import analytics_store
from .dataset_registry import get_dataset_registry_payload
from .financial_scenarios import (
    build_financial_scenarios,
    normalize_scenario_name,
)
from .metric_contract import build_metric_contract
from .metric_registry import get_metric_registry_payload
from .status import STATUS_PARTIAL, STATUS_READY, STATUS_UNAVAILABLE, normalize_status


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_text(value: Any) -> str:
    return " ".join(_safe_text(value).lower().split())


def _to_number(value: Any) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if parsed == parsed else 0.0
    raw = _safe_text(value)
    if not raw:
        return 0.0
    cleaned = raw.replace(" ", "")
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _safe_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return []


def _decision_grade(status: str, confidence: str) -> str:
    if normalize_status(status) == STATUS_UNAVAILABLE:
        return "D"
    if normalize_status(status) == STATUS_PARTIAL:
        return "C"
    if confidence == "high":
        return "A"
    if confidence == "medium":
        return "B"
    return "C"


def _confidence_from_periods(period_count: int) -> str:
    if period_count >= 12:
        return "high"
    if period_count >= 4:
        return "medium"
    return "low"


def _merge_unique(items: list[str]) -> list[str]:
    merged: list[str] = []
    for item in items:
        text = _safe_text(item)
        if text and text not in merged:
            merged.append(text)
    return merged


def _coalesce_estimate_type(estimate_types: list[str]) -> str:
    normalized = [str(item or "").strip().lower() for item in estimate_types if str(item or "").strip()]
    if not normalized:
        return "estimated"
    if all(item == "documented" for item in normalized):
        return "documented"
    if any(item == "documented" for item in normalized):
        return "hybrid"
    return "estimated"


def _prepare_production(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "product_description",
                "produced_quantity",
                "month",
                "reference_year",
                "period_start",
            ]
        )

    df = pd.DataFrame(rows).copy()
    if "product_code" not in df.columns:
        df["product_code"] = ""
    if "product_description" not in df.columns:
        df["product_description"] = ""
    if "produced_quantity" not in df.columns:
        df["produced_quantity"] = 0.0
    if "month" not in df.columns:
        df["month"] = None
    if "reference_year" not in df.columns:
        df["reference_year"] = None

    df["product_code"] = df["product_code"].map(_safe_text)
    df["product_description"] = df["product_description"].map(_safe_text)
    df["produced_quantity"] = df["produced_quantity"].map(_to_number)
    df["month"] = pd.to_numeric(df["month"], errors="coerce").round().astype("Int64")
    df["reference_year"] = pd.to_numeric(df["reference_year"], errors="coerce").round().astype("Int64")

    valid_period_mask = (
        df["month"].notna()
        & df["reference_year"].notna()
        & (df["month"] >= 1)
        & (df["month"] <= 12)
    )

    df["period_start"] = pd.NaT
    if bool(valid_period_mask.any()):
        df.loc[valid_period_mask, "period_start"] = pd.to_datetime(
            {
                "year": df.loc[valid_period_mask, "reference_year"].astype(int),
                "month": df.loc[valid_period_mask, "month"].astype(int),
                "day": 1,
            },
            errors="coerce",
        )

    df = df[df["product_code"] != ""].copy()
    return df.reset_index(drop=True)


def _prepare_sales(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "customer_code",
                "customer_name",
                "order_quantity",
                "price",
                "order_date",
                "period_start",
            ]
        )

    df = pd.DataFrame(rows).copy()
    for column in ("product_code", "customer_code", "customer_name"):
        if column not in df.columns:
            df[column] = ""
        df[column] = df[column].map(_safe_text)

    if "order_quantity" not in df.columns:
        df["order_quantity"] = 0.0
    if "price" not in df.columns:
        df["price"] = 0.0
    if "order_date" not in df.columns:
        df["order_date"] = None

    df["order_quantity"] = df["order_quantity"].map(_to_number)
    df["price"] = df["price"].map(_to_number)
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
    df["period_start"] = df["order_date"].dt.to_period("M").dt.to_timestamp()
    df = df[df["product_code"] != ""].copy()
    return df.reset_index(drop=True)


def _prepare_inventory(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "product_description",
                "available_stock",
                "safety_stock",
                "on_order_stock",
                "reorder_point",
                "consumption_30_days",
                "average_consumption_90_days",
                "unit_net_cost_usd",
                "last_entry_unit_net_cost_usd",
            ]
        )

    df = pd.DataFrame(rows).copy()
    for column in ("product_code", "product_description"):
        if column not in df.columns:
            df[column] = ""
        df[column] = df[column].map(_safe_text)

    numeric_columns = [
        "available_stock",
        "safety_stock",
        "on_order_stock",
        "reorder_point",
        "consumption_30_days",
        "average_consumption_90_days",
        "unit_net_cost_usd",
        "last_entry_unit_net_cost_usd",
    ]
    for column in numeric_columns:
        if column not in df.columns:
            df[column] = 0.0
        df[column] = df[column].map(_to_number)

    df = df[df["product_code"] != ""].copy()
    return df.reset_index(drop=True)


def _prepare_bom(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["product_code", "raw_material_code", "qty_per_unit", "unit_cost"])
    df = pd.DataFrame(rows).copy()
    for column in ("product_code", "raw_material_code"):
        if column not in df.columns:
            df[column] = ""
        df[column] = df[column].map(_safe_text)
    for column in ("qty_per_unit", "unit_cost"):
        if column not in df.columns:
            df[column] = 0.0
        df[column] = df[column].map(_to_number)
    df = df[df["product_code"] != ""].copy()
    return df.reset_index(drop=True)


def _extract_finance_sum(rows: list[dict[str, Any]], keywords: list[str]) -> tuple[float, str | None]:
    if not rows:
        return 0.0, None
    first = rows[0]
    columns = [str(column) for column in first.keys()]
    normalized_keywords = [
        _normalize_text(keyword).replace("_", " ").replace("-", " ") for keyword in keywords
    ]
    for column in columns:
        normalized = _normalize_text(column).replace("_", " ").replace("-", " ")
        if any(keyword in normalized for keyword in normalized_keywords):
            value = float(sum(_to_number(row.get(column)) for row in rows))
            return value, column
    return 0.0, None


def _extract_finance_value(rows: list[dict[str, Any]], keywords: list[str]) -> tuple[float | None, str | None]:
    if not rows:
        return None, None
    first = rows[0]
    columns = [str(column) for column in first.keys()]
    normalized_keywords = [
        _normalize_text(keyword).replace("_", " ").replace("-", " ") for keyword in keywords
    ]
    for column in columns:
        normalized = _normalize_text(column).replace("_", " ").replace("-", " ")
        if any(keyword in normalized for keyword in normalized_keywords):
            values = [_to_number(row.get(column)) for row in rows]
            non_zero = [value for value in values if value > 0]
            if non_zero:
                return float(sum(non_zero) / len(non_zero)), column
            if values:
                return float(sum(values) / len(values)), column
    return None, None


def _normalize_rate(value: float | None, *, default: float) -> float:
    if value is None or value <= 0:
        return default
    rate = float(value)
    if rate > 1.0:
        rate = rate / 100.0
    if rate <= 0:
        return default
    if rate > 1.0:
        return default
    return rate


class AnalyticsEngineV2:
    def __init__(self) -> None:
        self._dataset_registry_payload = get_dataset_registry_payload()
        self._metric_registry_payload = get_metric_registry_payload()
        self._metric_handlers: dict[str, Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]] = {
            "production_volume": self._metric_production_volume,
            "production_trend": self._metric_production_trend,
            "operational_seasonality": self._metric_operational_seasonality,
            "abc_operational": self._metric_abc_operational,
            "xyz_operational": self._metric_xyz_operational,
            "operational_risk": self._metric_operational_risk,
            "sales_volume": self._metric_sales_volume,
            "sales_growth": self._metric_sales_growth,
            "customer_mix": self._metric_customer_mix,
            "product_mix": self._metric_product_mix,
            "sales_concentration": self._metric_sales_concentration,
            "abc_commercial": self._metric_abc_commercial,
            "demand_vs_operation_gap": self._metric_demand_vs_operation_gap,
            "service_risk": self._metric_service_risk,
            "mts_mto_recommendation": self._metric_mts_mto_recommendation,
            "scenario_priority": self._metric_scenario_priority,
            "raw_material_coverage": self._metric_raw_material_coverage,
            "rupture_risk": self._metric_rupture_risk,
            "excess_risk": self._metric_excess_risk,
            "mts_incremental_inventory_requirement": self._metric_mts_incremental_inventory_requirement,
            "projected_revenue": self._metric_projected_revenue,
            "projected_cogs": self._metric_projected_cogs,
            "contribution_margin": self._metric_contribution_margin,
            "contribution_margin_pct": self._metric_contribution_margin_pct,
            "fg_working_capital": self._metric_fg_working_capital,
            "rm_working_capital": self._metric_rm_working_capital,
            "total_working_capital": self._metric_total_working_capital,
            "mts_incremental_investment": self._metric_mts_incremental_investment,
            "inventory_carrying_cost": self._metric_inventory_carrying_cost,
            "scenario_delta_financial": self._metric_scenario_delta_financial,
        }

    @property
    def engine_version(self) -> str:
        return "2.0.0"

    def _build_runtime_context(
        self,
        *,
        escopo: str,
        filtros: dict[str, Any] | None,
        cenario: str,
    ) -> dict[str, Any]:
        manifest = analytics_store.get_dataset_manifest()
        registry_entries = {
            str(entry["dataset_id"]): entry for entry in self._dataset_registry_payload["datasets"]
        }
        rows_by_dataset: dict[str, list[dict[str, Any]]] = {}
        dataset_nodes: dict[str, dict[str, Any]] = {}

        for dataset_id, entry in registry_entries.items():
            rows = analytics_store.get_dataset_rows(dataset_id)
            rows_by_dataset[dataset_id] = rows
            state = manifest.get(dataset_id, {})
            status = normalize_status(state.get("availability_status"))
            has_rows = len(rows) > 0
            uploaded = bool(state.get("uploaded", False))
            dataset_nodes[dataset_id] = {
                "dataset_id": dataset_id,
                "display_name": entry.get("display_name", dataset_id),
                "status": status,
                "uploaded": uploaded,
                "has_rows": has_rows,
                "row_count": int(len(rows)),
                "validation_status": str(state.get("validation_status", "missing")),
                "quality_score": int(state.get("compatibility_summary", {}).get("confidence_score", 0)),
                "compatibility_score": int(state.get("compatibility_summary", {}).get("compatibility_score", 0)),
                "missing_required_columns": _safe_list(
                    state.get("compatibility_summary", {}).get("missing_required_columns")
                ),
            }

        production_df = _prepare_production(rows_by_dataset.get("production", []))
        sales_df = _prepare_sales(rows_by_dataset.get("sales_orders", []))
        inventory_df = _prepare_inventory(rows_by_dataset.get("raw_material_inventory", []))
        bom_df = _prepare_bom(rows_by_dataset.get("bom", []))
        finance_rows = rows_by_dataset.get("finance_documents", [])

        filters = filtros or {}
        product_codes = {_safe_text(item) for item in _safe_list(filters.get("product_codes")) if _safe_text(item)}
        customer_codes = {_safe_text(item) for item in _safe_list(filters.get("customer_codes")) if _safe_text(item)}
        start_date = pd.to_datetime(filters.get("start_date"), errors="coerce")
        end_date = pd.to_datetime(filters.get("end_date"), errors="coerce")

        if product_codes:
            production_df = production_df[production_df["product_code"].isin(product_codes)].copy()
            sales_df = sales_df[sales_df["product_code"].isin(product_codes)].copy()
            inventory_df = inventory_df[inventory_df["product_code"].isin(product_codes)].copy()
            bom_df = bom_df[bom_df["product_code"].isin(product_codes)].copy()
        if customer_codes and "customer_code" in sales_df.columns:
            sales_df = sales_df[sales_df["customer_code"].isin(customer_codes)].copy()
        if pd.notna(start_date) and "order_date" in sales_df.columns:
            sales_df = sales_df[sales_df["order_date"] >= start_date].copy()
        if pd.notna(end_date) and "order_date" in sales_df.columns:
            sales_df = sales_df[sales_df["order_date"] <= end_date].copy()

        return {
            "escopo": escopo,
            "cenario": normalize_scenario_name(cenario),
            "manifest": manifest,
            "dataset_nodes": dataset_nodes,
            "rows_by_dataset": rows_by_dataset,
            "production_df": production_df,
            "sales_df": sales_df,
            "inventory_df": inventory_df,
            "bom_df": bom_df,
            "finance_rows": finance_rows,
            "cache": {},
        }

    def _check_minimum_datasets(
        self,
        metric_definition: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[bool, list[str]]:
        dataset_nodes = context["dataset_nodes"]
        missing: list[str] = []
        for dataset_id in metric_definition.get("minimum_datasets", []):
            node = dataset_nodes.get(dataset_id, {})
            if dataset_id == "finance_documents":
                if not bool(node.get("uploaded")):
                    missing.append(dataset_id)
                continue
            if not bool(node.get("has_rows")):
                missing.append(dataset_id)
        return len(missing) == 0, missing

    def _build_unavailable_metric(
        self,
        metric_definition: dict[str, Any],
        *,
        escopo: str,
        missing_datasets: list[str],
        blocked_reason: str,
    ) -> dict[str, Any]:
        return build_metric_contract(
            metric_definition=metric_definition,
            value=None,
            base_usada=[],
            escopo=escopo,
            status=STATUS_UNAVAILABLE,
            confianca="low",
            decision_grade="D",
            missing_data=_merge_unique(
                [*missing_datasets, metric_definition.get("missing_data_message", "")]
            ),
            observacoes=[],
            limitations=[f"minimum_datasets_missing: {', '.join(missing_datasets)}"],
            calculation_method=str(metric_definition.get("formula_engine", "")),
            reference_date=_now_iso(),
            blocked_reason=blocked_reason,
            fallback_strategy_applied=None,
            estimate_type="estimated",
        )

    def _finalize_metric(
        self,
        metric_definition: dict[str, Any],
        context: dict[str, Any],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        status = normalize_status(payload.get("status"))
        confidence = str(payload.get("confianca", "low"))
        decision = str(payload.get("decision_grade") or _decision_grade(status, confidence))
        return build_metric_contract(
            metric_definition=metric_definition,
            value=payload.get("value"),
            base_usada=_merge_unique(payload.get("base_usada", [])),
            escopo=context["escopo"],
            status=status,
            confianca=confidence,
            decision_grade=decision,
            missing_data=_merge_unique(payload.get("missing_data", [])),
            observacoes=_merge_unique(payload.get("observacoes", [])),
            limitations=_merge_unique(payload.get("limitations", [])),
            calculation_method=str(payload.get("calculation_method", metric_definition.get("formula_engine", ""))),
            reference_date=_now_iso(),
            blocked_reason=payload.get("blocked_reason"),
            fallback_strategy_applied=payload.get("fallback_strategy_applied"),
            estimate_type=payload.get("estimate_type"),
        )

    def compute_metrics(
        self,
        *,
        metric_ids: list[str] | None = None,
        escopo: str = "global",
        filtros: dict[str, Any] | None = None,
        cenario: str = "base",
    ) -> dict[str, Any]:
        context = self._build_runtime_context(escopo=escopo, filtros=filtros, cenario=cenario)
        registry_metrics = {
            str(metric["metric_id"]): metric for metric in self._metric_registry_payload["metrics"]
        }
        selected_ids = metric_ids or list(registry_metrics.keys())

        outputs: list[dict[str, Any]] = []
        blocked: list[dict[str, Any]] = []
        available: list[dict[str, Any]] = []

        for metric_id in selected_ids:
            metric_definition = registry_metrics.get(metric_id)
            if metric_definition is None:
                continue

            minimum_ok, missing = self._check_minimum_datasets(metric_definition, context)
            if not minimum_ok:
                output = self._build_unavailable_metric(
                    metric_definition,
                    escopo=escopo,
                    missing_datasets=missing,
                    blocked_reason="minimum_datasets_missing",
                )
                outputs.append(output)
                blocked.append(output)
                continue

            handler = self._metric_handlers.get(metric_id)
            if handler is None:
                output = self._build_unavailable_metric(
                    metric_definition,
                    escopo=escopo,
                    missing_datasets=[],
                    blocked_reason="metric_handler_not_implemented",
                )
                outputs.append(output)
                blocked.append(output)
                continue

            payload = handler(context, metric_definition)
            output = self._finalize_metric(metric_definition, context, payload)
            outputs.append(output)
            if output["status"] == STATUS_UNAVAILABLE:
                blocked.append(output)
            else:
                available.append(output)

        return {
            "metrics": outputs,
            "metricas_calculaveis": available,
            "metricas_bloqueadas": blocked,
            "engine_version": self.engine_version,
            "metric_registry_version": self._metric_registry_payload["version"],
        }

    def list_metrics_catalog(self, *, escopo: str = "global") -> dict[str, Any]:
        context = self._build_runtime_context(escopo=escopo, filtros=None, cenario="base")
        catalog: list[dict[str, Any]] = []

        for metric in self._metric_registry_payload["metrics"]:
            minimum_ok, missing = self._check_minimum_datasets(metric, context)
            status = STATUS_READY if minimum_ok else STATUS_UNAVAILABLE
            if minimum_ok:
                status = STATUS_READY
                for dataset_id in metric.get("minimum_datasets", []):
                    if dataset_id == "finance_documents":
                        node = context["dataset_nodes"][dataset_id]
                        if not bool(node.get("has_rows")):
                            status = STATUS_PARTIAL
                            break
            catalog.append(
                {
                    "metric_id": metric["metric_id"],
                    "display_name": metric["display_name"],
                    "category": metric["category"],
                    "minimum_datasets": metric["minimum_datasets"],
                    "ideal_datasets": metric["ideal_datasets"],
                    "status": status,
                    "missing_datasets": missing,
                    "executive_description": metric["executive_description"],
                }
            )

        return {
            "version": self._metric_registry_payload["version"],
            "metrics": catalog,
            "engine_version": self.engine_version,
        }

    def build_snapshot(self, *, escopo: str = "global") -> dict[str, Any]:
        context = self._build_runtime_context(escopo=escopo, filtros=None, cenario="base")
        computed = self.compute_metrics(escopo=escopo)

        dataset_nodes = context["dataset_nodes"]
        datasets_disponiveis = [
            {
                "dataset_id": dataset_id,
                "status": node["status"],
                "row_count": node["row_count"],
            }
            for dataset_id, node in dataset_nodes.items()
            if node["status"] in {STATUS_READY, STATUS_PARTIAL}
        ]

        qualidade_por_dataset = {
            dataset_id: {
                "status": node["status"],
                "validation_status": node["validation_status"],
                "quality_score": node["quality_score"],
                "compatibility_score": node["compatibility_score"],
                "row_count": node["row_count"],
                "uploaded": node["uploaded"],
                "missing_required_columns": node["missing_required_columns"],
            }
            for dataset_id, node in dataset_nodes.items()
        }

        metricas_calculaveis = [
            {
                "metric_id": metric["metric_id"],
                "status": metric["status"],
                "confianca": metric["confianca"],
                "decision_grade": metric["decision_grade"],
            }
            for metric in computed["metricas_calculaveis"]
        ]
        metricas_bloqueadas = [
            {
                "metric_id": metric["metric_id"],
                "status": metric["status"],
                "blocked_reason": metric.get("blocked_reason"),
                "missing_data": metric.get("missing_data", []),
            }
            for metric in computed["metricas_bloqueadas"]
        ]

        total = max(len(computed["metrics"]), 1)
        ready_count = sum(1 for metric in computed["metrics"] if metric["status"] == STATUS_READY)
        partial_count = sum(1 for metric in computed["metrics"] if metric["status"] == STATUS_PARTIAL)
        unavailable_count = sum(1 for metric in computed["metrics"] if metric["status"] == STATUS_UNAVAILABLE)

        readiness_v2 = {
            "metrics_ready": ready_count,
            "metrics_partial": partial_count,
            "metrics_unavailable": unavailable_count,
            "coverage_percent": int(round(((ready_count + partial_count) / total) * 100.0)),
            "overall_status": STATUS_READY
            if unavailable_count == 0
            else STATUS_PARTIAL
            if (ready_count + partial_count) > 0
            else STATUS_UNAVAILABLE,
        }

        missing_dataset_names = [
            node["display_name"]
            for node in dataset_nodes.values()
            if node["status"] == STATUS_UNAVAILABLE
        ]
        resumo_executivo = [
            f"{ready_count + partial_count} de {len(computed['metrics'])} metricas calculaveis na camada v2.",
            "Datasets disponiveis: "
            + (
                ", ".join(item["dataset_id"] for item in datasets_disponiveis)
                if datasets_disponiveis
                else "nenhum"
            )
            + ".",
        ]
        if missing_dataset_names:
            resumo_executivo.append(
                "Lacunas principais de dados: " + ", ".join(missing_dataset_names[:4]) + "."
            )

        return {
            "datasets_disponiveis": datasets_disponiveis,
            "qualidade_por_dataset": qualidade_por_dataset,
            "metricas_calculaveis": metricas_calculaveis,
            "metricas_bloqueadas": metricas_bloqueadas,
            "readiness_v2": readiness_v2,
            "resumo_executivo": resumo_executivo,
            "engine_version": self.engine_version,
        }

    def _compute_metric_without_minimum_check(
        self,
        context: dict[str, Any],
        metric_id: str,
    ) -> dict[str, Any]:
        registry_metrics = {
            str(metric["metric_id"]): metric for metric in self._metric_registry_payload["metrics"]
        }
        metric_definition = registry_metrics.get(metric_id)
        if metric_definition is None:
            return self._build_unavailable_metric(
                {
                    "metric_id": metric_id,
                    "display_name": metric_id,
                    "formula_engine": "metric_not_registered",
                    "missing_data_message": "metric_not_registered",
                },
                escopo=context["escopo"],
                missing_datasets=[],
                blocked_reason="metric_not_registered",
            )
        handler = self._metric_handlers.get(metric_id)
        if handler is None:
            return self._build_unavailable_metric(
                metric_definition,
                escopo=context["escopo"],
                missing_datasets=[],
                blocked_reason="metric_handler_not_implemented",
            )
        payload = handler(context, metric_definition)
        return self._finalize_metric(metric_definition, context, payload)

    def build_financial_scenarios(
        self,
        *,
        escopo: str = "global",
        filtros: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        scenario_ids = ["base", "conservador", "agressivo"]
        metric_field_map = [
            ("projected_revenue", "revenue"),
            ("projected_cogs", "cogs"),
            ("contribution_margin", "contribution_margin"),
            ("contribution_margin_pct", "contribution_margin_pct"),
            ("fg_working_capital", "fg_working_capital"),
            ("rm_working_capital", "rm_working_capital"),
            ("total_working_capital", "total_working_capital"),
            ("mts_incremental_investment", "mts_incremental_investment"),
            ("inventory_carrying_cost", "inventory_carrying_cost"),
        ]

        def _confidence_rank(confidence: str) -> int:
            if confidence == "high":
                return 3
            if confidence == "medium":
                return 2
            return 1

        def _rank_to_confidence(rank: int) -> str:
            if rank >= 3:
                return "high"
            if rank == 2:
                return "medium"
            return "low"

        scenarios_payload: list[dict[str, Any]] = []
        for scenario_id in scenario_ids:
            context = self._build_runtime_context(escopo=escopo, filtros=filtros, cenario=scenario_id)
            fin = self._get_financial_context(context)
            scenario_node = self._get_scenario_node(context)

            metric_nodes: dict[str, dict[str, Any]] = {}
            status_nodes: list[str] = []
            confidence_nodes: list[str] = []
            missing_data: list[str] = list(scenario_node.get("missing_data", []))
            limitations: list[str] = list(scenario_node.get("limitations", []))
            base_usada: list[str] = list(scenario_node.get("base_usada", []))

            for metric_id, field_name in metric_field_map:
                metric_contract = self._compute_metric_without_minimum_check(context, metric_id)
                metric_nodes[field_name] = metric_contract
                status_nodes.append(str(metric_contract.get("status", STATUS_PARTIAL)))
                confidence_nodes.append(str(metric_contract.get("confianca", "low")))
                missing_data.extend(_safe_list(metric_contract.get("missing_data")))
                limitations.extend(_safe_list(metric_contract.get("limitations")))
                base_usada.extend(_safe_list(metric_contract.get("base_usada")))

            scenario_delta_contract = self._compute_metric_without_minimum_check(
                context,
                "scenario_delta_financial",
            )
            status_nodes.append(str(scenario_delta_contract.get("status", STATUS_PARTIAL)))
            confidence_nodes.append(str(scenario_delta_contract.get("confianca", "low")))
            missing_data.extend(_safe_list(scenario_delta_contract.get("missing_data")))
            limitations.extend(_safe_list(scenario_delta_contract.get("limitations")))
            base_usada.extend(_safe_list(scenario_delta_contract.get("base_usada")))

            if all(status == STATUS_UNAVAILABLE for status in status_nodes):
                scenario_status = STATUS_UNAVAILABLE
            elif any(status in {STATUS_PARTIAL, STATUS_UNAVAILABLE} for status in status_nodes):
                scenario_status = STATUS_PARTIAL
            else:
                scenario_status = STATUS_READY

            if confidence_nodes:
                scenario_confidence = _rank_to_confidence(min(_confidence_rank(item) for item in confidence_nodes))
            else:
                scenario_confidence = str(scenario_node.get("confianca", "low"))

            calculation_method_parts = [
                str(scenario_node.get("calculation_method", "")).strip(),
                str(fin.get("calculation_method", "")).strip(),
            ]
            unique_methods: list[str] = []
            for method in calculation_method_parts:
                if method and method not in unique_methods:
                    unique_methods.append(method)
            calculation_method = " | ".join(unique_methods)

            scenarios_payload.append(
                {
                    "scenario_id": scenario_id,
                    "display_name": scenario_node.get("display_name", scenario_id.title()),
                    "assumptions": scenario_node.get("assumptions", {}),
                    "revenue": metric_nodes["revenue"],
                    "cogs": {
                        **metric_nodes["cogs"],
                        "components": {
                            "material_cost": float(fin.get("material_cost", 0.0)),
                            "conversion_cost": float(fin.get("conversion_cost", 0.0)),
                            "estimated_cogs": float(fin.get("estimated_cogs", 0.0)),
                            "material_cost_source": str(fin.get("material_cost_source", "unavailable")),
                            "conversion_cost_source": str(fin.get("conversion_cost_source", "unavailable")),
                            "estimated_cogs_source": str(fin.get("estimated_cogs_source", "unavailable")),
                        },
                    },
                    "contribution_margin": metric_nodes["contribution_margin"],
                    "contribution_margin_pct": metric_nodes["contribution_margin_pct"],
                    "fg_working_capital": metric_nodes["fg_working_capital"],
                    "rm_working_capital": metric_nodes["rm_working_capital"],
                    "total_working_capital": metric_nodes["total_working_capital"],
                    "mts_incremental_investment": metric_nodes["mts_incremental_investment"],
                    "inventory_carrying_cost": metric_nodes["inventory_carrying_cost"],
                    "delta_vs_base": {
                        "scenario_delta_financial": scenario_delta_contract,
                        "breakdown": scenario_node.get("delta_vs_base", {}),
                    },
                    "confianca": scenario_confidence,
                    "decision_grade": _decision_grade(scenario_status, scenario_confidence),
                    "status": scenario_status,
                    "missing_data": _merge_unique(missing_data),
                    "limitations": _merge_unique(limitations),
                    "calculation_method": calculation_method,
                    "base_usada": _merge_unique(base_usada),
                    "engine_version": self.engine_version,
                }
            )

        return {
            "base_scenario": "base",
            "escopo": escopo,
            "scenarios": scenarios_payload,
            "metricas_financeiras_suportadas": [
                "projected_revenue",
                "projected_cogs",
                "contribution_margin",
                "contribution_margin_pct",
                "fg_working_capital",
                "rm_working_capital",
                "total_working_capital",
                "mts_incremental_investment",
                "inventory_carrying_cost",
                "scenario_delta_financial",
            ],
            "engine_version": self.engine_version,
            "generated_at": _now_iso(),
        }

    # Fundamental helpers
    def _monthly_series_from_production(self, context: dict[str, Any]) -> pd.Series:
        df = context["production_df"]
        if df.empty:
            return pd.Series(dtype=float)
        grouped = (
            df.dropna(subset=["period_start"])
            .groupby("period_start", as_index=True)["produced_quantity"]
            .sum()
            .sort_index()
        )
        return grouped

    def _monthly_series_from_sales(self, context: dict[str, Any]) -> pd.Series:
        df = context["sales_df"]
        if df.empty:
            return pd.Series(dtype=float)
        grouped = (
            df.dropna(subset=["period_start"])
            .groupby("period_start", as_index=True)["order_quantity"]
            .sum()
            .sort_index()
        )
        return grouped

    def _growth_from_series(self, series: pd.Series) -> tuple[float, str, list[str], str, str]:
        limitations: list[str] = []
        if len(series) < 2:
            return 0.0, "insufficient_history", ["Historico insuficiente para comparacao temporal."], STATUS_PARTIAL, "low"
        if len(series) >= 6:
            prev = float(series.iloc[-6:-3].mean())
            recent = float(series.iloc[-3:].mean())
            window = "media_ultimos_3_vs_3_anteriores"
        else:
            prev = float(series.iloc[0])
            recent = float(series.iloc[-1])
            window = "primeiro_vs_ultimo_periodo"
            limitations.append("Historico abaixo de 6 periodos; tendencia em janela curta.")

        if prev <= 0 and recent > 0:
            growth = 100.0
            limitations.append("Base anterior sem volume positivo; crescimento tratado como 100%.")
        elif prev <= 0:
            growth = 0.0
            limitations.append("Base anterior zerada; crescimento percentual definido como 0%.")
        else:
            growth = ((recent - prev) / prev) * 100.0

        confidence = _confidence_from_periods(len(series))
        status = STATUS_READY if len(series) >= 4 else STATUS_PARTIAL
        return growth, window, limitations, status, confidence

    def _inventory_daily_consumption(self, row: dict[str, Any]) -> float:
        cons30 = _to_number(row.get("consumption_30_days"))
        cons90avg = _to_number(row.get("average_consumption_90_days"))
        if cons30 > 0:
            return cons30 / 30.0
        if cons90avg > 0:
            return cons90avg / 90.0
        return 0.0

    def _get_financial_context(self, context: dict[str, Any]) -> dict[str, Any]:
        cache = context["cache"]
        if "financial_context" in cache:
            return cache["financial_context"]

        finance_rows = context["finance_rows"]
        sales_df = context["sales_df"]
        production_df = context["production_df"]
        bom_df = context["bom_df"]
        inventory_df = context["inventory_df"]

        limitations: list[str] = []
        missing_data: list[str] = []
        base_usada: list[str] = []

        revenue, revenue_col = _extract_finance_sum(finance_rows, ["receita", "revenue", "faturamento", "sales"])
        revenue_source = "finance_documents"
        revenue_estimate_type = "documented"
        if revenue_col:
            base_usada.append("finance_documents")
        else:
            if not sales_df.empty and "price" in sales_df.columns:
                revenue = float((sales_df["order_quantity"] * sales_df["price"]).sum())
                revenue_source = "sales_orders_price_quantity_fallback"
                revenue_estimate_type = "estimated"
                base_usada.append("sales_orders")
                limitations.append(
                    "Receita projetada sem coluna direta em finance_documents; fallback por pedidos x preco."
                )
                missing_data.append("coluna_documental_receita")
            else:
                revenue_source = "unavailable"
                revenue_estimate_type = "estimated"
                limitations.append("Receita projetada indisponivel por ausencia de sinal financeiro e comercial.")
                missing_data.append("receita_projetada")

        material_cost_doc, material_col = _extract_finance_sum(
            finance_rows,
            [
                "material_cost",
                "raw material",
                "materia prima",
                "material direto",
                "material direto",
                "direct material",
            ],
        )
        conversion_cost_doc, conversion_col = _extract_finance_sum(
            finance_rows,
            [
                "conversion_cost",
                "conversao",
                "mao de obra",
                "labor",
                "overhead",
                "transformacao",
            ],
        )
        cogs_documented, cogs_col = _extract_finance_sum(finance_rows, ["cogs", "cmv", "cpv", "cost", "custo"])

        material_cost = 0.0
        material_cost_source = "unavailable"
        material_cost_estimate_type = "estimated"
        if material_col and material_cost_doc > 0:
            material_cost = material_cost_doc
            material_cost_source = "finance_documents"
            material_cost_estimate_type = "documented"
            base_usada.append("finance_documents")
        elif not bom_df.empty and not production_df.empty:
            produced = (
                production_df.groupby("product_code", as_index=False)["produced_quantity"]
                .sum()
                .rename(columns={"produced_quantity": "total_qty"})
            )
            unit_cost = (
                bom_df.assign(_line_cost=bom_df["qty_per_unit"] * bom_df["unit_cost"])
                .groupby("product_code", as_index=False)["_line_cost"]
                .sum()
                .rename(columns={"_line_cost": "unit_cost"})
            )
            merged_material = produced.merge(unit_cost, on="product_code", how="left").fillna({"unit_cost": 0.0})
            material_cost = float((merged_material["total_qty"] * merged_material["unit_cost"]).sum())
            material_cost_source = "production_bom_fallback"
            material_cost_estimate_type = "estimated"
            base_usada.extend(["production", "bom"])
            limitations.append(
                "Material_cost estimado por BOM x volume produzido por falta de abertura documental."
            )
            missing_data.append("material_cost_documented")
        elif cogs_col and cogs_documented > 0:
            material_cost = float(cogs_documented * 0.65)
            material_cost_source = "cogs_ratio_fallback"
            material_cost_estimate_type = "estimated"
            limitations.append(
                "Material_cost estimado por razao conservadora de 65% do COGS documental."
            )
            missing_data.append("material_cost_documented")
        else:
            missing_data.append("material_cost")
            limitations.append("Sem base para separar material_cost no COGS.")

        conversion_cost = 0.0
        conversion_cost_source = "unavailable"
        conversion_cost_estimate_type = "estimated"
        if conversion_col and conversion_cost_doc > 0:
            conversion_cost = conversion_cost_doc
            conversion_cost_source = "finance_documents"
            conversion_cost_estimate_type = "documented"
            base_usada.append("finance_documents")
        elif cogs_col and cogs_documented > 0 and material_cost > 0:
            conversion_cost = max(0.0, float(cogs_documented - material_cost))
            conversion_cost_source = "derived_from_cogs_minus_material"
            conversion_cost_estimate_type = "hybrid" if material_cost_estimate_type == "documented" else "estimated"
            limitations.append(
                "Conversion_cost derivado por diferenca entre COGS e material_cost por falta de abertura direta."
            )
            missing_data.append("conversion_cost_documented")
        elif material_cost > 0:
            conversion_cost = float(material_cost * 0.22)
            conversion_cost_source = "conservative_ratio_over_material_cost"
            conversion_cost_estimate_type = "estimated"
            limitations.append(
                "Conversion_cost estimado por razao conservadora de 22% sobre material_cost."
            )
            missing_data.append("conversion_cost_documented")
        else:
            missing_data.append("conversion_cost")
            limitations.append("Sem base para separar conversion_cost no COGS.")

        estimated_cogs = float(max(material_cost + conversion_cost, 0.0))
        estimated_cogs_source = f"{material_cost_source}+{conversion_cost_source}"
        estimated_cogs_estimate_type = _coalesce_estimate_type(
            [material_cost_estimate_type, conversion_cost_estimate_type]
        )

        cogs = 0.0
        cogs_source = "unavailable"
        cogs_estimate_type = "estimated"
        if cogs_col and cogs_documented > 0:
            cogs = cogs_documented
            cogs_source = "finance_documents"
            cogs_estimate_type = _coalesce_estimate_type(
                ["documented", material_cost_estimate_type, conversion_cost_estimate_type]
            )
            base_usada.append("finance_documents")
            if material_col is None or conversion_col is None:
                limitations.append(
                    "COGS documental sem abertura completa de material e conversao; composicao parcialmente estimada."
                )
        elif estimated_cogs > 0:
            cogs = estimated_cogs
            cogs_source = "estimated_material_plus_conversion"
            cogs_estimate_type = estimated_cogs_estimate_type
            limitations.append(
                "COGS projetado por material_cost + conversion_cost estimados por fallback operacional."
            )
            missing_data.append("coluna_documental_cogs")
        elif revenue > 0:
            cogs = float(revenue * 0.65)
            cogs_source = "revenue_ratio_fallback"
            cogs_estimate_type = "estimated"
            if material_cost <= 0:
                material_cost = float(cogs * 0.70)
                material_cost_source = "revenue_ratio_fallback"
                material_cost_estimate_type = "estimated"
            if conversion_cost <= 0:
                conversion_cost = float(cogs - material_cost)
                conversion_cost_source = "revenue_ratio_fallback"
                conversion_cost_estimate_type = "estimated"
            estimated_cogs = cogs
            limitations.append(
                "COGS sem sinal documental/estrutural; estimado por razao conservadora de 65% da receita."
            )
            missing_data.extend(["coluna_documental_cogs", "material_cost_documented", "conversion_cost_documented"])
        else:
            limitations.append("COGS projetado indisponivel por ausencia de sinal documental e estrutural.")
            missing_data.append("cogs_projetado")

        fg_doc, fg_col = _extract_finance_sum(
            finance_rows,
            [
                "fg_working_capital",
                "finished goods",
                "estoque fg",
                "estoque produtos acabados",
                "inventory fg",
            ],
        )
        fg_working_capital = 0.0
        fg_source = "unavailable"
        fg_estimate_type = "estimated"
        if fg_col and fg_doc > 0:
            fg_working_capital = fg_doc
            fg_source = "finance_documents"
            fg_estimate_type = "documented"
            base_usada.append("finance_documents")
        elif not production_df.empty and not bom_df.empty:
            produced = (
                production_df.groupby("product_code", as_index=False)["produced_quantity"]
                .sum()
                .rename(columns={"produced_quantity": "total_qty"})
            )
            unit_cost = (
                bom_df.assign(_line_cost=bom_df["qty_per_unit"] * bom_df["unit_cost"])
                .groupby("product_code", as_index=False)["_line_cost"]
                .sum()
                .rename(columns={"_line_cost": "unit_cost"})
            )
            merged_fg = produced.merge(unit_cost, on="product_code", how="left").fillna({"unit_cost": 0.0})
            fg_working_capital = float((merged_fg["total_qty"] * merged_fg["unit_cost"]).sum())
            fg_source = "production_bom_fallback"
            fg_estimate_type = "estimated"
            base_usada.extend(["production", "bom"])
            limitations.append("Capital de FG estimado por producao acumulada x custo unitario do BOM.")
            missing_data.append("fg_working_capital_documented")
        else:
            missing_data.append("fg_working_capital")
            limitations.append("Capital de FG estimado sem base completa de producao+BOM.")

        fx_rate_raw, fx_rate_col = _extract_finance_value(finance_rows, ["usd_brl", "fx", "cambio", "exchange rate"])
        fx_rate = 5.0
        fx_rate_source = "default_assumption"
        if fx_rate_raw is not None and fx_rate_raw > 1.0:
            fx_rate = float(fx_rate_raw)
            fx_rate_source = "finance_documents"
            base_usada.append("finance_documents")
        else:
            limitations.append("Taxa de cambio nao documentada; aplicado default conservador USD/BRL=5.0.")
            missing_data.append("fx_rate")

        rm_doc_brl, rm_doc_col = _extract_finance_sum(
            finance_rows,
            [
                "rm_working_capital",
                "raw material inventory",
                "estoque mp",
                "estoque materia prima",
                "inventory rm",
            ],
        )
        rm_working_capital_usd = 0.0
        rm_source = "unavailable"
        rm_estimate_type = "estimated"
        if not inventory_df.empty:
            inventory_df = inventory_df.copy()
            direct_cost = inventory_df["unit_net_cost_usd"].where(inventory_df["unit_net_cost_usd"] > 0)
            last_entry_cost = inventory_df["last_entry_unit_net_cost_usd"].where(
                inventory_df["last_entry_unit_net_cost_usd"] > 0
            )
            unit_cost_signal = direct_cost.fillna(last_entry_cost)
            if bool((unit_cost_signal.fillna(0.0) > 0).any()):
                rm_working_capital_usd = float((inventory_df["available_stock"] * unit_cost_signal.fillna(0.0)).sum())
                rm_source = "raw_material_inventory"
                rm_estimate_type = "hybrid" if bool(direct_cost.isna().any()) else "documented"
                base_usada.append("raw_material_inventory")
                if rm_estimate_type == "hybrid":
                    limitations.append(
                        "Parte do custo de MP veio de last_entry_unit_net_cost_usd por ausencia de unit_net_cost_usd."
                    )
                    missing_data.append("unit_net_cost_usd_partial")
            elif rm_doc_col and rm_doc_brl > 0:
                rm_working_capital_usd = float(rm_doc_brl / max(fx_rate, 0.1))
                rm_source = "finance_documents_fallback"
                rm_estimate_type = "hybrid"
                base_usada.append("finance_documents")
                limitations.append(
                    "Capital de MP sem custo unitario em estoque; fallback por valor documental convertido para USD."
                )
                missing_data.append("unit_net_cost_usd")
            else:
                missing_data.append("rm_working_capital")
                limitations.append("Capital de MP indisponivel por ausencia de custo de estoque.")
        elif rm_doc_col and rm_doc_brl > 0:
            rm_working_capital_usd = float(rm_doc_brl / max(fx_rate, 0.1))
            rm_source = "finance_documents"
            rm_estimate_type = "documented"
            base_usada.append("finance_documents")
            limitations.append("Capital de MP calculado por valor documental agregado; sem detalhe de item em estoque.")
            missing_data.append("raw_material_inventory")
        else:
            missing_data.append("rm_working_capital")
            limitations.append("Capital de MP indisponivel por ausencia de estoque de materia-prima.")

        rm_working_capital_brl = rm_working_capital_usd * fx_rate

        mts_incremental_investment = 0.0
        mts_source = "unavailable"
        mts_estimate_type = "estimated"
        if not sales_df.empty and not bom_df.empty and not production_df.empty:
            demand = sales_df.groupby("product_code", as_index=False)["order_quantity"].sum().rename(
                columns={"order_quantity": "demand_qty"}
            )
            produced = production_df.groupby("product_code", as_index=False)["produced_quantity"].sum().rename(
                columns={"produced_quantity": "produced_qty"}
            )
            unit_cost = (
                bom_df.assign(_line_cost=bom_df["qty_per_unit"] * bom_df["unit_cost"])
                .groupby("product_code", as_index=False)["_line_cost"]
                .sum()
                .rename(columns={"_line_cost": "unit_cost"})
            )
            merged = demand.merge(produced, on="product_code", how="left").merge(unit_cost, on="product_code", how="left")
            merged = merged.fillna({"produced_qty": 0.0, "unit_cost": 0.0})
            merged["positive_gap"] = (merged["demand_qty"] - merged["produced_qty"]).clip(lower=0.0)
            merged["incremental_cost"] = merged["positive_gap"] * merged["unit_cost"]
            mts_incremental_investment = float(merged["incremental_cost"].sum())
            with_cost = int((merged["unit_cost"] > 0).sum())
            mts_source = "sales_orders_production_bom"
            mts_estimate_type = "hybrid" if with_cost < len(merged) else "documented"
            base_usada.extend(["sales_orders", "production", "bom"])
            if with_cost == 0:
                limitations.append(
                    "Investimento incremental MTS sem custo unitario por SKU; valor tende a subestimar impacto."
                )
                missing_data.append("bom_unit_cost")
            elif mts_estimate_type == "hybrid":
                limitations.append(
                    "Investimento incremental MTS parcialmente estimado por lacunas de custo no BOM."
                )
                missing_data.append("bom_unit_cost_partial")
        elif not sales_df.empty and not bom_df.empty:
            demand = sales_df.groupby("product_code", as_index=False)["order_quantity"].sum().rename(
                columns={"order_quantity": "demand_qty"}
            )
            unit_cost = (
                bom_df.assign(_line_cost=bom_df["qty_per_unit"] * bom_df["unit_cost"])
                .groupby("product_code", as_index=False)["_line_cost"]
                .sum()
                .rename(columns={"_line_cost": "unit_cost"})
            )
            merged = demand.merge(unit_cost, on="product_code", how="left").fillna({"unit_cost": 0.0})
            merged["assumed_gap"] = merged["demand_qty"] * 0.20
            merged["incremental_cost"] = merged["assumed_gap"] * merged["unit_cost"]
            mts_incremental_investment = float(merged["incremental_cost"].sum())
            mts_source = "sales_orders_bom_assumed_gap_20pct"
            mts_estimate_type = "estimated"
            base_usada.extend(["sales_orders", "bom"])
            limitations.append(
                "Investimento incremental MTS estimado sem producao: gap assumido em 20% da demanda."
            )
            missing_data.append("production")
        else:
            missing_data.append("mts_incremental_investment")
            limitations.append("Investimento incremental MTS indisponivel sem base integrada de vendas/BOM.")

        carrying_rate_raw, carrying_rate_col = _extract_finance_value(
            finance_rows,
            ["carrying_cost_rate", "holding rate", "taxa carrying", "taxa carregamento"],
        )
        carrying_cost_rate = _normalize_rate(carrying_rate_raw, default=0.18)
        carrying_cost_rate_source = "finance_documents" if carrying_rate_col else "default_assumption"
        if carrying_cost_rate_source == "finance_documents":
            base_usada.append("finance_documents")
        else:
            missing_data.append("carrying_cost_rate")
            limitations.append("Taxa de carrying nao documentada; aplicado default de 18% ao ano.")

        total_working_capital = fg_working_capital + rm_working_capital_brl
        carrying_cost = total_working_capital * carrying_cost_rate
        contribution_margin = revenue - cogs
        contribution_margin_pct = (contribution_margin / revenue * 100.0) if revenue > 0 else 0.0

        contribution_estimate_type = _coalesce_estimate_type([revenue_estimate_type, cogs_estimate_type])
        total_working_capital_estimate_type = _coalesce_estimate_type(
            [fg_estimate_type, rm_estimate_type]
        )
        carrying_cost_estimate_type = _coalesce_estimate_type(
            [total_working_capital_estimate_type, "documented" if carrying_rate_col else "estimated"]
        )

        estimate_type_by_metric = {
            "projected_revenue": revenue_estimate_type,
            "revenue": revenue_estimate_type,
            "projected_cogs": cogs_estimate_type,
            "cogs": cogs_estimate_type,
            "contribution_margin": contribution_estimate_type,
            "contribution_margin_pct": contribution_estimate_type,
            "fg_working_capital": fg_estimate_type,
            "rm_working_capital": rm_estimate_type,
            "total_working_capital": total_working_capital_estimate_type,
            "mts_incremental_investment": mts_estimate_type,
            "inventory_carrying_cost": carrying_cost_estimate_type,
            "scenario_delta_financial": contribution_estimate_type,
        }

        confidence = "high"
        critical_estimate_types = {
            revenue_estimate_type,
            cogs_estimate_type,
            total_working_capital_estimate_type,
        }
        if "estimated" in critical_estimate_types:
            confidence = "medium"
        elif "hybrid" in critical_estimate_types:
            confidence = "medium"
        if revenue_source == "unavailable" or cogs_source == "unavailable":
            confidence = "low"
        if len(_merge_unique(missing_data)) >= 4:
            confidence = "low"

        status = STATUS_READY if confidence == "high" and len(_merge_unique(missing_data)) <= 1 else STATUS_PARTIAL
        calculation_method = (
            "financial_context_v2: receita via finance_documents com fallback comercial; "
            "cogs por abertura material/conversao; capital de giro FG/MP; investimento incremental MTS; "
            "carrying aplicado sobre capital total."
        )

        scenario_payload = build_financial_scenarios(
            base_revenue=revenue,
            base_cogs=cogs,
            base_total_working_capital=total_working_capital,
            base_confidence=confidence,
            base_limitations=limitations,
            base_fg_working_capital=fg_working_capital,
            base_rm_working_capital=rm_working_capital_brl,
            base_mts_incremental_investment=mts_incremental_investment,
            carrying_cost_rate=carrying_cost_rate,
            base_missing_data=_merge_unique(missing_data),
            base_base_usada=_merge_unique(base_usada),
            base_calculation_method=calculation_method,
        )

        payload = {
            "projected_revenue": revenue,
            "projected_revenue_source": revenue_source,
            "projected_cogs": cogs,
            "projected_cogs_source": cogs_source,
            "material_cost": material_cost,
            "material_cost_source": material_cost_source,
            "conversion_cost": conversion_cost,
            "conversion_cost_source": conversion_cost_source,
            "estimated_cogs": estimated_cogs,
            "estimated_cogs_source": estimated_cogs_source,
            "contribution_margin": contribution_margin,
            "contribution_margin_pct": contribution_margin_pct,
            "fg_working_capital": fg_working_capital,
            "fg_working_capital_source": fg_source,
            "rm_working_capital_usd": rm_working_capital_usd,
            "rm_working_capital_source": rm_source,
            "rm_working_capital_brl": rm_working_capital_brl,
            "total_working_capital": total_working_capital,
            "mts_incremental_investment": mts_incremental_investment,
            "mts_incremental_investment_source": mts_source,
            "inventory_carrying_cost": carrying_cost,
            "carrying_cost_rate": carrying_cost_rate,
            "carrying_cost_rate_source": carrying_cost_rate_source,
            "fx_rate": fx_rate,
            "fx_rate_source": fx_rate_source,
            "confidence": confidence,
            "status": status,
            "decision_grade": _decision_grade(status, confidence),
            "calculation_method": calculation_method,
            "estimate_type_by_metric": estimate_type_by_metric,
            "limitations": _merge_unique(limitations),
            "missing_data": _merge_unique(missing_data),
            "base_usada": _merge_unique(base_usada),
            "scenario_payload": scenario_payload,
        }
        cache["financial_context"] = payload
        return payload

    def _get_scenario_node(self, context: dict[str, Any]) -> dict[str, Any]:
        fin = self._get_financial_context(context)
        scenario_name = context["cenario"]
        return fin["scenario_payload"]["scenarios"].get(
            scenario_name, fin["scenario_payload"]["scenarios"]["base"]
        )

    # Metric handlers - Operacional
    def _metric_production_volume(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["production_df"]
        total = float(df["produced_quantity"].sum()) if not df.empty else 0.0
        confidence = "high" if len(df) >= 12 else "medium" if len(df) >= 3 else "low"
        return {
            "value": total,
            "base_usada": ["production"],
            "status": STATUS_READY if len(df) > 0 else STATUS_UNAVAILABLE,
            "confianca": confidence,
            "decision_grade": _decision_grade(STATUS_READY if len(df) > 0 else STATUS_UNAVAILABLE, confidence),
            "missing_data": [],
            "observacoes": [f"linhas_producao={len(df)}"],
            "limitations": [],
            "calculation_method": metric["formula_engine"],
        }

    def _metric_production_trend(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        series = self._monthly_series_from_production(context)
        growth, window, limitations, status, confidence = self._growth_from_series(series)
        return {
            "value": growth,
            "base_usada": ["production"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [],
            "observacoes": [f"janela={window}", f"periodos={len(series)}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
        }

    def _metric_operational_seasonality(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        series = self._monthly_series_from_production(context)
        if len(series) < 2:
            return {
                "value": 0.0,
                "base_usada": ["production"],
                "status": STATUS_PARTIAL,
                "confianca": "low",
                "decision_grade": "C",
                "missing_data": ["periodos_mensais_producao"],
                "observacoes": [],
                "limitations": ["Historico mensal insuficiente para sazonalidade."],
                "calculation_method": metric["formula_engine"],
            }
        mean_value = float(series.mean())
        std_value = float(series.std(ddof=0))
        cv_percent = (std_value / mean_value * 100.0) if mean_value > 0 else 0.0
        confidence = "high" if len(series) >= 12 else "medium" if len(series) >= 6 else "low"
        status = STATUS_READY if len(series) >= 6 else STATUS_PARTIAL
        limitations = []
        if status == STATUS_PARTIAL:
            limitations.append("Sazonalidade calculada com janela curta (<6 periodos).")
        return {
            "value": cv_percent,
            "base_usada": ["production"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [],
            "observacoes": [f"periodos={len(series)}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
        }

    def _metric_abc_operational(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["production_df"]
        grouped = df.groupby("product_code", as_index=False)["produced_quantity"].sum()
        grouped = grouped.sort_values("produced_quantity", ascending=False)
        if grouped.empty:
            return {
                "value": 0.0,
                "base_usada": ["production"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["product_code", "produced_quantity"],
                "observacoes": [],
                "limitations": ["Sem distribuicao por produto para curva ABC operacional."],
                "calculation_method": metric["formula_engine"],
            }
        total = float(grouped["produced_quantity"].sum())
        top_n = max(1, int(math.ceil(len(grouped) * 0.2)))
        top_share = float(grouped.head(top_n)["produced_quantity"].sum() / total * 100.0) if total > 0 else 0.0
        confidence = "high" if len(grouped) >= 20 else "medium" if len(grouped) >= 5 else "low"
        status = STATUS_READY if len(grouped) >= 5 else STATUS_PARTIAL
        return {
            "value": top_share,
            "base_usada": ["production"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [],
            "observacoes": [f"top_n={top_n}", f"skus={len(grouped)}"],
            "limitations": ["Curva ABC com baixa amostra de SKUs."] if status == STATUS_PARTIAL else [],
            "calculation_method": metric["formula_engine"],
        }

    def _metric_xyz_operational(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["production_df"]
        if df.empty or "period_start" not in df.columns:
            return {
                "value": 0.0,
                "base_usada": ["production"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["period_start", "produced_quantity"],
                "observacoes": [],
                "limitations": ["Sem historico temporal por SKU para classificar XYZ."],
                "calculation_method": metric["formula_engine"],
            }

        grouped = (
            df.dropna(subset=["period_start"])
            .groupby(["product_code", "period_start"], as_index=False)["produced_quantity"]
            .sum()
        )
        if grouped.empty:
            return {
                "value": 0.0,
                "base_usada": ["production"],
                "status": STATUS_PARTIAL,
                "confianca": "low",
                "decision_grade": "C",
                "missing_data": ["period_start"],
                "observacoes": [],
                "limitations": ["Sem periodos validos para leitura XYZ."],
                "calculation_method": metric["formula_engine"],
            }

        product_stats = grouped.groupby("product_code")["produced_quantity"].agg(["mean", "std", "count"]).reset_index()
        product_stats = product_stats[product_stats["count"] >= 2].copy()
        if product_stats.empty:
            return {
                "value": 0.0,
                "base_usada": ["production"],
                "status": STATUS_PARTIAL,
                "confianca": "low",
                "decision_grade": "C",
                "missing_data": ["periodos_por_produto"],
                "observacoes": [],
                "limitations": ["Poucos periodos por SKU para classificar variabilidade XYZ."],
                "calculation_method": metric["formula_engine"],
            }

        product_stats["cv"] = product_stats.apply(
            lambda row: float(row["std"]) / float(row["mean"]) if float(row["mean"]) > 0 else 0.0,
            axis=1,
        )
        product_stats["xyz_class"] = product_stats["cv"].apply(
            lambda value: "Z" if value > 1.0 else "Y" if value > 0.5 else "X"
        )
        total_products = len(product_stats)
        z_count = int((product_stats["xyz_class"] == "Z").sum())
        z_share = float((z_count / total_products) * 100.0) if total_products > 0 else 0.0
        status = STATUS_READY if total_products >= 5 else STATUS_PARTIAL
        confidence = "high" if int(product_stats["count"].median()) >= 6 else "medium"
        if total_products < 5:
            confidence = "low"
        return {
            "value": z_share,
            "base_usada": ["production"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [],
            "observacoes": [
                f"produtos={total_products}",
                f"distribuicao=X:{int((product_stats['xyz_class']=='X').sum())}|Y:{int((product_stats['xyz_class']=='Y').sum())}|Z:{z_count}",
            ],
            "limitations": ["Baixa amostra de SKUs para estabilidade XYZ."] if status == STATUS_PARTIAL else [],
            "calculation_method": metric["formula_engine"],
        }

    def _metric_operational_risk(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        trend_metric = self._metric_production_trend(context, metric)
        xyz_metric = self._metric_xyz_operational(context, metric)
        seasonality_metric = self._metric_operational_seasonality(context, metric)
        trend_value = _to_number(trend_metric["value"])
        z_share = _to_number(xyz_metric["value"])
        seasonality = _to_number(seasonality_metric["value"])
        risk_score = min(100.0, max(0.0, max(0.0, -trend_value) * 0.8 + z_share * 0.5 + seasonality * 0.2))
        confidence = "medium"
        if trend_metric["confianca"] == "high" and xyz_metric["confianca"] in {"high", "medium"}:
            confidence = "high"
        if trend_metric["status"] == STATUS_PARTIAL or xyz_metric["status"] == STATUS_PARTIAL:
            confidence = "medium" if confidence == "high" else confidence
        status = STATUS_READY if trend_metric["status"] == STATUS_READY else STATUS_PARTIAL
        return {
            "value": risk_score,
            "base_usada": ["production"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": _merge_unique(trend_metric["missing_data"] + xyz_metric["missing_data"]),
            "observacoes": [f"trend={trend_value:.2f}%", f"z_share={z_share:.2f}%"],
            "limitations": _merge_unique(trend_metric["limitations"] + xyz_metric["limitations"]),
            "calculation_method": metric["formula_engine"],
        }

    # Metric handlers - Comercial
    def _metric_sales_volume(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["sales_df"]
        total = float(df["order_quantity"].sum()) if not df.empty else 0.0
        confidence = "high" if len(df) >= 12 else "medium" if len(df) >= 3 else "low"
        return {
            "value": total,
            "base_usada": ["sales_orders"],
            "status": STATUS_READY if len(df) > 0 else STATUS_UNAVAILABLE,
            "confianca": confidence,
            "decision_grade": _decision_grade(STATUS_READY if len(df) > 0 else STATUS_UNAVAILABLE, confidence),
            "missing_data": [],
            "observacoes": [f"linhas_sales_orders={len(df)}"],
            "limitations": [],
            "calculation_method": metric["formula_engine"],
        }

    def _metric_sales_growth(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        series = self._monthly_series_from_sales(context)
        growth, window, limitations, status, confidence = self._growth_from_series(series)
        return {
            "value": growth,
            "base_usada": ["sales_orders"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [],
            "observacoes": [f"janela={window}", f"periodos={len(series)}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
        }

    def _metric_customer_mix(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["sales_df"].copy()
        if df.empty:
            return {
                "value": 0.0,
                "base_usada": ["sales_orders"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["sales_orders"],
                "observacoes": [],
                "limitations": ["Sem carteira de pedidos para mix de clientes."],
                "calculation_method": metric["formula_engine"],
            }
        customer_key = "customer_code" if bool((df["customer_code"] != "").any()) else "customer_name"
        grouped = df.groupby(customer_key, as_index=False)["order_quantity"].sum().sort_values(
            "order_quantity", ascending=False
        )
        total = float(grouped["order_quantity"].sum())
        top_share = float(grouped.iloc[0]["order_quantity"] / total * 100.0) if total > 0 else 0.0
        confidence = "high" if customer_key == "customer_code" else "medium"
        limitations: list[str] = []
        if customer_key != "customer_code":
            limitations.append("Mix de clientes calculado por nome por ausencia de customer_code consistente.")
        return {
            "value": top_share,
            "base_usada": ["sales_orders"],
            "status": STATUS_READY,
            "confianca": confidence,
            "decision_grade": _decision_grade(STATUS_READY, confidence),
            "missing_data": [],
            "observacoes": [f"cliente_lider={_safe_text(grouped.iloc[0][customer_key])}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": "fallback_to_customer_name_if_code_missing"
            if customer_key != "customer_code"
            else None,
        }

    def _metric_product_mix(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["sales_df"]
        grouped = df.groupby("product_code", as_index=False)["order_quantity"].sum().sort_values(
            "order_quantity", ascending=False
        )
        if grouped.empty:
            return {
                "value": 0.0,
                "base_usada": ["sales_orders"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["sales_orders"],
                "observacoes": [],
                "limitations": ["Sem dados por SKU na carteira comercial."],
                "calculation_method": metric["formula_engine"],
            }
        total = float(grouped["order_quantity"].sum())
        top_share = float(grouped.iloc[0]["order_quantity"] / total * 100.0) if total > 0 else 0.0
        confidence = "high" if len(grouped) >= 10 else "medium"
        status = STATUS_READY if len(grouped) >= 3 else STATUS_PARTIAL
        return {
            "value": top_share,
            "base_usada": ["sales_orders"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [],
            "observacoes": [f"sku_lider={_safe_text(grouped.iloc[0]['product_code'])}"],
            "limitations": ["Poucos SKUs para mix robusto."] if status == STATUS_PARTIAL else [],
            "calculation_method": metric["formula_engine"],
        }

    def _metric_sales_concentration(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["sales_df"]
        if df.empty:
            return {
                "value": 0.0,
                "base_usada": ["sales_orders"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["sales_orders"],
                "observacoes": [],
                "limitations": ["Sem carteira comercial para concentracao."],
                "calculation_method": metric["formula_engine"],
            }
        customer_key = "customer_code" if bool((df["customer_code"] != "").any()) else "customer_name"
        grouped = df.groupby(customer_key, as_index=False)["order_quantity"].sum()
        total = float(grouped["order_quantity"].sum())
        if total <= 0:
            return {
                "value": 0.0,
                "base_usada": ["sales_orders"],
                "status": STATUS_PARTIAL,
                "confianca": "low",
                "decision_grade": "C",
                "missing_data": ["order_quantity"],
                "observacoes": [],
                "limitations": ["Volume comercial sem sinal positivo para concentracao."],
                "calculation_method": metric["formula_engine"],
            }
        grouped["share"] = grouped["order_quantity"] / total
        hhi = float(((grouped["share"] * 100.0) ** 2).sum())
        confidence = "high" if customer_key == "customer_code" else "medium"
        return {
            "value": hhi,
            "base_usada": ["sales_orders"],
            "status": STATUS_READY,
            "confianca": confidence,
            "decision_grade": _decision_grade(STATUS_READY, confidence),
            "missing_data": [],
            "observacoes": [f"clientes={len(grouped)}"],
            "limitations": ["HHI calculado por customer_name por ausencia de customer_code."]
            if customer_key != "customer_code"
            else [],
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": "fallback_to_customer_name_if_code_missing"
            if customer_key != "customer_code"
            else None,
        }

    def _metric_abc_commercial(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        df = context["sales_df"]
        grouped = df.groupby("product_code", as_index=False)["order_quantity"].sum().sort_values(
            "order_quantity", ascending=False
        )
        if grouped.empty:
            return {
                "value": 0.0,
                "base_usada": ["sales_orders"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["sales_orders"],
                "observacoes": [],
                "limitations": ["Sem dados comerciais por SKU para curva ABC."],
                "calculation_method": metric["formula_engine"],
            }
        total = float(grouped["order_quantity"].sum())
        top_n = max(1, int(math.ceil(len(grouped) * 0.2)))
        top_share = float(grouped.head(top_n)["order_quantity"].sum() / total * 100.0) if total > 0 else 0.0
        confidence = "high" if len(grouped) >= 20 else "medium" if len(grouped) >= 5 else "low"
        status = STATUS_READY if len(grouped) >= 5 else STATUS_PARTIAL
        return {
            "value": top_share,
            "base_usada": ["sales_orders"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [],
            "observacoes": [f"top_n={top_n}", f"skus={len(grouped)}"],
            "limitations": ["Amostra comercial pequena para ABC robusto."] if status == STATUS_PARTIAL else [],
            "calculation_method": metric["formula_engine"],
        }

    # Metric handlers - S&OP Integrado
    def _metric_demand_vs_operation_gap(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        production_total = float(context["production_df"]["produced_quantity"].sum())
        sales_total = float(context["sales_df"]["order_quantity"].sum())
        absolute_gap = sales_total - production_total
        if sales_total > 0:
            gap_pct = (absolute_gap / sales_total) * 100.0
        else:
            gap_pct = 0.0
        confidence = "high" if len(context["production_df"]) >= 6 and len(context["sales_df"]) >= 6 else "medium"
        return {
            "value": gap_pct,
            "base_usada": ["production", "sales_orders"],
            "status": STATUS_READY,
            "confianca": confidence,
            "decision_grade": _decision_grade(STATUS_READY, confidence),
            "missing_data": [],
            "observacoes": [f"gap_absoluto={absolute_gap:,.2f}"],
            "limitations": ["Demanda total zerada no recorte selecionado."] if sales_total <= 0 else [],
            "calculation_method": metric["formula_engine"],
        }

    def _metric_service_risk(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        gap_metric = self._metric_demand_vs_operation_gap(context, metric)
        gap_value = max(0.0, _to_number(gap_metric["value"]))
        inventory_df = context["inventory_df"]
        rupture_share = 0.0
        status = STATUS_READY
        confidence = "high" if gap_metric["confianca"] == "high" else "medium"
        limitations: list[str] = []
        if inventory_df.empty:
            status = STATUS_PARTIAL
            confidence = "medium"
            limitations.append("Sem estoque de MP para reforcar score de risco de atendimento.")
        else:
            at_risk = (
                (inventory_df["available_stock"] + inventory_df["on_order_stock"] < inventory_df["safety_stock"])
                | (
                    (inventory_df["reorder_point"] > 0)
                    & (inventory_df["available_stock"] + inventory_df["on_order_stock"] < inventory_df["reorder_point"])
                )
            )
            rupture_share = float(at_risk.mean() * 100.0) if len(inventory_df) > 0 else 0.0
        service_risk = min(100.0, gap_value * 1.2 + rupture_share * 0.8)
        return {
            "value": service_risk,
            "base_usada": ["production", "sales_orders", "raw_material_inventory"]
            if not inventory_df.empty
            else ["production", "sales_orders"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": ["raw_material_inventory"] if inventory_df.empty else [],
            "observacoes": [f"gap_pct={gap_value:.2f}", f"rupture_share={rupture_share:.2f}%"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": "partial_without_inventory_signal" if inventory_df.empty else None,
        }

    def _metric_mts_mto_recommendation(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        gap_metric = self._metric_demand_vs_operation_gap(context, metric)
        xyz_metric = self._metric_xyz_operational(context, metric)
        gap_pct = _to_number(gap_metric["value"])
        z_share = _to_number(xyz_metric["value"])
        recommendation = "Hibrido MTS/MTO"
        reason = "Gap e variabilidade equilibrados."
        if gap_pct > 12 or z_share >= 55:
            recommendation = "Priorizar MTO"
            reason = "Pressao de demanda ou variabilidade elevada."
        elif gap_pct < -8 and z_share <= 30:
            recommendation = "Priorizar MTS"
            reason = "Capacidade superior a demanda e variabilidade controlada."
        has_supply_signal = not context["inventory_df"].empty and not context["bom_df"].empty
        confidence = "high" if has_supply_signal else "medium"
        status = STATUS_READY if has_supply_signal else STATUS_PARTIAL
        limitations = []
        if not has_supply_signal:
            limitations.append("Recomendacao sem sinal completo de abastecimento (BOM/estoque MP).")
        return {
            "value": recommendation,
            "base_usada": ["production", "sales_orders", "raw_material_inventory", "bom"]
            if has_supply_signal
            else ["production", "sales_orders"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [] if has_supply_signal else ["raw_material_inventory", "bom"],
            "observacoes": [reason, f"gap_pct={gap_pct:.2f}", f"z_share={z_share:.2f}%"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": "textual_recommendation_with_limited_inputs"
            if not has_supply_signal
            else None,
        }

    def _metric_scenario_priority(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        operational_risk = _to_number(self._metric_operational_risk(context, metric)["value"])
        commercial_hhi = _to_number(self._metric_sales_concentration(context, metric)["value"])
        supply_risk = (
            _to_number(self._metric_rupture_risk(context, metric)["value"])
            if not context["inventory_df"].empty
            else 0.0
        )
        financial = self._get_financial_context(context)
        margin_pct = _to_number(financial["contribution_margin_pct"])
        financial_pressure = max(0.0, 35.0 - margin_pct) * 2.0 if margin_pct < 35 else 5.0

        scores = {
            "Operacional": operational_risk,
            "Comercial": min(100.0, commercial_hhi / 100.0),
            "Abastecimento": min(100.0, supply_risk * 1.2),
            "Financeiro": min(100.0, financial_pressure),
        }
        priority = max(scores.items(), key=lambda item: item[1])[0]
        has_finance_dataset = bool(context["dataset_nodes"]["finance_documents"]["uploaded"])
        confidence = "high" if has_finance_dataset and not context["inventory_df"].empty else "medium"
        status = STATUS_READY if confidence == "high" else STATUS_PARTIAL
        limitations = []
        missing_data: list[str] = []
        if status == STATUS_PARTIAL:
            if context["inventory_df"].empty:
                missing_data.append("raw_material_inventory")
                limitations.append("Priorizacao sem camada completa de risco de abastecimento.")
            if not has_finance_dataset:
                missing_data.append("finance_documents")
                limitations.append("Priorizacao sem camada financeira documental completa.")
        return {
            "value": priority,
            "base_usada": ["production", "sales_orders"]
            + ([] if context["inventory_df"].empty else ["raw_material_inventory"])
            + (["finance_documents"] if has_finance_dataset else []),
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": missing_data,
            "observacoes": [f"scores={scores}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
        }

    # Metric handlers - Supply
    def _metric_raw_material_coverage(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        inventory_df = context["inventory_df"]
        if inventory_df.empty:
            return {
                "value": 0.0,
                "base_usada": ["raw_material_inventory"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["raw_material_inventory"],
                "observacoes": [],
                "limitations": ["Sem estoque de materia-prima para calcular cobertura."],
                "calculation_method": metric["formula_engine"],
            }
        coverage_values: list[float] = []
        fallback_values: list[float] = []
        for _, row in inventory_df.iterrows():
            daily = self._inventory_daily_consumption(row.to_dict())
            available = _to_number(row.get("available_stock"))
            if daily > 0:
                coverage_values.append(available / daily)
            else:
                safety = _to_number(row.get("safety_stock"))
                if safety > 0:
                    fallback_values.append((available / safety) * 30.0)
        if coverage_values:
            value = float(sum(coverage_values) / len(coverage_values))
            status = STATUS_READY
            confidence = "high" if len(coverage_values) >= 10 else "medium"
            limitations = []
            fallback = None
        elif fallback_values:
            value = float(sum(fallback_values) / len(fallback_values))
            status = STATUS_PARTIAL
            confidence = "low"
            limitations = ["Cobertura estimada por relacao estoque/safety_stock por falta de consumo."]
            fallback = "use_stock_vs_safety_ratio_when_consumption_missing"
        else:
            value = 0.0
            status = STATUS_PARTIAL
            confidence = "low"
            limitations = ["Sem sinal de consumo ou safety_stock para cobertura."]
            fallback = "use_available_columns_for_daily_consumption"
        return {
            "value": value,
            "base_usada": ["raw_material_inventory"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [] if coverage_values or fallback_values else ["consumption_30_days", "average_consumption_90_days"],
            "observacoes": [f"itens_cobertura={len(coverage_values)}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": fallback,
        }

    def _metric_rupture_risk(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        inventory_df = context["inventory_df"]
        if inventory_df.empty:
            return {
                "value": 0.0,
                "base_usada": ["raw_material_inventory"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["raw_material_inventory"],
                "observacoes": [],
                "limitations": ["Sem estoque de materia-prima para risco de ruptura."],
                "calculation_method": metric["formula_engine"],
            }
        available_plus_order = inventory_df["available_stock"] + inventory_df["on_order_stock"]
        safety_signal = inventory_df["safety_stock"] > 0
        reorder_signal = inventory_df["reorder_point"] > 0
        at_risk = (safety_signal & (available_plus_order < inventory_df["safety_stock"])) | (
            reorder_signal & (available_plus_order < inventory_df["reorder_point"])
        )
        if not bool((safety_signal | reorder_signal).any()):
            return {
                "value": 0.0,
                "base_usada": ["raw_material_inventory"],
                "status": STATUS_PARTIAL,
                "confianca": "low",
                "decision_grade": "C",
                "missing_data": ["safety_stock", "reorder_point"],
                "observacoes": [],
                "limitations": ["Sem sinais de safety_stock/reorder_point para classificar ruptura."],
                "calculation_method": metric["formula_engine"],
            }
        risk_pct = float(at_risk.mean() * 100.0)
        confidence = "high" if bool(safety_signal.any()) else "medium"
        return {
            "value": risk_pct,
            "base_usada": ["raw_material_inventory"],
            "status": STATUS_READY,
            "confianca": confidence,
            "decision_grade": _decision_grade(STATUS_READY, confidence),
            "missing_data": [],
            "observacoes": [f"itens_em_risco={int(at_risk.sum())}", f"itens_total={len(inventory_df)}"],
            "limitations": [],
            "calculation_method": metric["formula_engine"],
        }

    def _metric_excess_risk(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        inventory_df = context["inventory_df"]
        if inventory_df.empty:
            return {
                "value": 0.0,
                "base_usada": ["raw_material_inventory"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": ["raw_material_inventory"],
                "observacoes": [],
                "limitations": ["Sem estoque de materia-prima para risco de excesso."],
                "calculation_method": metric["formula_engine"],
            }
        excess_flags: list[bool] = []
        used_coverage = False
        for _, row in inventory_df.iterrows():
            row_dict = row.to_dict()
            daily = self._inventory_daily_consumption(row_dict)
            available = _to_number(row_dict.get("available_stock"))
            safety = _to_number(row_dict.get("safety_stock"))
            is_excess = False
            if daily > 0:
                coverage = available / daily
                is_excess = coverage > 180
                used_coverage = True
            elif safety > 0:
                is_excess = available > safety * 3
            excess_flags.append(bool(is_excess))
        excess_pct = float(sum(1 for item in excess_flags if item) / len(excess_flags) * 100.0) if excess_flags else 0.0
        status = STATUS_READY if used_coverage else STATUS_PARTIAL
        confidence = "high" if used_coverage else "medium"
        limitations = [] if used_coverage else ["Risco de excesso estimado por estoque vs safety_stock."]
        return {
            "value": excess_pct,
            "base_usada": ["raw_material_inventory"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [] if used_coverage else ["consumption_30_days", "average_consumption_90_days"],
            "observacoes": [f"itens_total={len(excess_flags)}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": "use_stock_vs_safety_ratio_when_consumption_missing"
            if not used_coverage
            else None,
        }

    def _metric_mts_incremental_inventory_requirement(
        self, context: dict[str, Any], metric: dict[str, Any]
    ) -> dict[str, Any]:
        sales_df = context["sales_df"]
        production_df = context["production_df"]
        bom_df = context["bom_df"]
        if sales_df.empty or production_df.empty or bom_df.empty:
            missing: list[str] = []
            if sales_df.empty:
                missing.append("sales_orders")
            if production_df.empty:
                missing.append("production")
            if bom_df.empty:
                missing.append("bom")
            return {
                "value": 0.0,
                "base_usada": ["sales_orders", "production", "bom"],
                "status": STATUS_UNAVAILABLE,
                "confianca": "low",
                "decision_grade": "D",
                "missing_data": missing,
                "observacoes": [],
                "limitations": ["Sem base integrada para investimento incremental de MTS."],
                "calculation_method": metric["formula_engine"],
            }
        demand = sales_df.groupby("product_code", as_index=False)["order_quantity"].sum().rename(
            columns={"order_quantity": "demand_qty"}
        )
        produced = production_df.groupby("product_code", as_index=False)["produced_quantity"].sum().rename(
            columns={"produced_quantity": "produced_qty"}
        )
        unit_cost = (
            bom_df.assign(_line_cost=bom_df["qty_per_unit"] * bom_df["unit_cost"])
            .groupby("product_code", as_index=False)["_line_cost"]
            .sum()
            .rename(columns={"_line_cost": "unit_cost"})
        )
        merged = demand.merge(produced, on="product_code", how="left").merge(unit_cost, on="product_code", how="left")
        merged = merged.fillna({"produced_qty": 0.0, "unit_cost": 0.0})
        merged["positive_gap"] = (merged["demand_qty"] - merged["produced_qty"]).clip(lower=0)
        merged["incremental_cost"] = merged["positive_gap"] * merged["unit_cost"]
        value = float(merged["incremental_cost"].sum())
        with_cost = int((merged["unit_cost"] > 0).sum())
        status = STATUS_READY if with_cost > 0 else STATUS_PARTIAL
        confidence = "high" if with_cost >= max(1, int(len(merged) * 0.6)) else "medium"
        limitations = [] if status == STATUS_READY else ["Lacunas de custo no BOM reduzem confianca do investimento incremental."]
        return {
            "value": value,
            "base_usada": ["production", "sales_orders", "bom"],
            "status": status,
            "confianca": confidence,
            "decision_grade": _decision_grade(status, confidence),
            "missing_data": [] if with_cost > 0 else ["unit_cost_bom"],
            "observacoes": [f"produtos_gap_positivo={int((merged['positive_gap'] > 0).sum())}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": "partial_without_full_cost_signal" if status == STATUS_PARTIAL else None,
        }

    # Metric handlers - Financeiro Executivo
    def _metric_projected_revenue(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["projected_revenue_source"] == "finance_documents" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        scenario_decision = str(scenario_node.get("decision_grade") or _decision_grade(status, scenario_confidence))
        return {
            "value": float(scenario_node.get("projected_revenue", scenario_node.get("revenue", 0.0))),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": scenario_decision,
            "missing_data": fin["missing_data"],
            "observacoes": [f"source={fin['projected_revenue_source']}", f"cenario={context['cenario']}"],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": fin["projected_revenue_source"]
            if fin["projected_revenue_source"] != "finance_documents"
            else None,
            "estimate_type": fin["estimate_type_by_metric"].get("projected_revenue", "estimated"),
        }

    def _metric_projected_cogs(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["projected_cogs_source"] == "finance_documents" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        scenario_decision = str(scenario_node.get("decision_grade") or _decision_grade(status, scenario_confidence))
        return {
            "value": float(scenario_node.get("projected_cogs", scenario_node.get("cogs", 0.0))),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": scenario_decision,
            "missing_data": fin["missing_data"],
            "observacoes": [
                f"source={fin['projected_cogs_source']}",
                f"material_cost={float(fin.get('material_cost', 0.0)):,.2f}",
                f"conversion_cost={float(fin.get('conversion_cost', 0.0)):,.2f}",
                f"estimated_cogs={float(fin.get('estimated_cogs', 0.0)):,.2f}",
                f"cenario={context['cenario']}",
            ],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": fin["projected_cogs_source"]
            if fin["projected_cogs_source"] != "finance_documents"
            else None,
            "estimate_type": fin["estimate_type_by_metric"].get("projected_cogs", "estimated"),
        }

    def _metric_contribution_margin(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["confidence"] == "high" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        scenario_decision = str(scenario_node.get("decision_grade") or _decision_grade(status, scenario_confidence))
        return {
            "value": float(scenario_node.get("contribution_margin", 0.0)),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": scenario_decision,
            "missing_data": fin["missing_data"],
            "observacoes": [f"cenario={context['cenario']}"],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "estimate_type": fin["estimate_type_by_metric"].get("contribution_margin", "estimated"),
        }

    def _metric_contribution_margin_pct(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["confidence"] == "high" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        scenario_decision = str(scenario_node.get("decision_grade") or _decision_grade(status, scenario_confidence))
        return {
            "value": float(scenario_node.get("contribution_margin_pct", 0.0)),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": scenario_decision,
            "missing_data": fin["missing_data"],
            "observacoes": [f"cenario={context['cenario']}"],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "estimate_type": fin["estimate_type_by_metric"].get("contribution_margin_pct", "estimated"),
        }

    def _metric_fg_working_capital(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["fg_working_capital_source"] != "unavailable" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        return {
            "value": float(scenario_node.get("fg_working_capital", fin["fg_working_capital"])),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": _decision_grade(status, scenario_confidence),
            "missing_data": fin["missing_data"],
            "observacoes": [f"source={fin['fg_working_capital_source']}", f"cenario={context['cenario']}"],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "fallback_strategy_applied": fin["fg_working_capital_source"]
            if fin["fg_working_capital_source"] != "unavailable"
            else None,
            "estimate_type": fin["estimate_type_by_metric"].get("fg_working_capital", "estimated"),
        }

    def _metric_rm_working_capital(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["rm_working_capital_source"] != "unavailable" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        return {
            "value": float(scenario_node.get("rm_working_capital", fin["rm_working_capital_usd"])),
            "base_usada": ["raw_material_inventory"] if fin["rm_working_capital_source"] != "unavailable" else [],
            "status": status,
            "confianca": scenario_confidence if status == STATUS_READY else "low",
            "decision_grade": _decision_grade(status, scenario_confidence if status == STATUS_READY else "low"),
            "missing_data": fin["missing_data"],
            "observacoes": [f"source={fin['rm_working_capital_source']}"],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "estimate_type": fin["estimate_type_by_metric"].get("rm_working_capital", "estimated"),
        }

    def _metric_total_working_capital(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["confidence"] == "high" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        scenario_decision = str(scenario_node.get("decision_grade") or _decision_grade(status, scenario_confidence))
        return {
            "value": float(scenario_node.get("total_working_capital", 0.0)),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": scenario_decision,
            "missing_data": fin["missing_data"],
            "observacoes": [f"cenario={context['cenario']}"],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "estimate_type": fin["estimate_type_by_metric"].get("total_working_capital", "estimated"),
        }

    def _metric_mts_incremental_investment(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["mts_incremental_investment_source"] != "unavailable" else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        scenario_decision = str(scenario_node.get("decision_grade") or _decision_grade(status, scenario_confidence))
        return {
            "value": float(scenario_node.get("mts_incremental_investment", fin.get("mts_incremental_investment", 0.0))),
            "base_usada": fin["base_usada"] or ["sales_orders", "production", "bom"],
            "status": status,
            "confianca": scenario_confidence if status == STATUS_READY else "low",
            "decision_grade": scenario_decision if status == STATUS_READY else _decision_grade(status, "low"),
            "missing_data": fin["missing_data"],
            "observacoes": [f"source={fin['mts_incremental_investment_source']}", f"cenario={context['cenario']}"],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "estimate_type": fin["estimate_type_by_metric"].get("mts_incremental_investment", "estimated"),
        }

    def _metric_inventory_carrying_cost(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        scenario_node = self._get_scenario_node(context)
        fin = self._get_financial_context(context)
        status = STATUS_READY if fin["confidence"] in {"high", "medium"} else STATUS_PARTIAL
        scenario_confidence = str(scenario_node.get("confianca") or scenario_node.get("confidence") or fin["confidence"])
        scenario_decision = str(scenario_node.get("decision_grade") or _decision_grade(status, scenario_confidence))
        return {
            "value": float(scenario_node.get("inventory_carrying_cost", 0.0)),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": scenario_decision,
            "missing_data": fin["missing_data"],
            "observacoes": [
                f"taxa_carrying={float(fin.get('carrying_cost_rate', 0.18)) * 100:.2f}%",
                f"cenario={context['cenario']}",
            ],
            "limitations": fin["limitations"],
            "calculation_method": metric["formula_engine"],
            "estimate_type": fin["estimate_type_by_metric"].get("inventory_carrying_cost", "estimated"),
        }

    def _metric_scenario_delta_financial(self, context: dict[str, Any], metric: dict[str, Any]) -> dict[str, Any]:
        fin = self._get_financial_context(context)
        scenario_name = context["cenario"]
        selected = fin["scenario_payload"]["scenarios"][scenario_name]
        delta_node = selected.get("delta_vs_base", {})
        delta = _to_number(delta_node.get("scenario_delta_financial", delta_node.get("contribution_margin", 0.0)))
        status = STATUS_READY if scenario_name != "base" and fin["confidence"] == "high" else STATUS_PARTIAL
        limitations = list(fin["limitations"])
        if scenario_name == "base":
            limitations.append("Delta financeiro no cenario base e naturalmente zero.")
        scenario_confidence = str(selected.get("confianca") or selected.get("confidence") or fin["confidence"])
        return {
            "value": float(delta),
            "base_usada": fin["base_usada"] or ["finance_documents"],
            "status": status,
            "confianca": scenario_confidence,
            "decision_grade": _decision_grade(status, scenario_confidence),
            "missing_data": fin["missing_data"],
            "observacoes": [f"cenario={scenario_name}", f"delta_vs_base_margin={delta:,.2f}"],
            "limitations": limitations,
            "calculation_method": metric["formula_engine"],
            "estimate_type": fin["estimate_type_by_metric"].get("scenario_delta_financial", "estimated"),
        }


analytics_engine_v2 = AnalyticsEngineV2()
