const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  nativeImage,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const PRODUCT_NAME = "Operion";
const SLOGAN = "Operational Intelligence Platform";
const DEFAULT_BACKEND_PORT = 8000;
const BACKEND_START_TIMEOUT_SEC = 60;
const BACKEND_POLL_INTERVAL_MS = 1000;
const DEBUG_MODE = process.env.OPERION_DEBUG === "1";

app.setName(PRODUCT_NAME);

let mainWindow = null;
let tray = null;
let isQuitting = false;

let backendProcess = null;
let backendPort = DEFAULT_BACKEND_PORT;
let backendStatusText = "Backend nao iniciado";
let apiRewriteRegistered = false;

let updateDownloaded = false;
let installUpdateOnQuit = true;
let updateStatusText = "Sem verificacao de atualizacao";

let logsDir = "";
let desktopLogPath = "";
let backendLogPath = "";
let rendererLogPath = "";
let rendererFallbackShown = false;

function initLogging() {
  logsDir = path.join(app.getPath("appData"), PRODUCT_NAME, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  desktopLogPath = path.join(logsDir, "desktop.log");
  backendLogPath = path.join(logsDir, "backend.log");
  rendererLogPath = path.join(logsDir, "renderer.log");
  appendLine(rendererLogPath, `[${new Date().toISOString()}] [info] Renderer log started`);
}

function appendLine(filePath, line) {
  try {
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  } catch (error) {
    console.error("Falha ao gravar log:", error);
  }
}

function logDesktop(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  console.log(line);
  if (desktopLogPath) {
    appendLine(desktopLogPath, line);
  }
}

function logBackend(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  if (backendLogPath) {
    appendLine(backendLogPath, line);
  }
}

function logRenderer(level, message, sourceId = "", lineNumber = 0) {
  if (!rendererLogPath) {
    return;
  }

  const safeSource = sourceId || "renderer";
  const line = `[${new Date().toISOString()}] [${level}] ${safeSource}:${lineNumber} ${message}`;
  appendLine(rendererLogPath, line);
}

function setBackendStatus(message) {
  backendStatusText = message;
  refreshTrayMenu();
}

function setUpdateStatus(message) {
  updateStatusText = message;
  refreshTrayMenu();
}

function getApiUrl() {
  return `http://127.0.0.1:${backendPort}`;
}

function registerApiUrlRewrite(session) {
  if (apiRewriteRegistered || backendPort === DEFAULT_BACKEND_PORT) {
    return;
  }

  const filter = {
    urls: ["http://127.0.0.1:8000/*", "http://localhost:8000/*"],
  };

  session.webRequest.onBeforeRequest(filter, (details, callback) => {
    const original = new URL(details.url);
    original.hostname = "127.0.0.1";
    original.port = String(backendPort);
    callback({ redirectURL: original.toString() });
  });

  apiRewriteRegistered = true;
  logDesktop(
    "info",
    `Reescrita de API ativa: http://127.0.0.1:8000 -> ${getApiUrl()}`,
  );
}

function resolveIconPath() {
  const candidates = [
    path.join(process.resourcesPath, "build", "icon.ico"),
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(process.cwd(), "build", "icon.ico"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort, maxAttempts) {
  let current = startPort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(current);
    if (available) {
      return current;
    }

    current += 1;
  }

  throw new Error(`Nenhuma porta disponivel encontrada a partir de ${startPort}.`);
}

function resolveDevPython() {
  const repoRoot = path.join(__dirname, "..");
  const venvPython = path.join(repoRoot, ".venv", "Scripts", "python.exe");

  if (fs.existsSync(venvPython)) {
    return { command: venvPython, argsPrefix: [] };
  }

  return { command: "python", argsPrefix: [] };
}

function resolveBackendLaunch() {
  const repoRoot = path.join(__dirname, "..");

  if (app.isPackaged) {
    const packagedExe = path.join(process.resourcesPath, "backend", "backend.exe");
    if (!fs.existsSync(packagedExe)) {
      throw new Error(`backend.exe nao encontrado em ${packagedExe}`);
    }
    return { command: packagedExe, args: [], cwd: process.resourcesPath };
  }

  const devScript = path.join(repoRoot, "backend", "run_prod.py");
  if (!fs.existsSync(devScript)) {
    throw new Error(`Entrypoint do backend nao encontrado: ${devScript}`);
  }

  const python = resolveDevPython();
  return {
    command: python.command,
    args: [...python.argsPrefix, devScript],
    cwd: repoRoot,
  };
}

function requestStatus(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 4000 }, (res) => {
      resolve(res.statusCode || 0);
      res.resume();
    });

    req.on("error", () => resolve(0));
    req.on("timeout", () => {
      req.destroy();
      resolve(0);
    });
  });
}

async function waitForBackendReady(port, timeoutSec) {
  const deadline = Date.now() + timeoutSec * 1000;
  const healthUrl = `http://127.0.0.1:${port}/health`;

  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const statusCode = await requestStatus(healthUrl);
    if (statusCode === 200) {
      return;
    }

    // eslint-disable-next-line no-await-in-loop
    await wait(BACKEND_POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout aguardando backend responder em ${healthUrl}.`);
}

async function stopEmbeddedBackend() {
  if (!backendProcess || backendProcess.killed) {
    return;
  }

  const pid = backendProcess.pid;
  if (!pid) {
    return;
  }

  await new Promise((resolve) => {
    execFile(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true },
      () => resolve(),
    );
  });

  backendProcess = null;
  setBackendStatus("Backend encerrado");
  logDesktop("info", `Backend encerrado (PID ${pid})`);
}

async function startEmbeddedBackend() {
  backendPort = await findAvailablePort(DEFAULT_BACKEND_PORT, 20);
  const selectedApiUrl = getApiUrl();
  process.env.OPERION_API_URL = selectedApiUrl;

  if (backendPort !== DEFAULT_BACKEND_PORT) {
    logDesktop(
      "warn",
      `Porta ${DEFAULT_BACKEND_PORT} ocupada, backend iniciado na porta ${backendPort}.`,
    );
  }

  const launch = resolveBackendLaunch();
  logDesktop("info", `Iniciando backend: ${launch.command} ${launch.args.join(" ")}`);
  logDesktop("info", `Log do backend: ${backendLogPath}`);

  backendProcess = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env: {
      ...process.env,
      OPERION_BACKEND_HOST: "127.0.0.1",
      OPERION_BACKEND_PORT: String(backendPort),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  backendProcess.stdout.on("data", (chunk) => {
    logBackend(`[stdout] ${chunk.toString().trimEnd()}`);
  });

  backendProcess.stderr.on("data", (chunk) => {
    logBackend(`[stderr] ${chunk.toString().trimEnd()}`);
  });

  backendProcess.on("exit", (code, signal) => {
    logDesktop("warn", `Backend encerrou. code=${code ?? "null"} signal=${signal ?? "null"}`);
  });

  backendProcess.on("error", (error) => {
    logDesktop("error", `Falha ao iniciar backend: ${error.message}`);
  });

  setBackendStatus(`Backend iniciando em ${selectedApiUrl}`);
  await waitForBackendReady(backendPort, BACKEND_START_TIMEOUT_SEC);
  setBackendStatus(`Backend online em ${selectedApiUrl}`);
  logDesktop("info", `Backend pronto em ${selectedApiUrl}`);
}

async function showBackendErrorAndQuit(error) {
  const message = error instanceof Error ? error.message : String(error);
  const detail = `${message}\n\nLogs: ${logsDir}`;
  logDesktop("error", detail);

  const result = await dialog.showMessageBox({
    type: "error",
    title: PRODUCT_NAME,
    message: "Nao foi possivel iniciar o backend local do Operion.",
    detail,
    buttons: ["Abrir pasta de logs", "Fechar"],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    await shell.openPath(logsDir);
  }

  isQuitting = true;
  await stopEmbeddedBackend();
  app.quit();
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function openLogsFolder() {
  if (!logsDir) {
    return;
  }

  shell.openPath(logsDir).catch((error) => {
    logDesktop("warn", `Falha ao abrir pasta de logs: ${error.message}`);
  });
}

function isFallbackPageUrl(url) {
  if (!url) {
    return false;
  }

  return url.includes("/desktop/fallback/error.html") || url.includes("\\desktop\\fallback\\error.html");
}

async function loadRendererFallback(reason, details) {
  if (!mainWindow || mainWindow.isDestroyed() || rendererFallbackShown) {
    return;
  }

  rendererFallbackShown = true;
  const fallbackPath = path.join(__dirname, "fallback", "error.html");
  const detailText = `${reason}${details ? ` | ${details}` : ""}`;

  logDesktop("error", `Renderer fallback acionado: ${detailText}`);

  try {
    await mainWindow.loadFile(fallbackPath, {
      query: {
        reason,
        details: details || "",
        logsPath: logsDir,
      },
    });
    mainWindow.setTitle(PRODUCT_NAME);
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  } catch (error) {
    logDesktop("error", `Falha ao carregar fallback do renderer: ${error.message}`);
  }
}

function attachRendererObservers() {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logRenderer(level, message, sourceId, line);
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || isFallbackPageUrl(validatedURL)) {
        return;
      }

      const details = `code=${errorCode} desc=${errorDescription} url=${validatedURL}`;
      loadRendererFallback("Operion nao conseguiu carregar a interface.", details);
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    const reason = details?.reason || "unknown";
    const exitCode = details?.exitCode ?? "null";
    loadRendererFallback(
      "O processo de interface foi encerrado inesperadamente.",
      `reason=${reason} exitCode=${exitCode}`,
    );
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.setTitle(PRODUCT_NAME);
    logDesktop("info", `Renderer carregado: ${mainWindow.webContents.getURL()}`);
  });
}

function resolveIndexHtmlPath() {
  return path.join(app.getAppPath(), "dist", "index.html");
}

function createMainWindow() {
  const iconPath = resolveIconPath();
  const preloadPath = path.join(__dirname, "preload.cjs");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: PRODUCT_NAME,
    icon: iconPath || undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  rendererFallbackShown = false;
  attachRendererObservers();
  registerApiUrlRewrite(mainWindow.webContents.session);

  const indexHtml = resolveIndexHtmlPath();
  mainWindow.loadFile(indexHtml).catch((error) => {
    loadRendererFallback("Operion nao conseguiu carregar a interface.", error.message);
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (DEBUG_MODE) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }

    mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showSystemNotification(title, body) {
  try {
    if (!Notification.isSupported()) {
      return;
    }

    const iconPath = resolveIconPath();
    const payload = { title, body, silent: false };
    if (iconPath) {
      payload.icon = iconPath;
    }

    new Notification(payload).show();
  } catch (error) {
    logDesktop("warn", `Falha ao mostrar notificacao: ${error.message}`);
  }
}

function checkForUpdatesSafe() {
  if (!app.isPackaged) {
    setUpdateStatus("Auto-update ativo apenas no app instalado");
    return;
  }

  autoUpdater
    .checkForUpdates()
    .then(() => {
      logDesktop("info", "Checagem de update iniciada");
    })
    .catch((error) => {
      logDesktop("warn", `Falha ao checar update (app segue offline): ${error.message}`);
      if (!updateDownloaded) {
        setUpdateStatus("Sem conexao para update (app segue offline)");
      }
    });
}

function applyUpdateNow() {
  if (!updateDownloaded) {
    return;
  }

  try {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  } catch (error) {
    logDesktop("error", `Falha ao aplicar update: ${error.message}`);
  }
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = installUpdateOnQuit;

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus("Verificando atualizacoes...");
  });

  autoUpdater.on("update-available", (info) => {
    updateDownloaded = false;
    setUpdateStatus("Atualizacao pendente (baixando em background)");
    showSystemNotification("Operion", `Atualizacao ${info.version} disponivel.`);
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent || 0);
    setUpdateStatus(`Atualizacao pendente (${percent}% baixado)`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    setUpdateStatus("Pronto para instalar ao reiniciar");
    showSystemNotification(
      "Operion",
      `Atualizacao ${info.version} pronta. Reinicie para aplicar.`,
    );
  });

  autoUpdater.on("update-not-available", () => {
    if (!updateDownloaded) {
      setUpdateStatus("Sem atualizacoes disponiveis");
    }
  });

  autoUpdater.on("error", (error) => {
    logDesktop("warn", `Erro no auto-update: ${error.message}`);
    if (!updateDownloaded) {
      setUpdateStatus("Nao foi possivel checar update (app segue offline)");
    }
  });
}

function buildTrayMenuTemplate() {
  return [
    {
      label: "Open Operion",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: backendStatusText,
      enabled: false,
    },
    {
      label: `Atualizacao: ${updateStatusText}`,
      enabled: false,
    },
    {
      label: "Verificar atualizacoes agora",
      click: () => checkForUpdatesSafe(),
    },
    {
      label: "Reiniciar e atualizar agora",
      enabled: updateDownloaded,
      click: () => applyUpdateNow(),
    },
    {
      label: "Atualizar ao fechar",
      type: "checkbox",
      checked: installUpdateOnQuit,
      click: (menuItem) => {
        installUpdateOnQuit = menuItem.checked;
        autoUpdater.autoInstallOnAppQuit = installUpdateOnQuit;
      },
    },
    {
      label: "Abrir pasta de logs",
      click: () => openLogsFolder(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: async () => {
        if (updateDownloaded && installUpdateOnQuit) {
          applyUpdateNow();
          return;
        }

        isQuitting = true;
        await stopEmbeddedBackend();
        app.quit();
      },
    },
  ];
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setToolTip(`${PRODUCT_NAME} - ${SLOGAN}`);
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()));
}

function createTray() {
  const iconPath = resolveIconPath();
  const trayImage = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(trayImage);
  refreshTrayMenu();

  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
}

app.whenReady().then(async () => {
  initLogging();
  logDesktop("info", "Operion desktop iniciado");
  if (DEBUG_MODE) {
    logDesktop("info", "OPERION_DEBUG=1 ativo: DevTools sera aberto automaticamente.");
  }

  createTray();
  setBackendStatus("Backend inicializando...");

  try {
    await startEmbeddedBackend();
  } catch (error) {
    await showBackendErrorAndQuit(error);
    return;
  }

  createMainWindow();
  configureAutoUpdater();

  setTimeout(() => {
    checkForUpdatesSafe();
  }, 2500);

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  stopEmbeddedBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  logDesktop("error", `uncaughtException: ${error.message}`);
});

process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.message : String(error);
  logDesktop("error", `unhandledRejection: ${message}`);
});
