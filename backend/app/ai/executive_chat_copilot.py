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
    manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    sales_df = _build_sales_dataframe(sales_rows)
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
        missing_data.append("Resultado consolidado de Planejamento e Producao")
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
        )
    )

    return {
        "planning_result": planning,
        "sales_df": sales_df,
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
        "group_candidates": _build_candidates(summary_by_group, ["product_group"]),
        "class_candidates": _build_candidates(summary_by_class, ["abc_class"]),
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


def _classify_intent(query: str) -> str:
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
            "Execute novamente o Planejamento e Producao para gerar os heatmaps e o ranking de riscos."
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
    manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    context = _build_chat_context(
        planning_result=planning_result,
        sales_rows=sales_rows,
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
    manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
    mode: str = "short",
) -> dict[str, Any]:
    context = _build_chat_context(
        planning_result=planning_result,
        sales_rows=sales_rows,
        manifest=manifest,
        history=history or [],
    )
    query = _normalize_text(message)
    intent = _classify_intent(query)
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
        "intent": intent,
        "has_planning_result": bool(context.get("planning_result")),
        "has_sales_orders": isinstance(context.get("sales_df"), pd.DataFrame)
        and not context["sales_df"].empty,
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
        "Supply Chain senior, COO, especialista de operacoes, gerente senior de SCM, "
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
