# AI Agent (Camada Consultiva)

Este projeto mantem o fluxo principal de calculo no frontend (`rmEngine.ts` e `pcpEngine.ts`) e usa o backend FastAPI para endpoints auxiliares do AI Agent.

## 1) Instalar dependencias do backend

```bash
pip install -r backend/requirements.txt
```

## 2) Rodar o backend

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Docs/OpenAPI: `http://127.0.0.1:8000/docs`

## 3) Rodar smoke test dos endpoints AI

Com o backend ativo:

```bash
python scripts/smoke_test_ai.py
```

Opcional (base URL customizada):

```bash
AI_BASE_URL=http://127.0.0.1:8000 python scripts/smoke_test_ai.py
```

O script valida:
- `POST /ai/audit`
- `POST /ai/insights`
- `POST /ai/product-improvements`
- Presenca dessas rotas no `/openapi.json`

## 4) Payloads de exemplo

### POST /ai/audit

```json
{
  "snapshots": [
    {
      "sku": "RM-001",
      "tc": 120,
      "pp": 80,
      "es": 95,
      "sla": 0.85,
      "cobertura": 5,
      "tr": 8
    }
  ],
  "context": {
    "source": "manual-test"
  }
}
```

### POST /ai/insights

```json
{
  "metrics": {
    "sla_medio": 0.84,
    "cobertura_media": 0.92,
    "acuracia_forecast": 0.71,
    "ruptura_pct": 0.08
  },
  "context": {
    "source": "manual-test"
  }
}
```

### POST /ai/product-improvements

```json
{
  "modulos": ["rm", "financeiro", "forecast"],
  "indicadores_atuais": ["total_registros", "ultima_atualizacao", "sla_medio", "ruptura_pct"],
  "objetivo": "Aumentar confianca das decisoes operacionais sem migrar o motor local.",
  "validacoes_atuais": [
    "Bloquear TC negativo.",
    "Validar limites por faixa (SLA entre 0 e 1; quantidades >= 0)."
  ],
  "contexto": {
    "source": "manual-test"
  }
}
```
