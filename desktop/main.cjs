const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  Tray,
  dialog,
  nativeImage,
  shell,
  clipboard,
  autoUpdater: nativeAutoUpdater,
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

let installUpdateOnQuit = true;
let lastDownloadProgressLogged = -1;
let applyingUpdateOnQuitLogged = false;

const DEFAULT_UPDATE_MESSAGE = "Sem verificacao de atualizacao";
const RELEVANT_UPDATER_LOG_PATTERN =
  /(app version on startup|app relaunched version|checking-for-update|update-available|download-progress|update-downloaded|will-install-on-quit|before-quit-for-update|quitAndInstall called|update-not-available|erro no auto-update|checando atualizacoes|atualizacao instalada|reopened-old-version)/i;

function createInitialUpdateState() {
  return {
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloading: false,
    downloaded: false,
    progressPercent: 0,
    installReady: false,
    available: false,
    phase: "idle",
    message: DEFAULT_UPDATE_MESSAGE,
    lastError: null,
    installedVersion: null,
    installedMessage: null,
  };
}

let updateState = createInitialUpdateState();

let logsDir = "";
let desktopLogPath = "";
let backendLogPath = "";
let rendererLogPath = "";
let rendererFallbackShown = false;
let updaterStatePath = "";
const DEFAULT_PERSISTED_UPDATER_STATE = {
  pendingInstallVersion: null,
  previousAppVersion: null,
  lastInstalledVersion: null,
  lastDetectedVersion: null,
  currentVersion: null,
  availableVersion: null,
  downloading: false,
  downloaded: false,
  progressPercent: 0,
  installReady: false,
  lastPhase: "idle",
  lastMessage: DEFAULT_UPDATE_MESSAGE,
  lastError: null,
};
let persistedUpdaterState = { ...DEFAULT_PERSISTED_UPDATER_STATE };

function initLogging() {
  logsDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  desktopLogPath = path.join(logsDir, "desktop.log");
  backendLogPath = path.join(logsDir, "backend.log");
  rendererLogPath = path.join(logsDir, "renderer.log");
  updaterStatePath = path.join(app.getPath("userData"), "updater-state.json");
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

function syncCurrentVersionState() {
  updateState.currentVersion = app.getVersion();
}

function loadPersistedUpdaterState() {
  if (!updaterStatePath || !fs.existsSync(updaterStatePath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(updaterStatePath, "utf8");
    const parsed = JSON.parse(raw);
    persistedUpdaterState = {
      ...DEFAULT_PERSISTED_UPDATER_STATE,
      ...parsed,
    };
  } catch (error) {
    logDesktop("warn", `Falha ao ler updater-state.json: ${error.message}`);
  }
}

function savePersistedUpdaterState() {
  if (!updaterStatePath) {
    return;
  }

  try {
    fs.writeFileSync(updaterStatePath, JSON.stringify(persistedUpdaterState, null, 2), "utf8");
  } catch (error) {
    logDesktop("warn", `Falha ao gravar updater-state.json: ${error.message}`);
  }
}

function persistUpdateSnapshot() {
  syncCurrentVersionState();
  persistedUpdaterState.currentVersion = updateState.currentVersion;
  persistedUpdaterState.availableVersion = updateState.availableVersion;
  persistedUpdaterState.lastDetectedVersion =
    updateState.availableVersion || persistedUpdaterState.lastDetectedVersion;
  persistedUpdaterState.downloading = updateState.downloading;
  persistedUpdaterState.downloaded = updateState.downloaded;
  persistedUpdaterState.progressPercent = updateState.progressPercent;
  persistedUpdaterState.installReady = updateState.installReady;
  persistedUpdaterState.lastPhase = updateState.phase;
  persistedUpdaterState.lastMessage = updateState.message;
  persistedUpdaterState.lastError = updateState.lastError;
  savePersistedUpdaterState();
}

function rememberDownloadedVersion(version) {
  const normalizedVersion = version || updateState.availableVersion || null;
  persistedUpdaterState.pendingInstallVersion = normalizedVersion;
  persistedUpdaterState.previousAppVersion = app.getVersion();
  persistedUpdaterState.availableVersion = normalizedVersion;
  persistedUpdaterState.lastDetectedVersion = normalizedVersion;
  persistedUpdaterState.downloaded = true;
  persistedUpdaterState.installReady = true;
  persistedUpdaterState.progressPercent = 100;
  savePersistedUpdaterState();
}

function detectInstalledUpdateOnStartup() {
  syncCurrentVersionState();
  const currentVersion = updateState.currentVersion;
  const { pendingInstallVersion, previousAppVersion, lastDetectedVersion } = persistedUpdaterState;
  const expectedVersion = pendingInstallVersion || lastDetectedVersion;

  if (previousAppVersion) {
    logDesktop("info", `app relaunched version=${currentVersion}`);
  }

  if (
    expectedVersion &&
    previousAppVersion &&
    expectedVersion === currentVersion &&
    previousAppVersion !== currentVersion
  ) {
    updateState = {
      ...updateState,
      currentVersion,
      availableVersion: currentVersion,
      available: false,
      downloading: false,
      downloaded: false,
      progressPercent: 100,
      installReady: false,
      phase: "installed",
      message: "Atualizacao instalada",
      lastError: null,
      installedVersion: currentVersion,
      installedMessage: `Atualizado com sucesso para versao ${currentVersion}`,
    };
    persistedUpdaterState.lastInstalledVersion = currentVersion;
    persistedUpdaterState.pendingInstallVersion = null;
    persistedUpdaterState.previousAppVersion = null;
    persistedUpdaterState.availableVersion = currentVersion;
    persistedUpdaterState.lastDetectedVersion = currentVersion;
    persistUpdateSnapshot();
    logDesktop("info", `Update aplicado com sucesso na inicializacao. version=${currentVersion}`);
    return;
  }

  if (
    expectedVersion &&
    previousAppVersion &&
    previousAppVersion === currentVersion &&
    expectedVersion !== currentVersion
  ) {
    updateState = {
      ...updateState,
      currentVersion,
      availableVersion: expectedVersion,
      available: true,
      downloading: false,
      downloaded: Boolean(persistedUpdaterState.downloaded),
      progressPercent: persistedUpdaterState.progressPercent || 0,
      installReady: Boolean(persistedUpdaterState.installReady),
      phase: persistedUpdaterState.installReady ? "pending-install" : persistedUpdaterState.lastPhase,
      message: persistedUpdaterState.installReady
        ? "Atualizacao baixada anteriormente. Feche o app para instalar."
        : persistedUpdaterState.lastMessage,
      lastError: persistedUpdaterState.lastError,
      installedVersion: persistedUpdaterState.lastInstalledVersion,
      installedMessage: null,
    };
    persistUpdateSnapshot();
    logDesktop("warn", `reopened-old-version current=${currentVersion} expected=${expectedVersion}`);
    return;
  }

  persistUpdateSnapshot();
}

function getRecentUpdaterLogLines(limit = 25) {
  if (!desktopLogPath || !fs.existsSync(desktopLogPath)) {
    return [];
  }

  try {
    const lines = fs.readFileSync(desktopLogPath, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.filter((line) => RELEVANT_UPDATER_LOG_PATTERN.test(line)).slice(-limit);
  } catch (error) {
    logDesktop("warn", `Falha ao ler desktop.log para diagnostico: ${error.message}`);
    return [];
  }
}

function buildUpdaterDiagnosticText() {
  const payload = getUpdateStatePayload();
  const lines = [
    "Operion Updater Diagnostic",
    `currentVersion: ${payload.currentVersion ?? "n/a"}`,
    `availableVersion: ${payload.availableVersion ?? "n/a"}`,
    `status: ${payload.phase}`,
    `message: ${payload.message || "n/a"}`,
    `progressPercent: ${payload.progressPercent}%`,
    `downloading: ${payload.downloading}`,
    `downloaded: ${payload.downloaded}`,
    `installReady: ${payload.installReady}`,
    `willInstallOnQuit: ${payload.willInstallOnQuit}`,
    `installedVersion: ${payload.installedVersion ?? "n/a"}`,
    `lastError: ${payload.lastError ?? "n/a"}`,
    "",
    "recentUpdaterLogLines:",
  ];

  const relevantLogLines = getRecentUpdaterLogLines();
  if (relevantLogLines.length === 0) {
    lines.push("<sem linhas relevantes no desktop.log>");
  } else {
    lines.push(...relevantLogLines);
  }

  return lines.join("\n");
}

function markApplyingUpdateOnQuit(trigger = "unknown") {
  if (updateState.installReady && installUpdateOnQuit && !applyingUpdateOnQuitLogged) {
    applyingUpdateOnQuitLogged = true;
    logDesktop("info", "will-install-on-quit=true");
    logDesktop(
      "info",
      `Aplicando atualizacao ao fechar. trigger=${trigger} version=${updateState.availableVersion || "unknown"}`,
    );
  }
}

function getUpdateStatePayload() {
  syncCurrentVersionState();
  return {
    phase: updateState.phase,
    status: updateState.phase,
    message: updateState.message,
    percent: updateState.progressPercent,
    progressPercent: updateState.progressPercent,
    version: updateState.availableVersion,
    currentVersion: updateState.currentVersion,
    availableVersion: updateState.availableVersion,
    available: updateState.available,
    downloading: updateState.downloading,
    downloaded: updateState.downloaded,
    installReady: updateState.installReady,
    updateDownloaded: updateState.downloaded,
    installUpdateOnQuit,
    willInstallOnQuit: updateState.installReady && installUpdateOnQuit,
    appVersion: updateState.currentVersion,
    isPackaged: app.isPackaged,
    lastError: updateState.lastError,
    installedVersion: updateState.installedVersion,
    installedMessage: updateState.installedMessage,
  };
}

function broadcastUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("operion-updater:status", getUpdateStatePayload());
  }

  refreshTrayMenu();
}

function setUpdateStatus(message, options = {}) {
  syncCurrentVersionState();
  updateState.message = message;

  if (typeof options.phase === "string" && options.phase) {
    updateState.phase = options.phase;
  }

  if (
    typeof options.progressPercent === "number" &&
    Number.isFinite(options.progressPercent)
  ) {
    updateState.progressPercent = Math.max(
      0,
      Math.min(100, Math.round(options.progressPercent)),
    );
  } else if (typeof options.percent === "number" && Number.isFinite(options.percent)) {
    updateState.progressPercent = Math.max(0, Math.min(100, Math.round(options.percent)));
  }

  if (typeof options.available === "boolean") {
    updateState.available = options.available;
  }

  if (typeof options.downloading === "boolean") {
    updateState.downloading = options.downloading;
  }

  if (typeof options.downloaded === "boolean") {
    updateState.downloaded = options.downloaded;
  }

  if (Object.prototype.hasOwnProperty.call(options, "installReady")) {
    updateState.installReady = Boolean(options.installReady);
  } else if (Object.prototype.hasOwnProperty.call(options, "downloaded")) {
    updateState.installReady = Boolean(options.downloaded);
  }

  if (Object.prototype.hasOwnProperty.call(options, "currentVersion")) {
    updateState.currentVersion = options.currentVersion || app.getVersion();
  }

  if (Object.prototype.hasOwnProperty.call(options, "availableVersion")) {
    updateState.availableVersion = options.availableVersion || null;
  } else if (Object.prototype.hasOwnProperty.call(options, "version")) {
    updateState.availableVersion = options.version || null;
  }

  if (Object.prototype.hasOwnProperty.call(options, "error")) {
    updateState.lastError = options.error || null;
  }

  if (Object.prototype.hasOwnProperty.call(options, "installedVersion")) {
    updateState.installedVersion = options.installedVersion || null;
  }

  if (Object.prototype.hasOwnProperty.call(options, "installedMessage")) {
    updateState.installedMessage = options.installedMessage || null;
  }

  if (!updateState.downloaded) {
    updateState.installReady = false;
  }

  persistUpdateSnapshot();
  broadcastUpdateStatus();
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
    broadcastUpdateStatus();
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
      if (updateState.installReady && installUpdateOnQuit) {
        event.preventDefault();
        isQuitting = true;
        markApplyingUpdateOnQuit("window-close");
        setImmediate(() => {
          app.quit();
        });
        return;
      }

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

function checkForUpdatesSafe(trigger = "auto") {
  if (!app.isPackaged) {
    setUpdateStatus("Auto-update ativo apenas no app instalado", {
      phase: "disabled",
      progressPercent: 0,
      available: false,
      downloading: false,
      downloaded: false,
      installReady: false,
      availableVersion: null,
      error: null,
    });
    logDesktop("info", "Checagem de update ignorada em ambiente nao empacotado");
    return;
  }

  logDesktop("info", `Checando atualizacoes (${trigger})`);
  autoUpdater
    .checkForUpdates()
    .then(() => {
      logDesktop("info", "Checagem de update iniciada");
    })
    .catch((error) => {
      logDesktop("warn", `Falha ao checar update (app segue offline): ${error.message}`);
      if (!updateState.installReady) {
        setUpdateStatus("Sem conexao para update (app segue offline)", {
          phase: "error",
          error: error.message,
        });
      }
    });
}

function applyUpdateNow() {
  if (!updateState.installReady) {
    return;
  }

  try {
    setUpdateStatus("Atualizacao baixada. Reiniciando...", {
      phase: "installing",
      progressPercent: 100,
      available: true,
      downloading: false,
      downloaded: true,
      installReady: true,
      error: null,
    });
    isQuitting = true;
    markApplyingUpdateOnQuit("manual-install");
    logDesktop("info", "quitAndInstall called");
    autoUpdater.quitAndInstall();
  } catch (error) {
    logDesktop("error", `Falha ao aplicar update: ${error.message}`);
  }
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  installUpdateOnQuit = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (nativeAutoUpdater && typeof nativeAutoUpdater.on === "function") {
    nativeAutoUpdater.on("before-quit-for-update", () => {
      logDesktop("info", "before-quit-for-update");
      setUpdateStatus("Instalando atualizacao...", {
        phase: "installing",
        progressPercent: 100,
        available: true,
        downloading: false,
        downloaded: true,
        installReady: true,
        error: null,
      });
    });
  }

  autoUpdater.on("checking-for-update", () => {
    const preserveInstallReady = updateState.installReady;
    logDesktop("info", "checking-for-update");
    setUpdateStatus(
      preserveInstallReady
        ? "Atualizacao baixada. Feche o app para instalar."
        : "Verificando atualizacoes...",
      {
        phase: preserveInstallReady ? "pending-install" : "checking",
        progressPercent: preserveInstallReady ? 100 : 0,
        available: preserveInstallReady,
        downloading: false,
        downloaded: preserveInstallReady,
        installReady: preserveInstallReady,
        availableVersion: updateState.availableVersion,
        error: null,
      },
    );
  });

  autoUpdater.on("update-available", (info) => {
    applyingUpdateOnQuitLogged = false;
    lastDownloadProgressLogged = -1;
    setUpdateStatus("Atualizacao disponivel. Baixando...", {
      phase: "downloading",
      progressPercent: 0,
      available: true,
      downloading: true,
      downloaded: false,
      installReady: false,
      availableVersion: info?.version || null,
      installedVersion: null,
      installedMessage: null,
      error: null,
    });
    logDesktop("info", `update-available version=${info?.version || "unknown"}`);
    showSystemNotification("Operion", `Atualizacao ${info.version} disponivel.`);
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent || 0)));
    setUpdateStatus(`Baixando atualizacao... ${percent}%`, {
      phase: "downloading",
      progressPercent: percent,
      available: true,
      downloading: true,
      downloaded: false,
      installReady: false,
      error: null,
    });

    if (percent !== lastDownloadProgressLogged) {
      lastDownloadProgressLogged = percent;
      logDesktop("info", `download-progress percent=${percent}`);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    const downloadedVersion = info?.version || updateState.availableVersion;
    rememberDownloadedVersion(downloadedVersion);
    setUpdateStatus("Atualizacao baixada. Feche o app para instalar.", {
      phase: "downloaded",
      progressPercent: 100,
      available: true,
      downloading: false,
      downloaded: true,
      installReady: true,
      availableVersion: downloadedVersion,
      error: null,
    });
    logDesktop("info", `update-downloaded version=${downloadedVersion || "unknown"}`);
    logDesktop("info", "will-install-on-quit=true");
    showSystemNotification(
      "Operion",
      `Atualizacao ${info.version} baixada. Feche o app para instalar.`,
    );
  });

  autoUpdater.on("update-not-available", () => {
    if (!updateState.installReady) {
      setUpdateStatus("Sem atualizacoes disponiveis.", {
        phase: "up-to-date",
        progressPercent: 0,
        available: false,
        downloading: false,
        downloaded: false,
        installReady: false,
        availableVersion: null,
        error: null,
      });
    }

    logDesktop("info", "update-not-available");
  });

  autoUpdater.on("error", (error) => {
    logDesktop("warn", `Erro no auto-update: ${error.message}`);
    if (!updateState.installReady) {
      setUpdateStatus("Nao foi possivel atualizar agora. O app continua funcional.", {
        phase: "error",
        downloading: false,
        installReady: false,
        error: error.message,
      });
    }
  });
}

function registerUpdaterIpcHandlers() {
  const channels = [
    "operion-updater:get-status",
    "operion-updater:check-now",
    "operion-updater:install-now",
    "operion-updater:set-install-on-quit",
    "operion-updater:copy-diagnostic",
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle("operion-updater:get-status", async () => getUpdateStatePayload());

  ipcMain.handle("operion-updater:check-now", async () => {
    checkForUpdatesSafe("manual");
    return {
      ok: true,
      message: "Verificacao de atualizacoes iniciada.",
    };
  });

  ipcMain.handle("operion-updater:install-now", async () => {
    if (!updateState.installReady) {
      return {
        ok: false,
        message: "Nenhuma atualizacao baixada para instalar.",
      };
    }

    applyUpdateNow();
    return {
      ok: true,
      message: "Reiniciando para aplicar atualizacao.",
    };
  });

  ipcMain.handle("operion-updater:set-install-on-quit", async () => {
    installUpdateOnQuit = true;
    autoUpdater.autoInstallOnAppQuit = true;
    broadcastUpdateStatus();

    return {
      ok: true,
      message: "A instalacao automatica ao fechar permanece ativa para garantir o update.",
    };
  });

  ipcMain.handle("operion-updater:copy-diagnostic", async () => {
    const diagnostic = buildUpdaterDiagnosticText();
    clipboard.writeText(diagnostic);
    logDesktop("info", "Updater diagnostic copied to clipboard");

    return {
      ok: true,
      message: "Diagnostico do updater copiado.",
    };
  });
}

function registerAppIpcHandlers() {
  const channels = ["app:getVersion", "app:openLogs"];
  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle("app:getVersion", async () => app.getVersion());

  ipcMain.handle("app:openLogs", async () => {
    const logsPath = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logsPath, { recursive: true });
    const openResult = await shell.openPath(logsPath);
    if (openResult) {
      throw new Error(openResult);
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
      label: `Atualizacao: ${updateState.message}`,
      enabled: false,
    },
    {
      label: "Verificar atualizacoes agora",
      click: () => checkForUpdatesSafe("manual"),
    },
    {
      label: "Reiniciar e atualizar agora",
      enabled: updateState.installReady,
      click: () => applyUpdateNow(),
    },
    {
      label: "Atualizar ao fechar (ativo)",
      type: "checkbox",
      checked: installUpdateOnQuit,
      enabled: false,
    },
    {
      label: "Abrir pasta de logs",
      click: () => openLogsFolder(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: async () => {
        if (updateState.installReady && installUpdateOnQuit) {
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
  loadPersistedUpdaterState();
  logDesktop("info", `app version on startup=${app.getVersion()}`);
  detectInstalledUpdateOnStartup();
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

  configureAutoUpdater();
  registerUpdaterIpcHandlers();
  registerAppIpcHandlers();
  createMainWindow();

  setTimeout(() => {
    checkForUpdatesSafe("startup");
  }, 2500);

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (updateState.installReady) {
    logDesktop("info", "before-quit-for-update");
    markApplyingUpdateOnQuit("before-quit");
  }
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

