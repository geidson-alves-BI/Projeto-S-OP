import type { AIConnectionStatus, AIIntegrationProvider } from "./analytics";

export type OperionUpdaterStatus = {
  phase: string;
  status: string;
  message: string;
  percent: number;
  progressPercent: number;
  version: string | null;
  currentVersion: string | null;
  availableVersion: string | null;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  installReady: boolean;
  updateDownloaded: boolean;
  installUpdateOnQuit: boolean;
  willInstallOnQuit: boolean;
  appVersion: string;
  isPackaged: boolean;
  lastError: string | null;
  installedVersion: string | null;
  installedMessage: string | null;
};

export type OperionUpdaterActionResult = {
  ok: boolean;
  message: string;
};

export type OperionUpdaterBridge = {
  getStatus: () => Promise<OperionUpdaterStatus>;
  checkNow: () => Promise<OperionUpdaterActionResult>;
  installNow: () => Promise<OperionUpdaterActionResult>;
  copyDiagnostic: () => Promise<OperionUpdaterActionResult>;
  setInstallOnQuit: (enabled: boolean) => Promise<OperionUpdaterActionResult>;
  onStatus: (callback: (status: OperionUpdaterStatus) => void) => () => void;
};

export type DesktopBridge = {
  getVersion: () => Promise<string>;
  openLogs: () => Promise<void>;
  installNow: () => Promise<OperionUpdaterActionResult>;
};

export type OperionConfig = {
  apiUrl: string;
  backendPort: number;
};

export type OperionGeneralPreferences = {
  compactNavigation: boolean;
  prioritizeAlerts: boolean;
  showAITeaser: boolean;
};

export type OperionAIIntegrationSettings = {
  provider: AIIntegrationProvider;
  apiKey: string;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  model: string;
  providerActive: AIIntegrationProvider;
  modelActive: string;
  connectionStatus: AIConnectionStatus | null;
  usingEnvironmentKey: boolean;
  lastSavedAt: string | null;
  lastTestedAt: string | null;
  lastStatus: string | null;
};

export type OperionLocalSettings = {
  general: OperionGeneralPreferences;
  integrations: OperionAIIntegrationSettings;
};
