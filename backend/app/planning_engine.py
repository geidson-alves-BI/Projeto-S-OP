from __future__ import annotations

from datetime import datetime, timezone
from io import StringIO
from math import sqrt
from typing import Any, Literal

import numpy as np
import pandas as pd
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing, Holt, SimpleExpSmoothing
    HAS_STATSMODELS = True
except Exception:
    ExponentialSmoothing = None  # type: ignore[assignment]
    Holt = None  # type: ignore[assignment]
    SimpleExpSmoothing = None  # type: ignore[assignment]
    HAS_STATSMODELS = False

ForecastMethod = Literal[
    "moving_average",
    "weighted_moving_average",
    "simple_exponential_smoothing",
    "holt_trend",
    "holt_winters_additive",
    "holt_winters_multiplicative",
    "historical_baseline_growth",
]

FORECAST_METHODS: tuple[ForecastMethod, ...] = (
    "moving_average",
    "weighted_moving_average",
    "simple_exponential_smoothing",
    "holt_trend",
    "holt_winters_additive",
    "holt_winters_multiplicative",
    "historical_baseline_growth",
)

GROUP_COLUMN_CANDIDATES = (
    "product_group",
    "group_description",
    "group",
    "grupo_produto",
    "product_family",
)
CLASS_COLUMN_CANDIDATES = (
    "abc_class",
    "product_class",
    "classe_abc",
    "class_abc",
    "classeabc",
)

RISK_LEVEL_THRESHOLDS: list[dict[str, Any]] = [
    {"key": "low", "label": "baixo", "min": 0.0, "max": 30.0, "color_token": "success"},
    {"key": "moderate", "label": "moderado", "min": 30.0, "max": 55.0, "color_token": "warning"},
    {"key": "high", "label": "alto", "min": 55.0, "max": 75.0, "color_token": "destructive"},
    {"key": "critical", "label": "critico", "min": 75.0, "max": 100.01, "color_token": "destructive"},
]

RISK_COMPONENT_LABELS: dict[str, str] = {
    "class_criticality": "Criticidade da classe ABC",
    "growth": "Crescimento projetado",
    "confidence": "Risco de confianca do forecast",
    "coverage": "Cobertura/estoque",
    "concentration": "Concentracao de clientes",
    "value_volume": "Impacto de valor/volume",
    "criticality": "Criticidade integrada",
}

RISK_WEIGHTS_DEFAULT: dict[str, dict[str, float]] = {
    "operational": {
        "class_criticality": 0.25,
        "growth": 0.25,
        "confidence": 0.25,
        "coverage": 0.25,
    },
    "commercial": {
        "growth": 0.30,
        "concentration": 0.30,
        "value_volume": 0.20,
        "confidence": 0.20,
    },
    "integrated": {
        "criticality": 0.20,
        "growth": 0.20,
        "concentration": 0.20,
        "confidence": 0.20,
        "coverage": 0.20,
    },
}

CLASS_CRITICALITY: dict[str, float] = {
    "A": 1.0,
    "B": 0.65,
    "C": 0.35,
    "UNCLASSIFIED": 0.55,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_number(value: Any) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        if np.isnan(value):
            return 0.0
        return float(value)

    raw = str(value or "").strip()
    if not raw:
        return 0.0

    normalized = raw.replace(" ", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        normalized = normalized.replace(",", ".")
    elif normalized.count(".") > 1:
        normalized = normalized.replace(".", "")

    try:
        parsed = float(normalized)
    except ValueError:
        return 0.0
    if np.isnan(parsed):
        return 0.0
    return float(parsed)


def _to_optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if np.isnan(value):
            return None
        return bool(value)

    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in {"sim", "s", "yes", "y", "true", "t", "1"}:
        return True
    if raw in {"nao", "não", "n", "no", "false", "f", "0"}:
        return False
    return None


def _to_month_start(value: Any) -> pd.Timestamp | None:
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    ts = pd.Timestamp(parsed)
    if ts.tzinfo is not None:
        ts = ts.tz_localize(None)
    return ts.to_period("M").to_timestamp()


def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    if denominator == 0:
        return float(default)
    return float(numerator / denominator)


def _clamp01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return float(value)


def _weighted_average(values: list[float], weights: list[float], default: float = 0.0) -> float:
    if not values or not weights:
        return float(default)
    valid: list[tuple[float, float]] = []
    for value, weight in zip(values, weights):
        if not np.isfinite(value) or not np.isfinite(weight):
            continue
        if weight <= 0:
            continue
        valid.append((float(value), float(weight)))
    if not valid:
        return float(default)
    numerator = sum(value * weight for value, weight in valid)
    denominator = sum(weight for _, weight in valid)
    if denominator <= 0:
        return float(default)
    return float(numerator / denominator)


def _weighted_average_from_series(
    values: pd.Series,
    weights: pd.Series,
    default: float = 0.0,
) -> float:
    values_list = [float(_to_number(value)) for value in values.tolist()]
    weights_list = [max(float(_to_number(weight)), 0.0) for weight in weights.tolist()]
    return _weighted_average(values_list, weights_list, default=default)


def _normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    positive = {key: max(float(value), 0.0) for key, value in weights.items()}
    total = sum(positive.values())
    if total <= 0:
        count = max(len(positive), 1)
        return {key: (1.0 / count) for key in positive}
    return {key: value / total for key, value in positive.items()}


def _score_components(
    components: dict[str, float],
    weights: dict[str, float],
) -> tuple[float, dict[str, float], str]:
    normalized_weights = _normalize_weights(weights)
    weighted_components: dict[str, float] = {}
    for key, weight in normalized_weights.items():
        component_value = _clamp01(float(components.get(key, 0.0)))
        weighted_components[key] = component_value * float(weight) * 100.0

    score = float(sum(weighted_components.values()))
    if weighted_components:
        top_key = max(weighted_components.keys(), key=lambda key: weighted_components[key])
    else:
        top_key = "growth"
    return score, weighted_components, top_key


def _risk_level(score: float) -> tuple[str, str]:
    safe_score = float(score)
    for level in RISK_LEVEL_THRESHOLDS:
        minimum = float(level.get("min", 0.0))
        maximum = float(level.get("max", 100.0))
        if safe_score >= minimum and safe_score < maximum:
            return str(level.get("key", "moderate")), str(level.get("label", "moderado"))
    return "critical", "critico"


def _confidence_from_mape(mape: float | None, fallback: float = 0.55) -> float:
    if mape is None or not np.isfinite(float(mape)):
        return _clamp01(fallback)
    safe_mape = max(float(mape), 0.0)
    if safe_mape <= 10.0:
        return 0.93
    if safe_mape <= 20.0:
        return 0.82
    if safe_mape <= 35.0:
        return 0.68
    if safe_mape <= 50.0:
        return 0.54
    return 0.38


def _confidence_label(score: float) -> str:
    safe_score = _clamp01(score)
    if safe_score >= 0.80:
        return "alta"
    if safe_score >= 0.62:
        return "moderada"
    return "baixa"


def _class_criticality(value: str) -> float:
    parsed = str(value or "").strip().upper()
    if parsed in CLASS_CRITICALITY:
        return CLASS_CRITICALITY[parsed]
    return CLASS_CRITICALITY["UNCLASSIFIED"]


def _coverage_risk_score(
    coverage_days: float | None,
    risk_status: str,
    *,
    mts_coverage_days: int,
    mtu_coverage_days: int,
    excess_multiplier: float,
) -> float:
    risk_key = str(risk_status or "").strip().lower()
    if risk_key == "rupture_risk":
        return 1.0
    if risk_key == "excess_risk":
        return 0.72
    if risk_key == "missing_stock_data":
        return 0.78

    if coverage_days is None or not np.isfinite(float(coverage_days)):
        return 0.70

    coverage_value = max(float(coverage_days), 0.0)
    mtu_limit = max(float(mtu_coverage_days), 1.0)
    mts_limit = max(float(mts_coverage_days), mtu_limit)
    excess_limit = mts_limit * max(float(excess_multiplier), 1.0)

    if coverage_value < mtu_limit:
        return 0.92
    if coverage_value < mts_limit:
        return 0.66
    if coverage_value > excess_limit:
        return 0.60
    return 0.28


def _growth_risk_from_pct(growth_pct: float, reference: float) -> float:
    positive_growth = max(float(growth_pct), 0.0)
    safe_reference = max(float(reference), 5.0)
    return _clamp01(positive_growth / safe_reference)


def _first_existing_column(df: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    return None


def _mode_or_default(series: pd.Series, default: str) -> str:
    clean = (
        series.astype(str)
        .str.strip()
        .replace({"": np.nan, "None": np.nan, "nan": np.nan})
        .dropna()
    )
    if clean.empty:
        return default
    return str(clean.mode().iloc[0]).strip() or default


def _normalize_growth_map(raw: dict[str, float] | None) -> dict[str, float]:
    if not raw:
        return {}
    normalized: dict[str, float] = {}
    for key, value in raw.items():
        parsed_key = str(key or "").strip()
        if not parsed_key:
            continue
        normalized[parsed_key] = float(_to_number(value))
    return normalized


def _sanitize_class(value: Any) -> str | None:
    raw = str(value or "").strip().upper()
    if raw in {"A", "B", "C"}:
        return raw
    return None


def _derive_abc_by_volume(df: pd.DataFrame) -> dict[str, str]:
    if df.empty:
        return {}
    grouped = (
        df.groupby("product_code", as_index=False)["order_quantity"]
        .sum()
        .rename(columns={"order_quantity": "total_quantity"})
        .sort_values("total_quantity", ascending=False)
    )
    total = float(grouped["total_quantity"].sum()) or 1.0
    grouped["share"] = grouped["total_quantity"] / total
    grouped["cum_share"] = grouped["share"].cumsum()

    out: dict[str, str] = {}
    for row in grouped.to_dict(orient="records"):
        cum_share = float(row["cum_share"])
        if cum_share <= 0.80:
            out[str(row["product_code"])] = "A"
        elif cum_share <= 0.95:
            out[str(row["product_code"])] = "B"
        else:
            out[str(row["product_code"])] = "C"
    return out


def _build_customer_lookup(customers_rows: list[dict[str, Any]] | None) -> pd.DataFrame:
    if not customers_rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "customer_code",
                "customer_name",
                "product_group",
                "abc_class",
            ]
        )

    frame = pd.DataFrame(customers_rows)
    if frame.empty:
        return pd.DataFrame(
            columns=[
                "product_code",
                "customer_code",
                "customer_name",
                "product_group",
                "abc_class",
            ]
        )

    for required_column in ("product_code", "customer_code", "customer_name"):
        if required_column not in frame.columns:
            frame[required_column] = ""

    group_column = _first_existing_column(frame, GROUP_COLUMN_CANDIDATES)
    class_column = _first_existing_column(frame, CLASS_COLUMN_CANDIDATES)

    frame["product_group"] = (
        frame[group_column].astype(str).str.strip() if group_column else ""
    )
    frame["abc_class"] = (
        frame[class_column].map(_sanitize_class) if class_column else np.nan
    )
    frame["product_code"] = frame["product_code"].astype(str).str.strip()
    frame["customer_code"] = frame["customer_code"].astype(str).str.strip()
    frame["customer_name"] = frame["customer_name"].astype(str).str.strip()

    selected = frame[
        ["product_code", "customer_code", "customer_name", "product_group", "abc_class"]
    ].copy()
    selected = selected[
        (selected["product_code"] != "")
        & ((selected["customer_code"] != "") | (selected["customer_name"] != ""))
    ]
    if selected.empty:
        return selected

    selected = selected.sort_values(
        ["product_code", "customer_code", "customer_name"]
    ).drop_duplicates(["product_code", "customer_code", "customer_name"], keep="first")
    return selected.reset_index(drop=True)


def build_sales_dataframe(
    sales_rows: list[dict[str, Any]],
    customers_rows: list[dict[str, Any]] | None = None,
) -> tuple[pd.DataFrame, list[str], dict[str, Any]]:
    if not sales_rows:
        raise ValueError(
            "Sem dados de vendas. Carregue a base 'sales_orders' na central de upload."
        )

    frame = pd.DataFrame(sales_rows)
    required_columns = [
        "product_code",
        "order_date",
        "order_quantity",
        "customer_code",
        "customer_name",
        "price",
    ]
    missing_columns = [column for column in required_columns if column not in frame.columns]
    if missing_columns:
        raise ValueError(
            "A base de vendas nao atende ao contrato minimo. Colunas ausentes: "
            + ", ".join(missing_columns)
            + "."
        )

    warnings: list[str] = []
    metadata: dict[str, Any] = {
        "group_available": False,
        "class_available": False,
        "class_source": "missing",
    }

    group_column = _first_existing_column(frame, GROUP_COLUMN_CANDIDATES)
    class_column = _first_existing_column(frame, CLASS_COLUMN_CANDIDATES)

    frame["product_code"] = frame["product_code"].astype(str).str.strip()
    frame["customer_code"] = frame["customer_code"].astype(str).str.strip()
    frame["customer_name"] = frame["customer_name"].astype(str).str.strip()
    frame["order_quantity"] = frame["order_quantity"].map(_to_number)
    frame["price"] = frame["price"].map(_to_number)
    frame["order_date"] = pd.to_datetime(frame["order_date"], errors="coerce")
    frame["product_group"] = (
        frame[group_column].astype(str).str.strip() if group_column else ""
    )
    frame["abc_class"] = (
        frame[class_column].map(_sanitize_class) if class_column else np.nan
    )

    frame = frame[(frame["product_code"] != "") & (~frame["order_date"].isna())].copy()
    if frame.empty:
        raise ValueError(
            "A base de vendas foi carregada, mas nao possui linhas validas com product_code e order_date."
        )

    lookup = _build_customer_lookup(customers_rows)
    if not lookup.empty:
        by_customer = lookup[
            ["product_code", "customer_code", "product_group", "abc_class"]
        ].copy()
        by_customer = by_customer.rename(
            columns={
                "product_group": "product_group_customer",
                "abc_class": "abc_class_customer",
            }
        )
        frame = frame.merge(
            by_customer,
            on=["product_code", "customer_code"],
            how="left",
        )
        frame["product_group"] = frame["product_group"].replace("", np.nan)
        frame["product_group"] = frame["product_group"].fillna(
            frame["product_group_customer"]
        )
        frame["abc_class"] = frame["abc_class"].fillna(frame["abc_class_customer"])

        by_product = lookup[
            ["product_code", "product_group", "abc_class"]
        ].copy().drop_duplicates("product_code", keep="first")
        by_product = by_product.rename(
            columns={
                "product_group": "product_group_product",
                "abc_class": "abc_class_product",
            }
        )
        frame = frame.merge(by_product, on="product_code", how="left")
        frame["product_group"] = frame["product_group"].fillna(
            frame["product_group_product"]
        )
        frame["abc_class"] = frame["abc_class"].fillna(frame["abc_class_product"])

        for temporary in (
            "product_group_customer",
            "abc_class_customer",
            "product_group_product",
            "abc_class_product",
        ):
            if temporary in frame.columns:
                frame = frame.drop(columns=[temporary])

    frame["product_group"] = frame["product_group"].replace("", np.nan)
    frame["abc_class"] = frame["abc_class"].map(_sanitize_class)

    has_group = bool(frame["product_group"].notna().any())
    has_class = bool(frame["abc_class"].notna().any())
    metadata["group_available"] = has_group
    metadata["class_available"] = has_class

    if not has_group:
        warnings.append(
            "Atributo de grupo de produto nao encontrado. Filtro por grupo permanece habilitado, mas depende do campo product_group."
        )

    if not has_class:
        derived_map = _derive_abc_by_volume(frame)
        frame["abc_class"] = frame["product_code"].map(derived_map)
        metadata["class_source"] = "derived"
        warnings.append(
            "Classe ABC nao veio carregada na base. O sistema derivou ABC por volume historico para manter a analise executiva."
        )
    else:
        metadata["class_source"] = "uploaded"

    frame["product_group"] = frame["product_group"].fillna("(sem grupo)").astype(str).str.strip()
    frame["abc_class"] = frame["abc_class"].fillna("UNCLASSIFIED")
    frame["order_month"] = frame["order_date"].dt.to_period("M").dt.to_timestamp()
    frame["order_value"] = frame["order_quantity"] * frame["price"]

    return frame, warnings, metadata


def _apply_sales_filters(
    sales_df: pd.DataFrame,
    *,
    product_codes: list[str] | None,
    customer_codes: list[str] | None,
    product_groups: list[str] | None,
    abc_classes: list[str] | None,
    start_date: str | None,
    end_date: str | None,
) -> pd.DataFrame:
    filtered = sales_df.copy()

    if product_codes:
        target = {str(code).strip() for code in product_codes if str(code).strip()}
        if target:
            filtered = filtered[filtered["product_code"].isin(target)]

    if customer_codes:
        target = {str(code).strip() for code in customer_codes if str(code).strip()}
        if target:
            filtered = filtered[
                filtered["customer_code"].isin(target)
                | filtered["customer_name"].isin(target)
            ]

    if product_groups:
        target = {str(value).strip() for value in product_groups if str(value).strip()}
        if target:
            filtered = filtered[filtered["product_group"].isin(target)]

    if abc_classes:
        target = {str(value).strip().upper() for value in abc_classes if str(value).strip()}
        if target:
            filtered = filtered[filtered["abc_class"].str.upper().isin(target)]

    if start_date:
        start = pd.to_datetime(start_date, errors="coerce")
        if not pd.isna(start):
            filtered = filtered[filtered["order_date"] >= start]

    if end_date:
        end = pd.to_datetime(end_date, errors="coerce")
        if not pd.isna(end):
            filtered = filtered[filtered["order_date"] <= end]

    return filtered.reset_index(drop=True)


def _series_from_product_monthly(monthly_df: pd.DataFrame) -> dict[str, pd.Series]:
    series_map: dict[str, pd.Series] = {}
    for product_code, bucket in monthly_df.groupby("product_code"):
        start = bucket["order_month"].min()
        finish = bucket["order_month"].max()
        index = pd.date_range(start=start, end=finish, freq="MS")
        series = (
            bucket.set_index("order_month")["order_quantity"]
            .reindex(index, fill_value=0.0)
            .astype(float)
        )
        series_map[str(product_code)] = series
    return series_map


def _moving_average_forecast(history: np.ndarray, horizon: int) -> np.ndarray:
    if history.size == 0:
        return np.zeros(horizon, dtype=float)
    window = min(3, history.size)
    base = float(np.mean(history[-window:]))
    return np.full(horizon, max(base, 0.0), dtype=float)


def _weighted_moving_average_forecast(history: np.ndarray, horizon: int) -> np.ndarray:
    if history.size == 0:
        return np.zeros(horizon, dtype=float)
    window = min(3, history.size)
    values = history[-window:]
    if window == 1:
        base = float(values[-1])
    elif window == 2:
        weights = np.array([0.65, 0.35], dtype=float)
        base = float(np.dot(values, weights))
    else:
        weights = np.array([0.1, 0.3, 0.6], dtype=float)
        base = float(np.dot(values, weights))
    return np.full(horizon, max(base, 0.0), dtype=float)


def _simple_exponential_smoothing_forecast(history: np.ndarray, horizon: int) -> np.ndarray:
    if not HAS_STATSMODELS or SimpleExpSmoothing is None:
        return _moving_average_forecast(history, horizon)
    if history.size < 2:
        return _moving_average_forecast(history, horizon)
    try:
        model = SimpleExpSmoothing(history, initialization_method="estimated")
        fit = model.fit(optimized=True)
        forecast = np.array(fit.forecast(horizon), dtype=float)
        return np.maximum(forecast, 0.0)
    except Exception:
        return _moving_average_forecast(history, horizon)


def _holt_forecast(history: np.ndarray, horizon: int) -> np.ndarray:
    if not HAS_STATSMODELS or Holt is None:
        return _simple_exponential_smoothing_forecast(history, horizon)
    if history.size < 3:
        return _simple_exponential_smoothing_forecast(history, horizon)
    try:
        model = Holt(history, initialization_method="estimated")
        fit = model.fit(optimized=True)
        forecast = np.array(fit.forecast(horizon), dtype=float)
        return np.maximum(forecast, 0.0)
    except Exception:
        return _simple_exponential_smoothing_forecast(history, horizon)


def _holt_winters_forecast(
    history: np.ndarray,
    horizon: int,
    seasonal_periods: int,
    seasonal: Literal["add", "mul"],
) -> np.ndarray:
    if not HAS_STATSMODELS or ExponentialSmoothing is None:
        return _holt_forecast(history, horizon)
    min_points = max(seasonal_periods * 2, seasonal_periods + 3)
    if history.size < min_points:
        return _holt_forecast(history, horizon)
    if seasonal == "mul" and np.any(history <= 0):
        return _holt_forecast(history, horizon)

    try:
        model = ExponentialSmoothing(
            history,
            trend="add",
            seasonal=seasonal,
            seasonal_periods=seasonal_periods,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True)
        forecast = np.array(fit.forecast(horizon), dtype=float)
        return np.maximum(forecast, 0.0)
    except Exception:
        return _holt_forecast(history, horizon)


def _historical_baseline_growth_forecast(
    history: np.ndarray,
    horizon: int,
    growth_pct: float,
) -> np.ndarray:
    if history.size == 0:
        return np.zeros(horizon, dtype=float)
    window = min(6, history.size)
    base = float(np.mean(history[-window:]))
    factor = max(0.0, 1.0 + (growth_pct / 100.0))
    value = max(base * factor, 0.0)
    return np.full(horizon, value, dtype=float)


def _forecast_by_method(
    method: ForecastMethod,
    history: np.ndarray,
    horizon: int,
    seasonal_periods: int,
    baseline_growth_pct: float,
) -> np.ndarray:
    safe_history = np.maximum(np.array(history, dtype=float), 0.0)
    if horizon <= 0:
        return np.array([], dtype=float)

    if method == "moving_average":
        return _moving_average_forecast(safe_history, horizon)
    if method == "weighted_moving_average":
        return _weighted_moving_average_forecast(safe_history, horizon)
    if method == "simple_exponential_smoothing":
        return _simple_exponential_smoothing_forecast(safe_history, horizon)
    if method == "holt_trend":
        return _holt_forecast(safe_history, horizon)
    if method == "holt_winters_additive":
        return _holt_winters_forecast(
            safe_history, horizon, seasonal_periods=seasonal_periods, seasonal="add"
        )
    if method == "holt_winters_multiplicative":
        return _holt_winters_forecast(
            safe_history, horizon, seasonal_periods=seasonal_periods, seasonal="mul"
        )
    if method == "historical_baseline_growth":
        return _historical_baseline_growth_forecast(
            safe_history, horizon, growth_pct=baseline_growth_pct
        )
    return _moving_average_forecast(safe_history, horizon)


def _compute_error_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float | None]:
    if actual.size == 0 or predicted.size == 0:
        return {"mae": None, "mape": None, "rmse": None, "bias": None}
    errors = predicted - actual
    abs_errors = np.abs(errors)
    mae = float(np.mean(abs_errors))
    rmse = float(sqrt(np.mean(np.square(errors))))
    bias = float(np.mean(errors))

    non_zero_mask = actual != 0
    if np.any(non_zero_mask):
        mape = float(np.mean(np.abs(errors[non_zero_mask] / actual[non_zero_mask])) * 100.0)
    else:
        mape = None
    return {"mae": mae, "mape": mape, "rmse": rmse, "bias": bias}


def _evaluate_method_on_history(
    method: ForecastMethod,
    history: np.ndarray,
    *,
    seasonal_periods: int,
    baseline_growth_pct: float,
) -> dict[str, float | int | None]:
    if history.size < 4:
        return {"mae": None, "mape": None, "rmse": None, "bias": None, "support": 0}

    holdout = max(1, min(3, history.size // 4))
    train = history[:-holdout]
    test = history[-holdout:]
    if train.size < 2:
        return {"mae": None, "mape": None, "rmse": None, "bias": None, "support": 0}

    predicted = _forecast_by_method(
        method,
        train,
        horizon=holdout,
        seasonal_periods=seasonal_periods,
        baseline_growth_pct=baseline_growth_pct,
    )
    metrics = _compute_error_metrics(actual=test, predicted=predicted)
    metrics["support"] = int(holdout)
    return metrics


def _score_metric(metric: dict[str, float | int | None]) -> float:
    rmse = metric.get("rmse")
    if isinstance(rmse, (int, float)) and rmse >= 0:
        return float(rmse)
    mae = metric.get("mae")
    if isinstance(mae, (int, float)) and mae >= 0:
        return float(mae)
    return float("inf")


def _sum_growth_pct(*parts: float) -> float:
    return float(sum(parts))


def _factor_from_growth(global_pct: float, *parts: float) -> float:
    factor = 1.0 + (global_pct / 100.0)
    for value in parts:
        factor *= 1.0 + (value / 100.0)
    return max(factor, 0.0)


def _build_inventory_snapshot_map(
    inventory_rows: list[dict[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    if not inventory_rows:
        return {}

    frame = pd.DataFrame(inventory_rows)
    if frame.empty or "product_code" not in frame.columns:
        return {}

    frame["product_code"] = frame["product_code"].astype(str).str.strip()
    frame = frame[frame["product_code"] != ""].copy()
    if frame.empty:
        return {}

    numeric_candidates: dict[str, tuple[str, ...]] = {
        "available_stock": ("available_stock", "stock_available", "inventory_available", "se_saldo_disponivel_un"),
        "general_stock": ("general_stock", "seg_saldo_estoque_geral"),
        "quarantine_stock": ("quarantine_stock", "seq_saldo_quarentena_un"),
        "safety_stock": ("safety_stock", "es_estoque_seguranca"),
        "on_order_stock": ("on_order_stock", "pc_abertos"),
        "reorder_point": ("reorder_point", "pp_ponto_pedido"),
        "coverage_days": ("coverage_time_days", "tc_tempo_cobertura_dias", "coverage_days"),
        "replenishment_time_days": ("replenishment_time_days", "tr_tempo_reposicao"),
        "purchase_cycle_days": ("purchase_cycle_days", "cc_ciclo_compras_dias"),
        "suggested_purchase_quantity": ("suggested_purchase_quantity", "qsc_quantidade_sugerida_compra"),
        "unit_cost_usd": ("last_entry_unit_net_cost_usd", "unit_net_cost_usd", "custo_liquido_ultima_entrada_usd", "custo_liquido_usd"),
        "financial_investment_12m_brl": ("financial_investment_12m_brl", "hist_invest_fin_12m_brl"),
        "financial_investment_12m_usd": ("financial_investment_12m_usd", "hist_invest_fin_12m_usd"),
    }
    bool_candidates: dict[str, tuple[str, ...]] = {
        "purchase_needed": (
            "purchase_needed",
            "necessario_pedido",
            "needs_purchase_next_cycle",
            "npc_necessario_pedido_compra_proximo_ciclo",
            "cycle_replenishment_required",
            "rpn_reposicao_necessaria_ciclo",
        ),
    }
    text_candidates: dict[str, tuple[str, ...]] = {
        "supplier": ("last_entry_supplier", "fornecedor_ultima_entrada", "supplier"),
        "origin": ("last_entry_origin", "origem_ultima_entrada", "origin"),
    }

    selected_numeric: dict[str, str] = {}
    for target, candidates in numeric_candidates.items():
        for candidate in candidates:
            if candidate in frame.columns:
                selected_numeric[target] = candidate
                frame[candidate] = frame[candidate].map(_to_number)
                break

    selected_bool: dict[str, str] = {}
    for target, candidates in bool_candidates.items():
        for candidate in candidates:
            if candidate in frame.columns:
                selected_bool[target] = candidate
                frame[candidate] = frame[candidate].map(_to_optional_bool)
                break

    selected_text: dict[str, str] = {}
    for target, candidates in text_candidates.items():
        for candidate in candidates:
            if candidate in frame.columns:
                selected_text[target] = candidate
                frame[candidate] = frame[candidate].astype(str).str.strip()
                break

    out: dict[str, dict[str, Any]] = {}
    for product_code, bucket in frame.groupby("product_code"):
        item: dict[str, Any] = {"product_code": str(product_code)}

        for target, source in selected_numeric.items():
            series = bucket[source].astype(float)
            if target in {"available_stock", "general_stock", "quarantine_stock", "on_order_stock", "financial_investment_12m_brl", "financial_investment_12m_usd"}:
                item[target] = float(series.sum())
            elif target in {"unit_cost_usd", "replenishment_time_days", "purchase_cycle_days", "coverage_days", "reorder_point", "safety_stock", "suggested_purchase_quantity"}:
                valid = [float(value) for value in series.tolist() if np.isfinite(value) and value != 0.0]
                item[target] = valid[0] if valid else float(series.max()) if len(series) > 0 else 0.0
            else:
                item[target] = float(series.mean()) if len(series) > 0 else 0.0

        for target, source in selected_bool.items():
            values = [value for value in bucket[source].tolist() if isinstance(value, bool)]
            item[target] = any(values) if values else None

        for target, source in selected_text.items():
            values = [str(value).strip() for value in bucket[source].tolist() if str(value).strip()]
            item[target] = values[0] if values else ""

        out[str(product_code)] = item

    return out


def _build_method_aggregate(
    per_product_metrics: dict[str, dict[ForecastMethod, dict[str, float | int | None]]]
) -> dict[str, dict[str, float | int | None]]:
    aggregate: dict[str, dict[str, float | int | None]] = {}
    for method in FORECAST_METHODS:
        metric_rows: list[dict[str, float | int | None]] = []
        for metric_by_method in per_product_metrics.values():
            metric_rows.append(metric_by_method.get(method, {}))

        supports = [int(row.get("support", 0) or 0) for row in metric_rows]
        total_support = int(sum(supports))

        if total_support <= 0:
            aggregate[method] = {
                "mae": None,
                "mape": None,
                "rmse": None,
                "bias": None,
                "support": 0,
                "products_evaluated": 0,
            }
            continue

        weighted: dict[str, float | int | None] = {}
        for metric_name in ("mae", "mape", "rmse", "bias"):
            numerator = 0.0
            denominator = 0
            for row, support in zip(metric_rows, supports):
                value = row.get(metric_name)
                if isinstance(value, (int, float)):
                    numerator += float(value) * support
                    denominator += support
            weighted[metric_name] = (numerator / denominator) if denominator > 0 else None

        aggregate[method] = {
            **weighted,
            "support": total_support,
            "products_evaluated": sum(1 for support in supports if support > 0),
        }

    return aggregate


def _pick_best_global_method(
    aggregate_metrics: dict[str, dict[str, float | int | None]]
) -> ForecastMethod:
    best_method: ForecastMethod = "moving_average"
    best_score = float("inf")
    for method in FORECAST_METHODS:
        metric = aggregate_metrics.get(method, {})
        rmse = metric.get("rmse")
        score = float(rmse) if isinstance(rmse, (int, float)) else float("inf")
        if score < best_score:
            best_score = score
            best_method = method
    return best_method


def _month_label(value: Any) -> str:
    parsed = _to_month_start(value)
    if parsed is None:
        return str(value or "-")
    return parsed.strftime("%Y-%m")


def _sorted_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = str(item or "").strip() or "-"
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _build_heatmap_payload(
    *,
    name: str,
    row_key: str,
    column_key: str,
    row_label: str,
    column_label: str,
    weights: dict[str, float],
    cells: list[dict[str, Any]],
) -> dict[str, Any]:
    sorted_cells = sorted(
        cells,
        key=lambda cell: float(_to_number(cell.get("score", 0.0))),
        reverse=True,
    )
    rows = _sorted_unique([str(cell.get(row_key, "-")) for cell in sorted_cells])
    columns = _sorted_unique([str(cell.get(column_key, "-")) for cell in sorted_cells])
    return {
        "name": name,
        "row_key": row_key,
        "column_key": column_key,
        "row_label": row_label,
        "column_label": column_label,
        "weights": _normalize_weights(weights),
        "rows": rows,
        "columns": columns,
        "cells": sorted_cells,
    }


def _build_flat_rows_for_export(
    result: dict[str, Any],
) -> pd.DataFrame:
    common = {
        "generated_at": result.get("generated_at"),
        "scenario_name": result.get("scenario_name"),
        "selected_method": result.get("selected_method"),
        "recommended_method": result.get("recommended_method"),
    }

    rows: list[dict[str, Any]] = []
    for bucket_name, rows_key in (
        ("product", "summary_by_product"),
        ("customer", "summary_by_customer"),
        ("group", "summary_by_group"),
        ("class", "summary_by_class"),
    ):
        for row in result.get(rows_key, []):
            rows.append({**common, "view": bucket_name, **row})

    for row in result.get("mts_mtu_scenarios", []):
        rows.append({**common, "view": "mts_mtu", **row})

    if not rows:
        rows.append(
            {
                **common,
                "view": "empty",
                "note": "Sem dados para exportar com os filtros atuais.",
            }
        )

    return pd.DataFrame(rows)


def export_planning_result_csv(result: dict[str, Any]) -> bytes:
    frame = _build_flat_rows_for_export(result)
    output = StringIO()
    frame.to_csv(output, index=False)
    return output.getvalue().encode("utf-8")


def _escape_pdf_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _build_simple_pdf(lines: list[str]) -> bytes:
    safe_lines = lines[:45] if lines else ["Relatorio vazio."]
    content_lines = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
    first = True
    for line in safe_lines:
        escaped = _escape_pdf_text(line[:140])
        if first:
            content_lines.append(f"({escaped}) Tj")
            first = False
        else:
            content_lines.append("T*")
            content_lines.append(f"({escaped}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects: list[bytes] = []
    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(b"2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n")
    objects.append(
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
    )
    objects.append(
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )
    objects.append(
        b"5 0 obj\n<< /Length "
        + str(len(stream)).encode("ascii")
        + b" >>\nstream\n"
        + stream
        + b"\nendstream\nendobj\n"
    )

    pdf = bytearray()
    pdf.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        (
            "trailer\n"
            f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            "startxref\n"
            f"{xref_offset}\n"
            "%%EOF\n"
        ).encode("ascii")
    )
    return bytes(pdf)


def export_planning_result_pdf(result: dict[str, Any]) -> bytes:
    summary_by_product = result.get("summary_by_product", [])
    summary_by_customer = result.get("summary_by_customer", [])
    summary_by_group = result.get("summary_by_group", [])
    summary_by_class = result.get("summary_by_class", [])
    alerts = result.get("risk_alerts", {})

    lines = [
        "Operion - Análise e Planejamento de Demanda",
        f"Gerado em: {result.get('generated_at', '-')}",
        f"Cenario: {result.get('scenario_name', 'Principal')}",
        f"Metodo selecionado: {result.get('selected_method', '-')}",
        f"Metodo recomendado: {result.get('recommended_method', '-')}",
        f"Total forecast base: {float(result.get('totals', {}).get('base_forecast', 0.0)):.2f}",
        f"Total forecast ajustado: {float(result.get('totals', {}).get('final_forecast', 0.0)):.2f}",
        f"Impacto crescimento (%): {float(result.get('totals', {}).get('growth_impact_pct', 0.0)):.2f}",
        "",
        "Resumo por produto (top 10):",
    ]

    for row in summary_by_product[:10]:
        lines.append(
            f"{row.get('product_code', '-')}: base {float(row.get('base_forecast', 0.0)):.2f} | "
            f"final {float(row.get('final_forecast', 0.0)):.2f} | metodo {row.get('method_used', '-')}"
        )

    lines.extend(["", "Resumo por cliente (top 8):"])
    for row in summary_by_customer[:8]:
        lines.append(
            f"{row.get('customer_label', '-')}: final {float(row.get('final_forecast', 0.0)):.2f}"
        )

    lines.extend(["", "Resumo por grupo (top 8):"])
    for row in summary_by_group[:8]:
        lines.append(
            f"{row.get('product_group', '-')}: final {float(row.get('final_forecast', 0.0)):.2f}"
        )

    lines.extend(["", "Resumo por classe ABC:"])
    for row in summary_by_class:
        lines.append(
            f"Classe {row.get('abc_class', '-')}: final {float(row.get('final_forecast', 0.0)):.2f}"
        )

    lines.extend(
        [
            "",
            "Alertas MTS/MTU:",
            f"Ruptura: {int(alerts.get('rupture_risk_count', 0))}",
            f"Excesso: {int(alerts.get('excess_risk_count', 0))}",
            f"Sem estoque: {int(alerts.get('missing_stock_count', 0))}",
        ]
    )
    return _build_simple_pdf(lines)


def run_planning_analysis(
    *,
    sales_rows: list[dict[str, Any]],
    customers_rows: list[dict[str, Any]] | None,
    inventory_rows: list[dict[str, Any]] | None,
    product_codes: list[str] | None,
    customer_codes: list[str] | None,
    product_groups: list[str] | None,
    abc_classes: list[str] | None,
    start_date: str | None,
    end_date: str | None,
    method: str,
    horizon_months: int,
    seasonal_periods: int,
    scenario_name: str,
    growth_global_pct: float,
    growth_by_product: dict[str, float] | None,
    growth_by_customer: dict[str, float] | None,
    growth_by_group: dict[str, float] | None,
    growth_by_class: dict[str, float] | None,
    mts_coverage_days: int,
    mtu_coverage_days: int,
    excess_multiplier: float,
) -> dict[str, Any]:
    sales_df, ingestion_warnings, ingestion_metadata = build_sales_dataframe(
        sales_rows=sales_rows,
        customers_rows=customers_rows,
    )

    filtered_df = _apply_sales_filters(
        sales_df,
        product_codes=product_codes,
        customer_codes=customer_codes,
        product_groups=product_groups,
        abc_classes=abc_classes,
        start_date=start_date,
        end_date=end_date,
    )
    if filtered_df.empty:
        raise ValueError(
            "Sem dados apos aplicacao dos filtros. Revise produto, cliente, grupo, classe e periodo."
        )

    growth_product = _normalize_growth_map(growth_by_product)
    growth_customer = _normalize_growth_map(growth_by_customer)
    growth_group = _normalize_growth_map(growth_by_group)
    growth_class = _normalize_growth_map(growth_by_class)
    global_growth_pct = float(growth_global_pct)

    filtered_df = filtered_df.copy()
    filtered_df["customer_label"] = filtered_df.apply(
        lambda row: (
            f"{str(row.get('customer_code', '')).strip()} - {str(row.get('customer_name', '')).strip()}"
            if str(row.get("customer_code", "")).strip()
            else str(row.get("customer_name", "")).strip() or "Sem cliente"
        ),
        axis=1,
    )

    historical_total_quantity = float(filtered_df["order_quantity"].map(_to_number).sum())
    historical_total_value = float(filtered_df["order_value"].map(_to_number).sum())
    global_avg_price = _safe_div(historical_total_value, historical_total_quantity, default=0.0)

    monthly_df = (
        filtered_df.groupby(["product_code", "order_month"], as_index=False)["order_quantity"]
        .sum()
        .sort_values(["product_code", "order_month"])
    )
    product_series = _series_from_product_monthly(monthly_df)

    product_info = (
        filtered_df.groupby("product_code", as_index=False)
        .agg(
            product_group=("product_group", lambda series: _mode_or_default(series, "(sem grupo)")),
            abc_class=("abc_class", lambda series: _mode_or_default(series, "UNCLASSIFIED")),
            product_name=("product_code", "first"),
        )
        .set_index("product_code")
    )

    price_by_product_df = (
        filtered_df.groupby("product_code", as_index=False)
        .agg(
            historical_quantity=("order_quantity", "sum"),
            historical_value=("order_value", "sum"),
        )
    )
    price_by_product_df["avg_price"] = price_by_product_df.apply(
        lambda row: _safe_div(
            float(_to_number(row.get("historical_value"))),
            float(_to_number(row.get("historical_quantity"))),
            default=global_avg_price,
        ),
        axis=1,
    )
    price_by_product_map = {
        str(row["product_code"]): float(_to_number(row.get("avg_price")))
        for row in price_by_product_df.to_dict(orient="records")
    }

    customer_mix = (
        filtered_df.groupby(["product_code", "customer_code", "customer_name"], as_index=False)[
            "order_quantity"
        ]
        .sum()
        .sort_values(["product_code", "order_quantity"], ascending=[True, False])
    )
    customer_mix["customer_code"] = customer_mix["customer_code"].astype(str).str.strip()
    customer_mix["customer_name"] = customer_mix["customer_name"].astype(str).str.strip()
    customer_mix["customer_label"] = customer_mix.apply(
        lambda row: (
            f"{row['customer_code']} - {row['customer_name']}"
            if str(row["customer_code"]).strip()
            else str(row["customer_name"]).strip() or "Sem cliente"
        ),
        axis=1,
    )
    customer_mix["share"] = customer_mix.groupby("product_code")["order_quantity"].transform(
        lambda values: values / max(float(values.sum()), 1.0)
    )

    per_product_metrics: dict[str, dict[ForecastMethod, dict[str, float | int | None]]] = {}
    product_forecasts: list[dict[str, Any]] = []
    product_forecast_vectors: dict[str, np.ndarray] = {}
    method_mode = "auto" if str(method).strip().lower() == "auto" else "manual"
    selected_method = str(method).strip().lower() or "auto"
    if selected_method not in FORECAST_METHODS and selected_method != "auto":
        raise ValueError(
            "Metodo de forecast invalido. Use 'auto' ou um metodo suportado."
        )

    for product_code, series in product_series.items():
        if product_code not in product_info.index:
            continue
        history = series.to_numpy(dtype=float)
        group_value = str(product_info.at[product_code, "product_group"])
        class_value = str(product_info.at[product_code, "abc_class"])

        product_growth_pct = _sum_growth_pct(
            growth_product.get(product_code, 0.0),
            growth_group.get(group_value, 0.0),
            growth_class.get(class_value, 0.0),
            global_growth_pct,
        )

        metrics_by_method: dict[ForecastMethod, dict[str, float | int | None]] = {}
        for method_name in FORECAST_METHODS:
            baseline_growth_for_eval = (
                product_growth_pct if method_name == "historical_baseline_growth" else 0.0
            )
            metrics_by_method[method_name] = _evaluate_method_on_history(
                method_name,
                history,
                seasonal_periods=seasonal_periods,
                baseline_growth_pct=baseline_growth_for_eval,
            )
        per_product_metrics[product_code] = metrics_by_method

        if method_mode == "manual":
            method_used = selected_method  # type: ignore[assignment]
        else:
            method_used = min(
                FORECAST_METHODS,
                key=lambda method_name: _score_metric(metrics_by_method[method_name]),
            )

        baseline_growth_for_forecast = (
            product_growth_pct if method_used == "historical_baseline_growth" else 0.0
        )
        horizon_forecast = _forecast_by_method(
            method_used,
            history,
            horizon=horizon_months,
            seasonal_periods=seasonal_periods,
            baseline_growth_pct=baseline_growth_for_forecast,
        )
        product_forecast_vectors[product_code] = np.array(horizon_forecast, dtype=float)
        base_forecast_total = float(np.sum(horizon_forecast))
        monthly_average = float(base_forecast_total / max(horizon_months, 1))

        chosen_metrics = metrics_by_method.get(method_used, {})
        product_forecasts.append(
            {
                "product_code": product_code,
                "product_group": group_value,
                "abc_class": class_value,
                "method_used": method_used,
                "base_forecast": base_forecast_total,
                "base_monthly_avg": monthly_average,
                "mae": chosen_metrics.get("mae"),
                "mape": chosen_metrics.get("mape"),
                "rmse": chosen_metrics.get("rmse"),
                "bias": chosen_metrics.get("bias"),
                "product_growth_pct": product_growth_pct,
                "avg_price": float(price_by_product_map.get(product_code, global_avg_price)),
            }
        )

    if not product_forecasts:
        raise ValueError("Nao foi possivel gerar forecast com os dados selecionados.")

    aggregate_metrics = _build_method_aggregate(per_product_metrics)
    recommended_method = _pick_best_global_method(aggregate_metrics)

    confidence_reference_method = recommended_method if selected_method == "auto" else selected_method
    confidence_reference_metric = aggregate_metrics.get(confidence_reference_method, {})
    confidence_reference_mape = confidence_reference_metric.get("mape")
    fallback_confidence = _confidence_from_mape(
        float(confidence_reference_mape)
        if isinstance(confidence_reference_mape, (int, float))
        else None,
        fallback=0.55,
    )

    forecast_df = pd.DataFrame(product_forecasts)
    mix_fallback_rows: list[dict[str, Any]] = []
    for product_code in forecast_df["product_code"].astype(str).tolist():
        has_mix = bool(
            not customer_mix[customer_mix["product_code"] == product_code].empty
        )
        if has_mix:
            continue
        mix_fallback_rows.append(
            {
                "product_code": product_code,
                "customer_code": "",
                "customer_name": "Sem cliente",
                "customer_label": "Sem cliente",
                "order_quantity": 0.0,
                "share": 1.0,
            }
        )

    if mix_fallback_rows:
        customer_mix = pd.concat(
            [customer_mix, pd.DataFrame(mix_fallback_rows)], ignore_index=True
        )

    history_product_customer_df = (
        filtered_df.groupby(["product_code", "customer_label"], as_index=False)
        .agg(
            historical_quantity=("order_quantity", "sum"),
            historical_value=("order_value", "sum"),
        )
    )
    history_product_customer_map = {
        (str(row["product_code"]), str(row["customer_label"])): {
            "historical_quantity": float(_to_number(row.get("historical_quantity"))),
            "historical_value": float(_to_number(row.get("historical_value"))),
        }
        for row in history_product_customer_df.to_dict(orient="records")
    }

    allocation_rows: list[dict[str, Any]] = []
    for row in forecast_df.to_dict(orient="records"):
        product_code = str(row["product_code"])
        product_mix = customer_mix[customer_mix["product_code"] == product_code]
        if product_mix.empty:
            product_mix = pd.DataFrame(
                [
                    {
                        "product_code": product_code,
                        "customer_code": "",
                        "customer_name": "Sem cliente",
                        "customer_label": "Sem cliente",
                        "share": 1.0,
                    }
                ]
            )

        for mix_row in product_mix.to_dict(orient="records"):
            customer_code = str(mix_row.get("customer_code", "") or "").strip()
            customer_name = str(mix_row.get("customer_name", "") or "").strip()
            customer_label = str(mix_row.get("customer_label", "") or "").strip() or "Sem cliente"
            share = float(mix_row.get("share", 0.0) or 0.0)
            share = max(0.0, share)
            base_allocated = float(row["base_forecast"]) * share
            average_price = float(_to_number(row.get("avg_price"))) or global_avg_price
            confidence_score = _confidence_from_mape(
                float(row["mape"]) if isinstance(row.get("mape"), (int, float)) else None,
                fallback=fallback_confidence,
            )

            group_value = str(row.get("product_group", "(sem grupo)"))
            class_value = str(row.get("abc_class", "UNCLASSIFIED"))
            product_growth_pct = float(growth_product.get(product_code, 0.0))
            customer_growth_pct = float(
                growth_customer.get(customer_code, growth_customer.get(customer_name, 0.0))
            )
            group_growth_pct = float(growth_group.get(group_value, 0.0))
            class_growth_pct = float(growth_class.get(class_value, 0.0))

            include_non_customer = row.get("method_used") != "historical_baseline_growth"
            if include_non_customer:
                growth_factor = _factor_from_growth(
                    global_growth_pct,
                    product_growth_pct,
                    customer_growth_pct,
                    group_growth_pct,
                    class_growth_pct,
                )
            else:
                growth_factor = _factor_from_growth(0.0, customer_growth_pct)

            final_allocated = base_allocated * growth_factor
            history_entry = history_product_customer_map.get(
                (product_code, customer_label),
                {"historical_quantity": 0.0, "historical_value": 0.0},
            )
            allocation_rows.append(
                {
                    "product_code": product_code,
                    "product_group": group_value,
                    "abc_class": class_value,
                    "method_used": row.get("method_used"),
                    "customer_code": customer_code,
                    "customer_name": customer_name,
                    "customer_label": customer_label,
                    "base_forecast": base_allocated,
                    "final_forecast": final_allocated,
                    "growth_factor": growth_factor,
                    "growth_effective_pct": (growth_factor - 1.0) * 100.0,
                    "mae": row.get("mae"),
                    "mape": row.get("mape"),
                    "rmse": row.get("rmse"),
                    "bias": row.get("bias"),
                    "product_growth_pct": row.get("product_growth_pct"),
                    "historical_quantity": float(history_entry.get("historical_quantity", 0.0)),
                    "historical_value": float(history_entry.get("historical_value", 0.0)),
                    "estimated_revenue_base": base_allocated * average_price,
                    "estimated_revenue_final": final_allocated * average_price,
                    "avg_price": average_price,
                    "forecast_confidence": confidence_score,
                    "confidence_risk": 1.0 - confidence_score,
                    "class_criticality": _class_criticality(class_value),
                }
            )

    allocation_df = pd.DataFrame(allocation_rows)
    if allocation_df.empty:
        raise ValueError("Nao foi possivel distribuir o forecast por cliente.")

    summary_by_product = (
        allocation_df.groupby(
            ["product_code", "product_group", "abc_class", "method_used"], as_index=False
        )
        .agg(
            base_forecast=("base_forecast", "sum"),
            final_forecast=("final_forecast", "sum"),
            mae=("mae", "first"),
            mape=("mape", "first"),
            rmse=("rmse", "first"),
            bias=("bias", "first"),
            product_growth_pct=("product_growth_pct", "first"),
            historical_quantity=("historical_quantity", "sum"),
            historical_value=("historical_value", "sum"),
            estimated_revenue=("estimated_revenue_final", "sum"),
            avg_price=("avg_price", "first"),
            forecast_confidence=("forecast_confidence", "first"),
            confidence_risk=("confidence_risk", "first"),
            class_criticality=("class_criticality", "first"),
        )
        .sort_values("final_forecast", ascending=False)
    )
    summary_by_product["growth_impact_pct"] = np.where(
        summary_by_product["base_forecast"] > 0,
        ((summary_by_product["final_forecast"] / summary_by_product["base_forecast"]) - 1.0)
        * 100.0,
        0.0,
    )
    summary_by_product["avg_price"] = summary_by_product.apply(
        lambda row: _safe_div(
            float(_to_number(row.get("estimated_revenue"))),
            float(_to_number(row.get("final_forecast"))),
            default=float(_to_number(row.get("avg_price")) or global_avg_price),
        ),
        axis=1,
    )

    summary_by_customer = (
        allocation_df.groupby(["customer_code", "customer_name", "customer_label"], as_index=False)
        .agg(
            base_forecast=("base_forecast", "sum"),
            final_forecast=("final_forecast", "sum"),
            historical_quantity=("historical_quantity", "sum"),
            historical_value=("historical_value", "sum"),
            estimated_revenue=("estimated_revenue_final", "sum"),
        )
        .sort_values("final_forecast", ascending=False)
    )
    summary_by_customer["growth_impact_pct"] = np.where(
        summary_by_customer["base_forecast"] > 0,
        ((summary_by_customer["final_forecast"] / summary_by_customer["base_forecast"]) - 1.0)
        * 100.0,
        0.0,
    )
    customer_confidence_df = (
        allocation_df.groupby(["customer_code", "customer_name", "customer_label"])
        .apply(
            lambda bucket: _weighted_average_from_series(
                bucket["forecast_confidence"],
                bucket["final_forecast"],
                default=fallback_confidence,
            )
        )
        .reset_index(name="forecast_confidence")
    )
    summary_by_customer = summary_by_customer.merge(
        customer_confidence_df,
        on=["customer_code", "customer_name", "customer_label"],
        how="left",
    )
    summary_by_customer["confidence_risk"] = 1.0 - summary_by_customer["forecast_confidence"].fillna(
        fallback_confidence
    )

    summary_by_group = (
        allocation_df.groupby("product_group", as_index=False)
        .agg(
            base_forecast=("base_forecast", "sum"),
            final_forecast=("final_forecast", "sum"),
            historical_quantity=("historical_quantity", "sum"),
            historical_value=("historical_value", "sum"),
            estimated_revenue=("estimated_revenue_final", "sum"),
        )
        .sort_values("final_forecast", ascending=False)
    )
    summary_by_group["growth_impact_pct"] = np.where(
        summary_by_group["base_forecast"] > 0,
        ((summary_by_group["final_forecast"] / summary_by_group["base_forecast"]) - 1.0)
        * 100.0,
        0.0,
    )
    group_confidence_df = (
        allocation_df.groupby("product_group")
        .apply(
            lambda bucket: _weighted_average_from_series(
                bucket["forecast_confidence"],
                bucket["final_forecast"],
                default=fallback_confidence,
            )
        )
        .reset_index(name="forecast_confidence")
    )
    summary_by_group = summary_by_group.merge(group_confidence_df, on="product_group", how="left")
    summary_by_group["confidence_risk"] = 1.0 - summary_by_group["forecast_confidence"].fillna(
        fallback_confidence
    )

    summary_by_class = (
        allocation_df.groupby("abc_class", as_index=False)
        .agg(
            base_forecast=("base_forecast", "sum"),
            final_forecast=("final_forecast", "sum"),
            historical_quantity=("historical_quantity", "sum"),
            historical_value=("historical_value", "sum"),
            estimated_revenue=("estimated_revenue_final", "sum"),
        )
        .sort_values("final_forecast", ascending=False)
    )
    summary_by_class["growth_impact_pct"] = np.where(
        summary_by_class["base_forecast"] > 0,
        ((summary_by_class["final_forecast"] / summary_by_class["base_forecast"]) - 1.0)
        * 100.0,
        0.0,
    )
    class_confidence_df = (
        allocation_df.groupby("abc_class")
        .apply(
            lambda bucket: _weighted_average_from_series(
                bucket["forecast_confidence"],
                bucket["final_forecast"],
                default=fallback_confidence,
            )
        )
        .reset_index(name="forecast_confidence")
    )
    summary_by_class = summary_by_class.merge(class_confidence_df, on="abc_class", how="left")
    summary_by_class["confidence_risk"] = 1.0 - summary_by_class["forecast_confidence"].fillna(
        fallback_confidence
    )

    inventory_snapshot_map = _build_inventory_snapshot_map(inventory_rows)
    scenario_rows: list[dict[str, Any]] = []
    rupture_risk_count = 0
    excess_risk_count = 0
    missing_stock_count = 0
    purchase_need_count = 0
    missing_cost_count = 0

    for row in summary_by_product.to_dict(orient="records"):
        product_code = str(row["product_code"])
        demand_total = float(row["final_forecast"])
        demand_monthly = demand_total / max(horizon_months, 1)

        mts_recommended = demand_monthly * (max(mts_coverage_days, 1) / 30.0)
        mtu_recommended = demand_monthly * (max(mtu_coverage_days, 1) / 30.0)

        snapshot = inventory_snapshot_map.get(product_code, {})
        raw_stock_available = snapshot.get("available_stock")
        stock_available = (
            float(_to_number(raw_stock_available))
            if raw_stock_available not in (None, "")
            else None
        )
        stock_on_order = float(_to_number(snapshot.get("on_order_stock")))
        stock_safety = float(_to_number(snapshot.get("safety_stock")))
        reorder_point = float(_to_number(snapshot.get("reorder_point")))
        supplier = str(snapshot.get("supplier") or "").strip()
        unit_cost_usd = float(_to_number(snapshot.get("unit_cost_usd")))
        suggested_purchase_qty = float(_to_number(snapshot.get("suggested_purchase_quantity")))
        financial_investment_12m_brl = float(_to_number(snapshot.get("financial_investment_12m_brl")))

        purchase_needed_raw = snapshot.get("purchase_needed")
        purchase_needed = (
            purchase_needed_raw
            if isinstance(purchase_needed_raw, bool)
            else _to_optional_bool(purchase_needed_raw)
        )

        raw_coverage_days = snapshot.get("coverage_days")
        coverage_days = (
            float(_to_number(raw_coverage_days))
            if raw_coverage_days not in (None, "")
            else None
        )
        if coverage_days is not None and coverage_days <= 0:
            coverage_days = None

        stock_position = (
            stock_available + max(stock_on_order, 0.0)
            if stock_available is not None
            else None
        )
        target_stock = max(mtu_recommended, reorder_point, stock_safety)

        if stock_available is None:
            risk = "missing_stock_data"
            missing_stock_count += 1
            projected_purchase_need_qty = max(suggested_purchase_qty, 0.0) if purchase_needed else 0.0
        else:
            if coverage_days is None:
                coverage_days = (stock_available / max(demand_monthly, 1e-9)) * 30.0
            projected_purchase_need_qty = max(target_stock - (stock_position or 0.0), 0.0)
            if purchase_needed and projected_purchase_need_qty <= 0.0:
                projected_purchase_need_qty = max(suggested_purchase_qty, 0.0)

            if purchase_needed or (stock_position or 0.0) < target_stock:
                risk = "rupture_risk"
                rupture_risk_count += 1
            elif stock_available > (mts_recommended * max(excess_multiplier, 1.0)):
                risk = "excess_risk"
                excess_risk_count += 1
            else:
                risk = "balanced"

        if purchase_needed:
            purchase_need_count += 1

        projected_purchase_value_usd = (
            projected_purchase_need_qty * unit_cost_usd
            if unit_cost_usd > 0
            else 0.0
        )
        if projected_purchase_need_qty > 0 and unit_cost_usd <= 0:
            missing_cost_count += 1

        class_value = str(row.get("abc_class", "UNCLASSIFIED"))
        if risk == "rupture_risk":
            suggested_policy = "MTS_replenish"
        elif risk == "excess_risk":
            suggested_policy = "MTU_rebalance"
        elif class_value in {"A", "B"}:
            suggested_policy = "MTS"
        else:
            suggested_policy = "MTU"

        scenario_rows.append(
            {
                "product_code": product_code,
                "product_group": row.get("product_group"),
                "abc_class": class_value,
                "demand_forecast": demand_total,
                "demand_monthly_avg": demand_monthly,
                "stock_available": stock_available,
                "stock_on_order": stock_on_order,
                "stock_safety": stock_safety,
                "stock_position": stock_position,
                "reorder_point": reorder_point,
                "coverage_days": coverage_days,
                "mts_recommended_volume": mts_recommended,
                "mtu_recommended_volume": mtu_recommended,
                "purchase_needed": purchase_needed,
                "suggested_purchase_qty": suggested_purchase_qty,
                "projected_purchase_need_qty": projected_purchase_need_qty,
                "projected_purchase_value_usd": projected_purchase_value_usd,
                "unit_cost_usd": unit_cost_usd,
                "last_entry_supplier": supplier or None,
                "financial_investment_12m_brl": financial_investment_12m_brl,
                "suggested_policy": suggested_policy,
                "risk_status": risk,
            }
        )

    scenario_lookup = {str(row["product_code"]): row for row in scenario_rows}
    summary_by_product["coverage_days"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("coverage_days")
    )
    summary_by_product["stock_available"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("stock_available")
    )
    summary_by_product["stock_position"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("stock_position")
    )
    summary_by_product["stock_on_order"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("stock_on_order")
    )
    summary_by_product["reorder_point"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("reorder_point")
    )
    summary_by_product["purchase_needed"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("purchase_needed")
    )
    summary_by_product["projected_purchase_need_qty"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("projected_purchase_need_qty")
    )
    summary_by_product["projected_purchase_value_usd"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("projected_purchase_value_usd")
    )
    summary_by_product["unit_cost_usd"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("unit_cost_usd")
    )
    summary_by_product["last_entry_supplier"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("last_entry_supplier")
    )
    summary_by_product["financial_investment_12m_brl"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("financial_investment_12m_brl")
    )
    summary_by_product["risk_status"] = summary_by_product["product_code"].map(
        lambda code: scenario_lookup.get(str(code), {}).get("risk_status", "missing_stock_data")
    )
    summary_by_product["coverage_risk"] = summary_by_product.apply(
        lambda row: _coverage_risk_score(
            float(row["coverage_days"]) if isinstance(row.get("coverage_days"), (int, float)) else None,
            str(row.get("risk_status", "")),
            mts_coverage_days=mts_coverage_days,
            mtu_coverage_days=mtu_coverage_days,
            excess_multiplier=excess_multiplier,
        ),
        axis=1,
    )

    product_concentration_df = (
        allocation_df.groupby(["product_code", "customer_label"], as_index=False)["final_forecast"]
        .sum()
        .sort_values(["product_code", "final_forecast"], ascending=[True, False])
    )
    product_concentration_totals = (
        product_concentration_df.groupby("product_code", as_index=False)["final_forecast"]
        .sum()
        .rename(columns={"final_forecast": "product_total_forecast"})
    )
    product_concentration_df = product_concentration_df.merge(
        product_concentration_totals,
        on="product_code",
        how="left",
    )
    product_concentration_df["share"] = product_concentration_df.apply(
        lambda row: _safe_div(
            float(_to_number(row.get("final_forecast"))),
            float(_to_number(row.get("product_total_forecast"))),
            default=0.0,
        ),
        axis=1,
    )
    product_top_share_df = (
        product_concentration_df.sort_values(["product_code", "share"], ascending=[True, False])
        .drop_duplicates(["product_code"], keep="first")
    )
    product_top_share_map = {
        str(row["product_code"]): float(_to_number(row.get("share")))
        for row in product_top_share_df.to_dict(orient="records")
    }
    product_top_customer_map = {
        str(row["product_code"]): str(row.get("customer_label") or "Sem cliente")
        for row in product_top_share_df.to_dict(orient="records")
    }
    summary_by_product["customer_concentration_ratio"] = summary_by_product["product_code"].map(
        lambda code: _clamp01(float(product_top_share_map.get(str(code), 0.0)))
    )
    summary_by_product["customer_concentration_pct"] = (
        summary_by_product["customer_concentration_ratio"] * 100.0
    )
    summary_by_product["top_customer_label"] = summary_by_product["product_code"].map(
        lambda code: product_top_customer_map.get(str(code), "Sem cliente")
    )

    max_product_forecast = float(max(summary_by_product["final_forecast"].max(), 1.0))
    max_product_revenue = float(max(summary_by_product["estimated_revenue"].max(), 1.0))
    summary_by_product["volume_norm"] = summary_by_product["final_forecast"].apply(
        lambda value: _clamp01(_safe_div(float(_to_number(value)), max_product_forecast, default=0.0))
    )
    summary_by_product["revenue_norm"] = summary_by_product["estimated_revenue"].apply(
        lambda value: _clamp01(_safe_div(float(_to_number(value)), max_product_revenue, default=0.0))
    )
    summary_by_product["value_volume_risk"] = (
        summary_by_product["volume_norm"] + summary_by_product["revenue_norm"]
    ) / 2.0
    growth_reference_product = max(
        float(
            np.percentile(
                summary_by_product["growth_impact_pct"].clip(lower=0.0).to_numpy(dtype=float),
                90,
            )
        )
        if not summary_by_product.empty
        else 0.0,
        12.0,
    )
    summary_by_product["growth_risk"] = summary_by_product["growth_impact_pct"].apply(
        lambda value: _growth_risk_from_pct(float(_to_number(value)), growth_reference_product)
    )

    history_monthly_df = (
        filtered_df.groupby("order_month", as_index=False)
        .agg(
            historical_quantity=("order_quantity", "sum"),
            historical_value=("order_value", "sum"),
        )
        .sort_values("order_month")
    )
    history_monthly_rows = [
        {
            "period": _month_label(row["order_month"]),
            "historical_quantity": float(_to_number(row.get("historical_quantity"))),
            "historical_value": float(_to_number(row.get("historical_value"))),
        }
        for row in history_monthly_df.to_dict(orient="records")
    ]

    forecast_monthly_rows: list[dict[str, Any]] = []
    if horizon_months > 0:
        aggregate_base = np.zeros(horizon_months, dtype=float)
        aggregate_adjusted = np.zeros(horizon_months, dtype=float)
        product_totals_df = (
            allocation_df.groupby("product_code", as_index=False)
            .agg(
                base_forecast=("base_forecast", "sum"),
                final_forecast=("final_forecast", "sum"),
            )
            .set_index("product_code")
        )
        for product_code, forecast_vector in product_forecast_vectors.items():
            aligned = np.zeros(horizon_months, dtype=float)
            vector_size = min(horizon_months, forecast_vector.size)
            aligned[:vector_size] = forecast_vector[:vector_size]
            base_total = float(np.sum(aligned))
            if product_code in product_totals_df.index:
                final_total = float(product_totals_df.at[product_code, "final_forecast"])
            else:
                final_total = base_total
            factor = _safe_div(final_total, base_total, default=1.0) if base_total > 0 else 1.0
            aggregate_base += aligned
            aggregate_adjusted += aligned * max(factor, 0.0)

        reference_month = (
            _to_month_start(history_monthly_df["order_month"].max())
            if not history_monthly_df.empty
            else _to_month_start(datetime.now(timezone.utc))
        )
        if reference_month is None:
            reference_month = _to_month_start(datetime.now(timezone.utc))
        forecast_start = pd.Timestamp(reference_month) + pd.offsets.MonthBegin(1)
        forecast_index = pd.date_range(start=forecast_start, periods=horizon_months, freq="MS")
        for idx, forecast_month in enumerate(forecast_index):
            forecast_monthly_rows.append(
                {
                    "period": _month_label(forecast_month),
                    "forecast_base": float(aggregate_base[idx]),
                    "forecast_adjusted": float(aggregate_adjusted[idx]),
                }
            )

    summary_by_product_records = summary_by_product.to_dict(orient="records")
    summary_by_customer_records = summary_by_customer.to_dict(orient="records")
    summary_by_group_records = summary_by_group.to_dict(orient="records")
    summary_by_class_records = summary_by_class.to_dict(orient="records")

    def _build_dimension_view(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
        return [
            {
                "entity": str(row.get(key, "-")),
                "historical_quantity": float(_to_number(row.get("historical_quantity"))),
                "forecast_base": float(_to_number(row.get("base_forecast"))),
                "forecast_adjusted": float(_to_number(row.get("final_forecast"))),
                "growth_impact_pct": float(_to_number(row.get("growth_impact_pct"))),
                "estimated_revenue": float(_to_number(row.get("estimated_revenue"))),
                "forecast_confidence": float(_to_number(row.get("forecast_confidence"))),
            }
            for row in rows[:40]
        ]

    forecast_visual = {
        "historical_monthly": history_monthly_rows,
        "forecast_monthly": forecast_monthly_rows,
        "by_dimension": {
            "product": _build_dimension_view(summary_by_product_records, "product_code"),
            "customer": _build_dimension_view(summary_by_customer_records, "customer_label"),
            "group": _build_dimension_view(summary_by_group_records, "product_group"),
            "class": _build_dimension_view(summary_by_class_records, "abc_class"),
        },
    }

    operational_cells: list[dict[str, Any]] = []
    for (abc_class_value, product_group_value), bucket in summary_by_product.groupby(
        ["abc_class", "product_group"]
    ):
        weights_bucket = bucket["final_forecast"].astype(float)
        components = {
            "class_criticality": _weighted_average_from_series(
                bucket["class_criticality"], weights_bucket, default=_class_criticality(str(abc_class_value))
            ),
            "growth": _weighted_average_from_series(bucket["growth_risk"], weights_bucket, default=0.0),
            "confidence": _weighted_average_from_series(
                bucket["confidence_risk"], weights_bucket, default=1.0 - fallback_confidence
            ),
            "coverage": _weighted_average_from_series(bucket["coverage_risk"], weights_bucket, default=0.70),
        }
        score, contributions, driver_key = _score_components(
            components,
            RISK_WEIGHTS_DEFAULT["operational"],
        )
        level_key, level_label = _risk_level(score)
        top_row = bucket.sort_values("final_forecast", ascending=False).iloc[0]
        missing_coverage_ratio = _safe_div(
            float((bucket["risk_status"] == "missing_stock_data").sum()),
            float(max(len(bucket), 1)),
            default=0.0,
        )
        operational_cells.append(
            {
                "abc_class": str(abc_class_value),
                "product_group": str(product_group_value),
                "score": score,
                "level_key": level_key,
                "level_label": level_label,
                "primary_driver_key": driver_key,
                "primary_driver_label": RISK_COMPONENT_LABELS.get(driver_key, driver_key),
                "components": {key: float(value) for key, value in components.items()},
                "contributions": {key: float(value) for key, value in contributions.items()},
                "metrics": {
                    "abc_class": str(abc_class_value),
                    "product_group": str(product_group_value),
                    "final_forecast": float(bucket["final_forecast"].sum()),
                    "historical_quantity": float(bucket["historical_quantity"].sum()),
                    "estimated_revenue": float(bucket["estimated_revenue"].sum()),
                    "growth_impact_pct": _weighted_average_from_series(
                        bucket["growth_impact_pct"], weights_bucket, default=0.0
                    ),
                    "forecast_confidence": _weighted_average_from_series(
                        bucket["forecast_confidence"], weights_bucket, default=fallback_confidence
                    ),
                    "coverage_days_avg": _weighted_average_from_series(
                        bucket["coverage_days"].fillna(0.0), weights_bucket, default=0.0
                    ),
                    "customer_concentration_pct": _weighted_average_from_series(
                        bucket["customer_concentration_ratio"], weights_bucket, default=0.0
                    )
                    * 100.0,
                    "top_product_code": str(top_row.get("product_code", "-")),
                    "top_customer_label": str(top_row.get("top_customer_label", "Sem cliente")),
                    "missing_coverage_ratio": missing_coverage_ratio,
                },
                "limitations": (
                    ["Cobertura parcial: parte dos produtos sem dados de estoque."]
                    if missing_coverage_ratio > 0
                    else []
                ),
            }
        )

    top_customer_labels = (
        summary_by_customer.sort_values("final_forecast", ascending=False)["customer_label"]
        .astype(str)
        .head(12)
        .tolist()
    )
    top_group_labels = (
        summary_by_group.sort_values("final_forecast", ascending=False)["product_group"]
        .astype(str)
        .head(8)
        .tolist()
    )

    commercial_matrix_df = (
        allocation_df.groupby(["customer_label", "product_group"], as_index=False)
        .agg(
            base_forecast=("base_forecast", "sum"),
            final_forecast=("final_forecast", "sum"),
            historical_quantity=("historical_quantity", "sum"),
            estimated_revenue=("estimated_revenue_final", "sum"),
        )
        .sort_values("final_forecast", ascending=False)
    )
    if top_customer_labels:
        commercial_matrix_df = commercial_matrix_df[
            commercial_matrix_df["customer_label"].astype(str).isin(top_customer_labels)
        ]
    if top_group_labels:
        commercial_matrix_df = commercial_matrix_df[
            commercial_matrix_df["product_group"].astype(str).isin(top_group_labels)
        ]

    commercial_confidence_df = (
        allocation_df.groupby(["customer_label", "product_group"])
        .apply(
            lambda bucket: _weighted_average_from_series(
                bucket["forecast_confidence"],
                bucket["final_forecast"],
                default=fallback_confidence,
            )
        )
        .reset_index(name="forecast_confidence")
    )
    commercial_matrix_df = commercial_matrix_df.merge(
        commercial_confidence_df,
        on=["customer_label", "product_group"],
        how="left",
    )
    commercial_matrix_df["growth_impact_pct"] = np.where(
        commercial_matrix_df["base_forecast"] > 0,
        ((commercial_matrix_df["final_forecast"] / commercial_matrix_df["base_forecast"]) - 1.0) * 100.0,
        0.0,
    )
    group_total_df = (
        commercial_matrix_df.groupby("product_group", as_index=False)["final_forecast"]
        .sum()
        .rename(columns={"final_forecast": "group_total_forecast"})
    )
    commercial_matrix_df = commercial_matrix_df.merge(group_total_df, on="product_group", how="left")
    commercial_matrix_df["concentration_ratio"] = commercial_matrix_df.apply(
        lambda row: _clamp01(
            _safe_div(
                float(_to_number(row.get("final_forecast"))),
                float(_to_number(row.get("group_total_forecast"))),
                default=0.0,
            )
        ),
        axis=1,
    )
    max_commercial_forecast = (
        float(max(commercial_matrix_df["final_forecast"].max(), 1.0))
        if not commercial_matrix_df.empty
        else 1.0
    )
    max_commercial_revenue = (
        float(max(commercial_matrix_df["estimated_revenue"].max(), 1.0))
        if not commercial_matrix_df.empty
        else 1.0
    )
    growth_reference_commercial = max(
        float(
            np.percentile(
                commercial_matrix_df["growth_impact_pct"].clip(lower=0.0).to_numpy(dtype=float),
                90,
            )
        )
        if not commercial_matrix_df.empty
        else 0.0,
        10.0,
    )
    commercial_matrix_df["growth_risk"] = commercial_matrix_df["growth_impact_pct"].apply(
        lambda value: _growth_risk_from_pct(float(_to_number(value)), growth_reference_commercial)
    )
    commercial_matrix_df["value_volume_risk"] = commercial_matrix_df.apply(
        lambda row: (
            _clamp01(_safe_div(float(_to_number(row.get("final_forecast"))), max_commercial_forecast, default=0.0))
            + _clamp01(_safe_div(float(_to_number(row.get("estimated_revenue"))), max_commercial_revenue, default=0.0))
        )
        / 2.0,
        axis=1,
    )
    commercial_matrix_df["confidence_risk"] = 1.0 - commercial_matrix_df["forecast_confidence"].fillna(
        fallback_confidence
    )

    top_product_by_customer_group_df = (
        allocation_df.groupby(["customer_label", "product_group", "product_code"], as_index=False)["final_forecast"]
        .sum()
        .sort_values(["customer_label", "product_group", "final_forecast"], ascending=[True, True, False])
        .drop_duplicates(["customer_label", "product_group"], keep="first")
    )
    top_product_by_customer_group_map = {
        (str(row["customer_label"]), str(row["product_group"])): str(row.get("product_code", "-"))
        for row in top_product_by_customer_group_df.to_dict(orient="records")
    }

    commercial_cells: list[dict[str, Any]] = []
    for row in commercial_matrix_df.to_dict(orient="records"):
        customer_label_value = str(row.get("customer_label", "Sem cliente"))
        product_group_value = str(row.get("product_group", "(sem grupo)"))
        components = {
            "growth": float(_to_number(row.get("growth_risk"))),
            "concentration": float(_to_number(row.get("concentration_ratio"))),
            "value_volume": float(_to_number(row.get("value_volume_risk"))),
            "confidence": float(_to_number(row.get("confidence_risk"))),
        }
        score, contributions, driver_key = _score_components(
            components,
            RISK_WEIGHTS_DEFAULT["commercial"],
        )
        level_key, level_label = _risk_level(score)
        commercial_cells.append(
            {
                "customer_label": customer_label_value,
                "product_group": product_group_value,
                "score": score,
                "level_key": level_key,
                "level_label": level_label,
                "primary_driver_key": driver_key,
                "primary_driver_label": RISK_COMPONENT_LABELS.get(driver_key, driver_key),
                "components": {key: float(value) for key, value in components.items()},
                "contributions": {key: float(value) for key, value in contributions.items()},
                "metrics": {
                    "customer_label": customer_label_value,
                    "product_group": product_group_value,
                    "abc_class": None,
                    "final_forecast": float(_to_number(row.get("final_forecast"))),
                    "historical_quantity": float(_to_number(row.get("historical_quantity"))),
                    "estimated_revenue": float(_to_number(row.get("estimated_revenue"))),
                    "growth_impact_pct": float(_to_number(row.get("growth_impact_pct"))),
                    "forecast_confidence": float(_to_number(row.get("forecast_confidence"))),
                    "customer_concentration_pct": float(_to_number(row.get("concentration_ratio"))) * 100.0,
                    "top_product_code": top_product_by_customer_group_map.get(
                        (customer_label_value, product_group_value),
                        "-",
                    ),
                    "top_customer_label": customer_label_value,
                },
                "limitations": [],
            }
        )

    bucket_customer_df = (
        allocation_df.groupby(["product_group", "abc_class", "customer_label"], as_index=False)["final_forecast"]
        .sum()
        .sort_values(["product_group", "abc_class", "final_forecast"], ascending=[True, True, False])
    )
    bucket_totals_df = (
        bucket_customer_df.groupby(["product_group", "abc_class"], as_index=False)["final_forecast"]
        .sum()
        .rename(columns={"final_forecast": "bucket_total_forecast"})
    )
    bucket_customer_df = bucket_customer_df.merge(
        bucket_totals_df,
        on=["product_group", "abc_class"],
        how="left",
    )
    bucket_customer_df["bucket_share"] = bucket_customer_df.apply(
        lambda row: _safe_div(
            float(_to_number(row.get("final_forecast"))),
            float(_to_number(row.get("bucket_total_forecast"))),
            default=0.0,
        ),
        axis=1,
    )
    bucket_top_df = (
        bucket_customer_df.sort_values(["product_group", "abc_class", "bucket_share"], ascending=[True, True, False])
        .drop_duplicates(["product_group", "abc_class"], keep="first")
    )
    bucket_share_map = {
        (str(row["product_group"]), str(row["abc_class"])): float(_to_number(row.get("bucket_share")))
        for row in bucket_top_df.to_dict(orient="records")
    }
    bucket_customer_map = {
        (str(row["product_group"]), str(row["abc_class"])): str(row.get("customer_label", "Sem cliente"))
        for row in bucket_top_df.to_dict(orient="records")
    }

    integrated_cells: list[dict[str, Any]] = []
    for (product_group_value, abc_class_value), bucket in summary_by_product.groupby(
        ["product_group", "abc_class"]
    ):
        weights_bucket = bucket["final_forecast"].astype(float)
        concentration_ratio = _clamp01(
            float(bucket_share_map.get((str(product_group_value), str(abc_class_value)), 0.0))
        )
        criticality_value = (
            _weighted_average_from_series(
                bucket["class_criticality"],
                weights_bucket,
                default=_class_criticality(str(abc_class_value)),
            )
            + _weighted_average_from_series(bucket["volume_norm"], weights_bucket, default=0.0)
        ) / 2.0
        components = {
            "criticality": _clamp01(criticality_value),
            "growth": _weighted_average_from_series(bucket["growth_risk"], weights_bucket, default=0.0),
            "concentration": concentration_ratio,
            "confidence": _weighted_average_from_series(
                bucket["confidence_risk"], weights_bucket, default=1.0 - fallback_confidence
            ),
            "coverage": _weighted_average_from_series(bucket["coverage_risk"], weights_bucket, default=0.70),
        }
        score, contributions, driver_key = _score_components(
            components,
            RISK_WEIGHTS_DEFAULT["integrated"],
        )
        level_key, level_label = _risk_level(score)
        top_row = bucket.sort_values("final_forecast", ascending=False).iloc[0]
        missing_coverage_ratio = _safe_div(
            float((bucket["risk_status"] == "missing_stock_data").sum()),
            float(max(len(bucket), 1)),
            default=0.0,
        )
        integrated_cells.append(
            {
                "product_group": str(product_group_value),
                "abc_class": str(abc_class_value),
                "score": score,
                "level_key": level_key,
                "level_label": level_label,
                "primary_driver_key": driver_key,
                "primary_driver_label": RISK_COMPONENT_LABELS.get(driver_key, driver_key),
                "components": {key: float(value) for key, value in components.items()},
                "contributions": {key: float(value) for key, value in contributions.items()},
                "metrics": {
                    "product_group": str(product_group_value),
                    "abc_class": str(abc_class_value),
                    "customer_label": bucket_customer_map.get(
                        (str(product_group_value), str(abc_class_value)),
                        "Sem cliente",
                    ),
                    "final_forecast": float(bucket["final_forecast"].sum()),
                    "historical_quantity": float(bucket["historical_quantity"].sum()),
                    "estimated_revenue": float(bucket["estimated_revenue"].sum()),
                    "growth_impact_pct": _weighted_average_from_series(
                        bucket["growth_impact_pct"], weights_bucket, default=0.0
                    ),
                    "forecast_confidence": _weighted_average_from_series(
                        bucket["forecast_confidence"], weights_bucket, default=fallback_confidence
                    ),
                    "customer_concentration_pct": concentration_ratio * 100.0,
                    "coverage_days_avg": _weighted_average_from_series(
                        bucket["coverage_days"].fillna(0.0), weights_bucket, default=0.0
                    ),
                    "top_product_code": str(top_row.get("product_code", "-")),
                    "top_customer_label": bucket_customer_map.get(
                        (str(product_group_value), str(abc_class_value)),
                        "Sem cliente",
                    ),
                    "missing_coverage_ratio": missing_coverage_ratio,
                },
                "limitations": (
                    ["Cobertura parcial no cruzamento grupo x classe por falta de estoque."]
                    if missing_coverage_ratio > 0
                    else []
                ),
            }
        )

    operational_heatmap = _build_heatmap_payload(
        name="operational",
        row_key="abc_class",
        column_key="product_group",
        row_label="Classe ABC",
        column_label="Grupo de produto",
        weights=RISK_WEIGHTS_DEFAULT["operational"],
        cells=operational_cells,
    )
    commercial_heatmap = _build_heatmap_payload(
        name="commercial",
        row_key="customer_label",
        column_key="product_group",
        row_label="Cliente",
        column_label="Grupo de produto",
        weights=RISK_WEIGHTS_DEFAULT["commercial"],
        cells=commercial_cells,
    )
    integrated_heatmap = _build_heatmap_payload(
        name="integrated",
        row_key="product_group",
        column_key="abc_class",
        row_label="Grupo de produto",
        column_label="Classe ABC",
        weights=RISK_WEIGHTS_DEFAULT["integrated"],
        cells=integrated_cells,
    )

    top_risks: list[dict[str, Any]] = []
    for heatmap_type, cell_collection in (
        ("integrated", integrated_cells),
        ("operational", operational_cells),
        ("commercial", commercial_cells),
    ):
        for cell in cell_collection:
            metrics = cell.get("metrics", {})
            if not isinstance(metrics, dict):
                metrics = {}
            top_risks.append(
                {
                    "heatmap_type": heatmap_type,
                    "group": metrics.get("product_group"),
                    "abc_class": metrics.get("abc_class"),
                    "customer": metrics.get("customer_label") or metrics.get("top_customer_label"),
                    "product": metrics.get("top_product_code"),
                    "growth_impact_pct": float(_to_number(metrics.get("growth_impact_pct"))),
                    "forecast": float(_to_number(metrics.get("final_forecast"))),
                    "score": float(_to_number(cell.get("score"))),
                    "risk_level_key": str(cell.get("level_key", "moderate")),
                    "risk_level_label": str(cell.get("level_label", "moderado")),
                    "primary_driver_key": str(cell.get("primary_driver_key", "growth")),
                    "primary_driver_label": str(cell.get("primary_driver_label", "Crescimento projetado")),
                }
            )
    top_risks = sorted(top_risks, key=lambda row: float(_to_number(row.get("score"))), reverse=True)[:12]

    risk_limitations: list[str] = []
    if missing_stock_count > 0:
        risk_limitations.append(
            "Parte dos produtos nao possui estoque/cobertura; leitura de risco operacional/comercial fica parcial."
        )
    if int(summary_by_product["mape"].isna().sum()) > 0:
        risk_limitations.append(
            "Parte dos SKUs sem historico suficiente para MAPE; confianca usa fallback estatistico."
        )
    if not bool(ingestion_metadata.get("group_available")):
        risk_limitations.append(
            "Base sem grupo de produto em parte das linhas; o heatmap pode concentrar itens em '(sem grupo)'."
        )

    risk_scoring = {
        "generated_at": _now_iso(),
        "score_scale": {"min": 0.0, "max": 100.0},
        "level_thresholds": RISK_LEVEL_THRESHOLDS,
        "component_labels": RISK_COMPONENT_LABELS,
        "weights": {
            name: _normalize_weights(value)
            for name, value in RISK_WEIGHTS_DEFAULT.items()
        },
        "operational_heatmap": operational_heatmap,
        "commercial_heatmap": commercial_heatmap,
        "integrated_heatmap": integrated_heatmap,
        "top_risks": top_risks,
        "data_limitations": risk_limitations,
    }

    overall_confidence = _weighted_average_from_series(
        summary_by_product["forecast_confidence"],
        summary_by_product["final_forecast"],
        default=fallback_confidence,
    )
    forecast_confidence_payload = {
        "score": overall_confidence,
        "percent": overall_confidence * 100.0,
        "label": _confidence_label(overall_confidence),
    }

    totals = {
        "base_forecast": float(allocation_df["base_forecast"].sum()),
        "final_forecast": float(allocation_df["final_forecast"].sum()),
        "historical_quantity": historical_total_quantity,
        "historical_value": historical_total_value,
        "estimated_revenue": float(summary_by_product["estimated_revenue"].sum()),
        "projected_purchase_need_qty": float(
            sum(_to_number(row.get("projected_purchase_need_qty")) for row in scenario_rows)
        ),
        "projected_purchase_value_usd": float(
            sum(_to_number(row.get("projected_purchase_value_usd")) for row in scenario_rows)
        ),
        "materials_with_purchase_need": int(
            sum(1 for row in scenario_rows if bool(row.get("purchase_needed")))
        ),
    }
    totals["growth_impact_pct"] = (
        ((totals["final_forecast"] / totals["base_forecast"]) - 1.0) * 100.0
        if totals["base_forecast"] > 0
        else 0.0
    )

    filtered_period_start = filtered_df["order_date"].min()
    filtered_period_end = filtered_df["order_date"].max()

    data_warnings = list(ingestion_warnings)
    if missing_stock_count > 0:
        data_warnings.append(
            "Estoque/cobertura nao disponivel para parte dos produtos. Alertas MTS/MTU podem estar parciais."
        )
    if missing_cost_count > 0:
        data_warnings.append(
            "Parte dos itens com necessidade de compra nao possui custo liquido; impacto financeiro ficou parcial."
        )

    if any(
        (
            aggregate_metrics[method_name]["support"] == 0
            for method_name in FORECAST_METHODS
        )
    ):
        data_warnings.append(
            "Historico insuficiente em parte dos produtos para calcular erro de todos os metodos."
        )

    data_warnings.extend(
        limitation for limitation in risk_limitations if limitation not in data_warnings
    )

    result = {
        "generated_at": _now_iso(),
        "scenario_name": scenario_name or "Cenario principal",
        "method_selection_mode": method_mode,
        "selected_method": selected_method,
        "recommended_method": recommended_method,
        "available_methods": list(FORECAST_METHODS),
        "method_metrics": aggregate_metrics,
        "forecast_confidence": forecast_confidence_payload,
        "totals": totals,
        "filters_applied": {
            "product_codes": [str(value) for value in (product_codes or [])],
            "customer_codes": [str(value) for value in (customer_codes or [])],
            "product_groups": [str(value) for value in (product_groups or [])],
            "abc_classes": [str(value) for value in (abc_classes or [])],
            "start_date": start_date,
            "end_date": end_date,
            "effective_period_start": (
                filtered_period_start.isoformat() if pd.notna(filtered_period_start) else None
            ),
            "effective_period_end": (
                filtered_period_end.isoformat() if pd.notna(filtered_period_end) else None
            ),
        },
        "growth_parameters": {
            "global_pct": global_growth_pct,
            "by_product": growth_product,
            "by_customer": growth_customer,
            "by_group": growth_group,
            "by_class": growth_class,
        },
        "dimension_availability": {
            "product_group_available": bool(ingestion_metadata.get("group_available")),
            "abc_class_available": bool(ingestion_metadata.get("class_available")),
            "abc_class_source": ingestion_metadata.get("class_source"),
        },
        "forecast_visual": forecast_visual,
        "summary_by_product": summary_by_product_records,
        "summary_by_customer": summary_by_customer_records,
        "summary_by_group": summary_by_group_records,
        "summary_by_class": summary_by_class_records,
        "summary_by_group_customer": commercial_matrix_df.to_dict(orient="records"),
        "summary_by_group_class": [
            {
                "product_group": cell.get("product_group"),
                "abc_class": cell.get("abc_class"),
                "score": cell.get("score"),
                "level_label": cell.get("level_label"),
                "primary_driver_label": cell.get("primary_driver_label"),
                "metrics": cell.get("metrics", {}),
            }
            for cell in integrated_cells
        ],
        "mts_mtu_scenarios": scenario_rows,
        "risk_scoring": risk_scoring,
        "risk_alerts": {
            "rupture_risk_count": rupture_risk_count,
            "excess_risk_count": excess_risk_count,
            "missing_stock_count": missing_stock_count,
            "purchase_need_count": purchase_need_count,
            "total_products_evaluated": len(scenario_rows),
        },
        "data_warnings": data_warnings,
    }
    return result

