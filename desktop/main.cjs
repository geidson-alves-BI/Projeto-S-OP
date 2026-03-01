const { app, BrowserWindow, Menu, Notification, Tray, nativeImage } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

const PRODUCT_NAME = "Operion";
const SLOGAN = "Operational Intelligence Platform";

let mainWindow = null;
let tray = null;
let isQuitting = false;
let updateDownloaded = false;
let installUpdateOnQuit = true;
let updateStatusText = "Sem verificacao de atualizacao";
let logFilePath = null;

function initDesktopLog() {
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  logFilePath = path.join(logDir, "desktop.log");
}

function logDesktop(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  console.log(line);

  if (!logFilePath) {
    return;
  }

  try {
    fs.appendFileSync(logFilePath, `${line}\n`, "utf8");
  } catch (error) {
    console.error("Falha ao gravar log local:", error);
  }
}

function setUpdateStatus(message) {
  updateStatusText = message;
  refreshTrayMenu();
}

function showSystemNotification(title, body) {
  try {
    if (!Notification.isSupported()) {
      return;
    }

    const iconPath = resolveIconPath();
    const payload = {
      title,
      body,
      silent: false,
    };

    if (iconPath) {
      payload.icon = iconPath;
    }

    new Notification(payload).show();
  } catch (error) {
    logDesktop("warn", `Falha ao mostrar notificacao: ${error.message}`);
  }
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

function createMainWindow() {
  const iconPath = resolveIconPath();

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  mainWindow.loadFile(indexHtml);

  mainWindow.once("ready-to-show", () => {
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

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
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

function applyUpdateNow() {
  if (!updateDownloaded) {
    return;
  }

  try {
    isQuitting = true;
    logDesktop("info", "Aplicando atualizacao via quitAndInstall()");
    autoUpdater.quitAndInstall();
  } catch (error) {
    logDesktop("error", `Falha ao aplicar atualizacao: ${error.message}`);
  }
}

function checkForUpdatesSafe() {
  if (!app.isPackaged) {
    logDesktop("info", "Auto-update ignorado em ambiente nao empacotado");
    setUpdateStatus("Auto-update ativo apenas no app instalado");
    return;
  }

  autoUpdater
    .checkForUpdates()
    .then(() => {
      logDesktop("info", "Checagem de atualizacao iniciada");
    })
    .catch((error) => {
      logDesktop("warn", `Sem atualizacao agora (offline ou sem release): ${error.message}`);
      if (!updateDownloaded) {
        setUpdateStatus("Sem conexao para update (app segue offline)");
      }
    });
}

function buildTrayMenuTemplate() {
  return [
    {
      label: "Open Operion",
      click: () => showMainWindow(),
    },
    {
      type: "separator",
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
        logDesktop(
          "info",
          `Atualizar ao fechar: ${installUpdateOnQuit ? "habilitado" : "desabilitado"}`,
        );
        refreshTrayMenu();
      },
    },
    {
      type: "separator",
    },
    {
      label: "Quit",
      click: () => {
        if (updateDownloaded && installUpdateOnQuit) {
          applyUpdateNow();
          return;
        }

        isQuitting = true;
        app.quit();
      },
    },
  ];
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setToolTip(`${PRODUCT_NAME} - ${SLOGAN}\n${updateStatusText}`);
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()));
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = installUpdateOnQuit;

  autoUpdater.on("checking-for-update", () => {
    logDesktop("info", "Verificando atualizacoes...");
    setUpdateStatus("Verificando atualizacoes...");
  });

  autoUpdater.on("update-available", (info) => {
    updateDownloaded = false;
    logDesktop("info", `Atualizacao disponivel: ${info.version}`);
    setUpdateStatus("Atualizacao pendente (baixando em background)");
    showSystemNotification("Operion", "Atualizacao pendente. Download iniciado em background.");
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent || 0);
    setUpdateStatus(`Atualizacao pendente (${percent}% baixado)`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    logDesktop("info", `Atualizacao pronta para instalar: ${info.version}`);
    setUpdateStatus("Pronto para instalar ao reiniciar");
    showSystemNotification(
      "Operion",
      "Atualizacao pronta. Reinicie o app para aplicar a nova versao.",
    );
  });

  autoUpdater.on("update-not-available", () => {
    logDesktop("info", "Nenhuma atualizacao disponivel");
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

function createTray() {
  const iconPath = resolveIconPath();
  const trayImage = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(trayImage);
  refreshTrayMenu();
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
}

app.whenReady().then(() => {
  initDesktopLog();
  logDesktop("info", "Aplicativo desktop iniciado");

  createMainWindow();
  createTray();
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
  logDesktop("info", "Aplicativo encerrando");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  logDesktop("error", `uncaughtException: ${error.message}`);
});
