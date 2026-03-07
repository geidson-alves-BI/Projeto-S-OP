from __future__ import annotations

import json
import os
from typing import Any
import urllib.error
import urllib.request

from ..personas import PersonaProfile
from .base import BaseAIProvider


class OpenAIProvider(BaseAIProvider):
    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.endpoint = "https://api.openai.com/v1/chat/completions"

    @classmethod
    def from_env(cls) -> OpenAIProvider | None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return None
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
        return cls(api_key=api_key, model=model)

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
            "1) Use EXCLUSIVAMENTE dados do context_pack enviado. "
            "2) Nao invente numeros, percentuais ou valores monetarios. "
            "3) Nao faca recomendacoes sem evidencia no dataset. "
            "4) Se dados insuficientes, escreva explicitamente 'dados insuficientes' e liste faltantes em questions_to_validate/data_quality_flags. "
            "5) Em risks e actions inclua evidence com path existente no context_pack. "
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
            "actions": [
                {
                    "title": "string",
                    "horizon": "0-7d|7-30d|30-90d",
                    "impact": "low|medium|high",
                    "evidence": [{"path": "string", "value": "any"}],
                }
            ],
            "questions_to_validate": ["string"],
            "data_quality_flags": ["string"],
            "disclaimer": "string",
        }
        return (
            "Gere insights executivos no schema abaixo. "
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
            raise RuntimeError(f"OpenAI HTTP {exc.code}: {detail[:500]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Falha de conexao com OpenAI: {exc}") from exc
        except TimeoutError as exc:
            raise RuntimeError("Timeout na chamada OpenAI.") from exc

        try:
            parsed = json.loads(raw_response)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Resposta OpenAI nao esta em JSON.") from exc

        if not isinstance(parsed, dict):
            raise RuntimeError("Resposta OpenAI invalida: payload nao e objeto.")
        return parsed

    def _extract_message_content(self, response_payload: dict[str, Any]) -> str:
        choices = response_payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("Resposta OpenAI sem choices.")

        message = choices[0].get("message", {})
        if not isinstance(message, dict):
            raise RuntimeError("Resposta OpenAI sem message.")

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

        raise RuntimeError("Resposta OpenAI sem content textual.")

    def _parse_json_object(self, content: str) -> dict[str, Any]:
        text = content.strip()
        if not text:
            raise RuntimeError("Resposta OpenAI vazia.")

        candidate = text
        if not (candidate.startswith("{") and candidate.endswith("}")):
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise RuntimeError("Resposta OpenAI nao contem JSON valido.")
            candidate = candidate[start : end + 1]

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Falha ao parsear JSON de saida do provider OpenAI.") from exc

        if not isinstance(parsed, dict):
            raise RuntimeError("Saida OpenAI invalida: JSON precisa ser objeto.")
        return parsed
