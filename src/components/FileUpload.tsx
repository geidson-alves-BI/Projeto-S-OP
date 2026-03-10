import { useCallback, useRef, useState } from "react";
import { Upload, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  label: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  accept?: string;
  description?: string;
}

export default function FileUpload({
  label,
  file,
  onFileSelect,
  accept = ".xlsx,.xls,.csv",
  description,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  return (
    <div
      className={cn(
        "upload-zone group relative",
        dragOver && "border-primary bg-primary/[0.06] shadow-[var(--shadow-glow)]",
        file && "border-success/40 bg-success/[0.03]"
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFileSelect(f);
        }}
      />
      {file ? (
        <>
          <FileCheck className="mx-auto mb-3 h-8 w-8 text-success transition-transform group-hover:scale-110" />
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-xs text-success font-mono truncate max-w-full">{file.name}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {(file.size / 1024).toFixed(0)} KB · Clique para trocar
          </p>
        </>
      ) : (
        <>
          <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground transition-transform group-hover:scale-110 group-hover:text-primary" />
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {description ?? `Arraste ou clique para selecionar (${accept.replaceAll(",", " / ")})`}
          </p>
        </>
      )}
    </div>
  );
}
