import pandas as pd

from .analytics_v2.abc_xyz_rules import classify_abc, classify_xyz
from .utils import safe_div

def compute_abcxyz(df: pd.DataFrame, sku_col: str, qty_col: str, cost_col: str):
    d = df.copy()
    d["value"] = d[qty_col].astype(float) * d[cost_col].astype(float)

    agg = d.groupby(sku_col, as_index=False).agg(
        annual_qty=(qty_col, "sum"),
        annual_value=("value", "sum"),
        mean=(qty_col, "mean"),
        std=(qty_col, "std"),
    )
    agg["std"] = agg["std"].fillna(0.0)
    agg["cv"] = agg.apply(lambda r: safe_div(r["std"], r["mean"]), axis=1)

    total_value = agg["annual_value"].sum() if agg["annual_value"].sum() != 0 else 1.0
    agg["share_value"] = agg["annual_value"] / total_value

    agg = agg.sort_values("share_value", ascending=False)
    agg["cum_share_value"] = agg["share_value"].cumsum()
    agg["abc"] = agg["cum_share_value"].apply(classify_abc)
    agg["xyz"] = agg["cv"].apply(classify_xyz)

    return agg.reset_index(drop=True)
