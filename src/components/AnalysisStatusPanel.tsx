import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatReadinessStatus, getStatusClasses, resolveReadinessModule } from "@/lib/upload-center";
import type { UploadCenterStatus, UploadDatasetKey, UploadReadinessKey } from "@/types/analytics";

type AnalysisStatusPanelProps = {
  uploadCenter: UploadCenterStatus | null;
  moduleKey: UploadReadinessKey;
  title: string;
  description: string;
  datasetIds: UploadDatasetKey[];
  compact?: boolean;
};

function getStatusIcon(status: "ready" | "partial" | "unavailable") {
  if (status === "ready") {
    return CheckCircle2;
  }
  if (status === "partial") {
    return AlertTriangle;
  }
  return XCircle;
}

export default function AnalysisStatusPanel({
  uploadCenter,
  moduleKey,
  title,
  description,
  datasetIds,
  compact = false,
}: AnalysisStatusPanelProps) {
  const moduleStatus = resolveReadinessModule(uploadCenter, moduleKey);
  const datasets = Array.isArray(uploadCenter?.datasets) ? uploadCenter.datasets : [];
  const datasetMap = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const status = moduleStatus?.status ?? "unavailable";
  const Icon = getStatusIcon(status);

  return (
    <section className={cn("metric-card space-y-4", compact && "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Prontidao de dados</p>
          <div>
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]", getStatusClasses(status))}>
          <Icon className="h-3.5 w-3.5" />
          {formatReadinessStatus(status)}
        </span>
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
        {moduleStatus?.summary ?? "Este modulo depende da central de upload para ganhar cobertura analitica."}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {datasetIds.map((datasetId) => {
          const dataset = datasetMap.get(datasetId);
          return (
            <div key={datasetId} className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {dataset?.name ?? datasetId}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {dataset?.uploaded ? dataset.last_upload_status : "Sem upload"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {dataset?.filename ? dataset.filename : "Enviar pela central para liberar este modulo."}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="gap-2">
          <Link to="/upload">
            Ir para Upload de Dados
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {moduleStatus?.missing_datasets?.length ? (
          <p className="text-xs text-muted-foreground">
            Faltando: {moduleStatus.missing_datasets.join(", ")}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Cobertura registrada para este modulo.</p>
        )}
      </div>
    </section>
  );
}
