from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any

EXPECTED_CONTEXT_SECTIONS: dict[str, Any] = {
    "top_products": [],
    "mts_products": [],
    "mto_products": [],
    "forecast_summary": {},
    "raw_material_impact": {},
    "financial_impact": {},
}

_PATH_TOKEN_RE = re.compile(r"([^[\].]+)|\[(\d+)\]")
_HAS_NUMBER_RE = re.compile(r"\d")


@dataclass(frozen=True)
class ContextPackValidationResult:
    is_valid: bool
    normalized_context_pack: dict[str, Any]
    missing_sections: list[str]
    message: str | None = None


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, dict):
        if not value:
            return True
        return all(_is_empty(item) for item in value.values())
    if isinstance(value, (list, tuple, set)):
        if len(value) == 0:
            return True
        return all(_is_empty(item) for item in value)
    return False


def _default_context_pack() -> dict[str, Any]:
    return deepcopy(EXPECTED_CONTEXT_SECTIONS)


def validate_context_pack(context_pack: Any) -> ContextPackValidationResult:
    if context_pack is None:
        context_pack = {}

    if not isinstance(context_pack, dict):
        return ContextPackValidationResult(
            is_valid=False,
            normalized_context_pack=_default_context_pack(),
            missing_sections=list(EXPECTED_CONTEXT_SECTIONS.keys()),
            message="dados insuficientes: context_pack invalido. Envie um objeto JSON no formato esperado.",
        )

    normalized: dict[str, Any] = {}
    missing_sections: list[str] = []

    for section, default_value in EXPECTED_CONTEXT_SECTIONS.items():
        raw_value = context_pack.get(section, deepcopy(default_value))
        if isinstance(default_value, list) and not isinstance(raw_value, list):
            raw_value = []
        elif isinstance(default_value, dict) and not isinstance(raw_value, dict):
            raw_value = {}

        normalized[section] = raw_value

        if section not in context_pack or _is_empty(raw_value):
            missing_sections.append(section)

    has_usable_data = any(not _is_empty(normalized[section]) for section in EXPECTED_CONTEXT_SECTIONS)
    if not has_usable_data:
        missing = ", ".join(missing_sections)
        message = (
            "dados insuficientes: context_pack sem conteudo util. "
            f"Campos faltantes/vazios: {missing}."
        )
        return ContextPackValidationResult(
            is_valid=False,
            normalized_context_pack=normalized,
            missing_sections=missing_sections,
            message=message,
        )

    if missing_sections:
        missing = ", ".join(missing_sections)
        message = f"Context pack parcial. Campos faltantes/vazios: {missing}."
    else:
        message = None

    return ContextPackValidationResult(
        is_valid=True,
        normalized_context_pack=normalized,
        missing_sections=missing_sections,
        message=message,
    )


def _tokenize_path(path: str) -> list[str | int]:
    if not isinstance(path, str) or not path.strip():
        raise KeyError("Evidence path vazio ou invalido.")

    tokens: list[str | int] = []
    for part in path.split("."):
        if not part:
            raise KeyError(f"Evidence path invalido: {path}")
        matches = list(_PATH_TOKEN_RE.finditer(part))
        consumed = "".join(match.group(0) for match in matches)
        if consumed != part:
            raise KeyError(f"Evidence path invalido: {path}")
        for match in matches:
            key_token = match.group(1)
            idx_token = match.group(2)
            if key_token is not None:
                tokens.append(key_token)
            elif idx_token is not None:
                tokens.append(int(idx_token))
    return tokens


def build_evidence(path: str, context_pack: dict[str, Any]) -> dict[str, Any]:
    current: Any = context_pack
    for token in _tokenize_path(path):
        if isinstance(token, str):
            if not isinstance(current, dict) or token not in current:
                raise KeyError(f"Evidence path nao encontrado: {path}")
            current = current[token]
        else:
            if not isinstance(current, list) or token < 0 or token >= len(current):
                raise KeyError(f"Evidence path nao encontrado: {path}")
            current = current[token]
    return {"path": path, "value": current}


def _append_unique(target: list[str], text: str) -> None:
    if text and text not in target:
        target.append(text)


def _contains_number(text: str) -> bool:
    return bool(_HAS_NUMBER_RE.search(text))


def _remove_numeric_fragments(text: str) -> str:
    sanitized = re.sub(r"R\$\s*\d[\d\.,]*", "valor monetario", text)
    sanitized = re.sub(r"\d[\d\.,]*\s*%", "percentual", sanitized)
    sanitized = re.sub(r"\d[\d\.,]*", "", sanitized)
    sanitized = re.sub(r"\s{2,}", " ", sanitized).strip(" .,:;-")
    if not sanitized:
        return "Informacao quantitativa removida por guardrail."
    return sanitized


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            item_text = item.strip()
            if item_text:
                out.append(item_text)
    return out


def _first_available_evidence(context_pack: dict[str, Any], preferred_paths: list[str]) -> dict[str, Any] | None:
    for path in preferred_paths:
        try:
            return build_evidence(path, context_pack)
        except KeyError:
            continue

    for section in EXPECTED_CONTEXT_SECTIONS:
        try:
            return build_evidence(section, context_pack)
        except KeyError:
            continue
    return None


def _sanitize_evidence(
    raw_evidence: Any,
    context_pack: dict[str, Any],
    data_quality_flags: list[str],
    owner_label: str,
    preferred_paths: list[str],
) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    if isinstance(raw_evidence, list):
        for evidence in raw_evidence:
            if not isinstance(evidence, dict):
                continue
            path = evidence.get("path")
            if not isinstance(path, str) or not path.strip():
                continue
            try:
                cleaned.append(build_evidence(path, context_pack))
            except KeyError:
                _append_unique(
                    data_quality_flags,
                    f"Evidencia invalida removida em {owner_label}: path '{path}' nao existe no context_pack.",
                )

    if cleaned:
        return cleaned

    fallback = _first_available_evidence(context_pack, preferred_paths)
    if fallback is not None:
        cleaned = [fallback]
        _append_unique(
            data_quality_flags,
            f"Evidencia ausente em {owner_label}; fallback automatico aplicado.",
        )
    else:
        _append_unique(
            data_quality_flags,
            f"Evidencia ausente em {owner_label}; nao foi possivel associar path no context_pack.",
        )
    return cleaned


def _normalize_choice(
    value: Any,
    allowed: set[str],
    default: str,
    data_quality_flags: list[str],
    field_name: str,
) -> str:
    if isinstance(value, str) and value in allowed:
        return value
    _append_unique(
        data_quality_flags,
        f"Valor invalido em {field_name}; aplicado default '{default}'.",
    )
    return default


def enforce_no_hallucination(output: Any, context_pack: dict[str, Any]) -> dict[str, Any]:
    raw_output = output if isinstance(output, dict) else {}
    data_quality_flags = _string_list(raw_output.get("data_quality_flags"))
    preferred_paths = [
        "financial_impact.total_production_cost",
        "financial_impact.total_raw_material_cost",
        "raw_material_impact.total_required",
        "forecast_summary.total_final_forecast",
        "top_products",
    ]

    executive_summary: list[str] = []
    for line in _string_list(raw_output.get("executive_summary")):
        if _contains_number(line):
            executive_summary.append(_remove_numeric_fragments(line))
            _append_unique(
                data_quality_flags,
                "Numeros removidos de executive_summary por ausencia de campo evidence nesse bloco.",
            )
        else:
            executive_summary.append(line)

    if not executive_summary:
        executive_summary = ["Dados insuficientes para um resumo executivo confiavel."]

    risks: list[dict[str, Any]] = []
    raw_risks = raw_output.get("risks")
    if isinstance(raw_risks, list):
        for idx, raw_risk in enumerate(raw_risks):
            if not isinstance(raw_risk, dict):
                continue
            title = str(raw_risk.get("title") or "Risco sem descricao objetiva.")
            severity = _normalize_choice(
                raw_risk.get("severity"),
                {"low", "medium", "high"},
                "medium",
                data_quality_flags,
                f"risks[{idx}].severity",
            )
            evidence = _sanitize_evidence(
                raw_risk.get("evidence"),
                context_pack,
                data_quality_flags,
                f"risks[{idx}]",
                preferred_paths,
            )
            if _contains_number(title) and not evidence:
                title = _remove_numeric_fragments(title)
            risks.append({"title": title, "severity": severity, "evidence": evidence})

    opportunities: list[dict[str, Any]] = []
    raw_opportunities = raw_output.get("opportunities")
    if isinstance(raw_opportunities, list):
        for idx, raw_opportunity in enumerate(raw_opportunities):
            if not isinstance(raw_opportunity, dict):
                continue
            title = str(raw_opportunity.get("title") or "Oportunidade sem descricao objetiva.")
            impact = _normalize_choice(
                raw_opportunity.get("impact"),
                {"low", "medium", "high"},
                "medium",
                data_quality_flags,
                f"opportunities[{idx}].impact",
            )
            evidence = _sanitize_evidence(
                raw_opportunity.get("evidence"),
                context_pack,
                data_quality_flags,
                f"opportunities[{idx}]",
                preferred_paths,
            )
            if _contains_number(title) and not evidence:
                title = _remove_numeric_fragments(title)
            opportunities.append({"title": title, "impact": impact, "evidence": evidence})

    actions: list[dict[str, Any]] = []
    raw_actions = raw_output.get("actions")
    if isinstance(raw_actions, list):
        for idx, raw_action in enumerate(raw_actions):
            if not isinstance(raw_action, dict):
                continue
            title = str(raw_action.get("title") or "Acao sem descricao objetiva.")
            horizon = _normalize_choice(
                raw_action.get("horizon"),
                {"0-7d", "7-30d", "30-90d"},
                "7-30d",
                data_quality_flags,
                f"actions[{idx}].horizon",
            )
            impact = _normalize_choice(
                raw_action.get("impact"),
                {"low", "medium", "high"},
                "medium",
                data_quality_flags,
                f"actions[{idx}].impact",
            )
            evidence = _sanitize_evidence(
                raw_action.get("evidence"),
                context_pack,
                data_quality_flags,
                f"actions[{idx}]",
                preferred_paths,
            )
            if _contains_number(title) and not evidence:
                title = _remove_numeric_fragments(title)
            actions.append(
                {
                    "title": title,
                    "horizon": horizon,
                    "impact": impact,
                    "evidence": evidence,
                }
            )

    limitations = _string_list(raw_output.get("limitations"))
    for flag in data_quality_flags:
        _append_unique(limitations, flag)

    questions_to_validate = _string_list(raw_output.get("questions_to_validate"))
    disclaimer = raw_output.get("disclaimer")
    if not isinstance(disclaimer, str) or not disclaimer.strip():
        disclaimer = (
            "Insights gerados exclusivamente a partir do context_pack fornecido. "
            "Nao execute decisoes sem validacao operacional e financeira."
        )

    persona = raw_output.get("persona")
    if not isinstance(persona, str) or not persona.strip():
        persona = "SUPPLY"

    return {
        "persona": persona,
        "executive_summary": executive_summary,
        "risks": risks,
        "opportunities": opportunities,
        "actions": actions,
        "limitations": limitations,
        "questions_to_validate": questions_to_validate,
        "data_quality_flags": data_quality_flags,
        "disclaimer": disclaimer.strip(),
    }
