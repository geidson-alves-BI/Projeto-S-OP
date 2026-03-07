from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

AI_PROVIDER_VALUES = {"openai", "deterministic"}
AI_TEST_STATUS_VALUES = {
    "success",
    "invalid_key",
    "model_not_found",
    "network_error",
    "provider_not_configured",
    "fallback_only",
    "openai_error",
}
DEFAULT_PROVIDER = "openai"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
FALLBACK_MODEL_NAME = "operion-deterministic-v1"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_provider(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized in AI_PROVIDER_VALUES:
        return normalized
    return DEFAULT_PROVIDER


def _normalize_model(value: str | None) -> str:
    model = (value or "").strip()
    return model or DEFAULT_OPENAI_MODEL


def _mask_api_key(value: str) -> str | None:
    api_key = value.strip()
    if not api_key:
        return None
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:3]}...{api_key[-4:]}"


@dataclass(frozen=True)
class AIConfigSnapshot:
    provider: str
    provider_active: str
    model: str
    model_active: str
    api_key: str
    has_api_key: bool
    api_key_masked: str | None
    using_environment_key: bool
    last_tested_at: str | None
    last_test_status: str | None
    last_test_message: str | None


class AIConfigStore:
    def __init__(self, explicit_path: str | None = None) -> None:
        self.path = self._resolve_path(explicit_path)

    def get_snapshot(self) -> AIConfigSnapshot:
        record = self._read_record()
        env_provider = _normalize_provider(os.getenv("OPERION_AI_PROVIDER"))
        env_model = _normalize_model(os.getenv("OPENAI_MODEL"))
        env_api_key = os.getenv("OPENAI_API_KEY", "").strip()

        provider = _normalize_provider(record.get("provider") or env_provider or DEFAULT_PROVIDER)
        model = _normalize_model(record.get("model") or env_model)
        stored_api_key = str(record.get("api_key") or "").strip()
        effective_api_key = stored_api_key or env_api_key
        using_environment_key = not stored_api_key and bool(env_api_key)
        has_api_key = bool(effective_api_key)
        provider_active = "openai" if provider == "openai" and has_api_key else "deterministic"
        model_active = model if provider_active == "openai" else FALLBACK_MODEL_NAME

        return AIConfigSnapshot(
            provider=provider,
            provider_active=provider_active,
            model=model,
            model_active=model_active,
            api_key=effective_api_key,
            has_api_key=has_api_key,
            api_key_masked=_mask_api_key(effective_api_key),
            using_environment_key=using_environment_key,
            last_tested_at=self._normalize_optional_string(record.get("last_tested_at")),
            last_test_status=self._normalize_test_status(record.get("last_test_status")),
            last_test_message=self._normalize_optional_string(record.get("last_test_message")),
        )

    def save_config(
        self,
        *,
        provider: str,
        model: str,
        api_key: str | None,
        keep_existing_key: bool,
    ) -> AIConfigSnapshot:
        record = self._read_record()
        normalized_key = (api_key or "").strip()
        record["provider"] = _normalize_provider(provider)
        record["model"] = _normalize_model(model)

        if normalized_key:
            record["api_key"] = normalized_key
        elif not keep_existing_key:
            record["api_key"] = ""

        record["last_tested_at"] = None
        record["last_test_status"] = None
        record["last_test_message"] = None
        self._write_record(record)
        return self.get_snapshot()

    def record_test_result(self, *, status: str, message: str) -> AIConfigSnapshot:
        record = self._read_record()
        record["last_tested_at"] = _utc_now_iso()
        record["last_test_status"] = self._normalize_test_status(status)
        record["last_test_message"] = message.strip()
        self._write_record(record)
        return self.get_snapshot()

    def _resolve_path(self, explicit_path: str | None) -> Path:
        configured = (explicit_path or os.getenv("OPERION_AI_CONFIG_PATH", "")).strip()
        if configured:
            return Path(configured)
        return Path.home() / ".operion" / "ai-config.json"

    def _read_record(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}

        try:
            raw = self.path.read_text(encoding="utf-8")
            parsed = json.loads(raw)
        except Exception:
            return {}

        if not isinstance(parsed, dict):
            return {}
        return parsed

    def _write_record(self, record: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    def _normalize_optional_string(self, value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        text = value.strip()
        return text or None

    def _normalize_test_status(self, value: Any) -> str | None:
        text = self._normalize_optional_string(value)
        if text in AI_TEST_STATUS_VALUES:
            return text
        return None
