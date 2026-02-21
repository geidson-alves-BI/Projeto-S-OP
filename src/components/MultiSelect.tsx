import { useState, useRef, useEffect, useMemo } from "react";
import { X, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

const MultiSelect = ({ options, selected, onChange, placeholder = "Buscar...", className }: MultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(lower));
  }, [options, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(s => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const removeTag = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter(s => s !== value));
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div
        className="flex items-center gap-1 flex-wrap min-h-[40px] rounded-md border border-border bg-secondary px-3 py-1.5 cursor-pointer"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {selected.length === 0 && (
          <span className="text-xs text-muted-foreground font-mono">{placeholder}</span>
        )}
        {selected.slice(0, 5).map(s => (
          <span key={s} className="inline-flex items-center gap-1 bg-primary/20 text-primary text-[10px] font-mono px-1.5 py-0.5 rounded">
            {s.length > 20 ? s.slice(0, 20) + "…" : s}
            <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={(e) => removeTag(s, e)} />
          </span>
        ))}
        {selected.length > 5 && (
          <span className="text-[10px] text-muted-foreground font-mono">+{selected.length - 5}</span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar por código ou palavra-chave..."
              className="w-full bg-transparent text-xs font-mono text-foreground outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
            <button onClick={selectAll} className="text-[10px] font-mono text-primary hover:underline">Selecionar todos</button>
            <span className="text-muted-foreground text-[10px]">|</span>
            <button onClick={clearAll} className="text-[10px] font-mono text-destructive hover:underline">Limpar</button>
            <span className="text-[10px] text-muted-foreground font-mono ml-auto">{selected.length}/{options.length}</span>
          </div>

          <div className="max-h-[250px] overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3 font-mono">Nenhum resultado</p>
            )}
            {filtered.map(option => {
              const isSelected = selected.includes(option);
              return (
                <div
                  key={option}
                  onClick={() => toggle(option)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs font-mono transition-colors",
                    isSelected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                  )}
                >
                  <div className={cn(
                    "h-3.5 w-3.5 rounded-sm border shrink-0 flex items-center justify-center",
                    isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                  )}>
                    {isSelected && <span className="text-[8px] text-primary-foreground font-bold">✓</span>}
                  </div>
                  <span className="truncate">{option}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
