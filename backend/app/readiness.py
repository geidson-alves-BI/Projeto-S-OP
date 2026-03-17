from __future__ import annotations

from typing import Any

VALIDATION_AVAILABLE_STATUSES = {"ready", "partial"}


def _is_available(dataset_state: dict[str, Any]) -> bool:
    return bool(dataset_state.get("uploaded")) and dataset_state.get("availability_status") in VALIDATION_AVAILABLE_STATUSES


def _get_confidence_score(dataset_state: dict[str, Any]) -> int:
    if not _is_available(dataset_state):
        return 0
    return int(dataset_state.get("compatibility_summary", {}).get("confidence_score", 0))


def _calculate_module_readiness(
    manifest: dict[str, dict[str, Any]],
    required_datasets: list[str],
    optional_datasets: list[str] = None,
) -> tuple[str, str, list[str]]:
    if optional_datasets is None:
        optional_datasets = []

    required_available = all(_is_available(manifest[ds]) for ds in required_datasets)
    optional_available = any(_is_available(manifest[ds]) for ds in optional_datasets)

    if required_available:
        status = "available"
    elif any(_is_available(manifest[ds]) for ds in required_datasets) or optional_available:
        status = "partial"
    else:
        status = "unavailable"

    total_confidence = sum(_get_confidence_score(manifest[ds]) for ds in required_datasets + optional_datasets)
    num_datasets = len(required_datasets) + len(optional_datasets)
    avg_confidence = total_confidence / num_datasets if num_datasets > 0 else 0

    if avg_confidence >= 80:
        confidence = "high"
    elif avg_confidence >= 50:
        confidence = "medium"
    else:
        confidence = "low"

    missing = [manifest[ds]["name"] for ds in required_datasets if not _is_available(manifest[ds])]
    return status, confidence, missing


ANALYTICAL_MODULES = {
    "planning_production": {
        "key": "planning_production",
        "label": "Analise e Planejamento de Demanda",
        "required": ["sales_orders"],
        "optional": ["customers", "raw_material_inventory", "finance_documents", "forecast_input"],
        "description": "Consolida forecast, crescimento comercial e cenarios MTS/MTO para decisao executiva.",
    },
    "forecast": {
        "key": "forecast",
        "label": "Forecast",
        "required": ["production"],
        "optional": ["sales_orders", "forecast_input"],
        "description": "Capacidade de prever a demanda futura com base em dados historicos e comerciais.",
    },
    "mts_mto": {
        "key": "mts_mto",
        "label": "MTS/MTO",
        "required": ["production"],
        "optional": ["customers", "forecast_input", "bom"],
        "description": "Leitura da politica MTS/MTO com simulacao condicionada ao carregamento da BOM.",
    },
    "raw_material": {
        "key": "raw_material",
        "label": "Materia-prima",
        "required": ["bom", "raw_material_inventory"],
        "optional": ["forecast_input"],
        "description": "Analise de cobertura, risco e necessidade de compra de insumos.",
    },
    "finance": {
        "key": "finance",
        "label": "Financeiro",
        "required": ["finance_documents"],
        "optional": ["bom", "raw_material_inventory", "sales_orders"],
        "description": "Visao economica do negocio, incluindo custos, margens e projecoes.",
    },
    "executive_ai": {
        "key": "executive_ai",
        "label": "Chat Executivo",
        "required": ["production", "bom", "finance_documents"],
        "optional": ["sales_orders", "customers", "raw_material_inventory", "forecast_input"],
        "description": "Capacidade de chat executivo para fornecer insights e recomendacoes estrategicas.",
    },
    "integrated_vision": {
        "key": "integrated_vision",
        "label": "Visao Integrada do Negocio",
        "required": ["production", "sales_orders", "bom", "raw_material_inventory", "finance_documents"],
        "optional": [],
        "description": "Visao completa e integrada de todas as areas do negocio.",
    },
}


def get_readiness_summary(manifest: dict[str, dict[str, Any]]) -> dict[str, Any]:
    modules = {}
    for key, config in ANALYTICAL_MODULES.items():
        status, confidence, missing = _calculate_module_readiness(
            manifest, config["required"], config["optional"]
        )
        modules[key] = {
            "key": key,
            "label": config["label"],
            "status": status,
            "confidence": confidence,
            "datasets": config["required"] + config["optional"],
            "missing_datasets": missing,
            "description": config["description"],
        }

    available_modules = sum(1 for m in modules.values() if m["status"] == "available")
    partial_modules = sum(1 for m in modules.values() if m["status"] == "partial")
    total_modules = len(modules)

    if available_modules == total_modules:
        overall_status = "available"
        overall_confidence = "high"
    elif available_modules + partial_modules > 0:
        overall_status = "partial"
        overall_confidence = "medium"
    else:
        overall_status = "unavailable"
        overall_confidence = "low"

    return {
        "overall_status": overall_status,
        "overall_confidence": overall_confidence,
        "modules": list(modules.values()),
    }


