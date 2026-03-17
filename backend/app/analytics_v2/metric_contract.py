from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .status import STATUS_UNAVAILABLE, normalize_status

ANALYTICS_ENGINE_V2_VERSION = "2.0.0"
METRIC_DEFINITION_VERSION = "1.0.0"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        parsed = float(value)
        if parsed != parsed:
            return None
        return parsed
    raw = str(value or "").strip()
    if not raw:
        return None
    cleaned = raw.replace(" ", "")
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _format_value(value: Any, output_format: str, unit: str | None = None) -> str:
    if value is None:
        return "N/A"

    numeric_value = _to_float(value)
    if output_format == "text":
        return str(value)
    if numeric_value is None:
        return str(value)

    if output_format == "currency_brl":
        return f"R$ {numeric_value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if output_format == "currency_usd":
        return f"US$ {numeric_value:,.2f}"
    if output_format == "percent":
        return f"{numeric_value:.2f}%"
    if output_format == "days":
        return f"{numeric_value:.1f} dias"
    if output_format == "count":
        return f"{int(round(numeric_value))}"
    if output_format == "ratio":
        return f"{numeric_value:.4f}"
    if output_format == "number":
        if unit:
            return f"{numeric_value:,.2f} {unit}"
        return f"{numeric_value:,.2f}"
    return str(value)


def build_metric_contract(
    *,
    metric_definition: dict[str, Any],
    value: Any,
    base_usada: list[str],
    escopo: str,
    status: str,
    confianca: str,
    decision_grade: str,
    missing_data: list[str] | None = None,
    observacoes: list[str] | None = None,
    limitations: list[str] | None = None,
    calculation_method: str = "",
    reference_date: str | None = None,
    blocked_reason: str | None = None,
    fallback_strategy_applied: str | None = None,
    estimate_type: str | None = None,
) -> dict[str, Any]:
    normalized_status = normalize_status(status)
    safe_missing = list(dict.fromkeys(str(item) for item in (missing_data or []) if str(item).strip()))
    safe_observacoes = list(dict.fromkeys(str(item) for item in (observacoes or []) if str(item).strip()))
    safe_limitations = list(dict.fromkeys(str(item) for item in (limitations or []) if str(item).strip()))

    if fallback_strategy_applied:
        safe_observacoes.append(f"fallback_strategy_applied: {fallback_strategy_applied}")

    if blocked_reason and normalized_status == STATUS_UNAVAILABLE:
        safe_limitations.append(f"blocked_reason: {blocked_reason}")

    output_format = str(metric_definition.get("output_format") or "number")
    output_unit = metric_definition.get("output_unit")
    normalized_estimate_type = str(estimate_type or "").strip().lower()
    if normalized_estimate_type not in {"documented", "estimated", "hybrid"}:
        normalized_estimate_type = "documented"

    return {
        "metric_id": str(metric_definition.get("metric_id", "")),
        "display_name": str(metric_definition.get("display_name", "")),
        "value": value if normalized_status != STATUS_UNAVAILABLE else None,
        "formatted_value": _format_value(value, output_format, str(output_unit) if output_unit else None),
        "base_usada": list(dict.fromkeys(base_usada)),
        "escopo": escopo,
        "confianca": confianca if confianca in {"high", "medium", "low"} else "low",
        "decision_grade": decision_grade if decision_grade in {"A", "B", "C", "D"} else "D",
        "missing_data": safe_missing,
        "status": normalized_status,
        "observacoes": safe_observacoes,
        "limitations": safe_limitations,
        "calculation_method": calculation_method,
        "estimate_type": normalized_estimate_type,
        "reference_date": reference_date or _now_iso(),
        "engine_version": ANALYTICS_ENGINE_V2_VERSION,
        "metric_definition_version": str(
            metric_definition.get("metric_definition_version", METRIC_DEFINITION_VERSION)
        ),
        "blocked_reason": blocked_reason,
    }
