from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import ValidationError

from ..context_pack import build_context_pack
from ..memory_store import analytics_store
from ..schemas import AIInterpretRequest, AIInterpretResponse
from .guardrails import enforce_no_hallucination, validate_context_pack
from .personas import get_persona_profile
from .providers.deterministic_provider import DeterministicProvider
from .providers.openai_provider import OpenAIProvider

logger = logging.getLogger(__name__)

_MISSING_SECTION_HINTS: dict[str, str] = {
    "top_products": "Preencher top_products no context_pack atual.",
    "mts_products": "Preencher mts_products para leitura de itens make-to-stock.",
    "mto_products": "Preencher mto_products para leitura de itens make-to-order.",
    "forecast_summary": "Preencher forecast_summary com consolidado de previsao.",
    "raw_material_impact": "Preencher raw_material_impact com consolidado de MPs.",
    "financial_impact": "Preencher financial_impact com consolidado de custos.",
}


class AIService:
    def __init__(self) -> None:
        self.deterministic_provider = DeterministicProvider()
        self.openai_provider = OpenAIProvider.from_env()

    def interpret(self, request: AIInterpretRequest) -> AIInterpretResponse:
        persona_profile = get_persona_profile(request.persona)

        context_pack = request.context_pack if request.context_pack is not None else self._load_current_context_pack()
        validation = validate_context_pack(context_pack)
        normalized_pack = validation.normalized_context_pack
        context_pack_size_bytes = len(json.dumps(normalized_pack, ensure_ascii=False, default=str).encode("utf-8"))

        logger.info(
            "ai.interpret request persona=%s context_pack_size_bytes=%s",
            persona_profile.code,
            context_pack_size_bytes,
        )

        provider = self.deterministic_provider
        provider_name = provider.name
        fallback_occurred = False

        if self.openai_provider is not None and validation.is_valid:
            provider = self.openai_provider
            provider_name = provider.name

        try:
            provider_output = provider.generate(
                persona=persona_profile,
                context_pack=normalized_pack,
                language=request.language,
            )
        except Exception:
            if provider is self.openai_provider:
                fallback_occurred = True
                logger.exception("OpenAI provider falhou; fallback para deterministic provider.")
                provider = self.deterministic_provider
                provider_name = provider.name
                provider_output = provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
            else:
                raise

        guarded_output = enforce_no_hallucination(provider_output, normalized_pack)
        guarded_output["persona"] = persona_profile.code
        self._inject_missing_data_notes(guarded_output, validation.missing_sections, validation.message)

        try:
            response_model = AIInterpretResponse.model_validate(guarded_output)
        except ValidationError:
            if provider is self.openai_provider:
                fallback_occurred = True
                logger.exception("Saida OpenAI invalida para schema; fallback para deterministic provider.")
                fallback_output = self.deterministic_provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
                guarded_fallback = enforce_no_hallucination(fallback_output, normalized_pack)
                guarded_fallback["persona"] = persona_profile.code
                self._inject_missing_data_notes(
                    guarded_fallback,
                    validation.missing_sections,
                    validation.message,
                )
                response_model = AIInterpretResponse.model_validate(guarded_fallback)
                provider_name = self.deterministic_provider.name
            else:
                raise

        logger.info(
            "ai.interpret result persona=%s provider=%s fallback=%s",
            persona_profile.code,
            provider_name,
            fallback_occurred,
        )
        return response_model

    def _load_current_context_pack(self) -> dict[str, Any]:
        return build_context_pack(analytics_store.get_session_snapshot())

    def _inject_missing_data_notes(
        self,
        output: dict[str, Any],
        missing_sections: list[str],
        validation_message: str | None,
    ) -> None:
        data_quality_flags = output.setdefault("data_quality_flags", [])
        questions = output.setdefault("questions_to_validate", [])

        if validation_message and validation_message not in data_quality_flags:
            data_quality_flags.append(validation_message)

        for section in missing_sections:
            hint = _MISSING_SECTION_HINTS.get(section)
            if hint and hint not in questions:
                questions.append(hint)

        output["data_quality_flags"] = list(dict.fromkeys(str(flag) for flag in data_quality_flags if str(flag)))
        output["questions_to_validate"] = list(dict.fromkeys(str(item) for item in questions if str(item)))


ai_service = AIService()
