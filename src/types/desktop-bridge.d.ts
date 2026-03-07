import type { DesktopBridge, OperionConfig, OperionUpdaterBridge } from "./desktop";

export {};

declare global {
  interface Window {
    __OPERION_CONFIG__?: OperionConfig;
    __OPERION_UPDATER__?: OperionUpdaterBridge;
    desktop?: DesktopBridge;
  }
}
