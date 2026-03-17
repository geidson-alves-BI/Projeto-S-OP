from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from .analytics_v2.abc_xyz_rules import (
    ABC_CRITERIA_TEXT,
    COMBINED_CRITERIA_TEXT,
    TARGET_DAYS_BY_CLASS,
    XYZ_CRITERIA_TEXT,
    classify_abc,
    classify_xyz,
)
from .analytics_v2.dataset_registry import get_dataset_registry_entry
from .analytics_v2.normalizers import safe_text as _safe_text
from .analytics_v2.normalizers import to_number as _to_number
from .analytics_v2.status import STATUS_PARTIAL, STATUS_READY, STATUS_UNAVAILABLE

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dataset_label(dataset_id: str, fallback: str) -> str:
    try:
        entry = get_dataset_registry_entry(dataset_id)
    except KeyError:
        return fallback

    label = _safe_text(entry.get("display_name"))
    return label or fallback


def _trend_label(trend_pct: float | None) -> str:
    if trend_pct is None:
        return "Sem base historica"
    if trend_pct >= 15:
        return "Crescimento forte"
    if trend_pct >= 5:
        return "Crescimento"
    if trend_pct <= -15:
        return "Queda forte"
    if trend_pct <= -5:
        return "Queda"
    return "Estavel"


def _customer_label(customer_code: str, customer_name: str) -> str:
    code = _safe_text(customer_code)
    name = _safe_text(customer_name)
    if code and name:
        return f"{code} - {name}"
    return code or name


def _prepare_production(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "product_code",
                "product_description",
                "produced_quantity",
                "month",
                "reference_year",
                "period_key",
                "customer_name",
                "customer_code",
            ]
        )

    frame = pd.DataFrame(rows).copy()
    for column, default in (
        ("product_code", ""),
        ("product_description", ""),
        ("produced_quantity", 0.0),
        ("month", None),
        ("reference_year", None),
        ("customer_name", ""),
        ("customer_code", ""),
    ):
        if column not in frame.columns:
            frame[column] = default

    frame["product_code"] = frame["product_code"].map(_safe_text)
    frame["product_description"] = frame["product_description"].map(_safe_text)
    frame["produced_quantity"] = frame["produced_quantity"].map(_to_number)
    frame["customer_name"] = frame["customer_name"].map(_safe_text)
    frame["customer_code"] = frame["customer_code"].map(_safe_text)
    frame["month"] = pd.to_numeric(frame["month"], errors="coerce").round().astype("Int64")
    frame["reference_year"] = pd.to_numeric(frame["reference_year"], errors="coerce").round().astype("Int64")

    valid_period_mask = (
        frame["month"].notna()
        & frame["reference_year"].notna()
        & (frame["month"] >= 1)
        & (frame["month"] <= 12)
    )

    frame["period_key"] = ""
    if bool(valid_period_mask.any()):
        year = frame.loc[valid_period_mask, "reference_year"].astype(int).astype(str)
        month = frame.loc[valid_period_mask, "month"].astype(int).astype(str).str.zfill(2)
        frame.loc[valid_period_mask, "period_key"] = year + "-" + month

    frame = frame[frame["product_code"] != ""].copy()
    frame.reset_index(drop=True, inplace=True)
    return frame


def _prepare_sales(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["product_code", "customer_code", "customer_name", "order_quantity"])

    frame = pd.DataFrame(rows).copy()
    for column, default in (
        ("product_code", ""),
        ("customer_code", ""),
        ("customer_name", ""),
        ("order_quantity", 0.0),
    ):
        if column not in frame.columns:
            frame[column] = default

    frame["product_code"] = frame["product_code"].map(_safe_text)
    frame["customer_code"] = frame["customer_code"].map(_safe_text)
    frame["customer_name"] = frame["customer_name"].map(_safe_text)
    frame["order_quantity"] = frame["order_quantity"].map(_to_number)
    frame = frame[frame["product_code"] != ""].copy()
    frame.reset_index(drop=True, inplace=True)
    return frame


def _build_concentration_map(
    production_df: pd.DataFrame,
    sales_df: pd.DataFrame,
) -> tuple[dict[str, dict[str, Any]], list[str], str]:
    concentration_map: dict[str, dict[str, Any]] = {}
    customers_seen: set[str] = set()

    production_customer = production_df.copy()
    production_customer["customer_label"] = production_customer.apply(
        lambda row: _customer_label(row.get("customer_code", ""), row.get("customer_name", "")),
        axis=1,
    )
    production_customer = production_customer[production_customer["customer_label"] != ""].copy()

    source = "none"
    grouped: pd.DataFrame
    qty_column: str
    if not production_customer.empty:
        grouped = (
            production_customer.groupby(["product_code", "customer_label"], as_index=False)["produced_quantity"]
            .sum()
            .rename(columns={"produced_quantity": "qty"})
        )
        qty_column = "qty"
        source = "production"
    else:
        sales_customer = sales_df.copy()
        sales_customer["customer_label"] = sales_customer.apply(
            lambda row: _customer_label(row.get("customer_code", ""), row.get("customer_name", "")),
            axis=1,
        )
        sales_customer = sales_customer[sales_customer["customer_label"] != ""].copy()
        if sales_customer.empty:
            return concentration_map, [], source
        grouped = (
            sales_customer.groupby(["product_code", "customer_label"], as_index=False)["order_quantity"]
            .sum()
            .rename(columns={"order_quantity": "qty"})
        )
        qty_column = "qty"
        source = "sales_orders"

    for product_code, product_bucket in grouped.groupby("product_code"):
        total_qty = float(product_bucket[qty_column].sum())
        if total_qty <= 0:
            continue
        ranked = product_bucket.sort_values(qty_column, ascending=False).copy()
        ranked["share"] = ranked[qty_column] / total_qty
        top_row = ranked.iloc[0]
        top_customer = _safe_text(top_row["customer_label"])
        top_share = float(top_row["share"])
        hhi_value = float((ranked["share"] ** 2).sum())

        concentration_map[_safe_text(product_code)] = {
            "top1_customer": top_customer,
            "top1_share": top_share,
            "hhi": hhi_value,
        }
        for customer in ranked["customer_label"].tolist():
            customer_label = _safe_text(customer)
            if customer_label:
                customers_seen.add(customer_label)

    return concentration_map, sorted(customers_seen), source


def _build_empty_response(limitations: list[str]) -> dict[str, Any]:
    return {
        "status": STATUS_UNAVAILABLE,
        "generated_at": _now_iso(),
        "base_utilizada": [],
        "abrangencia_analise": {
            "escopo": "Base global carregada",
            "periodo_inicial": None,
            "periodo_final": None,
            "meses_considerados": 0,
            "total_skus": 0,
            "linhas_producao": 0,
        },
        "confiabilidade": {
            "nivel": "baixa",
            "score": 0,
            "justificativas": ["Nao ha base suficiente para classificar ABC/XYZ."],
        },
        "limitacoes": limitations,
        "criterio_classificacao": {
            "abc": ABC_CRITERIA_TEXT,
            "xyz": XYZ_CRITERIA_TEXT,
            "combinada": COMBINED_CRITERIA_TEXT,
        },
        "indicadores_resumidos": {
            "total_skus": 0,
            "volume_total": 0.0,
            "classes_abc": {"A": 0, "B": 0, "C": 0},
            "classes_xyz": {"X": 0, "Y": 0, "Z": 0},
            "matriz_abc_xyz": {"AX": 0, "AY": 0, "AZ": 0, "BX": 0, "BY": 0, "BZ": 0, "CX": 0, "CY": 0, "CZ": 0},
            "concentracao_top10_percent": 0.0,
            "participacao_z_percent": 0.0,
            "priorizacao_executiva": [],
        },
        "clientes_disponiveis": [],
        "produtos": [],
    }


def build_abc_xyz_analysis(
    *,
    production_rows: list[dict[str, Any]],
    sales_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    production_base_label = _dataset_label("production", "Historico de producao")
    sales_base_label = _dataset_label("sales_orders", "Carteira comercial")

    production_df = _prepare_production(production_rows)
    sales_df = _prepare_sales(sales_rows or [])

    if production_df.empty:
        return _build_empty_response(
            [
                f"Base {production_base_label.lower()} indisponivel para classificar ABC/XYZ.",
                f"Envie a base {production_base_label.lower()} para liberar esta analise.",
            ]
        )

    limitations: list[str] = []
    base_utilizada: list[str] = [production_base_label]

    month_keys = sorted([key for key in production_df["period_key"].dropna().unique().tolist() if _safe_text(key)])
    if month_keys:
        pivot = (
            production_df.groupby(["product_code", "period_key"], as_index=False)["produced_quantity"]
            .sum()
            .pivot(index="product_code", columns="period_key", values="produced_quantity")
            .fillna(0.0)
        )
        for month in month_keys:
            if month not in pivot.columns:
                pivot[month] = 0.0
        pivot = pivot[month_keys]
    else:
        pivot = (
            production_df.groupby("product_code", as_index=False)["produced_quantity"]
            .sum()
            .rename(columns={"produced_quantity": "sem_periodo"})
            .set_index("product_code")
        )
        month_keys = ["sem_periodo"]
        limitations.append(
            "A base nao trouxe todos os periodos mensais esperados; a serie foi consolidada sem detalhamento temporal completo."
        )

    if pivot.empty:
        return _build_empty_response(
            [
                "Nao foi possivel consolidar volume por SKU com os dados recebidos.",
            ]
        )

    description_by_product: dict[str, str] = {}
    for product_code, bucket in production_df.groupby("product_code"):
        descriptions = [value for value in bucket["product_description"].tolist() if _safe_text(value)]
        description_by_product[_safe_text(product_code)] = _safe_text(descriptions[0]) if descriptions else _safe_text(product_code)

    concentration_map, customers_available, concentration_source = _build_concentration_map(production_df, sales_df)
    if concentration_source == "production":
        base_utilizada.append("Sinal de cliente vinculado na base operacional")
    elif concentration_source == "sales_orders":
        base_utilizada.append(f"{sales_base_label} para leitura de concentracao")
    else:
        limitations.append("Sem base de cliente suficiente para calcular concentracao por SKU.")

    total_volume = float(pivot.sum(axis=1).sum())
    total_volume_safe = total_volume if total_volume > 0 else 1.0

    summary = pd.DataFrame(
        {
            "product_code": pivot.index.astype(str),
            "volume_anual": pivot.sum(axis=1).astype(float).values,
            "media_mensal": pivot.mean(axis=1).astype(float).values,
            "desvio_padrao": pivot.std(axis=1, ddof=1).fillna(0.0).astype(float).values,
        }
    )
    summary = summary.sort_values("volume_anual", ascending=False).reset_index(drop=True)
    summary["cv"] = summary.apply(
        lambda row: float(row["desvio_padrao"] / row["media_mensal"]) if float(row["media_mensal"]) > 0 else 0.0,
        axis=1,
    )
    summary["share"] = summary["volume_anual"] / total_volume_safe
    summary["percentual_acumulado"] = summary["share"].cumsum()
    summary["classe_abc"] = summary["percentual_acumulado"].apply(lambda value: classify_abc(float(value)))
    summary["classe_xyz"] = summary["cv"].apply(lambda value: classify_xyz(float(value)))
    summary["classe_combinada"] = summary.apply(
        lambda row: f"{_safe_text(row['classe_abc'])}{_safe_text(row['classe_xyz'])}",
        axis=1,
    )

    first_window = month_keys[:3]
    last_window = month_keys[-3:]

    products_payload: list[dict[str, Any]] = []
    for _, row in summary.iterrows():
        product_code = _safe_text(row["product_code"])
        month_values = {month: float(pivot.at[product_code, month]) for month in month_keys}
        ordered_values = [month_values[month] for month in month_keys]

        base_volume = float(sum(month_values[month] for month in first_window)) if first_window else 0.0
        recent_volume = float(sum(month_values[month] for month in last_window)) if last_window else 0.0
        trend_pct = ((recent_volume - base_volume) / base_volume * 100.0) if base_volume > 0 else None
        trend = _trend_label(trend_pct)

        classe_abc = _safe_text(row["classe_abc"]) or "C"
        classe_xyz = _safe_text(row["classe_xyz"]) or "Z"
        class_code = f"{classe_abc}{classe_xyz}"
        target_days = int(TARGET_DAYS_BY_CLASS.get(class_code, 0))
        strategy = "MTS (candidato)" if target_days > 0 else "MTO"

        priority = 0
        if classe_abc == "A":
            priority += 4
        elif classe_abc == "B":
            priority += 2
        if classe_xyz in {"X", "Y"}:
            priority += 3
        else:
            priority -= 2
        if trend in {"Crescimento", "Crescimento forte"}:
            priority += 2

        concentration = concentration_map.get(product_code, {})
        description = description_by_product.get(product_code, product_code)
        sku_label = f"{product_code} - {description}" if description and description != product_code else product_code

        products_payload.append(
            {
                "sku": product_code,
                "sku_label": sku_label,
                "descricao": description,
                "month_values": month_values,
                "volume_anual": float(row["volume_anual"]),
                "media_mensal": float(row["media_mensal"]),
                "desvio_padrao": float(row["desvio_padrao"]),
                "cv": float(row["cv"]),
                "percentual_acumulado": float(row["percentual_acumulado"]),
                "classe_abc": classe_abc,
                "classe_xyz": classe_xyz,
                "classe_combinada": class_code,
                "tendencia_percentual": float(trend_pct) if trend_pct is not None else None,
                "tendencia": trend,
                "consumo_diario": float(row["media_mensal"]) / 30.0,
                "dias_alvo": target_days,
                "estrategia": strategy,
                "prioridade": int(priority),
                "top1_cliente": _safe_text(concentration.get("top1_customer")),
                "top1_share": float(concentration.get("top1_share", 0.0)),
                "hhi_cliente": float(concentration.get("hhi", 0.0)),
                "meses_ativos": int(sum(1 for value in ordered_values if value > 0)),
            }
        )

    total_skus = len(products_payload)
    month_count = len(month_keys)

    if month_count < 6:
        limitations.append("Janela historica menor que seis meses; tendencia e variabilidade podem oscilar.")
    if total_skus < 5:
        limitations.append("Quantidade de SKUs pequena para leitura estatistica robusta.")

    abc_counts = {
        "A": int(sum(1 for item in products_payload if item["classe_abc"] == "A")),
        "B": int(sum(1 for item in products_payload if item["classe_abc"] == "B")),
        "C": int(sum(1 for item in products_payload if item["classe_abc"] == "C")),
    }
    xyz_counts = {
        "X": int(sum(1 for item in products_payload if item["classe_xyz"] == "X")),
        "Y": int(sum(1 for item in products_payload if item["classe_xyz"] == "Y")),
        "Z": int(sum(1 for item in products_payload if item["classe_xyz"] == "Z")),
    }
    matrix_counts = {key: 0 for key in ("AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ")}
    for item in products_payload:
        matrix_counts[item["classe_combinada"]] = int(matrix_counts.get(item["classe_combinada"], 0) + 1)

    top10_volume = float(sum(item["volume_anual"] for item in products_payload[:10]))
    concentration_top10 = (top10_volume / total_volume_safe) * 100.0
    z_share_pct = (xyz_counts["Z"] / total_skus * 100.0) if total_skus > 0 else 0.0

    median_active_months = int(pd.Series([item["meses_ativos"] for item in products_payload]).median()) if products_payload else 0

    confidence_score = 35
    if month_count >= 12:
        confidence_score += 25
    elif month_count >= 6:
        confidence_score += 15
    elif month_count >= 3:
        confidence_score += 8
    else:
        confidence_score += 2

    if total_skus >= 50:
        confidence_score += 20
    elif total_skus >= 15:
        confidence_score += 12
    elif total_skus >= 5:
        confidence_score += 6
    else:
        confidence_score += 2

    if median_active_months >= 6:
        confidence_score += 10
    elif median_active_months >= 3:
        confidence_score += 5
    else:
        confidence_score += 1

    if concentration_source != "none":
        confidence_score += 8

    confidence_score = max(0, min(99, confidence_score))
    if confidence_score >= 75:
        confidence_level = "alta"
    elif confidence_score >= 50:
        confidence_level = "media"
    else:
        confidence_level = "baixa"

    confidence_notes = [
        f"{month_count} mes(es) considerados na classificacao.",
        f"{total_skus} SKU(s) com sinal de producao.",
        f"Mediana de {median_active_months} mes(es) ativos por SKU.",
    ]
    if concentration_source == "production":
        confidence_notes.append("Concentracao por cliente calculada com dados de producao.")
    elif concentration_source == "sales_orders":
        confidence_notes.append("Concentracao por cliente calculada com base comercial.")
    else:
        confidence_notes.append("Sem sinal de concentracao por cliente nesta leitura.")

    status = STATUS_READY
    if total_skus == 0:
        status = STATUS_UNAVAILABLE
    elif month_count < 6 or total_skus < 5:
        status = STATUS_PARTIAL

    prioritization: list[str] = []
    if matrix_counts["AZ"] + matrix_counts["BZ"] + matrix_counts["CZ"] > 0:
        prioritization.append("Priorizar revisao de politicas para itens com classe Z.")
    if concentration_top10 >= 70:
        prioritization.append("Alta concentracao nos principais SKUs; avaliar risco de dependencia.")
    if not prioritization:
        prioritization.append("Mix equilibrado para acompanhamento regular de reposicao e nivel de servico.")

    valid_month_keys = [month for month in month_keys if month != "sem_periodo"]
    period_start = valid_month_keys[0] if valid_month_keys else None
    period_end = valid_month_keys[-1] if valid_month_keys else None

    return {
        "status": status,
        "generated_at": _now_iso(),
        "base_utilizada": base_utilizada,
        "abrangencia_analise": {
            "escopo": "Base global carregada",
            "periodo_inicial": period_start,
            "periodo_final": period_end,
            "meses_considerados": month_count,
            "total_skus": total_skus,
            "linhas_producao": int(len(production_df)),
        },
        "confiabilidade": {
            "nivel": confidence_level,
            "score": confidence_score,
            "justificativas": confidence_notes,
        },
        "limitacoes": limitations,
        "criterio_classificacao": {
            "abc": ABC_CRITERIA_TEXT,
            "xyz": XYZ_CRITERIA_TEXT,
            "combinada": COMBINED_CRITERIA_TEXT,
        },
        "indicadores_resumidos": {
            "total_skus": total_skus,
            "volume_total": float(total_volume),
            "classes_abc": abc_counts,
            "classes_xyz": xyz_counts,
            "matriz_abc_xyz": matrix_counts,
            "concentracao_top10_percent": float(concentration_top10),
            "participacao_z_percent": float(z_share_pct),
            "priorizacao_executiva": prioritization,
        },
        "clientes_disponiveis": customers_available,
        "produtos": products_payload,
    }
