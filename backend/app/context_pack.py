from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _records_from_snapshot(session_snapshot: dict[str, Any], key: str) -> list[dict[str, Any]]:
    node = session_snapshot.get(key, {})
    if not isinstance(node, dict):
        return []
    data = node.get("data", [])
    if not isinstance(data, list):
        return []
    return [row for row in data if isinstance(row, dict)]


def _as_dataframe(records: list[dict[str, Any]]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame()
    return pd.DataFrame(records)


def _sorted_by_numeric(df: pd.DataFrame, column: str, ascending: bool = False) -> pd.DataFrame:
    if column not in df.columns:
        return df
    sorted_df = df.copy()
    sorted_df[column] = pd.to_numeric(sorted_df[column], errors="coerce")
    return sorted_df.sort_values(column, ascending=ascending, na_position="last")


def _to_records(df: pd.DataFrame, columns: list[str], top_n: int | None = None) -> list[dict[str, Any]]:
    if df.empty:
        return []
    available = [col for col in columns if col in df.columns]
    if not available:
        return []
    selected = df[available]
    if top_n is not None:
        selected = selected.head(top_n)
    return selected.to_dict(orient="records")


def _top_products(strategy_df: pd.DataFrame) -> list[dict[str, Any]]:
    if strategy_df.empty:
        return []
    sorted_df = _sorted_by_numeric(strategy_df, "total_sales", ascending=False)
    return _to_records(
        sorted_df,
        [
            "product_code",
            "product_name",
            "total_sales",
            "abc_class",
            "xyz_class",
            "recommended_strategy",
        ],
        top_n=10,
    )


def _strategy_products(strategy_df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, int]:
    if strategy_df.empty or "recommended_strategy" not in strategy_df.columns:
        return [], [], 0, 0

    sorted_df = _sorted_by_numeric(strategy_df, "total_sales", ascending=False)
    strategy_series = sorted_df["recommended_strategy"].astype(str).str.upper()
    mts_df = sorted_df[strategy_series == "MTS"]
    mto_df = sorted_df[strategy_series == "MTO"]

    columns = [
        "product_code",
        "product_name",
        "total_sales",
        "recommended_stock",
        "abc_class",
        "xyz_class",
        "recommended_strategy",
    ]
    mts_products = _to_records(mts_df, columns, top_n=20)
    mto_products = _to_records(mto_df, columns, top_n=20)
    return mts_products, mto_products, int(len(mts_df)), int(len(mto_df))


def _forecast_summary(forecast_df: pd.DataFrame) -> dict[str, Any]:
    if forecast_df.empty or "final_forecast" not in forecast_df.columns:
        return {}

    df = forecast_df.copy()
    df["final_forecast"] = pd.to_numeric(df["final_forecast"], errors="coerce")
    valid = df["final_forecast"].dropna()
    if valid.empty:
        return {
            "products": int(df["product_code"].nunique() if "product_code" in df.columns else len(df)),
            "total_forecast": 0.0,
            "total_final_forecast": 0.0,
            "top_forecast_products": [],
            "distribution": {},
            "flags": ["forecast_all_nan"],
        }

    sorted_df = df.sort_values("final_forecast", ascending=False, na_position="last")
    top_forecast_products = _to_records(sorted_df, ["product_code", "final_forecast"], top_n=10)

    zero_count = int((df["final_forecast"].fillna(0) == 0).sum())
    nan_count = int(df["final_forecast"].isna().sum())
    flags: list[str] = []
    if zero_count > 0:
        flags.append("forecast_zero_values")
    if nan_count > 0:
        flags.append("forecast_nan_values")

    total_forecast = float(valid.sum())
    mean_forecast = float(valid.mean())
    max_forecast = float(valid.max())
    min_forecast = float(valid.min())
    median_forecast = float(valid.median())

    return {
        "products": int(df["product_code"].nunique() if "product_code" in df.columns else len(df)),
        "total_forecast": total_forecast,
        "total_final_forecast": total_forecast,
        "avg_final_forecast": mean_forecast,
        "max_final_forecast": max_forecast,
        "min_final_forecast": min_forecast,
        "top_forecast_products": top_forecast_products,
        "distribution": {
            "mean": mean_forecast,
            "median": median_forecast,
            "max": max_forecast,
            "min": min_forecast,
            "zero_count": zero_count,
            "nan_count": nan_count,
        },
        "flags": flags,
    }


def _raw_material_impact(raw_material_df: pd.DataFrame) -> dict[str, Any]:
    if raw_material_df.empty or "raw_material_code" not in raw_material_df.columns:
        return {}

    value_col = "raw_material_required" if "raw_material_required" in raw_material_df.columns else None
    if value_col is None:
        return {}

    df = raw_material_df.copy()
    df[value_col] = pd.to_numeric(df[value_col], errors="coerce").fillna(0.0)
    grouped = (
        df.groupby("raw_material_code", as_index=False)[value_col]
        .sum()
        .rename(columns={value_col: "total_required"})
        .sort_values("total_required", ascending=False)
    )

    top_raw_materials = grouped.head(15).to_dict(orient="records")
    critical_raw_materials = grouped.head(5).to_dict(orient="records")

    return {
        "materials": int(grouped["raw_material_code"].nunique()),
        "total_required": float(grouped["total_required"].sum()),
        "top_raw_materials": top_raw_materials,
        "critical_raw_materials": critical_raw_materials,
        "top_materials": grouped.head(10).to_dict(orient="records"),
    }


def _financial_impact(
    simulation_df: pd.DataFrame,
    simulation_snapshot: dict[str, Any],
) -> dict[str, Any]:
    if simulation_df.empty:
        totals = simulation_snapshot.get("totals", {})
        if isinstance(totals, dict) and totals:
            return {
                "products_simulated": int(totals.get("products_simulated", 0)),
                "total_cost": float(totals.get("total_cost", 0.0)),
                "average_cost": float(totals.get("average_cost_per_product", 0.0)),
                "total_production_cost": float(totals.get("total_cost", 0.0)),
                "total_raw_material_cost": float(totals.get("total_raw_material_cost", 0.0)),
                "top_cost_products": [],
            }
        return {}

    df = simulation_df.copy()
    if "total_production_cost" not in df.columns or "product_code" not in df.columns:
        return {}

    per_product = (
        df[["product_code", "total_production_cost"]]
        .drop_duplicates()
        .copy()
    )
    per_product["total_production_cost"] = pd.to_numeric(per_product["total_production_cost"], errors="coerce").fillna(0.0)
    per_product = per_product.sort_values("total_production_cost", ascending=False)

    total_cost = float(per_product["total_production_cost"].sum())
    avg_cost = float(per_product["total_production_cost"].mean()) if not per_product.empty else 0.0
    total_raw_material_cost = (
        float(pd.to_numeric(df["raw_material_cost"], errors="coerce").fillna(0.0).sum())
        if "raw_material_cost" in df.columns
        else 0.0
    )

    return {
        "products_simulated": int(per_product["product_code"].nunique()),
        "total_cost": total_cost,
        "average_cost": avg_cost,
        "total_production_cost": total_cost,
        "total_raw_material_cost": total_raw_material_cost,
        "top_cost_products": per_product.head(10).to_dict(orient="records"),
    }


def _build_quality(
    has_strategy: bool,
    has_forecast: bool,
    has_bom: bool,
    has_simulation: bool,
    has_raw_material: bool,
) -> tuple[dict[str, Any], dict[str, bool]]:
    flags: list[str] = []
    if not has_strategy:
        flags.append("missing_strategy_report")
    if not has_forecast:
        flags.append("missing_forecast")
    if not has_bom:
        flags.append("missing_bom")
    if not has_simulation:
        flags.append("missing_mts_simulation")
    if not has_raw_material:
        flags.append("missing_raw_material_forecast")

    inputs_available = {
        "strategy_report": has_strategy,
        "forecast": has_forecast,
        "bom": has_bom,
        "mts_simulation": has_simulation,
        "raw_material_forecast": has_raw_material,
    }
    data_quality = {
        "flags": flags,
        "status": "ok" if not flags else "partial",
    }
    return data_quality, inputs_available


def build_context_pack(session_snapshot: dict[str, Any]) -> dict[str, Any]:
    strategy_records = _records_from_snapshot(session_snapshot, "last_strategy_report")
    forecast_records = _records_from_snapshot(session_snapshot, "last_forecast")
    raw_material_records = _records_from_snapshot(session_snapshot, "last_raw_material_forecast")
    mts_sim_records = _records_from_snapshot(session_snapshot, "last_mts_simulation")
    bom_status = session_snapshot.get("bom_status", {})
    if not isinstance(bom_status, dict):
        bom_status = {}

    strategy_df = _as_dataframe(strategy_records)
    forecast_df = _as_dataframe(forecast_records)
    raw_material_df = _as_dataframe(raw_material_records)
    simulation_df = _as_dataframe(mts_sim_records)

    top_products = _top_products(strategy_df)
    mts_products, mto_products, mts_count, mto_count = _strategy_products(strategy_df)
    forecast_summary = _forecast_summary(forecast_df)
    raw_material_impact = _raw_material_impact(raw_material_df)
    financial_impact = _financial_impact(
        simulation_df,
        session_snapshot.get("last_mts_simulation", {}),
    )

    has_strategy = bool(strategy_records)
    has_forecast = bool(forecast_records)
    has_bom = bool(bom_status.get("loaded", False))
    has_simulation = bool(mts_sim_records)
    has_raw_material = bool(raw_material_records)
    data_quality, inputs_available = _build_quality(
        has_strategy=has_strategy,
        has_forecast=has_forecast,
        has_bom=has_bom,
        has_simulation=has_simulation,
        has_raw_material=has_raw_material,
    )

    return {
        "top_products": top_products,
        "mts_products": mts_products,
        "mto_products": mto_products,
        "mts_count": mts_count,
        "mto_count": mto_count,
        "forecast_summary": forecast_summary,
        "raw_material_impact": raw_material_impact,
        "financial_impact": financial_impact,
        "data_quality": data_quality,
        "generated_at": _now_iso(),
        "inputs_available": inputs_available,
    }
