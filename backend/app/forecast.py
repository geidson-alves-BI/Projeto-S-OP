import pandas as pd

def forecast_naive(df: pd.DataFrame, sku_col: str, qty_col: str, date_col: str, horizon_months: int, growth: float):
    d = df.copy()
    d = d.sort_values([sku_col, date_col])
    last = d.groupby(sku_col).tail(1)[[sku_col, qty_col]].rename(columns={qty_col: "last_qty"})

    last["forecast_base_total"] = last["last_qty"] * horizon_months
    last["forecast_total"] = last["forecast_base_total"] * (1.0 + growth)
    last["method"] = "naive_last"
    return last