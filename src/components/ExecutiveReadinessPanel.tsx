import { ShieldCheck } from "lucide-react";
import { useReadiness } from "@/hooks/use-readiness";
import { formatReadinessStatus, getStatusClasses } from "@/lib/upload-center";

export function ExecutiveReadinessPanel() {
  const { readiness, loading, error } = useReadiness();
  const modules = Array.isArray(readiness?.modules) ? readiness.modules : [];

  if (loading) {
    return (
      <section className="space-y-4">
        <p>Loading executive readiness...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <p>Error loading readiness: {error}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Prontidão Executiva
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            Painel de Prontidão Executiva
          </h2>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => {
          const missingDatasets = Array.isArray(item.missing_datasets) ? item.missing_datasets : [];

          return (
            <article key={item.key} className="metric-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {item.label}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    {formatReadinessStatus(item.status)}
                  </h3>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${getStatusClasses(
                    item.status
                  )}`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <p className="text-xs text-muted-foreground">
                {missingDatasets.length > 0
                  ? `Faltando: ${missingDatasets.join(", ")}`
                  : "Cobertura registrada para este modulo."}
              </p>
            </article>
          );
        })}
        {modules.length === 0 && (
          <article className="metric-card">
            <p className="text-sm text-muted-foreground">
              Sem modulos de prontidao retornados pelo backend no momento.
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
