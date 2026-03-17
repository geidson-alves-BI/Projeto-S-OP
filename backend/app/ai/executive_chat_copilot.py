from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import json
import re
import unicodedata
from typing import Any

import pandas as pd

BASE_SUGGESTIONS = [
    "Quais sao os 5 maiores riscos executivos deste cenario?",
    "Qual classe ABC tera maior crescimento?",
    "Qual grupo de produto merece mais atencao?",
    "O crescimento comercial esta pressionando a operacao?",
    "Qual a previsao de demanda do cliente X?",
    "Quais produtos o cliente X comprou no ultimo ano?",
    "Ha risco de ruptura com o cenario atual?",
    "O forecast atual e confiavel?",
    "O que devo discutir na proxima reuniao de S&OP?",
    "Ha alguma limitacao importante nos dados para esta analise?",
]

QUERY_MODE_FACTUAL = "factual"
QUERY_MODE_EXECUTIVE = "executive"

FACTUAL_INTENTS = {
    "production_total_by_product",
    "production_by_month_for_product",
    "abc_xyz_by_product",
    "sales_total_by_product",
    "sales_total_by_customer",
    "customer_products_last_year",
    "stock_lookup_by_material_or_product",
}


@dataclass
class ResponseDraft:
    direct_answer: str = ""
    evidence: list[str] = field(default_factory=list)
    risks_limitations: list[str] = field(default_factory=list)
    executive_recommendation: list[str] = field(default_factory=list)
    data_points: list[dict[str, Any]] = field(default_factory=list)
    confidence: str = "medium"
    partial: bool = False
    missing_data: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)


@dataclass
class IntentResolution:
    query_mode: str
    intent: str
    entities: dict[str, str] = field(default_factory=dict)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _normalize_text(value: str) -> str:
    return " ".join(_strip_accents(str(value or "")).strip().lower().split())


def _contains_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def _to_number(value: Any) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
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
    try:
        return float(normalized)
    except ValueError:
        return 0.0


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if pd.isna(value):
            return None
        return int(value)
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.isdigit():
        return int(raw)
    parsed = _to_number(raw)
    if parsed == 0.0 and raw not in {"0", "0,0", "0.0"}:
        return None
    return int(parsed)


def _month_to_int(value: Any) -> int | None:
    parsed = _to_int(value)
    if parsed is not None and 1 <= parsed <= 12:
        return parsed
    raw = _normalize_text(str(value or ""))
    if not raw:
        return None
    month_alias = {
        "jan": 1,
        "janeiro": 1,
        "feb": 2,
        "fev": 2,
        "fevereiro": 2,
        "mar": 3,
        "marco": 3,
        "abril": 4,
        "abr": 4,
        "may": 5,
        "maio": 5,
        "jun": 6,
        "junho": 6,
        "jul": 7,
        "julho": 7,
        "aug": 8,
        "ago": 8,
        "agosto": 8,
        "sep": 9,
        "set": 9,
        "setembro": 9,
        "oct": 10,
        "out": 10,
        "outubro": 10,
        "nov": 11,
        "novembro": 11,
        "dec": 12,
        "dez": 12,
        "dezembro": 12,
    }
    return month_alias.get(raw)


def _build_production_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "product_description",
                "produced_quantity",
                "month",
                "reference_year",
                "period_start",
                "period_label",
            ]
        )

    frame = pd.DataFrame(rows)
    for column in ("product_code", "product_description"):
        if column not in frame.columns:
            frame[column] = ""
        frame[column] = frame[column].astype(str).str.strip()

    if "produced_quantity" not in frame.columns:
        frame["produced_quantity"] = 0.0
    frame["produced_quantity"] = frame["produced_quantity"].map(_to_number)

    if "month" not in frame.columns:
        frame["month"] = None
    frame["month"] = frame["month"].map(_month_to_int)

    if "reference_year" not in frame.columns:
        frame["reference_year"] = None
    frame["reference_year"] = frame["reference_year"].map(_to_int)

    frame["period_start"] = pd.NaT
    valid_period = frame["month"].notna() & frame["reference_year"].notna()
    if bool(valid_period.any()):
        frame.loc[valid_period, "period_start"] = pd.to_datetime(
            {
                "year": frame.loc[valid_period, "reference_year"].astype(int),
                "month": frame.loc[valid_period, "month"].astype(int),
                "day": 1,
            },
            errors="coerce",
        )
    frame["period_label"] = frame["period_start"].dt.strftime("%Y-%m")
    frame = frame[frame["product_code"] != ""].copy()
    return frame.reset_index(drop=True)


def _build_customers_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "customer_code",
                "customer_name",
                "product_group",
                "abc_class",
            ]
        )

    frame = pd.DataFrame(rows)
    for column in ("product_code", "customer_code", "customer_name", "product_group", "abc_class"):
        if column not in frame.columns:
            frame[column] = ""
        frame[column] = frame[column].astype(str).str.strip()
    return frame.reset_index(drop=True)


def _build_inventory_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "product_description",
                "group_description",
                "available_stock",
                "safety_stock",
                "on_order_stock",
                "reorder_point",
                "consumption_30_days",
                "average_consumption_90_days",
                "replenishment_time_days",
            ]
        )

    frame = pd.DataFrame(rows)
    for column in ("product_code", "product_description", "group_description"):
        if column not in frame.columns:
            frame[column] = ""
        frame[column] = frame[column].astype(str).str.strip()

    for column in (
        "available_stock",
        "safety_stock",
        "on_order_stock",
        "reorder_point",
        "consumption_30_days",
        "average_consumption_90_days",
        "replenishment_time_days",
    ):
        if column not in frame.columns:
            frame[column] = 0.0
        frame[column] = frame[column].map(_to_number)

    frame = frame[frame["product_code"] != ""].copy()
    return frame.reset_index(drop=True)


def _format_number(value: float) -> str:
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _format_pct(value: float) -> str:
    return f"{value:.2f}%"


def _format_currency(value: float) -> str:
    return f"R$ {_format_number(value)}"


def _unique_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        text = str(item or "").strip()
        if not text:
            continue
        key = _normalize_text(text)
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def _match_entity(query: str, candidates: list[str]) -> str | None:
    normalized_query = _normalize_text(query)
    scored: list[tuple[int, str]] = []
    for candidate in candidates:
        normalized_candidate = _normalize_text(candidate)
        if not normalized_candidate:
            continue
        if normalized_candidate in normalized_query:
            scored.append((len(normalized_candidate), candidate))
    if not scored:
        return None
    scored.sort(key=lambda row: row[0], reverse=True)
    return scored[0][1]


def _safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _safe_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_str(value: Any, default: str = "") -> str:
    text = str(value or "").strip()
    return text if text else default


def _confidence_from_score(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.5:
        return "medium"
    return "low"


def _build_sales_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "customer_code",
                "customer_name",
                "product_group",
                "abc_class",
                "order_quantity",
                "price",
                "order_value",
                "order_date",
            ]
        )

    frame = pd.DataFrame(rows)
    for column in (
        "product_code",
        "customer_code",
        "customer_name",
        "product_group",
        "abc_class",
    ):
        if column not in frame.columns:
            frame[column] = ""
        frame[column] = frame[column].astype(str).str.strip()

    for column in ("order_quantity", "price"):
        if column not in frame.columns:
            frame[column] = 0.0
        frame[column] = frame[column].map(_to_number)

    frame["order_value"] = frame["order_quantity"] * frame["price"]
    if "order_date" in frame.columns:
        frame["order_date"] = pd.to_datetime(frame["order_date"], errors="coerce")
    else:
        frame["order_date"] = pd.NaT
    return frame


def _build_candidates(rows: list[dict[str, Any]], keys: list[str]) -> list[str]:
    values: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in keys:
            text = _safe_str(row.get(key))
            if text:
                values.append(text)
    return _unique_keep_order(values)


def _candidate_map(values: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for value in values:
        clean = _safe_str(value)
        if not clean:
            continue
        normalized = _normalize_text(clean)
        if normalized and normalized not in out:
            out[normalized] = clean
    return out


def _resolve_code_entity(query: str, candidates: list[str], *, hints: list[str] | None = None) -> str | None:
    if not candidates:
        return None
    candidate_index = _candidate_map(candidates)
    if not candidate_index:
        return None

    hint_tokens = [re.escape(_normalize_text(token)) for token in (hints or []) if _normalize_text(token)]
    if hint_tokens:
        hint_pattern = rf"(?:{'|'.join(hint_tokens)})\s*[:#-]?\s*([a-z0-9._/-]+)"
        hinted_match = re.search(hint_pattern, query)
        if hinted_match:
            hinted_token = _normalize_text(hinted_match.group(1))
            if hinted_token in candidate_index:
                return candidate_index[hinted_token]

    for token in re.findall(r"\b[a-z0-9][a-z0-9._/-]{1,}\b", query):
        normalized_token = _normalize_text(token)
        if normalized_token in candidate_index:
            return candidate_index[normalized_token]

    return _match_entity(query, candidates)


def _mode_text(values: pd.Series, default: str = "") -> str:
    if values.empty:
        return default
    clean = (
        values.astype(str)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "none": pd.NA, "None": pd.NA})
        .dropna()
    )
    if clean.empty:
        return default
    mode = clean.mode()
    if mode.empty:
        return default
    return _safe_str(mode.iloc[0], default)


def _derive_abc_map_from_totals(product_totals: pd.Series) -> dict[str, str]:
    if product_totals.empty:
        return {}
    bucket = (
        product_totals.reset_index()
        .rename(columns={product_totals.index.name or "index": "product_code", 0: "total"})
        .fillna(0.0)
    )
    if "total" not in bucket.columns:
        amount_column = [column for column in bucket.columns if column != "product_code"]
        if amount_column:
            bucket = bucket.rename(columns={amount_column[0]: "total"})
        else:
            bucket["total"] = 0.0
    bucket["total"] = bucket["total"].map(_to_number)
    bucket = bucket[bucket["product_code"].astype(str).str.strip() != ""]
    if bucket.empty:
        return {}
    bucket = bucket.sort_values("total", ascending=False).reset_index(drop=True)
    total_sum = float(bucket["total"].sum()) or 1.0
    bucket["share"] = bucket["total"] / total_sum
    bucket["cum_share"] = bucket["share"].cumsum()

    out: dict[str, str] = {}
    for row in bucket.to_dict(orient="records"):
        product_code = _safe_str(row.get("product_code"))
        if not product_code:
            continue
        cum_share = float(_to_number(row.get("cum_share")))
        if cum_share <= 0.80:
            out[product_code] = "A"
        elif cum_share <= 0.95:
            out[product_code] = "B"
        else:
            out[product_code] = "C"
    return out


def _derive_xyz_from_production(production_df: pd.DataFrame) -> dict[str, str]:
    if production_df.empty:
        return {}
    if "period_label" not in production_df.columns:
        return {}
    monthly = (
        production_df.groupby(["product_code", "period_label"], as_index=False)["produced_quantity"]
        .sum()
        .sort_values(["product_code", "period_label"])
    )
    if monthly.empty:
        return {}

    out: dict[str, str] = {}
    for product_code, bucket in monthly.groupby("product_code"):
        quantities = bucket["produced_quantity"].map(_to_number).astype(float)
        if len(quantities) < 2:
            out[str(product_code)] = "UNCLASSIFIED"
            continue
        mean_value = float(quantities.mean())
        std_value = float(quantities.std(ddof=0))
        if mean_value <= 0:
            out[str(product_code)] = "UNCLASSIFIED"
            continue
        cv = std_value / mean_value
        if cv <= 0.5:
            out[str(product_code)] = "X"
        elif cv <= 1.0:
            out[str(product_code)] = "Y"
        else:
            out[str(product_code)] = "Z"
    return out


def _build_product_classification_frame(
    *,
    summary_by_product: list[dict[str, Any]],
    sales_df: pd.DataFrame,
    customers_df: pd.DataFrame,
    production_df: pd.DataFrame,
) -> pd.DataFrame:
    product_codes: list[str] = []
    product_codes.extend(_build_candidates(summary_by_product, ["product_code"]))
    if isinstance(sales_df, pd.DataFrame) and not sales_df.empty and "product_code" in sales_df.columns:
        product_codes.extend(sales_df["product_code"].dropna().astype(str).str.strip().tolist())
    if isinstance(customers_df, pd.DataFrame) and not customers_df.empty and "product_code" in customers_df.columns:
        product_codes.extend(customers_df["product_code"].dropna().astype(str).str.strip().tolist())
    if isinstance(production_df, pd.DataFrame) and not production_df.empty and "product_code" in production_df.columns:
        product_codes.extend(production_df["product_code"].dropna().astype(str).str.strip().tolist())
    product_codes = _unique_keep_order(product_codes)

    if not product_codes:
        return pd.DataFrame(columns=["product_code", "abc_class", "xyz_class", "abc_source", "xyz_source"])

    frame = pd.DataFrame({"product_code": product_codes})
    frame["abc_class"] = ""
    frame["xyz_class"] = ""
    frame["abc_source"] = ""
    frame["xyz_source"] = ""

    planning_abc: dict[str, str] = {}
    planning_xyz: dict[str, str] = {}
    for row in summary_by_product:
        if not isinstance(row, dict):
            continue
        product_code = _safe_str(row.get("product_code"))
        if not product_code:
            continue
        abc_class = _safe_str(row.get("abc_class")).upper()
        xyz_class = _safe_str(row.get("xyz_class")).upper()
        if abc_class in {"A", "B", "C", "UNCLASSIFIED"} and product_code not in planning_abc:
            planning_abc[product_code] = abc_class
        if xyz_class in {"X", "Y", "Z", "UNCLASSIFIED"} and product_code not in planning_xyz:
            planning_xyz[product_code] = xyz_class

    sales_abc: dict[str, str] = {}
    sales_xyz: dict[str, str] = {}
    if not sales_df.empty and "product_code" in sales_df.columns:
        if "abc_class" in sales_df.columns:
            grouped_abc = sales_df.groupby("product_code")["abc_class"].apply(_mode_text)
            sales_abc = {
                _safe_str(product): _safe_str(value).upper()
                for product, value in grouped_abc.to_dict().items()
                if _safe_str(product) and _safe_str(value).upper() in {"A", "B", "C", "UNCLASSIFIED"}
            }
        if "xyz_class" in sales_df.columns:
            grouped_xyz = sales_df.groupby("product_code")["xyz_class"].apply(_mode_text)
            sales_xyz = {
                _safe_str(product): _safe_str(value).upper()
                for product, value in grouped_xyz.to_dict().items()
                if _safe_str(product) and _safe_str(value).upper() in {"X", "Y", "Z", "UNCLASSIFIED"}
            }

    customer_abc: dict[str, str] = {}
    customer_xyz: dict[str, str] = {}
    if not customers_df.empty and "product_code" in customers_df.columns:
        if "abc_class" in customers_df.columns:
            grouped_abc = customers_df.groupby("product_code")["abc_class"].apply(_mode_text)
            customer_abc = {
                _safe_str(product): _safe_str(value).upper()
                for product, value in grouped_abc.to_dict().items()
                if _safe_str(product) and _safe_str(value).upper() in {"A", "B", "C", "UNCLASSIFIED"}
            }
        if "xyz_class" in customers_df.columns:
            grouped_xyz = customers_df.groupby("product_code")["xyz_class"].apply(_mode_text)
            customer_xyz = {
                _safe_str(product): _safe_str(value).upper()
                for product, value in grouped_xyz.to_dict().items()
                if _safe_str(product) and _safe_str(value).upper() in {"X", "Y", "Z", "UNCLASSIFIED"}
            }

    derived_abc_sales: dict[str, str] = {}
    if not sales_df.empty and {"product_code", "order_quantity"}.issubset(set(sales_df.columns)):
        totals = sales_df.groupby("product_code")["order_quantity"].sum()
        derived_abc_sales = _derive_abc_map_from_totals(totals)

    derived_abc_production: dict[str, str] = {}
    if not production_df.empty and {"product_code", "produced_quantity"}.issubset(set(production_df.columns)):
        totals = production_df.groupby("product_code")["produced_quantity"].sum()
        derived_abc_production = _derive_abc_map_from_totals(totals)

    derived_xyz_production = _derive_xyz_from_production(production_df)

    for index, row in frame.iterrows():
        product_code = _safe_str(row.get("product_code"))
        if not product_code:
            continue

        abc_value = ""
        abc_source = ""
        for source_name, source_map in (
            ("planning_result", planning_abc),
            ("sales_orders", sales_abc),
            ("customers", customer_abc),
            ("sales_orders_derived", derived_abc_sales),
            ("production_derived", derived_abc_production),
        ):
            candidate = _safe_str(source_map.get(product_code)).upper()
            if candidate in {"A", "B", "C", "UNCLASSIFIED"}:
                abc_value = candidate
                abc_source = source_name
                break

        xyz_value = ""
        xyz_source = ""
        for source_name, source_map in (
            ("planning_result", planning_xyz),
            ("sales_orders", sales_xyz),
            ("customers", customer_xyz),
            ("production_derived", derived_xyz_production),
        ):
            candidate = _safe_str(source_map.get(product_code)).upper()
            if candidate in {"X", "Y", "Z", "UNCLASSIFIED"}:
                xyz_value = candidate
                xyz_source = source_name
                break

        frame.at[index, "abc_class"] = abc_value or "UNCLASSIFIED"
        frame.at[index, "abc_source"] = abc_source or "unavailable"
        frame.at[index, "xyz_class"] = xyz_value or "UNCLASSIFIED"
        frame.at[index, "xyz_source"] = xyz_source or "unavailable"

    return frame.reset_index(drop=True)


def _top_rows_by(rows: list[dict[str, Any]], key: str, top_n: int = 5) -> list[dict[str, Any]]:
    ordered = sorted(rows, key=lambda row: float(_to_number(row.get(key))), reverse=True)
    return ordered[:top_n]


def _aggregate_risk_levels(top_risks: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"low": 0, "moderate": 0, "high": 0, "critical": 0}
    for row in top_risks:
        key = _safe_str(row.get("risk_level_key"), "moderate").lower()
        if key not in counts:
            key = "moderate"
        counts[key] += 1
    return counts


def _predominant_driver(top_risks: list[dict[str, Any]]) -> str:
    if not top_risks:
        return "Nao identificado"
    score_map: dict[str, int] = {}
    for row in top_risks:
        label = _safe_str(row.get("primary_driver_label"), "Driver nao informado")
        score_map[label] = score_map.get(label, 0) + 1
    return sorted(score_map.items(), key=lambda pair: pair[1], reverse=True)[0][0]


def _build_session_context(history: list[dict[str, Any]]) -> dict[str, Any]:
    recent_questions = [
        _safe_str(item.get("content"))
        for item in history
        if isinstance(item, dict) and _safe_str(item.get("role")).lower() == "user"
    ][-6:]

    topics: list[str] = []
    for question in recent_questions:
        normalized = _normalize_text(question)
        if _contains_any(normalized, ["risco", "heatmap", "ruptura", "excesso"]):
            topics.append("risco")
        if _contains_any(normalized, ["forecast", "previsao", "demanda", "metodo"]):
            topics.append("forecast")
        if _contains_any(normalized, ["cobertura", "estoque", "mts", "mtu"]):
            topics.append("cobertura")
        if _contains_any(normalized, ["cliente", "comercial", "concentracao"]):
            topics.append("comercial")
        if _contains_any(normalized, ["financeiro", "dre", "caixa", "margem"]):
            topics.append("financeiro")
        if _contains_any(normalized, ["s&op", "s&oe", "reuniao"]):
            topics.append("ritual_executivo")

    return {
        "recent_questions": recent_questions,
        "focus_topics": _unique_keep_order(topics),
    }


def _build_chat_context(
    *,
    planning_result: dict[str, Any] | None,
    sales_rows: list[dict[str, Any]],
    production_rows: list[dict[str, Any]],
    customers_rows: list[dict[str, Any]],
    inventory_rows: list[dict[str, Any]],
    manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    sales_df = _build_sales_dataframe(sales_rows)
    production_df = _build_production_dataframe(production_rows)
    customers_df = _build_customers_dataframe(customers_rows)
    inventory_df = _build_inventory_dataframe(inventory_rows)
    planning = planning_result if isinstance(planning_result, dict) else {}

    summary_by_product = _safe_list(planning.get("summary_by_product"))
    summary_by_customer = _safe_list(planning.get("summary_by_customer"))
    summary_by_group = _safe_list(planning.get("summary_by_group"))
    summary_by_class = _safe_list(planning.get("summary_by_class"))
    summary_by_group_customer = _safe_list(planning.get("summary_by_group_customer"))
    method_metrics = _safe_dict(planning.get("method_metrics"))
    totals = _safe_dict(planning.get("totals"))
    filters_applied = _safe_dict(planning.get("filters_applied"))
    growth_parameters = _safe_dict(planning.get("growth_parameters"))
    forecast_confidence = _safe_dict(planning.get("forecast_confidence"))
    risk_alerts = _safe_dict(planning.get("risk_alerts"))
    data_warnings = _safe_list(planning.get("data_warnings"))
    forecast_visual = _safe_dict(planning.get("forecast_visual"))

    risk_scoring = _safe_dict(planning.get("risk_scoring"))
    top_risks = _safe_list(risk_scoring.get("top_risks"))
    risk_limitations = _safe_list(risk_scoring.get("data_limitations"))

    finance_state = _safe_dict(manifest.get("finance_documents"))
    finance_availability = _safe_str(finance_state.get("availability_status"), "unavailable")
    finance_validation = _safe_str(finance_state.get("validation_status"), "missing")

    missing_data: list[str] = []
    limitations: list[str] = []

    if not planning:
        missing_data.append("Resultado consolidado de Análise e Planejamento de Demanda")
    if not summary_by_product:
        missing_data.append("Forecast consolidado por produto")
    if not summary_by_customer:
        missing_data.append("Forecast consolidado por cliente")
    if not summary_by_group:
        missing_data.append("Forecast consolidado por grupo de produto")
    if not summary_by_class:
        missing_data.append("Forecast consolidado por classe ABC")
    if not method_metrics:
        missing_data.append("Metricas de qualidade do forecast (MAE, MAPE, RMSE, Bias)")
    if not top_risks:
        missing_data.append("Top riscos executivos e score de risco")
    if not risk_alerts:
        missing_data.append("Alertas executivos de ruptura/excesso")
    if sales_df.empty:
        missing_data.append("Historico de pedidos (dataset sales_orders)")
    if production_df.empty:
        missing_data.append("Historico de producao (dataset production)")
    if finance_availability == "unavailable":
        missing_data.append("Documentos financeiros DRE")

    if finance_availability == "partial":
        limitations.append(
            "Documentos financeiros foram enviados, mas ainda estao parciais para leitura estruturada."
        )
    if finance_availability == "unavailable":
        limitations.append(
            "Sem DRE estruturado: recomendacoes financeiras ficam limitadas."
        )
    if forecast_confidence:
        confidence_score = float(_to_number(forecast_confidence.get("score")))
        if confidence_score < 0.5:
            limitations.append(
                "Confianca global da previsao esta baixa; usar a resposta como direcional."
            )
    limitations.extend(str(item) for item in data_warnings if str(item).strip())
    limitations.extend(str(item) for item in risk_limitations if str(item).strip())
    limitations = _unique_keep_order(limitations)
    missing_data = _unique_keep_order(missing_data)

    scenario_rows = _safe_list(planning.get("mts_mtu_scenarios"))
    products_with_coverage = 0
    low_coverage_count = 0
    for row in summary_by_product:
        if not isinstance(row, dict):
            continue
        coverage_days = row.get("coverage_days")
        if isinstance(coverage_days, (int, float)):
            products_with_coverage += 1
            if float(coverage_days) < 20.0:
                low_coverage_count += 1

    risk_level_counts = _aggregate_risk_levels(top_risks)
    top_group_growth = _top_rows_by(summary_by_group, "growth_impact_pct", top_n=3)
    top_class_growth = _top_rows_by(summary_by_class, "growth_impact_pct", top_n=3)
    top_customer_forecast = _top_rows_by(summary_by_customer, "final_forecast", top_n=5)
    top_product_forecast = _top_rows_by(summary_by_product, "final_forecast", top_n=5)
    product_classification = _build_product_classification_frame(
        summary_by_product=summary_by_product,
        sales_df=sales_df,
        customers_df=customers_df,
        production_df=production_df,
    )

    selected_method = _safe_str(planning.get("selected_method"), "auto")
    selected_method_metrics = _safe_dict(method_metrics.get(selected_method))
    horizon_months = len(_safe_list(forecast_visual.get("forecast_monthly"))) or None

    session_context = _build_session_context(history)
    context_summary = {
        "scenario_name": _safe_str(planning.get("scenario_name"), "Cenario atual"),
        "analysis_generated_at": planning.get("generated_at"),
        "filters_active": filters_applied,
        "selected_method": selected_method,
        "recommended_method": _safe_str(planning.get("recommended_method"), selected_method),
        "method_selection_mode": _safe_str(planning.get("method_selection_mode"), "auto"),
        "horizon_months": horizon_months,
        "growth_applied": growth_parameters,
        "forecast_totals": totals,
        "forecast_confidence": forecast_confidence,
        "quality_metrics": {
            "selected_method": selected_method,
            "selected_method_metrics": selected_method_metrics,
            "all_methods": method_metrics,
        },
        "forecast_by_product_top": top_product_forecast,
        "forecast_by_customer_top": top_customer_forecast,
        "forecast_by_group_top": top_group_growth,
        "forecast_by_class_top": top_class_growth,
        "risk_overview": {
            "predominant_driver": _predominant_driver(top_risks),
            "top_risks": top_risks[:8],
            "level_counts": risk_level_counts,
        },
        "coverage_overview": {
            "rupture_risk_count": int(_to_number(risk_alerts.get("rupture_risk_count"))),
            "excess_risk_count": int(_to_number(risk_alerts.get("excess_risk_count"))),
            "missing_stock_count": int(_to_number(risk_alerts.get("missing_stock_count"))),
            "products_evaluated": int(_to_number(risk_alerts.get("total_products_evaluated"))),
            "products_with_coverage": products_with_coverage,
            "low_coverage_count": low_coverage_count,
            "mts_mtu_rows": len(scenario_rows),
        },
        "commercial_overview": {
            "group_customer_rows": len(summary_by_group_customer),
        },
        "factual_sources": {
            "production": {"rows": int(len(production_df)), "available": bool(not production_df.empty)},
            "sales_orders": {"rows": int(len(sales_df)), "available": bool(not sales_df.empty)},
            "customers": {"rows": int(len(customers_df)), "available": bool(not customers_df.empty)},
            "raw_material_inventory": {"rows": int(len(inventory_df)), "available": bool(not inventory_df.empty)},
            "classification": {
                "rows": int(len(product_classification)),
                "available": bool(not product_classification.empty),
            },
        },
        "alerts": data_warnings[:8],
        "finance_status": {
            "uploaded": bool(finance_state.get("uploaded")),
            "availability_status": finance_availability,
            "validation_status": finance_validation,
            "filename": finance_state.get("filename"),
            "updated_at": finance_state.get("uploaded_at"),
            "structured": finance_availability == "ready",
        },
        "analysis_confidence": _safe_str(forecast_confidence.get("label"), "nao informado"),
        "limitations": limitations[:12],
        "missing_data": missing_data[:12],
        "session_context": session_context,
    }

    customers = _build_candidates(
        summary_by_customer,
        ["customer_label", "customer_name", "customer_code"],
    )
    customers.extend(
        _unique_keep_order(
            sales_df["customer_name"].dropna().astype(str).tolist()
            + sales_df["customer_code"].dropna().astype(str).tolist()
            + customers_df["customer_name"].dropna().astype(str).tolist()
            + customers_df["customer_code"].dropna().astype(str).tolist()
        )
    )

    product_candidates = _build_candidates(summary_by_product, ["product_code"])
    product_candidates.extend(
        _unique_keep_order(
            sales_df["product_code"].dropna().astype(str).tolist()
            + production_df["product_code"].dropna().astype(str).tolist()
            + customers_df["product_code"].dropna().astype(str).tolist()
            + product_classification["product_code"].dropna().astype(str).tolist()
        )
    )

    group_candidates = _build_candidates(summary_by_group, ["product_group"])
    if "product_group" in sales_df.columns:
        group_candidates.extend(sales_df["product_group"].dropna().astype(str).tolist())
    if "product_group" in customers_df.columns:
        group_candidates.extend(customers_df["product_group"].dropna().astype(str).tolist())
    if "group_description" in inventory_df.columns:
        group_candidates.extend(inventory_df["group_description"].dropna().astype(str).tolist())

    class_candidates = _build_candidates(summary_by_class, ["abc_class"])
    if "abc_class" in sales_df.columns:
        class_candidates.extend(sales_df["abc_class"].dropna().astype(str).tolist())
    if "abc_class" in customers_df.columns:
        class_candidates.extend(customers_df["abc_class"].dropna().astype(str).tolist())
    if not product_classification.empty and "abc_class" in product_classification.columns:
        class_candidates.extend(product_classification["abc_class"].dropna().astype(str).tolist())

    xyz_candidates: list[str] = []
    if not product_classification.empty and "xyz_class" in product_classification.columns:
        xyz_candidates.extend(product_classification["xyz_class"].dropna().astype(str).tolist())
    xyz_candidates = _unique_keep_order([value for value in xyz_candidates if value and value != "UNCLASSIFIED"])

    customer_name_candidates = _unique_keep_order(
        sales_df["customer_name"].dropna().astype(str).tolist()
        + customers_df["customer_name"].dropna().astype(str).tolist()
        + _build_candidates(summary_by_customer, ["customer_name", "customer_label"])
    )
    customer_code_candidates = _unique_keep_order(
        sales_df["customer_code"].dropna().astype(str).tolist()
        + customers_df["customer_code"].dropna().astype(str).tolist()
        + _build_candidates(summary_by_customer, ["customer_code"])
    )
    material_candidates = _unique_keep_order(
        inventory_df["product_code"].dropna().astype(str).tolist()
        + inventory_df["product_description"].dropna().astype(str).tolist()
    )

    customer_code_to_name: dict[str, str] = {}
    for row in sales_df.to_dict(orient="records") + customers_df.to_dict(orient="records"):
        if not isinstance(row, dict):
            continue
        customer_code = _safe_str(row.get("customer_code"))
        customer_name = _safe_str(row.get("customer_name"))
        if customer_code and customer_name and customer_code not in customer_code_to_name:
            customer_code_to_name[customer_code] = customer_name

    customer_name_to_code: dict[str, str] = {}
    for code, name in customer_code_to_name.items():
        normalized_name = _normalize_text(name)
        if normalized_name and normalized_name not in customer_name_to_code:
            customer_name_to_code[normalized_name] = code

    return {
        "planning_result": planning,
        "sales_df": sales_df,
        "production_df": production_df,
        "customers_df": customers_df,
        "inventory_df": inventory_df,
        "product_classification_df": product_classification,
        "summary_by_product": summary_by_product,
        "summary_by_customer": summary_by_customer,
        "summary_by_group": summary_by_group,
        "summary_by_class": summary_by_class,
        "summary_by_group_customer": summary_by_group_customer,
        "top_risks": top_risks,
        "method_metrics": method_metrics,
        "totals": totals,
        "growth_parameters": growth_parameters,
        "risk_alerts": risk_alerts,
        "forecast_confidence": forecast_confidence,
        "selected_method": selected_method,
        "selected_method_metrics": selected_method_metrics,
        "customer_candidates": _unique_keep_order(customers),
        "customer_name_candidates": customer_name_candidates,
        "customer_code_candidates": customer_code_candidates,
        "customer_code_to_name": customer_code_to_name,
        "customer_name_to_code": customer_name_to_code,
        "product_candidates": _unique_keep_order(product_candidates),
        "material_candidates": material_candidates,
        "group_candidates": _unique_keep_order(group_candidates),
        "class_candidates": _unique_keep_order(class_candidates),
        "xyz_candidates": xyz_candidates,
        "context_summary": context_summary,
        "missing_data": missing_data,
        "limitations": limitations,
        "session_context": session_context,
    }


def _build_dynamic_suggestions(context: dict[str, Any]) -> list[str]:
    summary = _safe_dict(context.get("context_summary"))
    top_customer_rows = _safe_list(summary.get("forecast_by_customer_top"))
    top_group_rows = _safe_list(summary.get("forecast_by_group_top"))
    top_class_rows = _safe_list(summary.get("forecast_by_class_top"))
    top_risks = _safe_list(_safe_dict(summary.get("risk_overview")).get("top_risks"))
    finance_status = _safe_dict(summary.get("finance_status"))
    missing_data = _safe_list(summary.get("missing_data"))
    session_context = _safe_dict(summary.get("session_context"))
    recent_questions = [_normalize_text(value) for value in _safe_list(session_context.get("recent_questions"))]

    suggestions = list(BASE_SUGGESTIONS)

    if top_group_rows:
        group_label = _safe_str(top_group_rows[0].get("product_group"), "")
        if group_label:
            suggestions.append(f"O grupo {group_label} esta sob risco operacional?")

    if top_class_rows:
        class_code = _safe_str(top_class_rows[0].get("abc_class"), "")
        if class_code:
            suggestions.append(f"A classe {class_code} esta pressionando cobertura ou capacidade?")

    if top_customer_rows:
        customer_label = _safe_str(
            top_customer_rows[0].get("customer_label")
            or top_customer_rows[0].get("customer_name")
            or top_customer_rows[0].get("customer_code"),
            "",
        )
        if customer_label:
            suggestions.append(f"O cliente {customer_label} concentra risco comercial?")

    if top_risks:
        driver = _safe_str(top_risks[0].get("primary_driver_label"), "")
        if driver:
            suggestions.append(f"Como reduzir o risco dominante de '{driver}' neste cenario?")

    if _safe_str(finance_status.get("availability_status")) == "ready":
        suggestions.append("O crescimento projetado parece compativel com a saude financeira atual?")
    else:
        suggestions.append("Quais dados financeiros faltam para validar impacto em caixa e estoque?")

    if missing_data:
        suggestions.append("Qual e o impacto das lacunas de dados na decisao de S&OP?")

    filtered: list[str] = []
    for suggestion in _unique_keep_order(suggestions):
        normalized = _normalize_text(suggestion)
        if any(normalized == question for question in recent_questions):
            continue
        filtered.append(suggestion)
    return filtered[:10]


def _scope_from_production(df: pd.DataFrame) -> str:
    if df.empty:
        return "nenhum registro carregado"
    months = df["period_label"].dropna().astype(str).map(str.strip)
    months = months[months != ""]
    if months.empty:
        return f"{len(df)} registros carregados"
    unique_months = sorted(set(months.tolist()))
    return f"{len(unique_months)} meses carregados ({unique_months[0]} a {unique_months[-1]})"


def _scope_from_sales(df: pd.DataFrame) -> str:
    if df.empty:
        return "nenhum registro carregado"
    if "order_date" not in df.columns:
        return f"{len(df)} registros carregados"
    valid_dates = df["order_date"].dropna()
    if valid_dates.empty:
        return f"{len(df)} registros carregados"
    start = pd.Timestamp(valid_dates.min()).date().isoformat()
    end = pd.Timestamp(valid_dates.max()).date().isoformat()
    months = valid_dates.dt.to_period("M").nunique()
    return f"{int(months)} meses carregados ({start} a {end})"


def _scope_from_customers(df: pd.DataFrame) -> str:
    if df.empty:
        return "nenhum registro carregado"
    rel = len(df)
    unique_customers = (
        df["customer_code"].astype(str).str.strip().replace("", pd.NA).dropna().nunique()
        if "customer_code" in df.columns
        else 0
    )
    return f"{rel} relacionamentos SKU-cliente carregados ({unique_customers} clientes)"


def _scope_from_inventory(df: pd.DataFrame) -> str:
    if df.empty:
        return "nenhum registro carregado"
    groups = (
        df["group_description"].astype(str).str.strip().replace("", pd.NA).dropna().nunique()
        if "group_description" in df.columns
        else 0
    )
    return f"{len(df)} itens carregados ({groups} grupos)"


def _with_factual_metadata(
    draft: ResponseDraft,
    *,
    base_used: str,
    scope: str,
    specific_limitations: list[str] | None = None,
) -> ResponseDraft:
    draft.evidence = [f"Base usada: {base_used}.", f"Escopo: {scope}."] + draft.evidence
    if specific_limitations:
        for item in specific_limitations:
            text = _safe_str(item)
            if text and text not in draft.risks_limitations:
                draft.risks_limitations.append(text)
    return draft


def _resolve_query_entities(query: str, context: dict[str, Any]) -> dict[str, str]:
    product_candidates = [str(item) for item in _safe_list(context.get("product_candidates"))]
    material_candidates = [str(item) for item in _safe_list(context.get("material_candidates"))]
    customer_name_candidates = [str(item) for item in _safe_list(context.get("customer_name_candidates"))]
    customer_code_candidates = [str(item) for item in _safe_list(context.get("customer_code_candidates"))]
    group_candidates = [str(item) for item in _safe_list(context.get("group_candidates"))]
    class_candidates = [str(item) for item in _safe_list(context.get("class_candidates"))]
    xyz_candidates = [str(item) for item in _safe_list(context.get("xyz_candidates"))]
    customer_code_to_name = _safe_dict(context.get("customer_code_to_name"))
    customer_name_to_code = _safe_dict(context.get("customer_name_to_code"))

    product_code = _resolve_code_entity(query, product_candidates, hints=["sku", "produto", "item"])
    material_code = _resolve_code_entity(query, material_candidates, hints=["material", "insumo", "mp", "item"])
    customer_code = _resolve_code_entity(query, customer_code_candidates, hints=["cliente", "customer"])
    customer_name = _match_entity(query, customer_name_candidates)
    product_group = _match_entity(query, group_candidates)
    abc_class = _match_entity(query, class_candidates)
    xyz_class = _match_entity(query, xyz_candidates)

    if customer_code and not customer_name:
        customer_name = _safe_str(customer_code_to_name.get(customer_code))
    if customer_name and not customer_code:
        customer_code = _safe_str(customer_name_to_code.get(_normalize_text(customer_name)))

    if not abc_class:
        abc_match = re.search(r"\bclasse\s*([abc])\b", query)
        if abc_match:
            abc_class = abc_match.group(1).upper()
    if not xyz_class:
        xyz_match = re.search(r"\bclasse\s*([xyz])\b", query)
        if xyz_match:
            xyz_class = xyz_match.group(1).upper()

    entities = {
        "product_code": _safe_str(product_code),
        "customer_code": _safe_str(customer_code),
        "customer_name": _safe_str(customer_name),
        "material_code": _safe_str(material_code),
        "product_group": _safe_str(product_group),
        "abc_class": _safe_str(abc_class).upper(),
        "xyz_class": _safe_str(xyz_class).upper(),
    }

    if entities["product_code"]:
        entities["entity_type"] = "product_code"
        entities["entity_value"] = entities["product_code"]
    elif entities["customer_code"]:
        entities["entity_type"] = "customer_code"
        entities["entity_value"] = entities["customer_code"]
    elif entities["customer_name"]:
        entities["entity_type"] = "customer_name"
        entities["entity_value"] = entities["customer_name"]
    elif entities["material_code"]:
        entities["entity_type"] = "material_code"
        entities["entity_value"] = entities["material_code"]
    elif entities["product_group"]:
        entities["entity_type"] = "product_group"
        entities["entity_value"] = entities["product_group"]
    elif entities["abc_class"]:
        entities["entity_type"] = "abc_class"
        entities["entity_value"] = entities["abc_class"]
    elif entities["xyz_class"]:
        entities["entity_type"] = "xyz_class"
        entities["entity_value"] = entities["xyz_class"]

    return entities


def _classify_factual_intent(query: str, entities: dict[str, str]) -> str | None:
    has_product = bool(entities.get("product_code"))
    has_customer = bool(entities.get("customer_code") or entities.get("customer_name"))
    has_material = bool(entities.get("material_code"))

    production_terms = ["produz", "producao", "fabric"]
    sales_terms = ["venda", "vendido", "pedido", "fatur", "compr"]
    stock_terms = ["estoque", "saldo", "cobertura", "insumo", "materia prima", "materia-prima"]

    if (has_product or "sku" in query or "produto" in query) and ("abc" in query or "xyz" in query):
        return "abc_xyz_by_product"
    if (has_product or "sku" in query) and _contains_any(query, production_terms) and _contains_any(
        query, ["mes", "meses", "mensal", "por mes", "quais meses"]
    ):
        return "production_by_month_for_product"
    if (has_product or "sku" in query or "produto" in query) and _contains_any(query, production_terms) and _contains_any(
        query, ["quanto", "total", "ao todo", "soma", "volume"]
    ):
        return "production_total_by_product"
    if has_customer and _contains_any(query, ["produto", "produtos"]) and _contains_any(
        query, ["comprou", "compraram", "compras"]
    ) and _contains_any(query, ["ultimo ano", "ultimos 12 meses", "12 meses"]):
        return "customer_products_last_year"
    if ("cliente" in query or has_customer) and _contains_any(
        query,
        ["volume vendido", "total vendido", "quanto vendeu", "quanto foi vendido", "vendas", "faturamento"],
    ):
        return "sales_total_by_customer"
    if (has_product or "sku" in query or "produto" in query) and _contains_any(query, sales_terms) and _contains_any(
        query, ["quanto", "total", "ao todo", "volume"]
    ):
        return "sales_total_by_product"
    if (has_material or has_product or "material" in query or "insumo" in query) and _contains_any(query, stock_terms):
        return "stock_lookup_by_material_or_product"
    return None


def _classify_executive_intent(query: str) -> str:
    if _contains_any(query, ["top riscos", "maiores riscos", "principal risco"]) and "risco" in query:
        return "top_risks"
    if _contains_any(query, ["s&op", "s&oe"]) or ("reuniao" in query and "sop" in query):
        return "sop_agenda"
    if _contains_any(query, ["limitacao", "falta de dados", "dados faltam", "ausencia de dados"]):
        return "data_limitations"
    if ("forecast" in query or "previsao" in query) and _contains_any(query, ["confianca", "confiavel"]):
        return "forecast_confidence"
    if ("previsao" in query or "forecast" in query or "demanda" in query) and "cliente" in query:
        return "forecast_customer"
    if "cliente" in query and _contains_any(query, ["comprou", "produtos"]) and _contains_any(
        query,
        ["ultimo ano", "12 meses", "ultimos 12 meses"],
    ):
        return "products_by_customer"
    if _contains_any(query, ["ruptura", "excesso"]) or (
        "cobertura" in query and _contains_any(query, ["suporta", "risco", "adequada"])
    ):
        return "coverage_risk"
    if "metodo" in query and _contains_any(query, ["forecast", "previsao", "usado"]):
        return "forecast_method"
    if "classe" in query and _contains_any(query, ["crescimento", "atencao", "abc"]):
        return "class_focus"
    if "grupo" in query and _contains_any(query, ["atencao", "risco", "crescimento", "demanda"]):
        return "group_focus"
    if "crescimento" in query and _contains_any(query, ["pression", "operacao", "impacto"]):
        return "growth_pressure"
    if _contains_any(query, ["financeiro", "dre", "caixa", "margem"]):
        return "financial_alignment"
    return "executive_snapshot"


def _resolve_query_intent(query: str, context: dict[str, Any]) -> IntentResolution:
    entities = _resolve_query_entities(query, context)
    factual_intent = _classify_factual_intent(query, entities)
    if factual_intent:
        return IntentResolution(
            query_mode=QUERY_MODE_FACTUAL,
            intent=factual_intent,
            entities=entities,
        )
    return IntentResolution(
        query_mode=QUERY_MODE_EXECUTIVE,
        intent=_classify_executive_intent(query),
        entities=entities,
    )


def _handle_factual_production_total_by_product(context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    production_df = context.get("production_df")
    if not isinstance(production_df, pd.DataFrame) or production_df.empty:
        draft.direct_answer = "Nao ha base de producao carregada para responder o total produzido por SKU."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Historico de producao (dataset production)")
        return draft

    product_code = _safe_str(entities.get("product_code"))
    if not product_code:
        draft.direct_answer = "Informe o codigo do SKU para eu buscar a producao total."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Pergunta factual sem SKU identificado.")
        return _with_factual_metadata(
            draft,
            base_used="producao",
            scope=_scope_from_production(production_df),
        )

    target = production_df[
        production_df["product_code"].astype(str).map(_normalize_text) == _normalize_text(product_code)
    ].copy()
    if target.empty:
        draft.direct_answer = f"Nao encontrei o SKU {product_code} na base de producao carregada."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("SKU nao localizado no dataset production.")
        return _with_factual_metadata(
            draft,
            base_used="producao",
            scope=_scope_from_production(production_df),
        )

    total_produced = float(target["produced_quantity"].map(_to_number).sum())
    draft.direct_answer = (
        f"O SKU {product_code} teve producao total de {_format_number(total_produced)} unidades no periodo carregado."
    )
    draft.data_points.extend(
        [
            {"label": "product_code", "value": product_code},
            {"label": "production_total", "value": total_produced},
        ]
    )
    return _with_factual_metadata(
        draft,
        base_used="producao",
        scope=_scope_from_production(target),
    )


def _handle_factual_production_by_month_for_product(context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    production_df = context.get("production_df")
    if not isinstance(production_df, pd.DataFrame) or production_df.empty:
        draft.direct_answer = "Nao ha base de producao carregada para listar producao por mes."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Historico de producao (dataset production)")
        return draft

    product_code = _safe_str(entities.get("product_code"))
    if not product_code:
        draft.direct_answer = "Informe o codigo do SKU para eu listar a producao mensal."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Pergunta factual sem SKU identificado.")
        return _with_factual_metadata(
            draft,
            base_used="producao",
            scope=_scope_from_production(production_df),
        )

    target = production_df[
        production_df["product_code"].astype(str).map(_normalize_text) == _normalize_text(product_code)
    ].copy()
    if target.empty:
        draft.direct_answer = f"Nao encontrei o SKU {product_code} na base de producao carregada."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("SKU nao localizado no dataset production.")
        return _with_factual_metadata(
            draft,
            base_used="producao",
            scope=_scope_from_production(production_df),
        )

    monthly = (
        target[target["period_label"].astype(str).str.strip() != ""]
        .groupby("period_label", as_index=False)["produced_quantity"]
        .sum()
        .sort_values("period_label")
    )
    total_produced = float(target["produced_quantity"].map(_to_number).sum())
    if monthly.empty:
        draft.direct_answer = (
            f"Encontrei o SKU {product_code}, mas sem periodo valido para detalhar por mes. "
            f"Total produzido: {_format_number(total_produced)} unidades."
        )
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Mes/ano ausentes em parte dos registros do dataset production.")
    else:
        draft.direct_answer = (
            f"O SKU {product_code} teve producao em {len(monthly)} meses no periodo carregado, "
            f"totalizando {_format_number(total_produced)} unidades."
        )
        for row in monthly.head(12).to_dict(orient="records"):
            draft.evidence.append(
                f"{_safe_str(row.get('period_label'), '-')}: "
                f"{_format_number(float(_to_number(row.get('produced_quantity'))))} unidades."
            )

    draft.data_points.extend(
        [
            {"label": "product_code", "value": product_code},
            {"label": "months_with_production", "value": int(len(monthly))},
            {"label": "production_total", "value": total_produced},
        ]
    )
    return _with_factual_metadata(
        draft,
        base_used="producao",
        scope=_scope_from_production(target),
    )


def _handle_factual_abc_xyz_by_product(context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    class_df = context.get("product_classification_df")
    if not isinstance(class_df, pd.DataFrame) or class_df.empty:
        draft.direct_answer = "Nao ha classificacao ABC/XYZ disponivel para responder por SKU."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Classificacao de produto (ABC/XYZ)")
        return draft

    product_code = _safe_str(entities.get("product_code"))
    if not product_code:
        draft.direct_answer = "Informe o SKU para eu consultar a classe ABC/XYZ."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Pergunta factual sem SKU identificado.")
        return _with_factual_metadata(
            draft,
            base_used="classificacao de produto",
            scope=f"{len(class_df)} SKUs classificados",
        )

    target = class_df[
        class_df["product_code"].astype(str).map(_normalize_text) == _normalize_text(product_code)
    ].copy()
    if target.empty:
        draft.direct_answer = f"Nao encontrei o SKU {product_code} na classificacao ABC/XYZ carregada."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("SKU nao localizado na camada de classificacao.")
        return _with_factual_metadata(
            draft,
            base_used="classificacao de produto",
            scope=f"{len(class_df)} SKUs classificados",
        )

    row = target.iloc[0]
    abc_class = _safe_str(row.get("abc_class"), "UNCLASSIFIED")
    xyz_class = _safe_str(row.get("xyz_class"), "UNCLASSIFIED")
    abc_source = _safe_str(row.get("abc_source"), "unavailable")
    xyz_source = _safe_str(row.get("xyz_source"), "unavailable")

    draft.direct_answer = (
        f"O SKU {product_code} esta classificado como ABC={abc_class} e XYZ={xyz_class} no periodo carregado."
    )
    draft.evidence.append(f"Origem da classe ABC: {abc_source}.")
    draft.evidence.append(f"Origem da classe XYZ: {xyz_source}.")
    if abc_class == "UNCLASSIFIED" or xyz_class == "UNCLASSIFIED":
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append(
            "Parte da classificacao foi derivada ou ficou sem classe explicita na base carregada."
        )
    draft.data_points.extend(
        [
            {"label": "product_code", "value": product_code},
            {"label": "abc_class", "value": abc_class},
            {"label": "xyz_class", "value": xyz_class},
        ]
    )
    return _with_factual_metadata(
        draft,
        base_used="planning_production, sales_orders, customers e producao (derivacao quando necessario)",
        scope=f"{len(class_df)} SKUs classificados",
    )


def _handle_factual_sales_total_by_product(context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    sales_df = context.get("sales_df")
    if not isinstance(sales_df, pd.DataFrame) or sales_df.empty:
        draft.direct_answer = "Nao ha base de vendas/pedidos carregada para responder volume vendido por SKU."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Historico de pedidos (dataset sales_orders)")
        return draft

    product_code = _safe_str(entities.get("product_code"))
    if not product_code:
        draft.direct_answer = "Informe o codigo do SKU para eu consultar o total vendido."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Pergunta factual sem SKU identificado.")
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=_scope_from_sales(sales_df),
        )

    target = sales_df[
        sales_df["product_code"].astype(str).map(_normalize_text) == _normalize_text(product_code)
    ].copy()
    if target.empty:
        draft.direct_answer = f"Nao encontrei o SKU {product_code} na base de vendas/pedidos carregada."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("SKU nao localizado no dataset sales_orders.")
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=_scope_from_sales(sales_df),
        )

    total_quantity = float(target["order_quantity"].map(_to_number).sum())
    total_value = float(target["order_value"].map(_to_number).sum())
    draft.direct_answer = (
        f"O SKU {product_code} teve volume vendido de {_format_number(total_quantity)} unidades no periodo carregado."
    )
    draft.evidence.append(f"Valor total associado: {_format_currency(total_value)}.")
    draft.data_points.extend(
        [
            {"label": "product_code", "value": product_code},
            {"label": "sales_total_quantity", "value": total_quantity},
            {"label": "sales_total_value", "value": total_value},
        ]
    )
    return _with_factual_metadata(
        draft,
        base_used="sales_orders",
        scope=_scope_from_sales(target),
    )


def _handle_factual_sales_total_by_customer(context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    sales_df = context.get("sales_df")
    if not isinstance(sales_df, pd.DataFrame) or sales_df.empty:
        draft.direct_answer = "Nao ha base de vendas/pedidos carregada para responder volume por cliente."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Historico de pedidos (dataset sales_orders)")
        return draft

    customer_code = _safe_str(entities.get("customer_code"))
    customer_name = _safe_str(entities.get("customer_name"))
    if not customer_code and not customer_name:
        draft.direct_answer = "Informe codigo ou nome do cliente para eu consultar o volume vendido."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Pergunta factual sem cliente identificado.")
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=_scope_from_sales(sales_df),
        )

    target = sales_df.copy()
    if customer_code:
        target = target[
            target["customer_code"].astype(str).map(_normalize_text) == _normalize_text(customer_code)
        ]
    elif customer_name:
        normalized_name = _normalize_text(customer_name)
        target = target[
            target["customer_name"].astype(str).map(_normalize_text).eq(normalized_name)
            | target["customer_name"].astype(str).map(_normalize_text).str.contains(normalized_name, na=False)
        ]

    if target.empty:
        reference = customer_code or customer_name
        draft.direct_answer = f"Nao encontrei o cliente {reference} na base de vendas/pedidos carregada."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Cliente nao localizado no dataset sales_orders.")
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=_scope_from_sales(sales_df),
        )

    label = customer_name or _safe_str(target["customer_name"].dropna().astype(str).head(1).squeeze())
    if not label:
        label = customer_code or "cliente"

    total_quantity = float(target["order_quantity"].map(_to_number).sum())
    total_value = float(target["order_value"].map(_to_number).sum())
    products = int(target["product_code"].astype(str).str.strip().replace("", pd.NA).dropna().nunique())

    draft.direct_answer = (
        f"O cliente {label} teve volume vendido de {_format_number(total_quantity)} unidades no periodo carregado."
    )
    draft.evidence.append(f"Valor total associado: {_format_currency(total_value)}.")
    draft.evidence.append(f"SKUs diferentes comprados: {products}.")
    draft.data_points.extend(
        [
            {"label": "customer_label", "value": label},
            {"label": "sales_total_quantity", "value": total_quantity},
            {"label": "sales_total_value", "value": total_value},
            {"label": "products_count", "value": products},
        ]
    )
    return _with_factual_metadata(
        draft,
        base_used="sales_orders",
        scope=_scope_from_sales(target),
    )


def _handle_factual_customer_products_last_year(context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    sales_df = context.get("sales_df")
    if not isinstance(sales_df, pd.DataFrame) or sales_df.empty:
        draft.direct_answer = "Nao ha base de vendas/pedidos carregada para listar produtos por cliente."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Historico de pedidos (dataset sales_orders)")
        return draft

    customer_code = _safe_str(entities.get("customer_code"))
    customer_name = _safe_str(entities.get("customer_name"))
    if not customer_code and not customer_name:
        draft.direct_answer = "Informe codigo ou nome do cliente para eu listar os produtos do ultimo ano."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Pergunta factual sem cliente identificado.")
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=_scope_from_sales(sales_df),
        )

    target = sales_df.copy()
    if customer_code:
        target = target[
            target["customer_code"].astype(str).map(_normalize_text) == _normalize_text(customer_code)
        ]
    elif customer_name:
        normalized_name = _normalize_text(customer_name)
        target = target[
            target["customer_name"].astype(str).map(_normalize_text).eq(normalized_name)
            | target["customer_name"].astype(str).map(_normalize_text).str.contains(normalized_name, na=False)
        ]

    if target.empty:
        reference = customer_code or customer_name
        draft.direct_answer = f"Nao encontrei o cliente {reference} na base de vendas/pedidos carregada."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Cliente nao localizado no dataset sales_orders.")
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=_scope_from_sales(sales_df),
        )

    max_date = target["order_date"].dropna().max()
    if pd.isna(max_date):
        draft.direct_answer = (
            "O cliente foi encontrado, mas a base nao possui datas validas para aplicar o recorte de ultimo ano."
        )
        draft.partial = True
        draft.confidence = "low"
        draft.limitations.append("order_date ausente/invalida no dataset sales_orders.")
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=f"{len(target)} registros do cliente",
        )

    cutoff = pd.Timestamp(max_date) - pd.Timedelta(days=365)
    period_df = target[target["order_date"] >= cutoff].copy()
    if period_df.empty:
        label = customer_name or customer_code or "cliente"
        draft.direct_answer = f"Nao encontrei compras do cliente {label} no recorte de 12 meses disponivel."
        draft.partial = True
        draft.confidence = "medium"
        return _with_factual_metadata(
            draft,
            base_used="sales_orders",
            scope=f"recorte 12 meses ate {pd.Timestamp(max_date).date().isoformat()}",
        )

    grouped = (
        period_df.groupby("product_code", as_index=False)
        .agg(order_quantity=("order_quantity", "sum"), order_value=("order_value", "sum"))
        .sort_values("order_quantity", ascending=False)
    )
    label = customer_name or _safe_str(period_df["customer_name"].dropna().astype(str).head(1).squeeze())
    if not label:
        label = customer_code or "cliente"

    products = grouped["product_code"].astype(str).tolist()
    draft.direct_answer = (
        f"Nos ultimos 12 meses carregados, o cliente {label} comprou {len(products)} produtos."
    )
    draft.evidence.append("Principais produtos: " + ", ".join(products[:10]) + ".")
    for row in grouped.head(8).to_dict(orient="records"):
        draft.evidence.append(
            f"{_safe_str(row.get('product_code'), '-')}: "
            f"{_format_number(float(_to_number(row.get('order_quantity'))))} un, "
            f"{_format_currency(float(_to_number(row.get('order_value'))))}."
        )
    draft.data_points.extend(
        [
            {"label": "customer_label", "value": label},
            {"label": "products_count_last_year", "value": int(len(products))},
            {"label": "cutoff_start", "value": cutoff.date().isoformat()},
            {"label": "cutoff_end", "value": pd.Timestamp(max_date).date().isoformat()},
        ]
    )
    return _with_factual_metadata(
        draft,
        base_used="sales_orders",
        scope=f"12 meses ({cutoff.date().isoformat()} a {pd.Timestamp(max_date).date().isoformat()})",
    )


def _handle_factual_stock_lookup_by_material_or_product(context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    inventory_df = context.get("inventory_df")
    if not isinstance(inventory_df, pd.DataFrame) or inventory_df.empty:
        draft.direct_answer = "Nao ha base de estoque de materia-prima carregada para consulta."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Estoque de materia-prima (dataset raw_material_inventory)")
        return draft

    material_code = _safe_str(entities.get("material_code")) or _safe_str(entities.get("product_code"))
    product_name = _safe_str(entities.get("entity_value"))
    if not material_code and not product_name:
        draft.direct_answer = "Informe codigo ou descricao do item para consultar estoque."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Pergunta factual sem material/produto identificado.")
        return _with_factual_metadata(
            draft,
            base_used="raw_material_inventory",
            scope=_scope_from_inventory(inventory_df),
        )

    target = inventory_df.copy()
    if material_code:
        normalized_code = _normalize_text(material_code)
        target = target[
            target["product_code"].astype(str).map(_normalize_text).eq(normalized_code)
            | target["product_description"].astype(str).map(_normalize_text).str.contains(normalized_code, na=False)
        ]
    elif product_name:
        normalized_name = _normalize_text(product_name)
        target = target[
            target["product_description"].astype(str).map(_normalize_text).str.contains(normalized_name, na=False)
        ]

    if target.empty:
        reference = material_code or product_name
        draft.direct_answer = f"Nao encontrei o item {reference} na base de estoque de materia-prima carregada."
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append("Item nao localizado no dataset raw_material_inventory.")
        return _with_factual_metadata(
            draft,
            base_used="raw_material_inventory",
            scope=_scope_from_inventory(inventory_df),
        )

    row = target.iloc[0]
    item_code = _safe_str(row.get("product_code"), "-")
    description = _safe_str(row.get("product_description"), item_code)
    available_stock = float(_to_number(row.get("available_stock")))
    safety_stock = float(_to_number(row.get("safety_stock")))
    on_order_stock = float(_to_number(row.get("on_order_stock")))
    reorder_point = float(_to_number(row.get("reorder_point")))

    draft.direct_answer = (
        f"O item {item_code} ({description}) tem estoque disponivel de {_format_number(available_stock)} no periodo carregado."
    )
    draft.evidence.append(
        f"Estoque de seguranca: {_format_number(safety_stock)} | "
        f"Em pedido: {_format_number(on_order_stock)} | "
        f"Ponto de pedido: {_format_number(reorder_point)}."
    )
    draft.data_points.extend(
        [
            {"label": "material_code", "value": item_code},
            {"label": "available_stock", "value": available_stock},
            {"label": "safety_stock", "value": safety_stock},
            {"label": "on_order_stock", "value": on_order_stock},
            {"label": "reorder_point", "value": reorder_point},
        ]
    )
    return _with_factual_metadata(
        draft,
        base_used="raw_material_inventory",
        scope=_scope_from_inventory(target),
    )


def _build_factual_draft_for_intent(intent: str, context: dict[str, Any], entities: dict[str, str]) -> ResponseDraft:
    if intent == "production_total_by_product":
        return _handle_factual_production_total_by_product(context, entities)
    if intent == "production_by_month_for_product":
        return _handle_factual_production_by_month_for_product(context, entities)
    if intent == "abc_xyz_by_product":
        return _handle_factual_abc_xyz_by_product(context, entities)
    if intent == "sales_total_by_product":
        return _handle_factual_sales_total_by_product(context, entities)
    if intent == "sales_total_by_customer":
        return _handle_factual_sales_total_by_customer(context, entities)
    if intent == "customer_products_last_year":
        return _handle_factual_customer_products_last_year(context, entities)
    if intent == "stock_lookup_by_material_or_product":
        return _handle_factual_stock_lookup_by_material_or_product(context, entities)

    draft = ResponseDraft(confidence="medium", partial=True)
    draft.direct_answer = "Nao consegui classificar a pergunta factual com seguranca."
    draft.limitations.append("Intent factual nao mapeada.")
    return draft


def _ensure_context_items(draft: ResponseDraft, context: dict[str, Any]) -> None:
    for item in _safe_list(context.get("missing_data")):
        text = _safe_str(item)
        if text and text not in draft.missing_data:
            draft.missing_data.append(text)
    for item in _safe_list(context.get("limitations")):
        text = _safe_str(item)
        if text and text not in draft.limitations:
            draft.limitations.append(text)


def _handle_top_risks(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    top_risks = _safe_list(context.get("top_risks"))
    if not top_risks:
        draft.direct_answer = "Nao ha ranking de risco disponivel para responder com seguranca."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Top riscos executivos e score de risco")
        draft.executive_recommendation.append(
            "Execute novamente a Análise e Planejamento de Demanda para gerar os heatmaps e o ranking de riscos."
        )
        _ensure_context_items(draft, context)
        return draft

    top = top_risks[0]
    group_name = _safe_str(top.get("group"), "(sem grupo)")
    class_name = _safe_str(top.get("abc_class"), "-")
    score = float(_to_number(top.get("score")))
    level = _safe_str(top.get("risk_level_label"), "moderado")
    driver = _safe_str(top.get("primary_driver_label"), "Driver nao informado")

    draft.direct_answer = (
        f"Os maiores riscos executivos estao concentrados em {group_name}/{class_name}, "
        f"com score {score:.1f}/100 ({level})."
    )
    for row in top_risks[:5]:
        draft.evidence.append(
            f"{_safe_str(row.get('group'), '(sem grupo)')}/{_safe_str(row.get('abc_class'), '-')}: "
            f"score {float(_to_number(row.get('score'))):.1f}, "
            f"driver {_safe_str(row.get('primary_driver_label'), 'nao informado')}."
        )
    draft.risks_limitations.append(f"Driver predominante do risco: {driver}.")
    draft.executive_recommendation.append(
        "Priorize revisao de capacidade, cobertura e carteira comercial nos 3 primeiros riscos do ranking."
    )
    draft.data_points.extend(
        [
            {"label": "top_risk_group", "value": group_name},
            {"label": "top_risk_class", "value": class_name},
            {"label": "top_risk_score", "value": score},
            {"label": "top_risk_driver", "value": driver},
        ]
    )
    _ensure_context_items(draft, context)
    return draft


def _handle_class_focus(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    classes = _safe_list(context.get("summary_by_class"))
    if not classes:
        draft.direct_answer = "Nao ha consolidado por classe ABC para responder com precisao."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Forecast consolidado por classe ABC")
        draft.executive_recommendation.append(
            "Carregue classe ABC no dataset de pedidos/clientes e rode novamente o planejamento."
        )
        _ensure_context_items(draft, context)
        return draft

    top_growth = _top_rows_by(classes, "growth_impact_pct", top_n=1)[0]
    class_code = _safe_str(top_growth.get("abc_class"), "-")
    growth_pct = float(_to_number(top_growth.get("growth_impact_pct")))
    demand = float(_to_number(top_growth.get("final_forecast")))
    confidence_class = float(_to_number(top_growth.get("forecast_confidence")))

    draft.direct_answer = (
        f"A classe {class_code} apresenta o maior crescimento projetado ({_format_pct(growth_pct)})."
    )
    draft.evidence.append(
        f"Classe {class_code}: forecast {_format_number(demand)} e confianca {confidence_class * 100.0:.1f}%."
    )

    top_risks = _safe_list(context.get("top_risks"))
    class_risks = [
        row for row in top_risks if _normalize_text(_safe_str(row.get("abc_class"))) == _normalize_text(class_code)
    ]
    if class_risks:
        best = class_risks[0]
        draft.evidence.append(
            f"No ranking de risco, a classe {class_code} aparece com score {float(_to_number(best.get('score'))):.1f}."
        )

    if confidence_class < 0.55:
        draft.partial = True
        draft.risks_limitations.append(
            "Confianca da previsao da classe lider esta baixa; tratar a leitura como sinal, nao como compromisso fechado."
        )
        draft.confidence = "medium"
    else:
        draft.confidence = "high"

    draft.executive_recommendation.append(
        f"Revise cobertura, capacidade e priorizacao de portfolio para a classe {class_code} antes de congelar o plano."
    )
    draft.data_points.extend(
        [
            {"label": "class_focus", "value": class_code},
            {"label": "class_growth_pct", "value": growth_pct},
            {"label": "class_forecast", "value": demand},
        ]
    )
    _ensure_context_items(draft, context)
    return draft


def _handle_group_focus(query: str, context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    groups = _safe_list(context.get("summary_by_group"))
    if not groups:
        draft.direct_answer = "Nao ha consolidado por grupo de produto para responder com profundidade."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Forecast consolidado por grupo de produto")
        _ensure_context_items(draft, context)
        return draft

    candidates = _safe_list(context.get("group_candidates"))
    matched_group = _match_entity(query, [str(item) for item in candidates])
    target = None
    if matched_group:
        for row in groups:
            if _normalize_text(_safe_str(row.get("product_group"))) == _normalize_text(matched_group):
                target = row
                break

    if target is None:
        target = _top_rows_by(groups, "final_forecast", top_n=1)[0]
        draft.partial = True
        draft.risks_limitations.append(
            "Nao foi possivel identificar o grupo citado na pergunta; usei o grupo com maior demanda."
        )

    group_name = _safe_str(target.get("product_group"), "(sem grupo)")
    forecast_value = float(_to_number(target.get("final_forecast")))
    growth_pct = float(_to_number(target.get("growth_impact_pct")))
    confidence_group = float(_to_number(target.get("forecast_confidence")))

    group_risks = [
        row
        for row in _safe_list(context.get("top_risks"))
        if _normalize_text(_safe_str(row.get("group"))) == _normalize_text(group_name)
    ]
    risk_note = ""
    if group_risks:
        risk_note = (
            f"Risco mais relevante do grupo: score {float(_to_number(group_risks[0].get('score'))):.1f} "
            f"({ _safe_str(group_risks[0].get('risk_level_label'), 'moderado') })."
        )

    draft.direct_answer = (
        f"O grupo {group_name} merece atencao no cenario atual, com forecast {_format_number(forecast_value)} "
        f"e crescimento {_format_pct(growth_pct)}."
    )
    draft.evidence.append(
        f"Confianca de forecast do grupo: {confidence_group * 100.0:.1f}%."
    )
    if risk_note:
        draft.evidence.append(risk_note)
    if confidence_group < 0.55:
        draft.partial = True
        draft.risks_limitations.append(
            "Confianca do forecast do grupo esta baixa; validar historico e premissas comerciais."
        )
    draft.executive_recommendation.append(
        f"Conduza revisao cruzada Comercial + PCP para o grupo {group_name}, com foco em capacidade e cobertura."
    )
    draft.data_points.extend(
        [
            {"label": "group_focus", "value": group_name},
            {"label": "group_forecast", "value": forecast_value},
            {"label": "group_growth_pct", "value": growth_pct},
        ]
    )
    _ensure_context_items(draft, context)
    return draft


def _handle_growth_pressure(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    totals = _safe_dict(context.get("totals"))
    alerts = _safe_dict(context.get("risk_alerts"))
    top_risks = _safe_list(context.get("top_risks"))
    growth_parameters = _safe_dict(context.get("growth_parameters"))

    if not totals:
        draft.direct_answer = "Nao ha totais de forecast para medir pressao operacional do crescimento."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Totais consolidados de forecast")
        _ensure_context_items(draft, context)
        return draft

    growth_pct = float(_to_number(totals.get("growth_impact_pct")))
    rupture = int(_to_number(alerts.get("rupture_risk_count")))
    excess = int(_to_number(alerts.get("excess_risk_count")))
    missing_stock = int(_to_number(alerts.get("missing_stock_count")))
    global_growth = float(_to_number(growth_parameters.get("global_pct")))

    growth_driver_risks = [
        row
        for row in top_risks
        if "crescimento" in _normalize_text(_safe_str(row.get("primary_driver_label")))
    ]

    pressure = growth_pct >= 8.0 or rupture > 0 or bool(growth_driver_risks)
    if pressure:
        draft.direct_answer = "Sim, o crescimento comercial projetado esta pressionando a operacao."
    else:
        draft.direct_answer = "Nao ha sinal forte de pressao operacional no crescimento projetado atual."

    draft.evidence.append(
        f"Crescimento consolidado no forecast: {_format_pct(growth_pct)} (parametro global {_format_pct(global_growth)})."
    )
    draft.evidence.append(
        f"Alertas operacionais: {rupture} risco de ruptura, {excess} risco de excesso, {missing_stock} sem cobertura."
    )
    if growth_driver_risks:
        draft.evidence.append(
            f"{len(growth_driver_risks)} riscos relevantes tem crescimento como driver principal."
        )

    if missing_stock > 0:
        draft.partial = True
        draft.risks_limitations.append(
            "Parte dos SKUs esta sem estoque/cobertura; a pressao real pode estar subestimada."
        )
    draft.executive_recommendation.append(
        "Revisar capacidade e cobertura dos grupos com maior crescimento antes de fechar o ciclo S&OE."
    )
    draft.data_points.extend(
        [
            {"label": "growth_impact_pct", "value": growth_pct},
            {"label": "rupture_risk_count", "value": rupture},
            {"label": "excess_risk_count", "value": excess},
        ]
    )
    draft.confidence = "high" if not draft.partial else "medium"
    _ensure_context_items(draft, context)
    return draft


def _handle_forecast_customer(query: str, context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    customers = _safe_list(context.get("summary_by_customer"))
    if not customers:
        draft.direct_answer = "Nao ha forecast consolidado por cliente para responder."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Forecast consolidado por cliente")
        _ensure_context_items(draft, context)
        return draft

    candidates = [str(item) for item in _safe_list(context.get("customer_candidates"))]
    matched = _match_entity(query, candidates)
    target = None
    if matched:
        for row in customers:
            label = _safe_str(row.get("customer_label") or row.get("customer_name") or row.get("customer_code"))
            if _normalize_text(label) == _normalize_text(matched):
                target = row
                break

    if target is None:
        target = _top_rows_by(customers, "final_forecast", top_n=1)[0]
        draft.partial = True
        draft.risks_limitations.append(
            "Cliente nao identificado de forma exata; usei o cliente lider do periodo filtrado."
        )

    label = _safe_str(
        target.get("customer_label") or target.get("customer_name") or target.get("customer_code"),
        "cliente",
    )
    forecast_value = float(_to_number(target.get("final_forecast")))
    growth_pct = float(_to_number(target.get("growth_impact_pct")))
    confidence_customer = float(_to_number(target.get("forecast_confidence")))

    draft.direct_answer = (
        f"A previsao de demanda para {label} e {_format_number(forecast_value)} no cenario atual."
    )
    draft.evidence.append(
        f"Crescimento projetado para o cliente: {_format_pct(growth_pct)}."
    )
    draft.evidence.append(
        f"Confianca do forecast para o cliente: {confidence_customer * 100.0:.1f}%."
    )

    if confidence_customer < 0.5:
        draft.partial = True
        draft.risks_limitations.append(
            "Confianca para este cliente esta baixa; trate a resposta como sinal direcional."
        )

    draft.executive_recommendation.append(
        f"Alinhar com Comercial e Operacoes o plano de atendimento do cliente {label} para o horizonte atual."
    )
    draft.data_points.extend(
        [
            {"label": "customer", "value": label},
            {"label": "forecast_final", "value": forecast_value},
            {"label": "growth_impact_pct", "value": growth_pct},
        ]
    )
    draft.confidence = "high" if confidence_customer >= 0.65 and not draft.partial else "medium"
    _ensure_context_items(draft, context)
    return draft


def _handle_products_by_customer(query: str, context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    sales_df = context.get("sales_df")
    if not isinstance(sales_df, pd.DataFrame) or sales_df.empty:
        draft.direct_answer = "Nao ha historico de pedidos para listar produtos por cliente."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Historico de pedidos (dataset sales_orders)")
        _ensure_context_items(draft, context)
        return draft

    candidates = [str(item) for item in _safe_list(context.get("customer_candidates"))]
    matched = _match_entity(query, candidates)
    selected = sales_df.copy()
    if matched:
        normalized_target = _normalize_text(matched)
        mask = (
            selected["customer_code"].astype(str).map(_normalize_text).eq(normalized_target)
            | selected["customer_name"].astype(str).map(_normalize_text).eq(normalized_target)
            | selected["customer_name"].astype(str).map(_normalize_text).str.contains(normalized_target, na=False)
        )
        selected = selected[mask]

    max_date = selected["order_date"].max()
    if pd.isna(max_date):
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    else:
        cutoff = pd.Timestamp(max_date).to_pydatetime() - timedelta(days=365)
    selected = selected[selected["order_date"] >= cutoff]

    if selected.empty:
        draft.direct_answer = "Nao encontrei compras para o cliente no recorte de 12 meses disponivel."
        draft.partial = True
        draft.confidence = "medium"
        draft.executive_recommendation.append(
            "Verifique nome/codigo do cliente e amplitude da base sales_orders carregada."
        )
        _ensure_context_items(draft, context)
        return draft

    grouped = (
        selected.groupby("product_code", as_index=False)
        .agg(order_quantity=("order_quantity", "sum"), order_value=("order_value", "sum"))
        .sort_values("order_quantity", ascending=False)
    )
    top_products = grouped.head(6)
    product_labels = top_products["product_code"].astype(str).tolist()
    customer_label = matched or _safe_str(selected["customer_name"].dropna().astype(str).head(1).squeeze(), "cliente")

    draft.direct_answer = (
        f"Nos ultimos 12 meses disponiveis, {customer_label} concentrou compras em: {', '.join(product_labels)}."
    )
    for row in top_products.to_dict(orient="records"):
        draft.evidence.append(
            f"{_safe_str(row.get('product_code'), '-')}: "
            f"{_format_number(float(_to_number(row.get('order_quantity'))))} un, "
            f"{_format_currency(float(_to_number(row.get('order_value'))))}."
        )
    if matched is None:
        draft.partial = True
        draft.risks_limitations.append(
            "Cliente nao foi identificado na pergunta; a lista pode representar o principal cliente carregado."
        )
    draft.executive_recommendation.append(
        "Use esta lista para revisar mix, capacidade e prioridade de atendimento na pauta comercial-operacional."
    )
    draft.data_points.append({"label": "products_found", "value": int(len(top_products))})
    _ensure_context_items(draft, context)
    return draft


def _handle_coverage_risk(query: str, context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    alerts = _safe_dict(context.get("risk_alerts"))
    scenario_rows = _safe_list(_safe_dict(context.get("planning_result")).get("mts_mtu_scenarios"))
    if not alerts:
        draft.direct_answer = "Nao ha alertas de cobertura/ruptura para responder com seguranca."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Alertas executivos de ruptura/excesso")
        _ensure_context_items(draft, context)
        return draft

    rupture = int(_to_number(alerts.get("rupture_risk_count")))
    excess = int(_to_number(alerts.get("excess_risk_count")))
    missing_stock = int(_to_number(alerts.get("missing_stock_count")))
    total_eval = int(_to_number(alerts.get("total_products_evaluated")))

    if _contains_any(query, ["mts", "mtu"]):
        policy_counts: dict[str, int] = {}
        for row in scenario_rows:
            if not isinstance(row, dict):
                continue
            policy = _safe_str(row.get("suggested_policy"), "nao_informado")
            policy_counts[policy] = policy_counts.get(policy, 0) + 1
        ordered_policy = sorted(policy_counts.items(), key=lambda pair: pair[1], reverse=True)
        if ordered_policy:
            primary_policy, qty = ordered_policy[0]
            draft.direct_answer = (
                f"O cenario atual indica predominio de {primary_policy} em {qty} produtos avaliados."
            )
            draft.evidence.append(
                "Distribuicao de politicas: "
                + ", ".join(f"{name}={count}" for name, count in ordered_policy[:4])
            )
        else:
            draft.direct_answer = "Nao ha cenario MTS/MTU suficiente para validar a politica mais prudente."
            draft.partial = True
            draft.confidence = "low"
    else:
        draft.direct_answer = (
            f"Ha risco de ruptura em {rupture} produtos no cenario atual."
        )

    draft.evidence.append(
        f"Alertas de cobertura: ruptura={rupture}, excesso={excess}, sem estoque={missing_stock}, avaliados={total_eval}."
    )

    rupture_products = [
        row for row in scenario_rows if isinstance(row, dict) and _safe_str(row.get("risk_status")) == "rupture_risk"
    ][:5]
    if rupture_products:
        draft.evidence.append(
            "Produtos mais expostos a ruptura: "
            + ", ".join(_safe_str(row.get("product_code"), "-") for row in rupture_products)
            + "."
        )

    if missing_stock > 0:
        draft.partial = True
        draft.risks_limitations.append(
            "Parte dos produtos esta sem estoque/cobertura; o risco pode estar subestimado."
        )

    draft.executive_recommendation.append(
        "Priorize reposicao para itens em ruptura e revise limites MTS/MTU para reduzir excesso."
    )
    draft.data_points.extend(
        [
            {"label": "rupture_risk_count", "value": rupture},
            {"label": "excess_risk_count", "value": excess},
            {"label": "missing_stock_count", "value": missing_stock},
        ]
    )
    draft.confidence = "high" if missing_stock == 0 else "medium"
    _ensure_context_items(draft, context)
    return draft


def _handle_forecast_confidence(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    confidence_payload = _safe_dict(context.get("forecast_confidence"))
    method = _safe_str(context.get("selected_method"), "auto")
    metrics = _safe_dict(context.get("selected_method_metrics"))
    if not confidence_payload:
        draft.direct_answer = "Nao ha score de confianca de forecast consolidado."
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Confianca consolidada do forecast")
        _ensure_context_items(draft, context)
        return draft

    score = float(_to_number(confidence_payload.get("score")))
    percent = float(_to_number(confidence_payload.get("percent"))) or (score * 100.0)
    label = _safe_str(confidence_payload.get("label"), "nao informado")

    draft.direct_answer = (
        f"A confianca do forecast atual e {label} ({percent:.1f}%)."
    )
    draft.evidence.append(f"Metodo selecionado: {method}.")
    if metrics:
        draft.evidence.append(
            f"MAPE={_to_number(metrics.get('mape')):.2f}, MAE={_to_number(metrics.get('mae')):.2f}, "
            f"RMSE={_to_number(metrics.get('rmse')):.2f}, Bias={_to_number(metrics.get('bias')):.2f}."
        )
        support = int(_to_number(metrics.get("support")))
        draft.evidence.append(f"Base de avaliacao da metrica (support): {support}.")

    if score < 0.5:
        draft.partial = True
        draft.risks_limitations.append(
            "Confianca baixa: risco elevado de revisao de plano entre S&OP e execucao."
        )
        draft.executive_recommendation.append(
            "Use buffer de capacidade/estoque e revise premissas comerciais dos itens mais volateis."
        )
    else:
        draft.executive_recommendation.append(
            "Pode usar o forecast como base principal, mantendo monitoramento semanal dos desvios."
        )

    draft.data_points.extend(
        [
            {"label": "forecast_confidence_score", "value": score},
            {"label": "forecast_confidence_percent", "value": percent},
            {"label": "selected_method", "value": method},
        ]
    )
    draft.confidence = _confidence_from_score(score)
    _ensure_context_items(draft, context)
    return draft


def _handle_forecast_method(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    method = _safe_str(context.get("selected_method"), "auto")
    planning = _safe_dict(context.get("planning_result"))
    recommended = _safe_str(planning.get("recommended_method"), method)
    selection_mode = _safe_str(planning.get("method_selection_mode"), "auto")
    metrics = _safe_dict(context.get("selected_method_metrics"))

    draft.direct_answer = (
        f"O metodo em uso e {method} (modo {selection_mode}), com recomendacao atual de {recommended}."
    )
    if metrics:
        draft.evidence.append(
            f"Qualidade do metodo selecionado: MAPE={_to_number(metrics.get('mape')):.2f}, "
            f"MAE={_to_number(metrics.get('mae')):.2f}, RMSE={_to_number(metrics.get('rmse')):.2f}, "
            f"Bias={_to_number(metrics.get('bias')):.2f}."
        )
        support = int(_to_number(metrics.get("support")))
        if support <= 0:
            draft.partial = True
            draft.risks_limitations.append(
                "Sem suporte estatistico suficiente para esse metodo em parte da base."
            )
            draft.confidence = "low"
    else:
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Metricas de qualidade por metodo")

    draft.executive_recommendation.append(
        "Mantenha monitoramento de erro por SKU critico e ajuste o metodo quando houver mudanca de padrao de demanda."
    )
    draft.data_points.append({"label": "selected_method", "value": method})
    _ensure_context_items(draft, context)
    return draft


def _handle_data_limitations(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="high")
    missing_data = _safe_list(context.get("missing_data"))
    limitations = _safe_list(context.get("limitations"))

    if not missing_data and not limitations:
        draft.direct_answer = "Nao ha limitacoes criticas registradas no contexto atual."
        draft.executive_recommendation.append(
            "Siga com a discussao executiva e monitore apenas mudancas de demanda e cobertura."
        )
        return draft

    draft.direct_answer = (
        "Ha limitacoes relevantes de dados; a resposta executiva deve ser tratada como parcial."
    )
    if missing_data:
        draft.evidence.append("Dados ausentes: " + "; ".join(str(item) for item in missing_data[:6]) + ".")
        draft.missing_data.extend(str(item) for item in missing_data[:8])
    if limitations:
        draft.risks_limitations.extend(str(item) for item in limitations[:6])
        draft.limitations.extend(str(item) for item in limitations[:8])
    draft.partial = True
    draft.confidence = "low" if missing_data else "medium"
    draft.executive_recommendation.append(
        "Priorize upload/estrutura de dados faltantes antes de comprometer decisoes de capacidade, estoque ou caixa."
    )
    return draft


def _handle_financial_alignment(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    summary = _safe_dict(context.get("context_summary"))
    finance_status = _safe_dict(summary.get("finance_status"))
    totals = _safe_dict(context.get("totals"))

    availability = _safe_str(finance_status.get("availability_status"), "unavailable")
    structured = bool(finance_status.get("structured"))
    forecast_final = float(_to_number(totals.get("final_forecast")))
    estimated_revenue = float(_to_number(totals.get("estimated_revenue")))

    if availability == "unavailable":
        draft.direct_answer = (
            "Nao e possivel validar aderencia financeira com seguranca porque o DRE nao esta disponivel."
        )
        draft.partial = True
        draft.confidence = "low"
        draft.missing_data.append("Documentos financeiros DRE")
    elif not structured:
        draft.direct_answer = (
            "Ha documentos financeiros carregados, mas a estrutura ainda esta parcial para cruzamento robusto."
        )
        draft.partial = True
        draft.confidence = "medium"
        draft.limitations.append(
            "Contexto financeiro parcial: use cautela em recomendacoes que impactam caixa e capital de giro."
        )
    else:
        draft.direct_answer = (
            "Existe base financeira disponivel, mas sem granularidade completa no contexto atual do chat."
        )
        draft.confidence = "medium"

    draft.evidence.append(
        f"Forecast final consolidado: {_format_number(forecast_final)}; receita estimada: {_format_currency(estimated_revenue)}."
    )
    draft.evidence.append(
        f"Status financeiro atual: availability={availability}, structured={str(structured).lower()}."
    )
    draft.executive_recommendation.append(
        "Antes de aprovar aumento de estoque, valide impacto em caixa e margem com o time financeiro."
    )
    _ensure_context_items(draft, context)
    return draft


def _handle_sop_agenda(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    top_risks = _safe_list(context.get("top_risks"))
    totals = _safe_dict(context.get("totals"))
    alerts = _safe_dict(context.get("risk_alerts"))
    summary = _safe_dict(context.get("context_summary"))
    finance_status = _safe_dict(summary.get("finance_status"))

    growth_pct = float(_to_number(totals.get("growth_impact_pct")))
    rupture = int(_to_number(alerts.get("rupture_risk_count")))
    missing_stock = int(_to_number(alerts.get("missing_stock_count")))
    top_driver = _predominant_driver(top_risks)

    draft.direct_answer = "Na proxima reuniao de S&OP, foque em riscos criticos, cobertura e confianca do forecast."
    draft.evidence.append(f"Crescimento consolidado: {_format_pct(growth_pct)}.")
    draft.evidence.append(f"Ruptura potencial em {rupture} produtos; {missing_stock} sem cobertura.")
    if top_risks:
        draft.evidence.append(
            f"Risco lider: {_safe_str(top_risks[0].get('group'), '(sem grupo)')}/"
            f"{_safe_str(top_risks[0].get('abc_class'), '-')} "
            f"com score {float(_to_number(top_risks[0].get('score'))):.1f}."
        )
    draft.risks_limitations.append(f"Driver predominante de risco: {top_driver}.")

    if _safe_str(finance_status.get("availability_status")) != "ready":
        draft.partial = True
        draft.risks_limitations.append(
            "Base financeira incompleta para fechar recomendacao de caixa/capital de giro."
        )

    draft.executive_recommendation.extend(
        [
            "Definir plano de mitigacao para os 3 maiores riscos executivos com dono e prazo.",
            "Revisar cobertura dos itens em ruptura e ajustar politicas MTS/MTU.",
            "Validar premissas comerciais dos grupos de maior crescimento antes do congelamento do plano.",
        ]
    )
    _ensure_context_items(draft, context)
    return draft


def _handle_executive_snapshot(context: dict[str, Any]) -> ResponseDraft:
    draft = ResponseDraft(confidence="medium")
    totals = _safe_dict(context.get("totals"))
    top_risks = _safe_list(context.get("top_risks"))
    summary = _safe_dict(context.get("context_summary"))

    forecast_final = float(_to_number(totals.get("final_forecast")))
    growth_pct = float(_to_number(totals.get("growth_impact_pct")))
    confidence_label = _safe_str(_safe_dict(context.get("forecast_confidence")).get("label"), "nao informado")

    draft.direct_answer = (
        f"Cenario executivo atual: forecast final {_format_number(forecast_final)}, "
        f"crescimento {_format_pct(growth_pct)} e confianca {confidence_label}."
    )
    if top_risks:
        top = top_risks[0]
        draft.evidence.append(
            f"Risco lider: {_safe_str(top.get('group'), '(sem grupo)')}/"
            f"{_safe_str(top.get('abc_class'), '-')} "
            f"(score {float(_to_number(top.get('score'))):.1f}, driver {_safe_str(top.get('primary_driver_label'), 'nao informado')})."
        )
    top_group_rows = _safe_list(summary.get("forecast_by_group_top"))
    if top_group_rows:
        group = top_group_rows[0]
        draft.evidence.append(
            f"Grupo com maior crescimento: {_safe_str(group.get('product_group'), '(sem grupo)')} "
            f"({_format_pct(float(_to_number(group.get('growth_impact_pct'))))})."
        )
    draft.executive_recommendation.append(
        "Se quiser, eu detalho por cliente, classe ABC, cobertura MTS/MTU, risco comercial ou pauta de S&OP."
    )
    _ensure_context_items(draft, context)
    return draft


def _build_draft_for_intent(intent: str, query: str, context: dict[str, Any]) -> ResponseDraft:
    if intent == "top_risks":
        return _handle_top_risks(context)
    if intent == "class_focus":
        return _handle_class_focus(context)
    if intent == "group_focus":
        return _handle_group_focus(query, context)
    if intent == "growth_pressure":
        return _handle_growth_pressure(context)
    if intent == "forecast_customer":
        return _handle_forecast_customer(query, context)
    if intent == "products_by_customer":
        return _handle_products_by_customer(query, context)
    if intent == "coverage_risk":
        return _handle_coverage_risk(query, context)
    if intent == "forecast_confidence":
        return _handle_forecast_confidence(context)
    if intent == "forecast_method":
        return _handle_forecast_method(context)
    if intent == "data_limitations":
        return _handle_data_limitations(context)
    if intent == "financial_alignment":
        return _handle_financial_alignment(context)
    if intent == "sop_agenda":
        return _handle_sop_agenda(context)
    return _handle_executive_snapshot(context)


def _blocks_for_mode(draft: ResponseDraft, mode: str) -> dict[str, Any]:
    if mode == "detailed":
        evidence = draft.evidence[:8]
        risks = _unique_keep_order(draft.risks_limitations + draft.limitations)[:8]
        recommendation = draft.executive_recommendation[:5]
    else:
        evidence = draft.evidence[:3]
        risks = _unique_keep_order(draft.risks_limitations + draft.limitations)[:3]
        recommendation = draft.executive_recommendation[:2]

    return {
        "direct_answer": draft.direct_answer,
        "evidence": evidence,
        "risks_limitations": risks,
        "executive_recommendation": recommendation,
    }


def _compose_answer_from_blocks(blocks: dict[str, Any], mode: str) -> str:
    direct_answer = _safe_str(blocks.get("direct_answer"), "Sem resposta direta para este contexto.")
    evidence = [str(item) for item in _safe_list(blocks.get("evidence")) if str(item).strip()]
    risks = [str(item) for item in _safe_list(blocks.get("risks_limitations")) if str(item).strip()]
    recommendation = [
        str(item) for item in _safe_list(blocks.get("executive_recommendation")) if str(item).strip()
    ]

    lines = [f"Resposta direta:\n{direct_answer}"]
    if evidence:
        lines.append("Evidencias / base utilizada:\n- " + "\n- ".join(evidence))
    if risks:
        lines.append("Riscos ou limitacoes:\n- " + "\n- ".join(risks))
    if recommendation:
        lines.append("Recomendacao executiva:\n- " + "\n- ".join(recommendation))

    if mode == "short":
        return "\n\n".join(lines[:3] if len(lines) >= 3 else lines)
    return "\n\n".join(lines)


def build_executive_chat_context_payload(
    *,
    planning_result: dict[str, Any] | None,
    sales_rows: list[dict[str, Any]],
    production_rows: list[dict[str, Any]] | None = None,
    customers_rows: list[dict[str, Any]] | None = None,
    inventory_rows: list[dict[str, Any]] | None = None,
    manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    context = _build_chat_context(
        planning_result=planning_result,
        sales_rows=sales_rows,
        production_rows=production_rows or [],
        customers_rows=customers_rows or [],
        inventory_rows=inventory_rows or [],
        manifest=manifest,
        history=history or [],
    )
    return {
        "generated_at": _now_iso(),
        "context_summary": context["context_summary"],
        "suggestions": _build_dynamic_suggestions(context),
    }


def build_executive_chat_response(
    *,
    message: str,
    planning_result: dict[str, Any] | None,
    sales_rows: list[dict[str, Any]],
    production_rows: list[dict[str, Any]] | None = None,
    customers_rows: list[dict[str, Any]] | None = None,
    inventory_rows: list[dict[str, Any]] | None = None,
    manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
    mode: str = "short",
) -> dict[str, Any]:
    context = _build_chat_context(
        planning_result=planning_result,
        sales_rows=sales_rows,
        production_rows=production_rows or [],
        customers_rows=customers_rows or [],
        inventory_rows=inventory_rows or [],
        manifest=manifest,
        history=history or [],
    )
    query = _normalize_text(message)
    resolution = _resolve_query_intent(query, context)
    intent = resolution.intent
    entities = resolution.entities
    query_mode = resolution.query_mode

    if query_mode == QUERY_MODE_FACTUAL:
        draft = _build_factual_draft_for_intent(intent, context, entities)
    else:
        draft = _build_draft_for_intent(intent, query, context)

    draft.missing_data = _unique_keep_order(draft.missing_data)
    draft.limitations = _unique_keep_order(draft.limitations)

    if draft.missing_data and "Resposta parcial por falta de dados no contexto atual." not in draft.limitations:
        draft.limitations.append("Resposta parcial por falta de dados no contexto atual.")
    if draft.partial and draft.confidence == "high":
        draft.confidence = "medium"

    response_mode = "detailed" if mode == "detailed" else "short"
    blocks = _blocks_for_mode(draft, response_mode)
    answer = _compose_answer_from_blocks(blocks, response_mode)
    context_summary = context["context_summary"]
    suggestions = _build_dynamic_suggestions(context)

    context_used = {
        "query_mode": query_mode,
        "intent": intent,
        "entities": entities,
        "has_planning_result": bool(context.get("planning_result")),
        "has_production": isinstance(context.get("production_df"), pd.DataFrame)
        and not context["production_df"].empty,
        "has_sales_orders": isinstance(context.get("sales_df"), pd.DataFrame)
        and not context["sales_df"].empty,
        "has_customers": isinstance(context.get("customers_df"), pd.DataFrame)
        and not context["customers_df"].empty,
        "has_inventory": isinstance(context.get("inventory_df"), pd.DataFrame)
        and not context["inventory_df"].empty,
        "has_summary_by_customer": bool(context.get("summary_by_customer")),
        "has_summary_by_group": bool(context.get("summary_by_group")),
        "has_summary_by_class": bool(context.get("summary_by_class")),
        "has_risk_scoring": bool(context.get("top_risks")),
        "has_coverage": bool(_safe_dict(context_summary.get("coverage_overview")).get("products_evaluated")),
        "has_finance_documents": _safe_str(
            _safe_dict(context_summary.get("finance_status")).get("availability_status")
        )
        in {"ready", "partial"},
        "filters": _safe_dict(context_summary.get("filters_active")),
        "selected_method": _safe_str(context_summary.get("selected_method")),
        "horizon_months": context_summary.get("horizon_months"),
        "response_mode": response_mode,
        "history_size": len(history or []),
    }

    return {
        "answer": answer,
        "response_mode": response_mode,
        "blocks": blocks,
        "confidence": draft.confidence if draft.confidence in {"high", "medium", "low"} else "medium",
        "partial": bool(draft.partial or bool(draft.missing_data)),
        "limitations": draft.limitations[:10],
        "missing_data": draft.missing_data[:10],
        "data_points": draft.data_points[:12],
        "suggestions": suggestions,
        "context_used": context_used,
        "context_summary": context_summary,
        "generated_at": _now_iso(),
    }


def build_executive_chat_openai_prompt(
    *,
    message: str,
    mode: str,
    context_summary: dict[str, Any],
    history: list[dict[str, Any]] | None,
    fallback_payload: dict[str, Any],
) -> dict[str, str]:
    response_mode = "detailed" if mode == "detailed" else "short"
    recent_history = [
        {
            "role": _safe_str(item.get("role"), "user"),
            "content": _safe_str(item.get("content")),
        }
        for item in (history or [])[-10:]
        if isinstance(item, dict)
    ]
    baseline_blocks = _safe_dict(fallback_payload.get("blocks"))
    response_schema = {
        "response_mode": "short|detailed",
        "blocks": {
            "direct_answer": "string",
            "evidence": ["string"],
            "risks_limitations": ["string"],
            "executive_recommendation": ["string"],
        },
        "confidence": "high|medium|low",
        "partial": "boolean",
        "limitations": ["string"],
        "missing_data": ["string"],
        "data_points": [{"label": "string", "value": "string|number|boolean"}],
        "suggestions": ["string"],
    }

    system_prompt = (
        "Voce e o Copiloto Executivo do Operion com perspectiva integrada de "
        "abastecimento senior, COO, especialista de operacoes, gerente senior de SCM, "
        "especialista financeiro, especialista em S&OP e especialista em S&OE. "
        "Responda em portugues do Brasil, com foco decisorio executivo. "
        "Regras obrigatorias: "
        "1) Use APENAS os dados presentes no JSON de contexto recebido. "
        "2) Nao invente numeros, drivers, clientes, grupos ou classes. "
        "3) Se houver lacuna de dado, declare explicitamente em 'missing_data' e 'limitations'. "
        "4) Entregue resposta estruturada nos blocos solicitados. "
        "5) Seja objetivo, acionavel e transparente. "
        "6) Retorne somente JSON valido, sem markdown."
    )

    user_payload = {
        "question": message,
        "response_mode": response_mode,
        "session_history": recent_history,
        "context_summary": context_summary,
        "deterministic_baseline": {
            "direct_answer": _safe_str(baseline_blocks.get("direct_answer")),
            "evidence": _safe_list(baseline_blocks.get("evidence")),
            "risks_limitations": _safe_list(baseline_blocks.get("risks_limitations")),
            "executive_recommendation": _safe_list(baseline_blocks.get("executive_recommendation")),
        },
        "target_schema": response_schema,
        "quality_rules": [
            "Use numeros exatos somente quando estiverem no contexto.",
            "Nao assumir informacoes ausentes.",
            "Se partial=true, justificar em limitations.",
            "Manter coerencia entre blocos e confidence.",
        ],
    }
    user_prompt = (
        "Gere uma resposta executiva no schema alvo abaixo.\n"
        "Nao inclua campos extras fora do schema.\n\n"
        f"Payload:\n{json.dumps(user_payload, ensure_ascii=False)}"
    )
    return {
        "system_prompt": system_prompt,
        "user_prompt": user_prompt,
    }


def _coerce_text(value: Any) -> str:
    return _safe_str(value)


def _split_text_list(value: str) -> list[str]:
    text = _safe_str(value)
    if not text:
        return []
    parts = re.split(r"(?:\r?\n|;\s+)", text)
    cleaned: list[str] = []
    for part in parts:
        normalized = re.sub(r"^\s*[-*•\d\)\(.:]+\s*", "", part).strip()
        if normalized:
            cleaned.append(normalized)
    return cleaned


def _coerce_text_list(value: Any, *, warnings: list[str], field_name: str) -> list[str]:
    if isinstance(value, list):
        return _unique_keep_order([_safe_str(item) for item in value if _safe_str(item)])
    if isinstance(value, str):
        warnings.append(f"{field_name}: convertido de texto para lista.")
        return _unique_keep_order(_split_text_list(value))
    if value is None:
        return []
    warnings.append(f"{field_name}: tipo invalido ({type(value).__name__}), fallback aplicado.")
    return []


def _coerce_bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    normalized = _normalize_text(str(value))
    if normalized in {"true", "1", "yes", "sim"}:
        return True
    if normalized in {"false", "0", "no", "nao"}:
        return False
    return default


def _coerce_confidence(value: Any, *, default: str) -> str:
    normalized = _normalize_text(str(value))
    if normalized in {"high", "alta"}:
        return "high"
    if normalized in {"low", "baixa"}:
        return "low"
    if normalized in {"medium", "media", "med"}:
        return "medium"
    return default if default in {"high", "medium", "low"} else "medium"


def _coerce_data_points(value: Any, *, warnings: list[str]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        if value is None:
            return []
        warnings.append("data_points: valor nao era lista; campo ignorado.")
        return []

    points: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            label = _safe_str(item.get("label"))
            if not label:
                continue
            points.append({"label": label, "value": item.get("value")})
        elif isinstance(item, str):
            label = _safe_str(item)
            if label:
                points.append({"label": label, "value": label})
    return points[:12]


def merge_executive_chat_openai_output(
    *,
    openai_output: dict[str, Any],
    fallback_payload: dict[str, Any],
    mode: str,
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    llm_payload = openai_output if isinstance(openai_output, dict) else {}

    fallback_blocks = _safe_dict(fallback_payload.get("blocks"))
    llm_blocks = _safe_dict(llm_payload.get("blocks"))
    direct_answer = _coerce_text(llm_blocks.get("direct_answer") or llm_payload.get("direct_answer"))
    if not direct_answer:
        direct_answer = _coerce_text(fallback_blocks.get("direct_answer"))
        warnings.append("direct_answer ausente no LLM; fallback de bloco aplicado.")

    evidence = _coerce_text_list(
        llm_blocks.get("evidence") if "evidence" in llm_blocks else llm_payload.get("evidence"),
        warnings=warnings,
        field_name="evidence",
    )
    risks = _coerce_text_list(
        llm_blocks.get("risks_limitations")
        if "risks_limitations" in llm_blocks
        else llm_payload.get("risks_limitations"),
        warnings=warnings,
        field_name="risks_limitations",
    )
    recommendation = _coerce_text_list(
        llm_blocks.get("executive_recommendation")
        if "executive_recommendation" in llm_blocks
        else llm_payload.get("executive_recommendation"),
        warnings=warnings,
        field_name="executive_recommendation",
    )

    if not evidence:
        evidence = _coerce_text_list(
            fallback_blocks.get("evidence"),
            warnings=warnings,
            field_name="fallback_evidence",
        )
    if not risks:
        risks = _coerce_text_list(
            fallback_blocks.get("risks_limitations"),
            warnings=warnings,
            field_name="fallback_risks_limitations",
        )
    if not recommendation:
        recommendation = _coerce_text_list(
            fallback_blocks.get("executive_recommendation"),
            warnings=warnings,
            field_name="fallback_executive_recommendation",
        )

    response_mode = "detailed" if mode == "detailed" else "short"
    blocks = {
        "direct_answer": direct_answer,
        "evidence": evidence,
        "risks_limitations": risks,
        "executive_recommendation": recommendation,
    }
    answer = _compose_answer_from_blocks(blocks, response_mode)

    fallback_confidence = _safe_str(fallback_payload.get("confidence"), "medium")
    fallback_partial = bool(fallback_payload.get("partial"))
    confidence = _coerce_confidence(llm_payload.get("confidence"), default=fallback_confidence)
    partial = _coerce_bool(llm_payload.get("partial"), default=fallback_partial)

    limitations = _coerce_text_list(
        llm_payload.get("limitations"),
        warnings=warnings,
        field_name="limitations",
    )
    missing_data = _coerce_text_list(
        llm_payload.get("missing_data"),
        warnings=warnings,
        field_name="missing_data",
    )
    if not limitations:
        limitations = _coerce_text_list(
            fallback_payload.get("limitations"),
            warnings=warnings,
            field_name="fallback_limitations",
        )
    if not missing_data:
        missing_data = _coerce_text_list(
            fallback_payload.get("missing_data"),
            warnings=warnings,
            field_name="fallback_missing_data",
        )
    if missing_data and "Resposta parcial por falta de dados no contexto atual." not in limitations:
        limitations.append("Resposta parcial por falta de dados no contexto atual.")
        partial = True

    data_points = _coerce_data_points(llm_payload.get("data_points"), warnings=warnings)
    if not data_points:
        data_points = _coerce_data_points(fallback_payload.get("data_points"), warnings=warnings)

    llm_suggestions = _coerce_text_list(
        llm_payload.get("suggestions"),
        warnings=warnings,
        field_name="suggestions",
    )
    fallback_suggestions = _coerce_text_list(
        fallback_payload.get("suggestions"),
        warnings=warnings,
        field_name="fallback_suggestions",
    )
    suggestions = llm_suggestions or fallback_suggestions

    merged_payload = dict(fallback_payload)
    merged_payload.update(
        {
            "answer": answer,
            "response_mode": response_mode,
            "blocks": blocks,
            "confidence": confidence,
            "partial": partial,
            "limitations": limitations[:10],
            "missing_data": missing_data[:10],
            "data_points": data_points[:12],
            "suggestions": suggestions[:10],
            "generated_at": _now_iso(),
        }
    )
    return merged_payload, _unique_keep_order(warnings)

