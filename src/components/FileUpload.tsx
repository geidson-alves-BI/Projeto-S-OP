import { useCallback, useRef } from "react";
import { Upload } from "lucide-react";

interface FileUploadProps {
  label: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  accept?: string;
}

export default function FileUpload({ label, file, onFileSelect, accept = ".xlsx,.xls,.csv" }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  return (
    <div
      className="upload-zone"
      onClick={() => inputRef.current?.click()}
      onDragOver={e => e.preventDefault()}
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
      <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      {file ? (
        <p className="mt-1 text-xs text-primary font-mono">{file.name}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Arraste ou clique para selecionar (.xlsx / .csv)</p>
      )}
    </div>
  );
}
