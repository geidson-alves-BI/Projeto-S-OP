from __future__ import annotations

from typing import Any, Dict

import numpy as np
import pandas as pd


def _moving_average(row: pd.Series) -> float:
    return (
        0.4 * float(row["last_30_days"])
        + 0.3 * float(row["last_90_days"])
        + 0.2 * float(row["last_180_days"])
        + 0.1 * float(row["last_365_days"])
    )


def _seasonal_adjustment(base_forecast: float, monthly_history: list[float] | None) -> tuple[float, float]:
    if not monthly_history:
        return 1.0, base_forecast

    arr = np.array(monthly_history, dtype=float)
    if arr.size == 0:
        return 1.0, base_forecast

    annual_avg = float(arr.mean()) if arr.size else 0.0
    if annual_avg <= 0:
        return 1.0, base_forecast

    window = min(3, arr.size)
    monthly_avg = float(arr[-window:].mean())
    seasonal_index = monthly_avg / annual_avg if annual_avg else 1.0
    return seasonal_index, base_forecast * seasonal_index


def _linear_trend_forecast(monthly_history: list[float] | None, fallback: float) -> float:
    if not monthly_history or len(monthly_history) < 2:
        return fallback

    y = np.array(monthly_history, dtype=float)
    x = np.arange(1, len(y) + 1, dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    next_t = float(len(y) + 1)
    forecast = intercept + slope * next_t
    return max(0.0, float(forecast))


def build_demand_forecast(items: list[Dict[str, Any]]) -> pd.DataFrame:
    if not items:
        return pd.DataFrame(
            columns=[
                "product_code",
                "moving_average_forecast",
                "seasonal_index",
                "seasonal_forecast",
                "trend_forecast",
                "final_forecast",
            ]
        )

    rows: list[dict[str, Any]] = []
    for raw in items:
        product_code = str(raw.get("product_code", "")).strip()
        if not product_code:
            continue

        last_30 = float(raw.get("last_30_days", 0.0) or 0.0)
        last_90 = float(raw.get("last_90_days", 0.0) or 0.0)
        last_180 = float(raw.get("last_180_days", 0.0) or 0.0)
        last_365 = float(raw.get("last_365_days", 0.0) or 0.0)

        monthly_history = raw.get("monthly_history")
        if monthly_history is not None:
            monthly_history = [float(v) for v in monthly_history]

        moving_average = 0.4 * last_30 + 0.3 * last_90 + 0.2 * last_180 + 0.1 * last_365
        seasonal_index, seasonal_forecast = _seasonal_adjustment(moving_average, monthly_history)
        trend_forecast = _linear_trend_forecast(monthly_history, moving_average)
        final_forecast = (
            0.5 * moving_average
            + 0.3 * seasonal_forecast
            + 0.2 * trend_forecast
        )

        rows.append(
            {
                "product_code": product_code,
                "moving_average_forecast": float(moving_average),
                "seasonal_index": float(seasonal_index),
                "seasonal_forecast": float(seasonal_forecast),
                "trend_forecast": float(trend_forecast),
                "final_forecast": float(final_forecast),
            }
        )

    return pd.DataFrame(rows)
