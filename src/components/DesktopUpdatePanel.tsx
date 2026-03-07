import { useState } from "react";
import { RefreshCcw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getUpdaterPhaseAccent, getUpdaterPhaseLabel } from "@/lib/updater";
import { useOperionDesktopStatus } from "@/hooks/use-operion-desktop";

type DesktopUpdatePanelProps = {
  className?: string;
};

export default function DesktopUpdatePanel({ className }: DesktopUpdatePanelProps) {
  const {
    updaterStatus: status,
    progressValue,
    currentVersion,
    availableVersion,
    desktopBridge,
    updaterBridge,
  } = useOperionDesktopStatus();
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const runAction = async (actionKey: string, handler: () => Promise<{ message?: string }>) => {
    try {
      setActionBusy(actionKey);
      const result = await handler();
      setActionMessage(result.message ?? "Operacao concluida.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(null);
    }
  };

  const checkNow = async () => {
    if (!updaterBridge?.checkNow) {
      setActionMessage("Verificacao de atualizacao disponivel apenas no app desktop.");
      return;
    }

    await runAction("check", () => updaterBridge.checkNow());
  };

  const installNow = async () => {
    if (!desktopBridge?.installNow) {
      setActionMessage("Instalacao manual disponivel apenas no app desktop.");
      return;
    }

    await runAction("install", () => desktopBridge.installNow());
  };

  const toggleInstallOnQuit = async (enabled: boolean) => {
    if (!updaterBridge?.setInstallOnQuit) {
      setActionMessage("Ajuste de instalacao ao fechar disponivel apenas no app desktop.");
      return;
    }

    await runAction("toggle", () => updaterBridge.setInstallOnQuit(enabled));
  };

  if (!updaterBridge || !status.isPackaged) {
    return (
      <section className={cn("metric-card space-y-3", className)}>
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Atualizacoes</p>
          <h3 className="text-lg font-semibold text-foreground">Updater indisponivel neste ambiente</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          O fluxo de atualizacao aparece apenas na versao desktop instalada do Operion.
        </p>
      </section>
    );
  }

  return (
    <section className={cn("metric-card space-y-5", className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Atualizacoes</p>
          <h3 className="text-lg font-semibold text-foreground">Gestao de versoes do aplicativo</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status.installReady && (
            <span className="rounded-full border border-success/40 bg-success/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-success">
              Pronto para instalar
            </span>
          )}
          <span className={`rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] ${getUpdaterPhaseAccent(status)}`}>
            {getUpdaterPhaseLabel(status)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Versao atual</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{currentVersion}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ultima versao</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{availableVersion}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Status atual</p>
          <p className="mt-2 text-sm text-foreground">{status.message}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Progresso</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{progressValue}%</p>
        </div>
      </div>

      {(status.downloading || status.installReady) && (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-foreground">
              {status.installReady ? "Download concluido" : "Baixando atualizacao..."}
            </span>
            <span className={status.installReady ? "text-success" : "text-primary"}>{progressValue}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/70">
            <div
              className={`h-full rounded-full transition-all ${status.installReady ? "bg-success" : "bg-primary"}`}
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-background/45 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Instalar ao fechar</p>
          <p className="text-sm text-muted-foreground">
            Quando a atualizacao estiver pronta, o Operion aplica a nova versao automaticamente ao encerrar.
          </p>
        </div>
        <Switch
          checked={status.willInstallOnQuit}
          onCheckedChange={toggleInstallOnQuit}
          disabled={actionBusy === "toggle"}
        />
      </div>

      {status.installReady && (
        <div className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3">
          <p className="text-sm font-semibold text-success">Atualizacao baixada. Feche o app para instalar.</p>
          <p className="mt-1 text-sm text-foreground">
            Se preferir, use o reinicio manual para aplicar a nova versao imediatamente.
          </p>
        </div>
      )}

      {status.installedMessage && (
        <div className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {status.installedMessage}
        </div>
      )}

      {status.lastError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {status.lastError}
        </div>
      )}

      {actionMessage && <p className="text-xs font-mono text-muted-foreground">{actionMessage}</p>}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" className="gap-2" onClick={checkNow} disabled={actionBusy !== null}>
          <RefreshCcw className="h-4 w-4" />
          Verificar agora
        </Button>
        <Button className="gap-2" onClick={installNow} disabled={actionBusy !== null || !status.installReady}>
          <RotateCcw className="h-4 w-4" />
          Reiniciar e atualizar
        </Button>
      </div>
    </section>
  );
}
