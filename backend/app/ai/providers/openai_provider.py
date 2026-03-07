from __future__ import annotations

import json
from typing import Any
import urllib.error
import urllib.request

from ..personas import PersonaProfile
from .base import BaseAIProvider


class OpenAIProviderError(RuntimeError):
    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


class OpenAIProvider(BaseAIProvider):
    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.api_key = api_key.strip()
        self.model = model.strip() or "gpt-4o-mini"
        self.timeout_seconds = timeout_seconds
        self.endpoint = "https://api.openai.com/v1/chat/completions"

    def test_connection(self) -> None:
        payload = {
            "model": self.model,
            "temperature": 0,
            "max_tokens": 8,
            "messages": [
                {
                    "role": "system",
                    "content": "Reply with the single word ok.",
                },
                {
                    "role": "user",
                    "content": "Connection test for Operion.",
                },
            ],
        }
        self._post_json(payload)

    def generate(
        self,
        persona: PersonaProfile,
        context_pack: dict[str, Any],
        language: str,
    ) -> dict[str, Any]:
        system_prompt = self._build_system_prompt(persona=persona, language=language)
        user_prompt = self._build_user_prompt(persona=persona, context_pack=context_pack)

        payload = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        api_response = self._post_json(payload)
        content = self._extract_message_content(api_response)
        parsed = self._parse_json_object(content)
        parsed["persona"] = persona.code
        return parsed

    def _build_system_prompt(self, persona: PersonaProfile, language: str) -> str:
        persona_focus = "; ".join(persona.focus)
        persona_goals = "; ".join(persona.goals)
        persona_questions = "; ".join(persona.guiding_questions)
        return (
            "Voce e o interprete executivo do Operion. "
            f"Idioma de saida: {language}. Persona alvo: {persona.label}. "
            f"Tom: {persona.tone}. Foco: {persona_focus}. Objetivos: {persona_goals}. "
            f"Perguntas norteadoras: {persona_questions}. "
            "Regras obrigatorias: "
            "1) Use exclusivamente dados do context_pack enviado. "
            "2) Nao invente numeros, percentuais ou valores monetarios. "
            "3) Em risks, opportunities e actions inclua evidence com path existente no context_pack. "
            "4) Se dados insuficientes, escreva explicitamente 'dados insuficientes' e detalhe faltantes em limitations e questions_to_validate. "
            "5) Priorize leitura executiva, impacto e proximo passo para a persona escolhida. "
            "6) Retorne apenas JSON valido, sem markdown."
        )

    def _build_user_prompt(self, persona: PersonaProfile, context_pack: dict[str, Any]) -> str:
        response_schema = {
            "persona": persona.code,
            "executive_summary": ["string"],
            "risks": [
                {
                    "title": "string",
                    "severity": "low|medium|high",
                    "evidence": [{"path": "string", "value": "any"}],
                }
            ],
            "opportunities": [
                {
                    "title": "string",
                    "impact": "low|medium|high",
                    "evidence": [{"path": "string", "value": "any"}],
                }
            ],
            "actions": [
                {
                    "title": "string",
                    "horizon": "0-7d|7-30d|30-90d",
                    "impact": "low|medium|high",
                    "evidence": [{"path": "string", "value": "any"}],
                }
            ],
            "limitations": ["string"],
            "questions_to_validate": ["string"],
            "data_quality_flags": ["string"],
            "disclaimer": "string",
        }
        return (
            "Gere uma leitura executiva no schema abaixo. "
            "Nao inclua campos extras.\n\n"
            f"Schema alvo:\n{json.dumps(response_schema, ensure_ascii=False)}\n\n"
            f"Context pack:\n{json.dumps(context_pack, ensure_ascii=False)}"
        )

    def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw_response = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="ignore")
            except Exception:
                detail = str(exc)
            raise self._classify_http_error(status_code=exc.code, detail=detail) from exc
        except urllib.error.URLError as exc:
            raise OpenAIProviderError(
                "network_error",
                f"Falha de conexao com OpenAI: {exc}",
            ) from exc
        except TimeoutError as exc:
            raise OpenAIProviderError("network_error", "Timeout na chamada OpenAI.") from exc

        try:
            parsed = json.loads(raw_response)
        except json.JSONDecodeError as exc:
            raise OpenAIProviderError("openai_error", "Resposta OpenAI nao esta em JSON.") from exc

        if not isinstance(parsed, dict):
            raise OpenAIProviderError("openai_error", "Resposta OpenAI invalida: payload nao e objeto.")
        return parsed

    def _classify_http_error(self, *, status_code: int, detail: str) -> OpenAIProviderError:
        message = detail.strip()
        parsed_message = message
        parsed_code = None

        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            payload = None

        if isinstance(payload, dict):
            error_payload = payload.get("error", {})
            if isinstance(error_payload, dict):
                parsed_message = str(error_payload.get("message") or parsed_message)
                parsed_code = str(error_payload.get("code") or "").strip() or None

        lower_message = parsed_message.lower()
        lower_code = (parsed_code or "").lower()

        if status_code in {401, 403} or lower_code == "invalid_api_key" or "incorrect api key" in lower_message:
            return OpenAIProviderError("invalid_key", "Chave OpenAI invalida ou sem permissao.")

        if (
            lower_code == "model_not_found"
            or status_code == 404
            or "model" in lower_message and "not found" in lower_message
            or "does not exist" in lower_message
        ):
            return OpenAIProviderError("model_not_found", "Modelo OpenAI nao encontrado.")

        return OpenAIProviderError(
            "openai_error",
            parsed_message[:500] or f"OpenAI HTTP {status_code}",
        )

    def _extract_message_content(self, response_payload: dict[str, Any]) -> str:
        choices = response_payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise OpenAIProviderError("openai_error", "Resposta OpenAI sem choices.")

        message = choices[0].get("message", {})
        if not isinstance(message, dict):
            raise OpenAIProviderError("openai_error", "Resposta OpenAI sem message.")

        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            chunks: list[str] = []
            for chunk in content:
                if isinstance(chunk, dict):
                    text = chunk.get("text")
                    if isinstance(text, str):
                        chunks.append(text)
            if chunks:
                return "".join(chunks)

        raise OpenAIProviderError("openai_error", "Resposta OpenAI sem content textual.")

    def _parse_json_object(self, content: str) -> dict[str, Any]:
        text = content.strip()
        if not text:
            raise OpenAIProviderError("openai_error", "Resposta OpenAI vazia.")

        candidate = text
        if not (candidate.startswith("{") and candidate.endswith("}")):
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise OpenAIProviderError("openai_error", "Resposta OpenAI nao contem JSON valido.")
            candidate = candidate[start : end + 1]

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise OpenAIProviderError(
                "openai_error",
                "Falha ao parsear JSON de saida do provider OpenAI.",
            ) from exc

        if not isinstance(parsed, dict):
            raise OpenAIProviderError("openai_error", "Saida OpenAI invalida: JSON precisa ser objeto.")
        return parsed
