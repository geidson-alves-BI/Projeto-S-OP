from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import ValidationError

from ..context_pack import build_context_pack
from ..memory_store import analytics_store
from ..schemas import (
    AIConfigRequest,
    AIConfigResponse,
    AIInterpretRequest,
    AIInterpretResponse,
    AITestConnectionResponse,
)
from .config_store import AIConfigStore, DEFAULT_OPENAI_MODEL, FALLBACK_MODEL_NAME
from .guardrails import enforce_no_hallucination, validate_context_pack
from .personas import get_persona_profile
from .providers.deterministic_provider import DeterministicProvider
from .providers.openai_provider import OpenAIProvider, OpenAIProviderError

logger = logging.getLogger(__name__)

_MISSING_SECTION_HINTS: dict[str, str] = {
    "top_products": "Preencher top_products no contexto atual.",
    "mts_products": "Preencher mts_products para leitura make-to-stock.",
    "mto_products": "Preencher mto_products para leitura make-to-order.",
    "forecast_summary": "Preencher forecast_summary com consolidado de previsao.",
    "raw_material_impact": "Preencher raw_material_impact com consolidado de insumos.",
    "financial_impact": "Preencher financial_impact com consolidado financeiro.",
}

_MISSING_SECTION_LIMITATIONS: dict[str, str] = {
    "top_products": "Sem top_products consolidados: concentracao de portfolio fica limitada.",
    "mts_products": "Sem mts_products: leitura make-to-stock fica parcial.",
    "mto_products": "Sem mto_products: leitura make-to-order fica parcial.",
    "forecast_summary": "Sem forecast_summary: leitura de tendencia fica limitada.",
    "raw_material_impact": "Sem raw_material_impact: cobertura de insumos fica parcial.",
    "financial_impact": "Sem financial_impact: impacto financeiro fica parcial.",
}


class AIService:
    def __init__(self) -> None:
        self.config_store = AIConfigStore()
        self.deterministic_provider = DeterministicProvider()

    def get_config(self) -> AIConfigResponse:
        snapshot = self.config_store.get_snapshot()
        return self._build_config_response(snapshot)

    def save_config(self, request: AIConfigRequest) -> AIConfigResponse:
        snapshot = self.config_store.save_config(
            provider=request.provider,
            model=request.model,
            api_key=request.apiKey,
            keep_existing_key=request.keepExistingKey,
        )
        logger.info(
            "ai.config saved provider=%s provider_active=%s model=%s has_api_key=%s",
            snapshot.provider,
            snapshot.provider_active,
            snapshot.model,
            snapshot.has_api_key,
        )
        return self._build_config_response(snapshot)

    def test_connection(self) -> AITestConnectionResponse:
        snapshot = self.config_store.get_snapshot()

        if snapshot.provider == "deterministic":
            result_snapshot = self.config_store.record_test_result(
                status="fallback_only",
                message="Provider configurado em modo fallback local.",
            )
            return AITestConnectionResponse(
                success=True,
                status="fallback_only",
                message="Provider configurado em modo fallback local.",
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )

        provider = self._build_openai_provider(snapshot)
        if provider is None:
            result_snapshot = self.config_store.record_test_result(
                status="provider_not_configured",
                message="OpenAI selecionado, mas nenhuma API key esta configurada.",
            )
            return AITestConnectionResponse(
                success=False,
                status="provider_not_configured",
                message="OpenAI selecionado, mas nenhuma API key esta configurada.",
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )

        try:
            provider.test_connection()
            result_snapshot = self.config_store.record_test_result(
                status="success",
                message=f"Conexao com OpenAI validada com o modelo {snapshot.model}.",
            )
            return AITestConnectionResponse(
                success=True,
                status="success",
                message=f"Conexao com OpenAI validada com o modelo {snapshot.model}.",
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )
        except OpenAIProviderError as exc:
            result_snapshot = self.config_store.record_test_result(
                status=exc.reason,
                message=str(exc),
            )
            return AITestConnectionResponse(
                success=False,
                status=exc.reason,  # type: ignore[arg-type]
                message=str(exc),
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )

    def interpret(self, request: AIInterpretRequest) -> AIInterpretResponse:
        persona_profile = get_persona_profile(request.persona)
        snapshot = self.config_store.get_snapshot()

        context_pack = request.context_pack if request.context_pack is not None else self._load_current_context_pack()
        validation = validate_context_pack(context_pack)
        normalized_pack = validation.normalized_context_pack
        context_pack_size_bytes = len(json.dumps(normalized_pack, ensure_ascii=False, default=str).encode("utf-8"))

        logger.info(
            "ai.interpret request persona=%s configured_provider=%s active_provider=%s model=%s context_pack_size_bytes=%s",
            persona_profile.code,
            snapshot.provider,
            snapshot.provider_active,
            snapshot.model,
            context_pack_size_bytes,
        )

        provider_used = self.deterministic_provider.name
        model_used = FALLBACK_MODEL_NAME
        used_fallback = True
        reason_fallback = "fallback_only" if snapshot.provider == "deterministic" else "provider_not_configured"

        provider_output: dict[str, Any]
        openai_provider = self._build_openai_provider(snapshot)

        if snapshot.provider == "openai" and openai_provider is not None and validation.is_valid:
            try:
                provider_output = openai_provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
                provider_used = openai_provider.name
                model_used = snapshot.model
                used_fallback = False
                reason_fallback = None
            except OpenAIProviderError as exc:
                logger.exception("OpenAI provider falhou; fallback para deterministic provider.")
                provider_output = self.deterministic_provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
                reason_fallback = exc.reason
        else:
            if snapshot.provider == "openai" and openai_provider is None:
                reason_fallback = "provider_not_configured"
            elif snapshot.provider == "openai" and not validation.is_valid:
                reason_fallback = "context_pack_insufficient"

            provider_output = self.deterministic_provider.generate(
                persona=persona_profile,
                context_pack=normalized_pack,
                language=request.language,
            )

        guarded_output = enforce_no_hallucination(provider_output, normalized_pack)
        guarded_output["persona"] = persona_profile.code
        guarded_output["providerUsed"] = provider_used
        guarded_output["modelUsed"] = model_used
        guarded_output["usedFallback"] = used_fallback
        guarded_output["reasonFallback"] = reason_fallback
        self._inject_missing_data_notes(guarded_output, validation.missing_sections, validation.message)

        try:
            response_model = AIInterpretResponse.model_validate(guarded_output)
        except ValidationError:
            if provider_used == "openai":
                logger.exception("Saida OpenAI invalida para schema; fallback para deterministic provider.")
                fallback_output = self.deterministic_provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
                guarded_fallback = enforce_no_hallucination(fallback_output, normalized_pack)
                guarded_fallback["persona"] = persona_profile.code
                guarded_fallback["providerUsed"] = self.deterministic_provider.name
                guarded_fallback["modelUsed"] = FALLBACK_MODEL_NAME
                guarded_fallback["usedFallback"] = True
                guarded_fallback["reasonFallback"] = "invalid_openai_output"
                self._inject_missing_data_notes(
                    guarded_fallback,
                    validation.missing_sections,
                    validation.message,
                )
                response_model = AIInterpretResponse.model_validate(guarded_fallback)
                provider_used = self.deterministic_provider.name
                model_used = FALLBACK_MODEL_NAME
                used_fallback = True
                reason_fallback = "invalid_openai_output"
            else:
                raise

        logger.info(
            "ai.interpret result persona=%s provider_used=%s model_used=%s used_fallback=%s reason_fallback=%s",
            persona_profile.code,
            provider_used,
            model_used,
            used_fallback,
            reason_fallback,
        )
        return response_model

    def _load_current_context_pack(self) -> dict[str, Any]:
        return build_context_pack(analytics_store.get_session_snapshot())

    def _build_openai_provider(self, snapshot: Any) -> OpenAIProvider | None:
        if snapshot.provider != "openai" or not snapshot.api_key:
            return None
        return OpenAIProvider(api_key=snapshot.api_key, model=snapshot.model or DEFAULT_OPENAI_MODEL)

    def _build_config_response(self, snapshot: Any) -> AIConfigResponse:
        return AIConfigResponse(
            provider=snapshot.provider,  # type: ignore[arg-type]
            providerActive=snapshot.provider_active,  # type: ignore[arg-type]
            model=snapshot.model,
            modelActive=snapshot.model_active,
            hasApiKey=snapshot.has_api_key,
            apiKeyMasked=snapshot.api_key_masked,
            usingEnvironmentKey=snapshot.using_environment_key,
            connectionStatus=snapshot.last_test_status,  # type: ignore[arg-type]
            lastTestedAt=snapshot.last_tested_at,
            lastTestMessage=snapshot.last_test_message,
        )

    def _inject_missing_data_notes(
        self,
        output: dict[str, Any],
        missing_sections: list[str],
        validation_message: str | None,
    ) -> None:
        data_quality_flags = output.setdefault("data_quality_flags", [])
        questions = output.setdefault("questions_to_validate", [])
        limitations = output.setdefault("limitations", [])

        if validation_message:
            if validation_message not in data_quality_flags:
                data_quality_flags.append(validation_message)
            if validation_message not in limitations:
                limitations.append(validation_message)

        for section in missing_sections:
            hint = _MISSING_SECTION_HINTS.get(section)
            limitation = _MISSING_SECTION_LIMITATIONS.get(section)
            if hint and hint not in questions:
                questions.append(hint)
            if limitation and limitation not in limitations:
                limitations.append(limitation)

        output["data_quality_flags"] = list(dict.fromkeys(str(flag) for flag in data_quality_flags if str(flag)))
        output["questions_to_validate"] = list(dict.fromkeys(str(item) for item in questions if str(item)))
        output["limitations"] = list(dict.fromkeys(str(item) for item in limitations if str(item)))


ai_service = AIService()
