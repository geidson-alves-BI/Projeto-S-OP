import json
import os
import sys
from typing import Any, Dict, Tuple

import requests

BASE_URL = os.getenv("AI_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = float(os.getenv("AI_SMOKE_TIMEOUT", "10"))


def _preview(data: Any, limit: int = 360) -> str:
    dumped = json.dumps(data, ensure_ascii=False)
    return dumped[:limit] + ("..." if len(dumped) > limit else "")


def _print_result(name: str, response: requests.Response) -> bool:
    print(f"\n[{name}] {response.request.method} {response.url}")
    print(f"status_code={response.status_code}")
    try:
        payload = response.json()
        print(f"json_preview={_preview(payload)}")
    except ValueError:
        print(f"text_preview={response.text[:360]}")
    return response.status_code == 200


def _post(path: str, payload: Dict[str, Any]) -> requests.Response:
    return requests.post(f"{BASE_URL}{path}", json=payload, timeout=TIMEOUT)


def _check_openapi() -> Tuple[bool, str]:
    response = requests.get(f"{BASE_URL}/openapi.json", timeout=TIMEOUT)
    if response.status_code != 200:
        return False, f"/openapi.json retornou {response.status_code}"

    paths = response.json().get("paths", {})
    required = ["/ai/audit", "/ai/insights", "/ai/product-improvements"]
    missing = [p for p in required if p not in paths]
    if missing:
        return False, f"endpoints ausentes no OpenAPI: {', '.join(missing)}"
    return True, "OpenAPI contem os 3 endpoints /ai/*"


def main() -> int:
    print(f"AI smoke test base_url={BASE_URL}")

    audit_payload = {
        "snapshots": [
            {
                "sku": "RM-001",
                "tc": 120,
                "pp": 80,
                "es": 95,
                "sla": 0.85,
                "cobertura": 5,
                "tr": 8,
            },
            {
                "sku": "RM-002",
                "tc": -5,
                "pp": 40,
                "es": 35,
                "sla": 0.96,
                "cobertura": 15,
                "tr": 12,
            },
        ],
        "context": {"source": "smoke_test_ai.py"},
    }

    insights_payload = {
        "metrics": {
            "sla_medio": 0.84,
            "cobertura_media": 0.92,
            "acuracia_forecast": 0.71,
            "ruptura_pct": 0.08,
        },
        "context": {"source": "smoke_test_ai.py"},
    }

    improvements_payload = {
        "modulos": ["rm", "financeiro", "forecast"],
        "indicadores_atuais": [
            "total_registros",
            "ultima_atualizacao",
            "sla_medio",
            "ruptura_pct",
        ],
        "objetivo": "Aumentar confianca das decisoes operacionais sem migrar o motor local.",
        "validacoes_atuais": [
            "Bloquear TC negativo.",
            "Validar limites por faixa (SLA entre 0 e 1; quantidades >= 0).",
        ],
        "contexto": {"source": "smoke_test_ai.py"},
    }

    checks = []
    checks.append(_print_result("ai/audit", _post("/ai/audit", audit_payload)))
    checks.append(_print_result("ai/insights", _post("/ai/insights", insights_payload)))
    checks.append(
        _print_result(
            "ai/product-improvements",
            _post("/ai/product-improvements", improvements_payload),
        )
    )

    openapi_ok, openapi_msg = _check_openapi()
    print(f"\n[openapi] {openapi_msg}")
    checks.append(openapi_ok)

    if all(checks):
        print("\nSmoke test concluido com sucesso.")
        return 0

    print("\nSmoke test falhou.")
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except requests.RequestException as exc:
        print(f"Erro de conexao: {exc}")
        sys.exit(1)
