from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
import unicodedata

import pandas as pd

from .dataset_contracts import get_dataset_contract

TABULAR_FORMATS = {".csv", ".xlsx", ".xls"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    cleaned = "".join(character for character in normalized if unicodedata.category(character) != "Mn")
    cleaned = cleaned.lower()
    cleaned = "".join(character if character.isalnum() else " " for character in cleaned)
    return " ".join(cleaned.split())


def _build_alias_lookup(contract: dict[str, Any]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    labels = contract.get("column_labels", {})
    aliases = contract.get("column_aliases", {})
    expected_columns = list(contract.get("required_columns", [])) + list(contract.get("optional_columns", []))
    for canonical in expected_columns:
        candidates = [canonical, str(labels.get(canonical, ""))]
        candidates.extend(str(alias) for alias in aliases.get(canonical, []))
        for candidate in candidates:
            key = _normalize_text(candidate)
            if key and key not in lookup:
                lookup[key] = canonical
    return lookup


def _map_source_columns(
    contract: dict[str, Any],
    source_columns: list[str],
) -> tuple[dict[str, str], list[str], list[str], list[dict[str, str]]]:
    lookup = _build_alias_lookup(contract)
    labels = contract.get("column_labels", {})

    source_to_canonical: dict[str, str] = {}
    recognized_columns: list[str] = []
    ignored_columns: list[str] = []
    alias_mapped_columns: list[dict[str, str]] = []

    for source in source_columns:
        normalized_source = _normalize_text(source)
        canonical = lookup.get(normalized_source)
        if not canonical:
            ignored_columns.append(source)
            continue
        source_to_canonical[source] = canonical
        if canonical not in recognized_columns:
            recognized_columns.append(canonical)

        if normalized_source != _normalize_text(canonical):
            alias_mapped_columns.append(
                {
                    "source_column": source,
                    "canonical_column": canonical,
                    "column_label": str(labels.get(canonical, canonical)),
                }
            )

    return source_to_canonical, recognized_columns, ignored_columns, alias_mapped_columns


def _normalize_rows(
    rows: list[dict[str, Any]],
    source_to_canonical: dict[str, str],
) -> list[dict[str, Any]]:
    normalized_rows: list[dict[str, Any]] = []
    for row in rows:
        normalized: dict[str, Any] = {}
        for source, value in row.items():
            canonical = source_to_canonical.get(str(source))
            if not canonical:
                continue
            current = normalized.get(canonical)
            if current in (None, "") and value not in (None, ""):
                normalized[canonical] = value
            elif canonical not in normalized:
                normalized[canonical] = value
        normalized_rows.append(normalized)
    return normalized_rows


def _percent(matched: int, total: int) -> int:
    if total <= 0:
        return 100
    return int(round((matched / total) * 100))


def _build_rule_results(
    contract: dict[str, Any],
    recognized_columns: list[str],
    row_count: int,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    recognized_set = set(recognized_columns)
    for rule in contract.get("validation_rules", []):
        rule_type = str(rule.get("type", "")).strip()
        passed = True
        missing_columns: list[str] = []
        if rule_type == "minimum_rows":
            passed = row_count >= int(rule.get("value", 0) or 0)
        elif rule_type == "at_least_one_of":
            candidates = [str(column) for column in rule.get("columns", [])]
            missing_columns = [column for column in candidates if column not in recognized_set]
            passed = len(missing_columns) < len(candidates)

        results.append(
            {
                "rule_id": str(rule.get("id", rule_type or "rule")),
                "description": str(rule.get("description", "Regra de validacao.")),
                "severity": str(rule.get("severity", "warning")),
                "type": rule_type,
                "passed": passed,
                "missing_columns": missing_columns,
            }
        )
    return results


def _build_analytical_impact(
    contract: dict[str, Any],
    *,
    availability_status: str,
    missing_required_columns: list[str],
) -> dict[str, Any]:
    modules = list(contract.get("readiness_impact", []))
    if availability_status == "ready":
        summary = "Cobertura contratual suficiente para liberar os modulos impactados."
    elif availability_status == "partial":
        summary = "Cobertura parcial; modulos impactados podem operar com restricoes."
    elif missing_required_columns:
        summary = (
            "Cobertura indisponivel ate corrigir colunas obrigatorias: "
            + ", ".join(missing_required_columns)
            + "."
        )
    else:
        summary = "Cobertura indisponivel; o dataset ainda nao sustenta leitura analitica confiavel."

    return {
        "modules": modules,
        "summary": summary,
    }


def _derive_statuses(
    contract: dict[str, Any],
    *,
    row_count: int,
    recognized_columns: list[str],
    missing_required_columns: list[str],
    rule_results: list[dict[str, Any]],
) -> tuple[str, str, str]:
    if contract.get("storage_kind") == "document":
        return "partial", "partial", "partial"

    has_error_failure = any(not rule["passed"] and rule["severity"] == "error" for rule in rule_results)
    has_warning_failure = any(not rule["passed"] and rule["severity"] == "warning" for rule in rule_results)
    has_recognition = bool(recognized_columns)

    if row_count <= 0:
        return "invalid", "unavailable", "incompatible"

    if missing_required_columns or has_error_failure:
        if has_recognition:
            return "partial", "unavailable", "partial"
        return "invalid", "unavailable", "incompatible"

    if has_warning_failure:
        return "partial", "partial", "partial"

    return "valid", "ready", "compatible"


def _build_summary(
    contract: dict[str, Any],
    *,
    validation_status: str,
    availability_status: str,
    missing_required_columns: list[str],
    rule_results: list[dict[str, Any]],
) -> str:
    if availability_status == "ready":
        return f"{contract['name']} pronto para consumo analitico padronizado."

    failing_rules = [rule for rule in rule_results if not rule.get("passed")]
    if missing_required_columns:
        return (
            f"{contract['name']} com lacunas de contrato. Colunas obrigatorias faltantes: "
            + ", ".join(missing_required_columns)
            + "."
        )
    if failing_rules:
        return f"{contract['name']} com restricoes contratuais: {failing_rules[0]['description']}"
    if validation_status == "missing":
        return f"{contract['name']} sem upload registrado."
    return f"{contract['name']} com cobertura parcial para leitura executiva."


def _build_quality_gaps(
    missing_required_columns: list[str],
    ignored_columns: list[str],
    rule_results: list[dict[str, Any]],
) -> list[str]:
    gaps: list[str] = []
    if missing_required_columns:
        gaps.append("Colunas obrigatorias ausentes: " + ", ".join(missing_required_columns))
    if ignored_columns:
        gaps.append("Colunas ignoradas: " + ", ".join(ignored_columns))

    for rule in rule_results:
        if rule.get("passed"):
            continue
        description = str(rule.get("description", "Regra nao atendida."))
        missing_columns = [str(column) for column in rule.get("missing_columns", []) if str(column).strip()]
        if missing_columns:
            description = f"{description} Faltando: {', '.join(missing_columns)}."
        gaps.append(description)

    return gaps


def _build_scores(
    *,
    required_coverage_percent: int,
    optional_coverage_percent: int,
    passed_rules: int,
    total_rules: int,
    availability_status: str,
) -> tuple[int, int]:
    rule_percent = _percent(passed_rules, total_rules)
    compatibility_score = int(round((required_coverage_percent * 0.7) + (optional_coverage_percent * 0.2) + (rule_percent * 0.1)))

    if availability_status == "ready":
        confidence_score = max(80, compatibility_score)
    elif availability_status == "partial":
        confidence_score = min(79, max(45, compatibility_score))
    else:
        confidence_score = min(35, compatibility_score)

    return compatibility_score, confidence_score


def build_validation_report(
    dataset_id: str,
    *,
    source_columns: list[str],
    row_count: int,
    file_format: str,
    filename: str | None = None,
) -> dict[str, Any]:
    contract = get_dataset_contract(dataset_id)
    source_to_canonical, recognized_columns, ignored_columns, alias_mapped_columns = _map_source_columns(contract, source_columns)
    required_columns = list(contract.get("required_columns", []))
    optional_columns = list(contract.get("optional_columns", []))
    missing_required_columns = [column for column in required_columns if column not in recognized_columns]

    required_matched = len(required_columns) - len(missing_required_columns)
    optional_matched = len([column for column in optional_columns if column in recognized_columns])
    required_coverage_percent = _percent(required_matched, len(required_columns))
    optional_coverage_percent = _percent(optional_matched, len(optional_columns))
    rule_results = _build_rule_results(contract, recognized_columns, row_count)

    validation_status, availability_status, compatibility_status = _derive_statuses(
        contract,
        row_count=row_count,
        recognized_columns=recognized_columns,
        missing_required_columns=missing_required_columns,
        rule_results=rule_results,
    )

    compatibility_score, confidence_score = _build_scores(
        required_coverage_percent=required_coverage_percent,
        optional_coverage_percent=optional_coverage_percent,
        passed_rules=sum(1 for rule in rule_results if rule.get("passed")),
        total_rules=len(rule_results),
        availability_status=availability_status,
    )

    analytical_impact = _build_analytical_impact(
        contract,
        availability_status=availability_status,
        missing_required_columns=missing_required_columns,
    )
    quality_gaps = _build_quality_gaps(missing_required_columns, ignored_columns, rule_results)
    summary = _build_summary(
        contract,
        validation_status=validation_status,
        availability_status=availability_status,
        missing_required_columns=missing_required_columns,
        rule_results=rule_results,
    )

    return {
        "dataset_id": contract["dataset_id"],
        "dataset_name": contract["name"],
        "validation_status": validation_status,
        "availability_status": availability_status,
        "compatibility_status": compatibility_status,
        "compatibility_score": compatibility_score,
        "confidence_score": confidence_score,
        "row_count": int(row_count),
        "column_count": len(source_columns),
        "source_columns": list(source_columns),
        "recognized_columns": recognized_columns,
        "missing_required_columns": missing_required_columns,
        "ignored_columns": ignored_columns,
        "alias_mapped_columns": alias_mapped_columns,
        "required_coverage": {
            "matched": required_matched,
            "total": len(required_columns),
            "percent": required_coverage_percent,
        },
        "optional_coverage": {
            "matched": optional_matched,
            "total": len(optional_columns),
            "percent": optional_coverage_percent,
        },
        "analytical_impact": analytical_impact,
        "quality_gaps": quality_gaps,
        "rule_results": rule_results,
        "summary": summary,
        "source_format": file_format,
        "source_filename": filename,
        "validated_at": _now_iso(),
        "source_to_canonical": source_to_canonical,
    }


def build_default_compatibility_summary(dataset_id: str) -> dict[str, Any]:
    contract = get_dataset_contract(dataset_id)
    return {
        "dataset_id": contract["dataset_id"],
        "validation_status": "missing",
        "availability_status": "unavailable",
        "compatibility_status": "incompatible",
        "compatibility_score": 0,
        "confidence_score": 0,
        "missing_required_columns": list(contract.get("required_columns", [])),
        "quality_gaps": ["Sem upload validado para este dataset."],
        "summary": f"{contract['name']} sem upload registrado.",
    }


def build_compatibility_summary(validation_report: dict[str, Any] | None, dataset_id: str) -> dict[str, Any]:
    if not validation_report:
        return build_default_compatibility_summary(dataset_id)

    return {
        "dataset_id": validation_report["dataset_id"],
        "validation_status": validation_report["validation_status"],
        "availability_status": validation_report["availability_status"],
        "compatibility_status": validation_report["compatibility_status"],
        "compatibility_score": int(validation_report["compatibility_score"]),
        "confidence_score": int(validation_report["confidence_score"]),
        "missing_required_columns": list(validation_report.get("missing_required_columns", [])),
        "quality_gaps": list(validation_report.get("quality_gaps", [])),
        "summary": str(validation_report.get("summary", "")),
    }


def parse_tabular_bytes(filename: str, content: bytes) -> pd.DataFrame:
    file_format = "." + filename.lower().split(".")[-1] if "." in filename else ".bin"
    buffer = BytesIO(content)
    if file_format == ".csv":
        frame = pd.read_csv(buffer, sep=None, engine="python")
    elif file_format in {".xlsx", ".xls"}:
        frame = pd.read_excel(buffer)
    else:
        raise ValueError(f"Unsupported tabular format: {file_format}")
    return frame.fillna("")


def build_tabular_upload_bundle(dataset_id: str, filename: str, content: bytes) -> dict[str, Any]:
    contract = get_dataset_contract(dataset_id)
    frame = parse_tabular_bytes(filename, content)
    source_columns = [str(column) for column in frame.columns]
    source_rows = frame.to_dict(orient="records")
    validation = build_validation_report(
        dataset_id,
        source_columns=source_columns,
        row_count=len(source_rows),
        file_format="." + filename.lower().split(".")[-1] if "." in filename else ".bin",
        filename=filename,
    )
    normalized_rows = _normalize_rows(source_rows, validation.get("source_to_canonical", {}))
    return {
        "contract": contract,
        "validation": validation,
        "source_columns": source_columns,
        "source_rows": source_rows,
        "normalized_rows": normalized_rows,
    }


def build_document_validation_report(dataset_id: str, filename: str, file_format: str) -> dict[str, Any]:
    contract = get_dataset_contract(dataset_id)
    validation = build_validation_report(
        dataset_id,
        source_columns=[],
        row_count=1,
        file_format=file_format,
        filename=filename,
    )
    validation["validation_status"] = "partial"
    validation["availability_status"] = "partial"
    validation["compatibility_status"] = "partial"
    validation["compatibility_score"] = 65
    validation["confidence_score"] = 55
    validation["quality_gaps"] = [
        "Documento aceito e armazenado. A extracao estruturada ficara para a proxima etapa.",
    ]
    validation["summary"] = "Documento aceito para governanca e leitura inteligente futura."
    validation["analytical_impact"] = {
        "modules": list(contract.get("readiness_impact", [])),
        "summary": "Evidencia documental armazenada para ampliar a cobertura financeira e futura IA.",
    }
    validation["source_to_canonical"] = {}
    return validation


def to_number(value: Any) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)

    raw = str(value or "").strip()
    if not raw:
        return 0.0

    negative_by_parens = raw.startswith("(") and raw.endswith(")")
    cleaned = raw.replace("(", "").replace(")", "")
    cleaned = cleaned.replace(" ", "")
    cleaned = "".join(character for character in cleaned if character.isdigit() or character in {",", ".", "-"})

    if cleaned.count(",") > 0 and cleaned.count(".") > 0:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif cleaned.count(",") > 0:
        decimal_part = cleaned.split(",")[-1]
        if len(decimal_part) == 3 and cleaned.count(",") >= 1:
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(",", ".")
    elif cleaned.count(".") > 1:
        cleaned = cleaned.replace(".", "")

    try:
        parsed = float(cleaned)
    except ValueError:
        return 0.0
    return -abs(parsed) if negative_by_parens else parsed


def parse_monthly_history(value: Any) -> list[float] | None:
    if isinstance(value, list):
        chunks = [to_number(item) for item in value]
        return [item for item in chunks if item > 0] or None

    raw = str(value or "").strip()
    if not raw:
        return None

    cleaned = raw.removeprefix("[").removesuffix("]")
    parts = [part.strip() for part in cleaned.replace("|", ";").split(";")]
    chunks = [to_number(part) for part in parts if part]
    positive = [item for item in chunks if item > 0]
    return positive or None


def build_forecast_items(normalized_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for row in normalized_rows:
        item = {
            "product_code": str(row.get("product_code", "") or "").strip(),
            "last_30_days": to_number(row.get("last_30_days")),
            "last_90_days": to_number(row.get("last_90_days")),
            "last_180_days": to_number(row.get("last_180_days")),
            "last_365_days": to_number(row.get("last_365_days")),
            "monthly_history": parse_monthly_history(row.get("monthly_history")),
        }
        if not item["product_code"]:
            continue
        if not any(
            [
                item["last_30_days"],
                item["last_90_days"],
                item["last_180_days"],
                item["last_365_days"],
                bool(item["monthly_history"]),
            ]
        ):
            continue
        items.append(item)
    return items


def downgrade_validation_report(
    validation_report: dict[str, Any],
    *,
    gap: str,
    validation_status: str,
    availability_status: str,
    compatibility_status: str,
) -> dict[str, Any]:
    updated = deepcopy(validation_report)
    updated["validation_status"] = validation_status
    updated["availability_status"] = availability_status
    updated["compatibility_status"] = compatibility_status
    updated["compatibility_score"] = min(int(updated.get("compatibility_score", 0)), 60 if availability_status == "partial" else 35)
    updated["confidence_score"] = min(int(updated.get("confidence_score", 0)), 55 if availability_status == "partial" else 30)
    quality_gaps = list(updated.get("quality_gaps", []))
    if gap not in quality_gaps:
        quality_gaps.append(gap)
    updated["quality_gaps"] = quality_gaps
    updated["summary"] = gap
    analytical_impact = dict(updated.get("analytical_impact") or {})
    analytical_impact["summary"] = gap
    updated["analytical_impact"] = analytical_impact
    return updated
