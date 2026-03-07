import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, Layers3, ShieldAlert, Sparkles } from "lucide-react";
import { getContextPackStatusLabel } from "@/lib/context-pack";
import { cn } from "@/lib/utils";
import type { ContextPackViewModel } from "@/types/context-pack";

type ContextPackOverviewProps = {
  viewModel: ContextPackViewModel;
  loading?: boolean;
  error?: string | null;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Ainda nao consolidado";
  }

  return new Date(value).toLocaleString("pt-BR");
}

function getStatusAccent(status: ContextPackViewModel["status"]) {
  if (status === "ready") return "border-success/35 bg-success/10 text-success";
  if (status === "partial") return "border-warning/35 bg-warning/10 text-warning";
  return "border-border/70 bg-muted/20 text-muted-foreground";
}

export default function ContextPackOverview({
  viewModel,
  loading,
  error,
  actions,
  footer,
  className,
}: ContextPackOverviewProps) {
  return (
    <section className={cn("metric-card space-y-5", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
              Pacote de contexto analitico
            </span>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] ${getStatusAccent(viewModel.status)}`}>
              {getContextPackStatusLabel(viewModel.status)}
            </span>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{viewModel.friendlyName}</h2>
            <p className="text-sm font-medium text-primary">{viewModel.subtitle}</p>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{viewModel.description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cobertura analitica</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{viewModel.coveragePercent}%</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Blocos disponiveis</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {viewModel.availableComponentsCount} / {viewModel.totalComponentsCount}
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ultima consolidacao</p>
          <p className="mt-2 text-sm font-medium text-foreground">{formatTimestamp(viewModel.generatedAt)}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Qualidade</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {viewModel.dataQuality.status === "ok" ? "Sem alertas criticos" : `${viewModel.dataQuality.flags.length} alerta(s) monitorados`}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-border/70">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${viewModel.coveragePercent}%` }} />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{viewModel.summary}</p>
      </div>

      {loading && <p className="text-xs font-mono text-muted-foreground">Atualizando contexto consolidado...</p>}
      {error && <p className="text-xs font-mono text-destructive">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Entradas do contexto</h3>
          </div>
          <div className="grid gap-3">
            {viewModel.inputsAvailable.map((source) => (
              <div key={source.key} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{source.label}</p>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em]",
                      source.available
                        ? "border-success/35 bg-success/10 text-success"
                        : "border-border/70 bg-background/50 text-muted-foreground",
                    )}
                  >
                    {source.available ? "Disponivel" : "Ausente"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{source.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Blocos do contexto</h3>
          </div>
          <div className="grid gap-3">
            {viewModel.componentsAvailable.map((component) => (
              <div key={component.key} className="rounded-2xl border border-success/30 bg-success/10 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-sm font-semibold text-foreground">{component.label}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{component.detail}</p>
              </div>
            ))}
            {viewModel.componentsMissing.map((component) => (
              <div key={component.key} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <CircleDashed className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">{component.label}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{component.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Leituras disponiveis por persona</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {viewModel.personasReady.map((persona) => (
              <div key={persona.key} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{persona.label}</p>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em]",
                      persona.ready
                        ? "border-success/35 bg-success/10 text-success"
                        : "border-warning/35 bg-warning/10 text-warning",
                    )}
                  >
                    {persona.ready ? "Pronta" : "Limitada"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{persona.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <h3 className="text-base font-semibold text-foreground">Lacunas e limitacoes</h3>
          </div>
          {viewModel.limitations.length === 0 ? (
            <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-foreground">
              O contexto esta consistente para leituras executivas amplas.
            </div>
          ) : (
            <div className="grid gap-3">
              {viewModel.limitations.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-foreground">
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {footer}
    </section>
  );
}
