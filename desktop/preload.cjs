const { contextBridge } = require("electron");

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
