from __future__ import annotations

from copy import deepcopy
from typing import Any

from .dataset_contracts import get_contract_registry_payload, get_dataset_contract, list_dataset_contracts
from .dataset_validation import build_default_compatibility_summary
from .readiness import get_readiness_summary

VALIDATION_AVAILABLE_STATUSES = {"ready", "partial"}


def build_manifest_state() -> dict[str, dict[str, Any]]:
    manifest: dict[str, dict[str, Any]] = {}
    for contract in list_dataset_contracts():
        dataset_id = str(contract["dataset_id"])
        manifest[dataset_id] = {
            **deepcopy(contract),
            "uploaded": False,
            "available": False,
            "validation_status": "missing",
            "availability_status": "unavailable",
            "uploaded_at": None,
            "filename": None,
            "format": None,
            "row_count": 0,
            "column_count": 0,
            "columns_detected": [],
            "latest_message": "Sem upload registrado.",
            "history_count": 0,
            "document_count": 0,
            "storage_path": None,
            "last_upload_status": "missing",
            "last_validation": None,
            "compatibility_summary": build_default_compatibility_summary(dataset_id),
        }
    return manifest


def get_dataset_definition(dataset_id: str) -> dict[str, Any]:
    return get_dataset_contract(dataset_id)


def _is_available(dataset_state: dict[str, Any]) -> bool:
    return bool(dataset_state.get("uploaded")) and dataset_state.get("availability_status") in VALIDATION_AVAILABLE_STATUSES


def _status_label(status: str) -> str:
    mapping = {
        "valid": "Validado",
        "partial": "Parcial",
        "invalid": "Invalido",
        "pending": "Pendente",
        "missing": "Sem upload",
    }
    return mapping.get(status, status)


def _build_global_compatibility_summary(
    manifest: dict[str, dict[str, Any]],
    coverage_percent: int,
) -> dict[str, Any]:
    datasets_payload: dict[str, dict[str, Any]] = {}
    confidence_scores: list[int] = []
    compatibility_scores: list[int] = []
    missing_datasets: list[str] = []
    ready_count = 0
    partial_count = 0
    unavailable_count = 0
    largest_gaps: list[str] = []

    for dataset_id, dataset in manifest.items():
        summary = dataset.get("compatibility_summary") or build_default_compatibility_summary(dataset_id)
        datasets_payload[dataset_id] = summary
        confidence_scores.append(int(summary.get("confidence_score", 0)))
        compatibility_scores.append(int(summary.get("compatibility_score", 0)))
        availability = str(summary.get("availability_status", "unavailable"))

        if availability == "ready":
            ready_count += 1
        elif availability == "partial":
            partial_count += 1
        else:
            unavailable_count += 1
            missing_datasets.append(str(dataset.get("name", dataset_id)))

        quality_gaps = summary.get("quality_gaps", [])
        for gap in quality_gaps[:2]:
            largest_gaps.append(f"{dataset.get('name', dataset_id)}: {gap}")

    total = max(len(datasets_payload), 1)
    average_confidence = int(round(sum(confidence_scores) / total))
    average_compatibility = int(round(sum(compatibility_scores) / total))

    ai_required = ["production", "bom", "finance_documents"]
    ai_missing: list[str] = []
    ai_scores: list[int] = []
    for dataset_id in ai_required:
        summary = datasets_payload.get(dataset_id) or build_default_compatibility_summary(dataset_id)
        ai_scores.append(int(summary.get("confidence_score", 0)))
        if str(summary.get("availability_status", "unavailable")) != "ready":
            ai_missing.append(dataset_id)

    ai_confidence = int(round(sum(ai_scores) / max(len(ai_scores), 1)))
    ai_coverage = int(round(((len(ai_required) - len(ai_missing)) / len(ai_required)) * 100))

    if not largest_gaps and unavailable_count == 0:
        largest_gaps = ["Sem gaps criticos no contrato de dados atual."]

    return {
        "average_confidence_score": average_confidence,
        "average_compatibility_score": average_compatibility,
        "ready_datasets": ready_count,
        "partial_datasets": partial_count,
        "unavailable_datasets": unavailable_count,
        "missing_datasets": missing_datasets,
        "largest_gaps": largest_gaps[:8],
        "datasets": datasets_payload,
        "ai_readiness": {
            "coverage_percent": ai_coverage if coverage_percent else ai_coverage,
            "confidence_score": ai_confidence,
            "quality_gaps": [
                f"Dataset obrigatorio ausente para IA executiva: {dataset_id}"
                for dataset_id in ai_missing
            ],
            "missing_datasets": ai_missing,
        },
    }


def build_upload_center_payload(
    dataset_manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]],
    session_snapshot: dict[str, Any],
) -> dict[str, Any]:
    del session_snapshot
    manifest = deepcopy(dataset_manifest)
    readiness = get_readiness_summary(manifest)

    available_dataset_count = sum(1 for dataset in manifest.values() if _is_available(dataset))
    coverage_percent = int(round((available_dataset_count / max(len(manifest), 1)) * 100))

    datasets = []
    for dataset in manifest.values():
        dataset["available"] = _is_available(dataset)
        dataset["last_upload_status"] = _status_label(str(dataset.get("validation_status", "missing")))
        datasets.append(dataset)

    ordered_history = sorted(
        history,
        key=lambda item: str(item.get("uploaded_at") or ""),
        reverse=True,
    )

    return {
        "coverage_percent": coverage_percent,
        "available_dataset_count": available_dataset_count,
        "total_dataset_count": len(manifest),
        "datasets": datasets,
        "readiness": readiness,
        "history": ordered_history,
        "compatibility_summary": _build_global_compatibility_summary(manifest, coverage_percent),
        "contract_registry": get_contract_registry_payload(),
    }
