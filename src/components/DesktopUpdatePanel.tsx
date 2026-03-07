import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UpdatePanelStatus = {
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

const DEFAULT_STATUS: UpdatePanelStatus = {
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

function getUpdaterBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__OPERION_UPDATER__;
}

function getDesktopBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.desktop;
}

function getPhaseLabel(status: UpdatePanelStatus) {
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

function getPhaseAccent(status: UpdatePanelStatus) {
  if (status.installedMessage || status.installReady) return "border-success/40 bg-success/10";
  if (status.downloading || status.available) return "border-warning/40 bg-warning/10";
  if (status.phase === "error") return "border-destructive/40 bg-destructive/10";
  return "border-border bg-muted/20";
}

export default function DesktopUpdatePanel() {
  const updater = getUpdaterBridge();
  const desktop = getDesktopBridge();
  const [status, setStatus] = useState<UpdatePanelStatus>(DEFAULT_STATUS);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!updater) {
      return;
    }

    let active = true;
    let unsubscribe = () => {};

    updater
      .getStatus()
      .then((payload) => {
        if (active) {
          setStatus(payload);
        }
      })
      .catch((error) => {
        if (active) {
          setActionMessage(error instanceof Error ? error.message : String(error));
        }
      });

    unsubscribe = updater.onStatus((payload) => {
      if (active) {
        setStatus(payload);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [updater]);

  if (!updater || !status.isPackaged) {
    return null;
  }

  const progressValue = Math.max(
    0,
    Math.min(100, Math.round(status.progressPercent ?? status.percent ?? 0)),
  );
  const currentVersion = status.currentVersion ?? status.appVersion ?? "n/a";
  const availableVersion = status.availableVersion ?? status.version ?? "n/a";

  const checkNow = async () => {
    try {
      setActionBusy(true);
      const result = await updater.checkNow();
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  };

  const installNow = async () => {
    if (!desktop?.installNow) {
      setActionMessage("Instalacao manual disponivel apenas no app desktop.");
      return;
    }

    try {
      setActionBusy(true);
      const result = await desktop.installNow();
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[380px] rounded-lg border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-mono font-semibold text-foreground">Atualizacoes do Operion</p>
          <div className="flex items-center gap-2">
            {status.installReady && (
              <span className="rounded border border-success/40 bg-success/10 px-2 py-1 text-[10px] font-mono uppercase text-success">
                Pronto
              </span>
            )}
            <span className={`rounded border px-2 py-1 text-[10px] font-mono uppercase ${getPhaseAccent(status)}`}>
              {getPhaseLabel(status)}
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-xs font-mono">
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Versao atual instalada:</span> {currentVersion}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Ultima versao encontrada:</span> {availableVersion}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Status atual:</span> {status.message}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Progresso do download:</span> {progressValue}%
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Instalar ao fechar:</span> {status.willInstallOnQuit ? "Ativo" : "Inativo"}
          </div>
        </div>

        {status.installedMessage && (
          <div className="rounded border border-success/40 bg-success/10 px-3 py-2">
            <p className="text-xs font-mono font-semibold text-success">{status.installedMessage}</p>
          </div>
        )}

        {status.available && !status.installReady && (
          <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2">
            <p className="text-xs font-mono font-semibold text-warning">Atualizacao disponivel</p>
            <p className="mt-1 text-xs font-mono text-foreground">{status.message}</p>
          </div>
        )}

        {(status.downloading || status.installReady) && (
          <div className="rounded border border-border bg-muted/20 px-3 py-3">
            <div className="flex items-center justify-between gap-2 text-xs font-mono">
              <span className="text-foreground">
                {status.installReady ? "Download concluido" : "Baixando atualizacao..."}
              </span>
              <span className={status.installReady ? "text-success" : "text-primary"}>{progressValue}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-border/60">
              <div
                className={`h-full rounded-full transition-all ${status.installReady ? "bg-success" : "bg-primary"}`}
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
        )}

        {status.installReady && (
          <div className="rounded border border-success/40 bg-success/10 px-3 py-3">
            <p className="text-xs font-mono font-semibold text-success">
              Atualizacao baixada. Feche o app para instalar.
            </p>
            <p className="mt-1 text-xs font-mono text-foreground">
              O Operion vai aplicar a nova versao ao fechar. Se preferir, use o botao manual abaixo.
            </p>
          </div>
        )}

        {!status.available && !status.downloading && !status.installReady && !status.installedMessage && (
          <p className="text-sm font-mono text-foreground">{status.message}</p>
        )}

        {status.lastError && <p className="text-xs font-mono text-destructive">{status.lastError}</p>}
        {actionMessage && <p className="text-xs font-mono text-muted-foreground">{actionMessage}</p>}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="font-mono text-xs" onClick={checkNow} disabled={actionBusy}>
            Verificar atualizacoes agora
          </Button>
          <Button
            size="sm"
            className="font-mono text-xs"
            onClick={installNow}
            disabled={actionBusy || !status.installReady}
          >
            Reiniciar e atualizar
          </Button>
        </div>
      </div>
    </aside>
  );
}
