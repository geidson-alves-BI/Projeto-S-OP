export {};

type OperionUpdaterStatus = {
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

type OperionUpdaterActionResult = {
  ok: boolean;
  message: string;
};

type OperionUpdaterBridge = {
  getStatus: () => Promise<OperionUpdaterStatus>;
  checkNow: () => Promise<OperionUpdaterActionResult>;
  installNow: () => Promise<OperionUpdaterActionResult>;
  copyDiagnostic: () => Promise<OperionUpdaterActionResult>;
  setInstallOnQuit: (enabled: boolean) => Promise<OperionUpdaterActionResult>;
  onStatus: (callback: (status: OperionUpdaterStatus) => void) => () => void;
};

type DesktopBridge = {
  getVersion: () => Promise<string>;
  openLogs: () => Promise<void>;
  installNow: () => Promise<OperionUpdaterActionResult>;
};

declare global {
  interface Window {
    __OPERION_CONFIG__?: {
      apiUrl: string;
      backendPort: number;
    };
    __OPERION_UPDATER__?: OperionUpdaterBridge;
    desktop?: DesktopBridge;
  }
}
