from __future__ import annotations

from typing import Any, Dict

import pandas as pd


def build_raw_material_forecast(items: list[Dict[str, Any]], bom_df: pd.DataFrame) -> pd.DataFrame:
    if not items:
        return pd.DataFrame(
            columns=[
                "product_code",
                "forecast_demand",
                "raw_material_code",
                "raw_material_required",
            ]
        )

    if bom_df.empty:
        raise ValueError("BOM is empty. Upload BOM before calculating raw material forecast.")

    demand_rows = []
    for raw in items:
        product_code = str(raw.get("product_code", "")).strip()
        if not product_code:
            continue
        demand_value = raw.get("forecast_demand")
        if demand_value is None:
            demand_value = raw.get("final_forecast")
        demand_rows.append(
            {
                "product_code": product_code,
                "forecast_demand": float(demand_value or 0.0),
            }
        )

    if not demand_rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "forecast_demand",
                "raw_material_code",
                "raw_material_required",
            ]
        )

    demand_df = pd.DataFrame(demand_rows)
    merged = demand_df.merge(
        bom_df[["product_code", "raw_material_code", "qty_per_unit"]],
        on="product_code",
        how="left",
    )

    missing_bom = sorted(merged[merged["raw_material_code"].isna()]["product_code"].unique().tolist())
    if missing_bom:
        raise ValueError(f"Missing BOM definition for products: {missing_bom}")

    merged["raw_material_required"] = merged["forecast_demand"] * merged["qty_per_unit"]

    out = merged[["product_code", "forecast_demand", "raw_material_code", "raw_material_required"]].copy()
    out["forecast_demand"] = out["forecast_demand"].astype(float)
    out["raw_material_required"] = out["raw_material_required"].astype(float)
    return out.reset_index(drop=True)
