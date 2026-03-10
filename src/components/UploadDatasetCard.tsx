import { Loader2, ArrowUpRight } from "lucide-react";
import FileUpload from "@/components/FileUpload";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTimestamp, getStatusClasses, summarizeDataset } from "@/lib/upload-center";
import type { UploadDataset } from "@/types/analytics";

export type UploadFeedback = {
  tone: "success" | "error" | "info";
  message: string;
};

type UploadDatasetCardProps = {
  dataset: UploadDataset;
  file: File | null;
  onFileSelect: (file: File) => void;
  onUpload: () => Promise<void> | void;
  loading?: boolean;
  feedback?: UploadFeedback | null;
  actionLabel?: string;
  description?: string;
};

function getFeedbackClasses(tone: UploadFeedback["tone"]) {
  if (tone === "success") {
    return "border-success/30 bg-success/10 text-foreground";
  }
  if (tone === "error") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  return "border-primary/20 bg-primary/10 text-foreground";
}

export default function UploadDatasetCard({
  dataset,
  file,
  onFileSelect,
  onUpload,
  loading = false,
  feedback = null,
  actionLabel = "Enviar base",
  description,
}: UploadDatasetCardProps) {
  return (
    <article className="metric-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{dataset.category}</p>
            <h3 className="text-lg font-semibold text-foreground">{dataset.name}</h3>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{dataset.objective}</p>
        </div>

        <span className={cn("rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]", getStatusClasses(dataset.validation_status))}>
          {dataset.last_upload_status}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Ultimo upload</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {dataset.filename ?? "Nenhum arquivo registrado"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatTimestamp(dataset.uploaded_at)} • {dataset.format ?? "Sem formato"}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Cobertura</p>
              <p className="mt-1 text-sm text-foreground">{summarizeDataset(dataset)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Impacto nas analises</p>
              <p className="mt-1 text-sm text-foreground">{dataset.readiness_impact.join(", ")}</p>
            </div>
          </div>

          <div className="space-y-3">
            <FileUpload
              label={dataset.name}
              file={file}
              onFileSelect={onFileSelect}
              accept={dataset.accepted_formats.join(",")}
              description={description ?? `Formatos aceitos: ${dataset.accepted_formats.join(", ")}`}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void onUpload()} disabled={!file || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                {loading ? "Processando..." : actionLabel}
              </Button>
              <p className="text-xs text-muted-foreground">
                {dataset.storage_kind === "document" ? "Fluxo documental preparado para leitura futura." : "Base estruturada para consolidacao analitica."}
              </p>
            </div>
          </div>

          {feedback ? (
            <div className={cn("rounded-2xl border px-4 py-3 text-sm", getFeedbackClasses(feedback.tone))}>
              {feedback.message}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
          <Accordion type="single" collapsible defaultValue="data-dictionary">
            <AccordionItem value="data-dictionary" className="border-none">
              <AccordionTrigger className="py-0 text-left text-sm font-semibold text-foreground">
                Dicionario da base
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Colunas obrigatorias</p>
                    <p className="mt-2 text-sm text-foreground">
                      {dataset.required_columns.length > 0 ? dataset.required_columns.join(", ") : "Nao se aplica"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Colunas opcionais</p>
                    <p className="mt-2 text-sm text-foreground">
                      {dataset.optional_columns.length > 0 ? dataset.optional_columns.join(", ") : "Nao se aplica"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Formatos aceitos</p>
                    <p className="mt-2 text-sm text-foreground">{dataset.accepted_formats.join(", ")}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Status do ultimo upload</p>
                    <p className="mt-2 text-sm text-foreground">{dataset.latest_message}</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </article>
  );
}
