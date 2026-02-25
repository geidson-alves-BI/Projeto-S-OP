# pixel-perfect

Guia rapido para rodar frontend + backend localmente no Windows.

## Pre-requisitos

- Python 3.12+ com `py` ou `python` no PATH
- Node.js 18+
- npm

## Terminal 1: rodar backend (FastAPI)

Na raiz do repositorio:

```powershell
cd c:\Projetos\pixel-perfect
.\scripts\run_backend.ps1
```

Esse script:

1. Cria `.venv` (se nao existir)
2. Tenta ativar a `.venv`
3. Instala dependencias de `backend/requirements.txt`
4. Sobe a API em `http://127.0.0.1:8000` com reload

Forma manual equivalente (na raiz):

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --reload --port 8000
```

Ou sem ativar:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000
```

## Terminal 2: rodar frontend (Vite)

Na raiz do repositorio:

```powershell
cd c:\Projetos\pixel-perfect
npm run dev:local
```

Frontend esperado: `http://127.0.0.1:8081`  
API esperada pelo frontend: `VITE_API_URL=http://127.0.0.1:8000`

## Como validar backend

Com backend em execucao:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`

Checks locais:

```powershell
.\scripts\check_backend.ps1
.\scripts\check_backend.ps1 -SkipHttp
```

Opcional (smoke test `/ai/*`):

```powershell
.\.venv\Scripts\python.exe scripts\smoke_test_ai.py
```

## AI Agent

As instrucoes detalhadas e exemplos de payload para os endpoints `/ai/*` estao em:

- [docs/AI_AGENT.md](docs/AI_AGENT.md)

## CORS local permitido

O backend esta configurado para aceitar:

- `http://localhost:8081`
- `http://127.0.0.1:8081`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

## Troubleshooting rapido

- Erro ao ativar `Activate.ps1`:
  - Rode `Set-ExecutionPolicy -Scope Process Bypass` e tente novamente.
  - Ou execute sem ativar: `.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000`.

- Erro de `PYTHONPATH` / `No module named backend`:
  - Rode os comandos a partir da raiz `c:\Projetos\pixel-perfect`.
  - Use `backend.app.main:app` (nao `app.main:app`).

- Erro `No module named fastapi` ou `uvicorn` nao reconhecido:
  - Rode `.\scripts\run_backend.ps1` para recriar ambiente e instalar dependencias.
  - Confirme com `.\scripts\check_backend.ps1` (valida imports e `GET /docs`).
