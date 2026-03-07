import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UpdatePanelStatus = {
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

const DEFAULT_STATUS: UpdatePanelStatus = {
  phase: "idle",
  message: "Sem verificacao de atualizacao",
  percent: 0,
  version: null,
  availableVersion: null,
  available: false,
  downloading: false,
  downloaded: false,
  updateDownloaded: false,
  installUpdateOnQuit: true,
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

function getPhaseLabel(status: UpdatePanelStatus) {
  if (status.installedMessage) return "Atualizacao instalada";
  if (status.phase === "checking") return "Verificando atualizacao...";
  if (status.downloaded) return "Atualizacao baixada";
  if (status.downloading) return "Baixando atualizacao";
  if (status.available) return "Atualizacao disponivel";
  if (status.phase === "up-to-date") return "Sem atualizacoes";
  if (status.phase === "error") return "Falha no updater";
  if (status.phase === "disabled") return "Updater indisponivel";
  return "Updater";
}

function getPhaseAccent(status: UpdatePanelStatus) {
  if (status.installedMessage || status.downloaded) return "border-success/40 bg-success/10";
  if (status.downloading || status.available) return "border-warning/40 bg-warning/10";
  if (status.phase === "error") return "border-destructive/40 bg-destructive/10";
  return "border-border bg-muted/20";
}

export default function DesktopUpdatePanel() {
  const updater = getUpdaterBridge();
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

  const progressValue = Math.max(0, Math.min(100, Math.round(status.percent || 0)));

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
    try {
      setActionBusy(true);
      const result = await updater.installNow();
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  };

  const toggleInstallOnQuit = async (enabled: boolean) => {
    try {
      const result = await updater.setInstallOnQuit(enabled);
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[380px] rounded-lg border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-mono font-semibold text-foreground">Atualizacoes do Operion</p>
          <span className={`rounded border px-2 py-1 text-[10px] font-mono uppercase ${getPhaseAccent(status)}`}>
            {getPhaseLabel(status)}
          </span>
        </div>

        <div className="grid gap-2 text-xs font-mono">
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Versao atual:</span> {status.appVersion}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Ultima versao encontrada:</span> {status.version ?? "n/a"}
          </div>
        </div>

        {status.installedMessage && (
          <div className="rounded border border-success/40 bg-success/10 px-3 py-2">
            <p className="text-xs font-mono font-semibold text-success">{status.installedMessage}</p>
          </div>
        )}

        {status.available && !status.downloaded && (
          <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2">
            <p className="text-xs font-mono font-semibold text-warning">Atualizacao disponivel</p>
            <p className="mt-1 text-xs font-mono text-foreground">{status.message}</p>
          </div>
        )}

        {status.downloading && (
          <div className="rounded border border-border bg-muted/20 px-3 py-3">
            <div className="flex items-center justify-between gap-2 text-xs font-mono">
              <span className="text-foreground">Baixando atualizacao...</span>
              <span className="text-primary">{progressValue}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
        )}

        {status.downloaded && (
          <div className="rounded border border-success/40 bg-success/10 px-3 py-3">
            <p className="text-xs font-mono font-semibold text-success">
              Atualizacao baixada. Feche o app para instalar.
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-success/20">
              <div className="h-full w-full rounded-full bg-success" />
            </div>
          </div>
        )}

        {!status.available && !status.downloading && !status.downloaded && !status.installedMessage && (
          <p className="text-sm font-mono text-foreground">{status.message}</p>
        )}

        {status.lastError && <p className="text-xs font-mono text-destructive">{status.lastError}</p>}
        {actionMessage && <p className="text-xs font-mono text-muted-foreground">{actionMessage}</p>}

        <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <input
            type="checkbox"
            checked={status.installUpdateOnQuit}
            onChange={(event) => toggleInstallOnQuit(event.target.checked)}
          />
          Atualizar ao fechar
        </label>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="font-mono text-xs" onClick={checkNow} disabled={actionBusy}>
            Verificar atualizacoes agora
          </Button>
          <Button
            size="sm"
            className="font-mono text-xs"
            onClick={installNow}
            disabled={actionBusy || !status.updateDownloaded}
          >
            Reiniciar e atualizar
          </Button>
        </div>
      </div>
    </aside>
  );
}
