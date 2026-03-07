import type { OperionUpdaterStatus } from "@/types/desktop";

export const DEFAULT_UPDATER_STATUS: OperionUpdaterStatus = {
  phase: "idle",
  status: "idle",
  message: "Sem verificacao de atualizacao",
  percent: 0,
  progressPercent: 0,
  version: null,
  currentVersion: null,
  availableVersion: null,
  available: false,
  downloading: false,
  downloaded: false,
  installReady: false,
  updateDownloaded: false,
  installUpdateOnQuit: true,
  willInstallOnQuit: true,
  appVersion: "",
  isPackaged: false,
  lastError: null,
  installedVersion: null,
  installedMessage: null,
};

export function getUpdaterProgress(status: OperionUpdaterStatus) {
  return Math.max(0, Math.min(100, Math.round(status.progressPercent ?? status.percent ?? 0)));
}

export function getUpdaterPhaseLabel(status: OperionUpdaterStatus) {
  if (status.installedMessage) return "Atualizacao instalada";
  if (status.installReady) return "Pronta para instalar";
  if (status.phase === "checking") return "Verificando atualizacao";
  if (status.downloading) return "Baixando atualizacao";
  if (status.available) return "Atualizacao disponivel";
  if (status.phase === "up-to-date") return "Sem atualizacoes";
  if (status.phase === "error") return "Falha no updater";
  if (status.phase === "disabled") return "Updater indisponivel";
  return "Updater";
}

export function getUpdaterPhaseAccent(status: OperionUpdaterStatus) {
  if (status.installedMessage || status.installReady) return "border-success/40 bg-success/10 text-success";
  if (status.downloading || status.available) return "border-warning/40 bg-warning/10 text-warning";
  if (status.phase === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-border bg-muted/20 text-muted-foreground";
}

export function hasUpdaterAttention(status: OperionUpdaterStatus) {
  return Boolean(status.available || status.downloading || status.installReady);
}
