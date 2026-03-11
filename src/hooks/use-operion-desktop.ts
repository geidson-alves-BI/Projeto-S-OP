import { useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/api";
import { DEFAULT_UPDATER_STATUS, getUpdaterProgress } from "@/lib/updater";
import type { DesktopBridge, OperionConfig, OperionUpdaterBridge, OperionUpdaterStatus } from "@/types/desktop";

type OperionDesktopStatus = {
  appVersion: string;
  backendUrl: string;
  config: OperionConfig;
  updaterStatus: OperionUpdaterStatus;
  currentVersion: string;
  availableVersion: string;
  progressValue: number;
  isDesktop: boolean;
  desktopBridge?: DesktopBridge;
  updaterBridge?: OperionUpdaterBridge;
};

function getDefaultConfig(): OperionConfig {
  if (window.__OPERION_CONFIG__) {
    return window.__OPERION_CONFIG__;
  }

  try {
    return {
      apiUrl: API_URL,
      backendPort: Number(new URL(API_URL).port || 80),
    };
  } catch {
    return {
      apiUrl: API_URL,
      backendPort: 8000,
    };
  }
}

export function useOperionDesktopStatus(): OperionDesktopStatus {
  const [appVersion, setAppVersion] = useState<string>("n/a");
  const [updaterStatus, setUpdaterStatus] = useState<OperionUpdaterStatus>(DEFAULT_UPDATER_STATUS);

  const desktopBridge = typeof window !== "undefined" ? window.desktop : undefined;
  const updaterBridge = typeof window !== "undefined" ? window.__OPERION_UPDATER__ : undefined;
  const config = useMemo(
    () => (typeof window !== "undefined" ? getDefaultConfig() : { apiUrl: API_URL, backendPort: 8000 }),
    [],
  );

  useEffect(() => {
    let active = true;

    if (desktopBridge?.getVersion) {
      desktopBridge
        .getVersion()
        .then((version) => {
          if (active) {
            setAppVersion(version);
          }
        })
        .catch(() => {
          if (active) {
            setAppVersion("n/a");
          }
        });
    } else {
      setAppVersion("web");
    }

    if (!updaterBridge) {
      setUpdaterStatus({
        ...DEFAULT_UPDATER_STATUS,
        phase: "disabled",
        status: "disabled",
        message: "Updater indisponivel no ambiente atual",
      });
      return () => {
        active = false;
      };
    }

    let unsubscribe = () => {};

    updaterBridge
      .getStatus()
      .then((status) => {
        if (active) {
          setUpdaterStatus(status);
          if (status.currentVersion) {
            setAppVersion(status.currentVersion);
          }
        }
      })
      .catch((error) => {
        if (active) {
          setUpdaterStatus({
            ...DEFAULT_UPDATER_STATUS,
            phase: "error",
            status: "error",
            message: error instanceof Error ? error.message : String(error),
            lastError: error instanceof Error ? error.message : String(error),
          });
        }
      });

    unsubscribe = updaterBridge.onStatus((status) => {
      if (active) {
        setUpdaterStatus(status);
        if (status.currentVersion) {
          setAppVersion(status.currentVersion);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktopBridge, updaterBridge]);

  return useMemo(
    () => ({
      appVersion,
      backendUrl: config.apiUrl,
      config,
      updaterStatus,
      currentVersion: updaterStatus.currentVersion ?? updaterStatus.appVersion ?? appVersion ?? "n/a",
      availableVersion: updaterStatus.availableVersion ?? updaterStatus.version ?? "n/a",
      progressValue: getUpdaterProgress(updaterStatus),
      isDesktop: Boolean(desktopBridge),
      desktopBridge,
      updaterBridge,
    }),
    [appVersion, config, desktopBridge, updaterBridge, updaterStatus],
  );
}
