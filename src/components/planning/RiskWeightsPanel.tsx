import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type RiskWeightsPanelProps = {
  title: string;
  weights: Record<string, number>;
  labels: Record<string, string>;
  onChange: (next: Record<string, number>) => void;
};

function normalize(weights: Record<string, number>) {
  const safeEntries = Object.entries(weights).map(([key, value]) => [key, Math.max(value, 0)] as const);
  const total = safeEntries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) {
    const even = safeEntries.length > 0 ? 1 / safeEntries.length : 0;
    return Object.fromEntries(safeEntries.map(([key]) => [key, even]));
  }
  return Object.fromEntries(safeEntries.map(([key, value]) => [key, value / total]));
}

export default function RiskWeightsPanel({ title, weights, labels, onChange }: RiskWeightsPanelProps) {
  const normalized = normalize(weights);

  const updateValue = (key: string, raw: string) => {
    const parsed = Number(raw);
    const nextRaw = {
      ...weights,
      [key]: Number.isFinite(parsed) ? parsed / 100 : 0,
    };
    onChange(normalize(nextRaw));
  };

  return (
    <section className="metric-card space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold font-mono">{title}</h3>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-[11px]">
              Pesos visiveis e configuraveis. O total sempre fecha em 100%.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="grid gap-2">
        {Object.entries(normalized).map(([key, value]) => (
          <label key={key} className="grid grid-cols-[1fr_88px] items-center gap-2">
            <span className="text-xs text-muted-foreground">{labels[key] ?? key}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={(value * 100).toFixed(0)}
                onChange={(event) => updateValue(key, event.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-right"
              />
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
