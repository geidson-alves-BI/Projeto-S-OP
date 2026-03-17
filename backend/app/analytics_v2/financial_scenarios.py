from __future__ import annotations

from copy import deepcopy
from typing import Any

DEFAULT_SCENARIO = "base"
SUPPORTED_SCENARIOS = {"base", "conservador", "agressivo"}

_SCENARIO_ASSUMPTIONS: dict[str, dict[str, Any]] = {
    "base": {
        "display_name": "Base",
        "revenue_factor": 1.00,
        "demand_factor": 1.00,
        "inventory_coverage_factor": 1.00,
        "safety_factor": 1.00,
        "notes": "Referencia neutra para comparacao.",
    },
    "conservador": {
        "display_name": "Conservador",
        "revenue_factor": 0.94,
        "demand_factor": 0.95,
        "inventory_coverage_factor": 1.10,
        "safety_factor": 1.05,
        "notes": "Pressupoe demanda menor e maior protecao de estoque.",
    },
    "agressivo": {
        "display_name": "Agressivo",
        "revenue_factor": 1.08,
        "demand_factor": 1.12,
        "inventory_coverage_factor": 1.20,
        "safety_factor": 0.98,
        "notes": "Pressupoe crescimento comercial com aceleracao de giro.",
    },
}


def normalize_scenario_name(scenario: str | None) -> str:
    normalized = str(scenario or "").strip().lower()
    if normalized in SUPPORTED_SCENARIOS:
        return normalized
    aliases = {
        "cenario_base": "base",
        "cenario conservador": "conservador",
        "cenario agressivo": "agressivo",
    }
    return aliases.get(normalized, DEFAULT_SCENARIO)


def _safe_float(value: Any) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if parsed == parsed else 0.0
    raw = str(value or "").strip()
    if not raw:
        return 0.0
    cleaned = raw.replace(" ", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _degrade_confidence(confidence: str) -> str:
    if confidence == "high":
        return "medium"
    if confidence == "medium":
        return "low"
    return "low"


def _decision_grade_from_confidence(confidence: str, status: str) -> str:
    if status == "unavailable":
        return "D"
    if status == "partial" and confidence == "low":
        return "C"
    if confidence == "high":
        return "A"
    if confidence == "medium":
        return "B"
    return "C"


def _build_scenario_values(
    *,
    assumptions: dict[str, Any],
    base_revenue: float,
    base_cogs: float,
    base_fg_working_capital: float,
    base_rm_working_capital: float,
    base_mts_incremental_investment: float,
    carrying_cost_rate: float,
) -> dict[str, float]:
    revenue_factor = _safe_float(assumptions.get("revenue_factor")) or 1.0
    demand_factor = _safe_float(assumptions.get("demand_factor")) or 1.0
    inventory_coverage_factor = _safe_float(assumptions.get("inventory_coverage_factor")) or 1.0
    safety_factor = _safe_float(assumptions.get("safety_factor")) or 1.0

    revenue = base_revenue * revenue_factor
    cogs_factor = demand_factor * safety_factor
    cogs = base_cogs * cogs_factor

    fg_working_capital = base_fg_working_capital * demand_factor * inventory_coverage_factor
    rm_working_capital = base_rm_working_capital * safety_factor * inventory_coverage_factor
    total_working_capital = fg_working_capital + rm_working_capital

    mts_incremental_investment = base_mts_incremental_investment * demand_factor * safety_factor
    inventory_carrying_cost = total_working_capital * carrying_cost_rate
    contribution_margin = revenue - cogs
    contribution_margin_pct = (contribution_margin / revenue * 100.0) if revenue > 0 else 0.0

    return {
        "revenue": revenue,
        "cogs": cogs,
        "contribution_margin": contribution_margin,
        "contribution_margin_pct": contribution_margin_pct,
        "fg_working_capital": fg_working_capital,
        "rm_working_capital": rm_working_capital,
        "total_working_capital": total_working_capital,
        "mts_incremental_investment": mts_incremental_investment,
        "inventory_carrying_cost": inventory_carrying_cost,
    }


def build_financial_scenarios(
    *,
    base_revenue: float,
    base_cogs: float,
    base_total_working_capital: float,
    base_confidence: str,
    base_limitations: list[str] | None = None,
    base_fg_working_capital: float | None = None,
    base_rm_working_capital: float | None = None,
    base_mts_incremental_investment: float = 0.0,
    carrying_cost_rate: float = 0.18,
    base_missing_data: list[str] | None = None,
    base_base_usada: list[str] | None = None,
    base_calculation_method: str | None = None,
) -> dict[str, Any]:
    safe_limitations = list(base_limitations or [])
    safe_missing_data = list(base_missing_data or [])
    safe_base_usada = list(base_base_usada or [])
    safe_carrying_cost_rate = _safe_float(carrying_cost_rate) or 0.18
    safe_fg = _safe_float(base_fg_working_capital)
    safe_rm = _safe_float(base_rm_working_capital)

    if safe_fg <= 0 and safe_rm <= 0:
        safe_fg = max(0.0, _safe_float(base_total_working_capital) * 0.6)
        safe_rm = max(0.0, _safe_float(base_total_working_capital) - safe_fg)
    elif safe_fg <= 0:
        safe_fg = max(0.0, _safe_float(base_total_working_capital) - safe_rm)
    elif safe_rm <= 0:
        safe_rm = max(0.0, _safe_float(base_total_working_capital) - safe_fg)

    scenarios: dict[str, dict[str, Any]] = {}
    for scenario_id in ("base", "conservador", "agressivo"):
        assumptions = deepcopy(_SCENARIO_ASSUMPTIONS[scenario_id])
        assumptions["carrying_cost_rate"] = safe_carrying_cost_rate
        values = _build_scenario_values(
            assumptions=assumptions,
            base_revenue=_safe_float(base_revenue),
            base_cogs=_safe_float(base_cogs),
            base_fg_working_capital=safe_fg,
            base_rm_working_capital=safe_rm,
            base_mts_incremental_investment=_safe_float(base_mts_incremental_investment),
            carrying_cost_rate=safe_carrying_cost_rate,
        )

        confidence = base_confidence if scenario_id == "base" else _degrade_confidence(base_confidence)
        scenario_limitations = list(safe_limitations)
        if scenario_id != "base":
            scenario_limitations.append(
                "Cenario derivado por premissas explicitas de demanda, cobertura e seguranca."
            )

        scenario_missing_data = list(safe_missing_data)
        status = "ready" if confidence == "high" and not scenario_missing_data else "partial"
        decision_grade = _decision_grade_from_confidence(confidence, status)

        scenarios[scenario_id] = {
            "scenario": scenario_id,
            "scenario_id": scenario_id,
            "display_name": str(assumptions.get("display_name", scenario_id.title())),
            "assumptions": assumptions,
            "revenue": values["revenue"],
            "projected_revenue": values["revenue"],
            "cogs": values["cogs"],
            "projected_cogs": values["cogs"],
            "contribution_margin": values["contribution_margin"],
            "contribution_margin_pct": values["contribution_margin_pct"],
            "fg_working_capital": values["fg_working_capital"],
            "rm_working_capital": values["rm_working_capital"],
            "total_working_capital": values["total_working_capital"],
            "mts_incremental_investment": values["mts_incremental_investment"],
            "inventory_carrying_cost": values["inventory_carrying_cost"],
            "confianca": confidence,
            "confidence": confidence,
            "decision_grade": decision_grade,
            "status": status,
            "missing_data": list(dict.fromkeys(scenario_missing_data)),
            "limitations": list(dict.fromkeys(scenario_limitations)),
            "calculation_method": base_calculation_method
            or (
                "scenario_v2_formula: revenue=base*revenue_factor; "
                "cogs=base*(demand_factor*safety_factor); "
                "working_capital=(fg+rm)*inventory_coverage_factor; "
                "carrying=capital_total*carrying_cost_rate."
            ),
            "base_usada": list(dict.fromkeys(safe_base_usada)),
        }

    base_node = scenarios["base"]
    delta_fields = [
        "revenue",
        "projected_revenue",
        "cogs",
        "projected_cogs",
        "contribution_margin",
        "contribution_margin_pct",
        "fg_working_capital",
        "rm_working_capital",
        "total_working_capital",
        "mts_incremental_investment",
        "inventory_carrying_cost",
    ]
    for scenario_id, node in scenarios.items():
        node["delta_vs_base"] = {
            field: _safe_float(node.get(field)) - _safe_float(base_node.get(field))
            for field in delta_fields
        }
        node["delta_vs_base"]["scenario_delta_financial"] = node["delta_vs_base"]["contribution_margin"]

    return {
        "scenarios": scenarios,
        "ordered_scenarios": [scenarios["base"], scenarios["conservador"], scenarios["agressivo"]],
        "base_scenario": "base",
        "assumptions": {scenario_id: deepcopy(node["assumptions"]) for scenario_id, node in scenarios.items()},
    }
