const { app, BrowserWindow, Menu, Tray, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");

const PRODUCT_NAME = "Operion";
const SLOGAN = "Operational Intelligence Platform";

let mainWindow = null;
let tray = null;
let isQuitting = false;

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

function createTray() {
  const iconPath = resolveIconPath();
  const trayImage = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(trayImage);
  tray.setToolTip(`${PRODUCT_NAME} - ${SLOGAN}`);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Operion",
      click: () => showMainWindow(),
    },
    {
      type: "separator",
    },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
}

app.whenReady().then(() => {
  createMainWindow();
  createTray();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
