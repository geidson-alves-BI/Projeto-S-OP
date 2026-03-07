from __future__ import annotations

from typing import Any, Dict

import pandas as pd


BOM_COLUMNS = [
    "product_code",
    "raw_material_code",
    "raw_material_name",
    "qty_per_unit",
    "unit_cost",
]


def normalize_bom_rows(
    rows: list[Dict[str, Any]],
    product_code_col: str,
    raw_material_code_col: str,
    raw_material_name_col: str,
    qty_per_unit_col: str,
    unit_cost_col: str,
) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=BOM_COLUMNS)

    df = pd.DataFrame(rows)
    required = [
        product_code_col,
        raw_material_code_col,
        raw_material_name_col,
        qty_per_unit_col,
        unit_cost_col,
    ]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing BOM columns: {missing}")

    bom = df[required].copy().rename(
        columns={
            product_code_col: "product_code",
            raw_material_code_col: "raw_material_code",
            raw_material_name_col: "raw_material_name",
            qty_per_unit_col: "qty_per_unit",
            unit_cost_col: "unit_cost",
        }
    )

    bom["product_code"] = bom["product_code"].astype(str).str.strip()
    bom["raw_material_code"] = bom["raw_material_code"].astype(str).str.strip()
    bom["raw_material_name"] = bom["raw_material_name"].astype(str).str.strip()
    bom["qty_per_unit"] = pd.to_numeric(bom["qty_per_unit"], errors="coerce").fillna(0.0)
    bom["unit_cost"] = pd.to_numeric(bom["unit_cost"], errors="coerce").fillna(0.0)

    bom = bom[(bom["product_code"] != "") & (bom["raw_material_code"] != "")]
    bom = bom.reset_index(drop=True)
    return bom
