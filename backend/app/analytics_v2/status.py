from __future__ import annotations

STATUS_READY = "ready"
STATUS_PARTIAL = "partial"
STATUS_UNAVAILABLE = "unavailable"

VALID_STATUSES = {
    STATUS_READY,
    STATUS_PARTIAL,
    STATUS_UNAVAILABLE,
}

_LEGACY_TO_V2 = {
    "available": STATUS_READY,
    "partial": STATUS_PARTIAL,
    "unavailable": STATUS_UNAVAILABLE,
    "ready": STATUS_READY,
    "missing": STATUS_UNAVAILABLE,
    "invalid": STATUS_UNAVAILABLE,
}


def normalize_status(status: str | None) -> str:
    normalized = str(status or "").strip().lower()
    if normalized in VALID_STATUSES:
        return normalized
    return _LEGACY_TO_V2.get(normalized, STATUS_UNAVAILABLE)


def is_available(status: str | None) -> bool:
    return normalize_status(status) in {STATUS_READY, STATUS_PARTIAL}


def from_legacy_readiness(status: str | None) -> str:
    return normalize_status(status)
