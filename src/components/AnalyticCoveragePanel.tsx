import { BarChart } from "lucide-react";
import { useExecutiveContext } from "@/hooks/use-executive-context";
import { cn } from "@/lib/utils";

type AnalyticCoveragePanelProps = {
  compact?: boolean;
};

export function AnalyticCoveragePanel({ compact = false }: AnalyticCoveragePanelProps) {
  const { executiveContext, loading, error } = useExecutiveContext();
  const loadedDatasetsCount = Array.isArray(executiveContext?.loaded_datasets)
    ? executiveContext.loaded_datasets.length
    : 0;
  const missingDatasetsCount = Array.isArray(executiveContext?.missing_datasets)
    ? executiveContext.missing_datasets.length
    : 0;
  const dreAvailable = Boolean(executiveContext?.dre_available);

  if (loading) {
    return (
      <section className="space-y-4">
        <p>Loading analytic coverage...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <p>Error loading analytic coverage: {error}</p>
      </section>
    );
  }

  return (
    <section className={cn("space-y-4", compact && "space-y-3")}>
      {!compact ? (
        <div className="flex items-center gap-2">
          <BarChart className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cobertura Analitica</p>
            <h2 className="text-xl font-semibold text-foreground">Painel de Cobertura Analitica</h2>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Datasets Carregados</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{loadedDatasetsCount}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Datasets Faltantes</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{missingDatasetsCount}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">DRE Disponivel</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{dreAvailable ? "Sim" : "Nao"}</p>
        </div>
      </div>
    </section>
  );
}
