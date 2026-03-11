import { AlertTriangle } from "lucide-react";
import { useExecutiveContext } from "@/hooks/use-executive-context";

export function CriticalGapsPanel() {
  const { executiveContext, loading, error } = useExecutiveContext();

  if (loading) {
    return (
      <section className="space-y-4">
        <p>Loading critical gaps...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <p>Error loading critical gaps: {error}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
        <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Lacunas Críticas</p>
                <h2 className="text-xl font-semibold text-foreground">Painel de Lacunas Críticas</h2>
            </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
        <div className="mt-3 flex flex-wrap gap-2">
            {executiveContext?.key_gaps && executiveContext.key_gaps.length > 0 ? (
            executiveContext.key_gaps.map((gap) => (
                <span key={gap} className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-foreground">
                {gap}
                </span>
            ))
            ) : (
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-foreground">
                Sem lacunas abertas na ultima rodada.
            </span>
            )}
        </div>
        </div>
    </section>
  );
}
