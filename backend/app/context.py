from __future__ import annotations

from typing import Any
from .readiness import get_readiness_summary


def _get_dataset_quality_score(dataset: dict[str, Any]) -> int:
    return int(dataset.get("compatibility_summary", {}).get("confidence_score", 0))


def build_executive_context(manifest: dict[str, dict[str, Any]]) -> dict[str, Any]:
    readiness = get_readiness_summary(manifest)
    
    loaded_datasets = [d["name"] for d in manifest.values() if d.get("available")]
    missing_datasets = [d["name"] for d in manifest.values() if not d.get("available")]
    
    status_by_module = {m["label"]: m["status"] for m in readiness["modules"]}
    
    quality_score_by_dataset = {
        d["name"]: _get_dataset_quality_score(d) for d in manifest.values()
    }

    readiness_score_by_module = {
        m["label"]: 100 if m["status"] == "available" else 50 if m["status"] == "partial" else 0 
        for m in readiness["modules"]
    }

    key_gaps = []
    for dataset in manifest.values():
        if not dataset.get("available"):
            key_gaps.append(f"Ausência do dataset: {dataset['name']}")
        else:
            gaps = dataset.get("compatibility_summary", {}).get("quality_gaps", [])
            for gap in gaps:
                key_gaps.append(f"{dataset['name']}: {gap}")

    dre_available = any(d["id"] == "finance_documents" and d.get("available") for d in manifest.values())

    limitations = []
    if not dre_available:
        limitations.append("Análise financeira comprometida pela ausência de DRE.")
    
    for module in readiness["modules"]:
        if module["status"] != "available":
            limitations.append(f"Módulo '{module['label']}' com prontidão {module['status']}.")

    return {
        "loaded_datasets": loaded_datasets,
        "missing_datasets": missing_datasets,
        "status_by_module": status_by_module,
        "quality_score_by_dataset": quality_score_by_dataset,
        "readiness_score_by_module": readiness_score_by_module,
        "key_gaps": key_gaps,
        "executive_impact_of_gaps": limitations,
        "dre_available": dre_available,
        "limitations_for_future_analysis": limitations,
    }
