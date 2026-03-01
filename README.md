# Operion

Operion - Operational Intelligence Platform.

## Pre-requisitos

- Python 3.12+ com `py` ou `python` no PATH
- Node.js 18+
- npm
- Windows PowerShell (para scripts `.ps1`)
- Git (opcional)

## Desktop Windows (NSIS)

Para gerar o instalador do app desktop:

```powershell
cd c:\Projetos\pixel-perfect
npm run desktop:dist
```

Saida esperada:

- Instalador: `dist\desktop\Operion-Setup-<versao>.exe`
- App empacotado: `dist\desktop\win-unpacked\`

Branding aplicado no desktop/installer:

- Nome do produto: `Operion`
- AppId: `com.operion.app`
- Icone app/installer/tray: `build\icon.ico`
- Sidebar do instalador: `build\installerSidebar.png`
- Header do instalador: `build\installerHeader.png`

### Como testar (desktop)

1. Gere o instalador:

```powershell
cd c:\Projetos\pixel-perfect
npm run desktop:dist
```

2. Verifique os artefatos:

- Instalador NSIS: `dist\desktop\Operion-Setup-0.0.0.exe`
- Aplicativo empacotado: `dist\desktop\win-unpacked\Operion.exe`

3. Teste manual:

- Execute o instalador e confirme nome/atalhos como `Operion`
- Abra o app instalado e confirme o tray icon usando `build\icon.ico`

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

## Frontend e API em modo producao local

O frontend ja usa `VITE_API_URL` em [`src/lib/api.ts`](src/lib/api.ts).  
Para build de producao local apontando para o backend local, defina:

```powershell
$env:VITE_API_URL="http://127.0.0.1:8000"
```

Alternativa persistente para producao local:

1. Crie `./.env.production.local`
2. Adicione `VITE_API_URL=http://127.0.0.1:8000`

## Rodar com 1 clique (production-like local)

Use o launcher unico para subir backend + frontend sem alterar a logica do app.

Opcao 1 (mais simples):

- De duplo clique em `scripts\run_app_prod.cmd`

Opcao 2 (PowerShell):

```powershell
cd c:\Projetos\pixel-perfect
.\scripts\run_app_prod.ps1
```

O launcher faz:

1. Sobe backend em `http://127.0.0.1:8000` (sem reload)
2. Aguarda backend ficar pronto
3. Define `VITE_API_URL=http://127.0.0.1:8000`
4. Builda o frontend e sobe `dist/` em `http://127.0.0.1:8081`
5. Abre o navegador automaticamente
6. Mostra mensagem clara: `AGORA ABRA: http://127.0.0.1:8081`

Pre-requisitos para 1 clique:

- Python 3 com `py` ou `python` no PATH
- Node.js com `npm`
- Windows PowerShell
- Git (opcional, apenas para clonar/atualizar repo)

Como parar:

- Pressione `Ctrl+C` na janela do launcher para encerrar backend e frontend
- Ou feche a janela do launcher

Troubleshooting do 1 clique:

- Porta `8081` ocupada:
  - Rode `.\scripts\run_app_prod.ps1 -FrontendPort 8082`
  - Acesse `http://127.0.0.1:8082`
- Script bloqueado por ExecutionPolicy:
  - Use `scripts\run_app_prod.cmd` (duplo clique), ou
  - Rode `Set-ExecutionPolicy -Scope Process Bypass` antes do `.ps1`

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

Validacao do app completo em producao local:

1. Acesse `http://127.0.0.1:8081`
2. Confirme backend em `http://127.0.0.1:8000/docs`
3. Teste `http://127.0.0.1:8000/openapi.json`
4. Rode `.\.venv\Scripts\python.exe scripts\smoke_test_ai.py` e confirme status 200 nos endpoints `/ai/*`

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
