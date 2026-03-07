from __future__ import annotations

from typing import Any, Dict

import pandas as pd


def simulate_mts_production(
    items: list[Dict[str, Any]],
    bom_df: pd.DataFrame,
    mts_codes: set[str] | None = None,
) -> pd.DataFrame:
    if not items:
        return pd.DataFrame(
            columns=[
                "product_code",
                "production_qty",
                "raw_material_code",
                "raw_material_required",
                "raw_material_cost",
                "total_production_cost",
            ]
        )

    required_cols = {"product_code", "forecast_demand"}
    rows_df = pd.DataFrame(items)
    missing = required_cols.difference(rows_df.columns)
    if missing:
        raise ValueError(f"Missing simulation columns: {sorted(missing)}")

    rows_df = rows_df[["product_code", "forecast_demand"]].copy()
    rows_df["product_code"] = rows_df["product_code"].astype(str).str.strip()
    rows_df["production_qty"] = pd.to_numeric(rows_df["forecast_demand"], errors="coerce").fillna(0.0)
    rows_df = rows_df.drop(columns=["forecast_demand"])

    if mts_codes is not None:
        invalid = sorted(set(rows_df["product_code"]) - set(mts_codes))
        if invalid:
            raise ValueError(
                f"Products are not classified as MTS in the latest strategic report: {invalid}"
            )

    if bom_df.empty:
        raise ValueError("BOM is empty. Upload BOM before running production simulation.")

    merged = rows_df.merge(
        bom_df[["product_code", "raw_material_code", "qty_per_unit", "unit_cost"]],
        on="product_code",
        how="left",
    )

    no_bom = sorted(merged[merged["raw_material_code"].isna()]["product_code"].unique().tolist())
    if no_bom:
        raise ValueError(f"Missing BOM definition for products: {no_bom}")

    merged["raw_material_required"] = merged["production_qty"] * merged["qty_per_unit"]
    merged["raw_material_cost"] = merged["raw_material_required"] * merged["unit_cost"]
    merged["total_production_cost"] = merged.groupby("product_code")["raw_material_cost"].transform("sum")

    out = merged[
        [
            "product_code",
            "production_qty",
            "raw_material_code",
            "raw_material_required",
            "raw_material_cost",
            "total_production_cost",
        ]
    ].copy()

    for col in ["production_qty", "raw_material_required", "raw_material_cost", "total_production_cost"]:
        out[col] = out[col].astype(float)

    return out.reset_index(drop=True)
