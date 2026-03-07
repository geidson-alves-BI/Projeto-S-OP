from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..personas import PersonaProfile


class BaseAIProvider(ABC):
    name = "base"

    @abstractmethod
    def generate(
        self,
        persona: PersonaProfile,
        context_pack: dict[str, Any],
        language: str,
    ) -> dict[str, Any]:
        raise NotImplementedError
