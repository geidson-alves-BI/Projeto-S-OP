# Operion

Operion - Operational Intelligence Platform.

## Pre-requisitos

- Python 3.12+ com `py` ou `python` no PATH
- Node.js 18+
- npm
- Windows PowerShell (para scripts `.ps1`)
- Git (opcional)

## Operion Desktop (standalone)

No desktop do Operion, o backend FastAPI inicia automaticamente junto com o app.  
O usuario instala e abre o Operion sem precisar terminal.

Comportamento esperado:

1. Ao abrir o app, backend sobe em `127.0.0.1` (porta padrao `8000`)
2. Se `8000` estiver ocupada, o app tenta proxima porta livre e registra no log
3. Ao fechar o app, o processo do backend embutido eh encerrado
4. O app continua funcional offline no PC

Logs locais:

- `%APPDATA%\Operion\logs\desktop.log`
- `%APPDATA%\Operion\logs\backend.log`

Troubleshooting rapido (desktop standalone):

- Porta `8000` em uso:
  - O app tenta outra porta automaticamente
  - Consulte `%APPDATA%\Operion\logs\desktop.log` para ver a porta escolhida
- Firewall/antivirus:
  - Permita execucao do `Operion.exe` e do backend embutido
  - Se bloquear subprocesso local, o frontend pode abrir sem conseguir acessar API

## Desktop Windows (NSIS)

Para gerar o instalador desktop:

```powershell
cd C:\Projetos\Operion
npm run desktop:dist
```

Saida esperada:

- Instalador: `dist\desktop\Operion-Setup-<versao>.exe`
- Blockmap: `dist\desktop\Operion-Setup-<versao>.exe.blockmap`
- Metadata update: `dist\desktop\latest.yml`
- App empacotado: `dist\desktop\win-unpacked\Operion.exe`

Branding aplicado:

- Nome do produto: `Operion`
- AppId: `com.operion.app`
- Icone app/installer/tray: `build\icon.ico`
- Sidebar do instalador: `build\installerSidebar.png`
- Header do instalador: `build\installerHeader.png`

### Como testar (dev)

```powershell
cd C:\Projetos\Operion
npm run desktop:backend
npm run desktop:start
```

Checklist:

1. App abre sem terminal adicional
2. Backend responde em `http://127.0.0.1:8000/health` (ou porta alternativa registrada no log)
3. `http://127.0.0.1:8000/docs` abre no browser
4. Ao fechar o app, processo backend encerra

### Como testar (installer)

1. Gere instalador:

```powershell
cd C:\Projetos\Operion
npm run desktop:dist
```

2. Instale e abra o app:

- `dist\desktop\Operion-Setup-0.1.0.exe`

3. Valide:

- Operion abre sem terminal
- Backend sobe automaticamente
- UI chama API normalmente
- Fechar app encerra backend

## Atualizacoes (Auto-Update)

O desktop do Operion funciona 100% local no PC.  
Sem internet, o app abre e roda normalmente.

Quando houver internet, o desktop:

1. Checa atualizacoes no GitHub Releases ao iniciar
2. Se houver nova versao, mostra notificacao e status no tray (`Atualizacao pendente`)
3. Faz download em background
4. Quando concluir, muda para `Pronto para instalar ao reiniciar`

Aplicacao da atualizacao:

- Opcao 1: fechar e abrir o app novamente
- Opcao 2: menu do tray -> `Reiniciar e atualizar agora`
- Opcao adicional no tray: `Atualizar ao fechar` (ligado por padrao)

Logs locais do desktop:

- `%APPDATA%\Operion\logs\desktop.log`
- Em alguns ambientes: `%APPDATA%\operion\logs\desktop.log`

Troubleshooting de update:

- Sem internet ou sem release publicada:
  - O app continua abrindo normalmente
  - O erro fica apenas no log local, sem bloquear o uso
- Update nao aparece:
  - Confirme que existe release no GitHub com tag (`v0.1.1`, por exemplo)
  - Confirme que os assets da release incluem `.exe`, `.blockmap` e `latest.yml`

## Como publicar uma nova versao (GitHub Releases)

Fluxo recomendado:

1. Atualize `package.json` para a nova versao (ex.: `0.1.1`)
2. Gere lockfile atualizado (se necessario) e commit:
   - `git add package.json package-lock.json`
   - `git commit -m "chore: bump desktop version to 0.1.1"`
3. Crie e envie a tag:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

4. O workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) sera disparado automaticamente e publicara os assets no GitHub Release.

Teste basico de update (simulado):

1. Instale `0.1.0`
2. Publique `0.1.1` (passos acima)
3. Abra o app `0.1.0` com internet
4. Verifique tray com `Atualizacao pendente`
5. Use `Reiniciar e atualizar agora` (ou reinicie o app)

## Terminal 1: rodar backend (FastAPI)

Na raiz do repositorio:

```powershell
cd C:\Projetos\Operion
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
cd C:\Projetos\Operion
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
cd C:\Projetos\Operion
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
  - Rode os comandos a partir da raiz `C:\Projetos\Operion`.
  - Use `backend.app.main:app` (nao `app.main:app`).

- Erro `No module named fastapi` ou `uvicorn` nao reconhecido:
  - Rode `.\scripts\run_backend.ps1` para recriar ambiente e instalar dependencias.
  - Confirme com `.\scripts\check_backend.ps1` (valida imports e `GET /docs`).
