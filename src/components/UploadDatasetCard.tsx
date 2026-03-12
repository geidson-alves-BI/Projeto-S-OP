import { useMemo, useRef } from "react";
import { ArrowUpRight, FileSearch, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTimestamp, formatValidationStatus, getStatusClasses } from "@/lib/upload-center";
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
  onOpenDictionary?: () => void;
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

function formatCompactAvailabilityStatus(status: UploadDataset["availability_status"]) {
  if (status === "ready") {
    return "Carregado";
  }
  if (status === "partial") {
    return "Parcial";
  }
  return "Faltando";
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
  onOpenDictionary,
}: UploadDatasetCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acceptedFormats = useMemo(
    () => description ?? `Formatos aceitos: ${dataset.accepted_formats.join(", ")}`,
    [dataset.accepted_formats, description],
  );
  const statusLabel = formatCompactAvailabilityStatus(dataset.availability_status);
  const validationLabel = formatValidationStatus(dataset.validation_status);

  const handlePrimaryAction = () => {
    if (loading) {
      return;
    }
    if (!file) {
      inputRef.current?.click();
      return;
    }
    void onUpload();
  };

  return (
    <article className="h-full min-w-[250px] max-w-[288px] flex-1 snap-start space-y-2 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{dataset.category}</p>
          <h3 className="text-sm font-semibold leading-snug text-foreground">{dataset.name}</h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]",
            getStatusClasses(dataset.availability_status),
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div
          className={cn(
            "rounded-lg border px-2 py-1 text-[10px] uppercase tracking-[0.14em]",
            getStatusClasses(dataset.validation_status),
          )}
        >
          <p className="text-[9px] text-current/80">Validacao</p>
          <p className="mt-0.5 font-semibold text-current">{validationLabel}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/45 px-2 py-1 text-right">
          <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Compatibilidade</p>
          <p className="mt-0.5 text-[11px] font-semibold text-foreground">
            {dataset.compatibility_summary.compatibility_score}%
          </p>
        </div>
      </div>

      <div className="space-y-1 rounded-xl border border-border/70 bg-background/35 px-2.5 py-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Ultimo upload</p>
        <p className="truncate text-[11px] font-medium text-foreground">
          {dataset.filename ?? "Nenhum arquivo registrado"}
        </p>
        <p className="text-[10px] text-muted-foreground/90">
          {formatTimestamp(dataset.uploaded_at)} | {dataset.format ?? "Sem formato"}
        </p>
      </div>

      <div className="space-y-1 rounded-xl border border-dashed border-border/70 bg-muted/15 px-2.5 py-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={dataset.accepted_formats.join(",")}
          onChange={(event) => {
            const selectedFile = event.target.files?.[0];
            if (selectedFile) {
              onFileSelect(selectedFile);
            }
          }}
        />
        <p className="truncate text-[11px] font-medium text-foreground">
          {file ? file.name : "Nenhum arquivo selecionado"}
        </p>
        <p className="text-[10px] text-muted-foreground/90">
          {file ? `${Math.max(1, Math.round(file.size / 1024))} KB selecionado` : acceptedFormats}
        </p>
        {file ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className="h-6 justify-start px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Trocar arquivo
          </Button>
        ) : null}
      </div>

      <div className="space-y-1 pt-0.5">
        <Button
          type="button"
          size="sm"
          className="h-8 w-full gap-2 bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/0.32)] hover:bg-primary/90"
          disabled={loading}
          onClick={handlePrimaryAction}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : file ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
          {loading ? "Processando..." : file ? actionLabel : "Selecionar arquivo"}
        </Button>
        {onOpenDictionary ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 w-fit gap-1.5 px-1 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onOpenDictionary}
          >
            <FileSearch className="h-3.5 w-3.5" />
            Dicionario
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <div className={cn("rounded-lg border px-2 py-1.5 text-[10px]", getFeedbackClasses(feedback.tone))}>
          {feedback.message}
        </div>
      ) : null}
    </article>
  );
}
