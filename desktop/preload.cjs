const { contextBridge, ipcRenderer } = require("electron");

function parseBackendPort(apiUrl) {
  try {
    const url = new URL(apiUrl);
    return Number(url.port || 80);
  } catch (_error) {
    return 8000;
  }
}

const apiUrl = process.env.OPERION_API_URL || "http://127.0.0.1:8000";

contextBridge.exposeInMainWorld(
  "__OPERION_CONFIG__",
  Object.freeze({
    apiUrl,
    backendPort: parseBackendPort(apiUrl),
  }),
);

contextBridge.exposeInMainWorld(
  "__OPERION_UPDATER__",
  Object.freeze({
    getStatus: () => ipcRenderer.invoke("operion-updater:get-status"),
    checkNow: () => ipcRenderer.invoke("operion-updater:check-now"),
    installNow: () => ipcRenderer.invoke("operion-updater:install-now"),
    copyDiagnostic: () => ipcRenderer.invoke("operion-updater:copy-diagnostic"),
    setInstallOnQuit: (enabled) =>
      ipcRenderer.invoke("operion-updater:set-install-on-quit", Boolean(enabled)),
    onStatus: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }

      const listener = (_event, payload) => {
        callback(payload);
      };

      ipcRenderer.on("operion-updater:status", listener);
      return () => {
        ipcRenderer.removeListener("operion-updater:status", listener);
      };
    },
  }),
);

contextBridge.exposeInMainWorld(
  "desktop",
  Object.freeze({
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
    openLogs: () => ipcRenderer.invoke("app:openLogs"),
  }),
);
