export {};

type OperionUpdaterStatus = {
  phase: string;
  message: string;
  percent: number;
  version: string | null;
  availableVersion: string | null;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  updateDownloaded: boolean;
  installUpdateOnQuit: boolean;
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
  setInstallOnQuit: (enabled: boolean) => Promise<OperionUpdaterActionResult>;
  onStatus: (callback: (status: OperionUpdaterStatus) => void) => () => void;
};

type DesktopBridge = {
  getVersion: () => Promise<string>;
  openLogs: () => Promise<void>;
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
