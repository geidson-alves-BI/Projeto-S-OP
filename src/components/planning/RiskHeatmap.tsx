import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PlanningRiskHeatmap, PlanningRiskHeatmapCell } from "@/types/analytics";

type RiskHeatmapProps = {
  title: string;
  description: string;
  heatmap?: PlanningRiskHeatmap | null;
  emptyLabel?: string;
};

function levelClass(levelKey: string) {
  const normalized = String(levelKey || "").toLowerCase();
  if (normalized === "critical") {
    return "bg-destructive/25 border-destructive/50 text-destructive";
  }
  if (normalized === "high") {
    return "bg-warning/20 border-warning/50 text-warning";
  }
  if (normalized === "moderate") {
    return "bg-warning/10 border-warning/30 text-warning";
  }
  return "bg-success/20 border-success/40 text-success";
}

function pickMetric(cell: PlanningRiskHeatmapCell, key: string) {
  const raw = cell.metrics?.[key];
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function RiskHeatmap({ title, description, heatmap, emptyLabel }: RiskHeatmapProps) {
  if (!heatmap || !heatmap.cells || heatmap.cells.length === 0) {
    return (
      <section className="metric-card space-y-2">
        <h3 className="text-sm font-semibold font-mono">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">{emptyLabel ?? "Sem dados suficientes para gerar heatmap."}</p>
      </section>
    );
  }

  const byKey = new Map<string, PlanningRiskHeatmapCell>();
  heatmap.cells.forEach((cell) => {
    const row = String(cell[heatmap.row_key] ?? "-");
    const column = String(cell[heatmap.column_key] ?? "-");
    byKey.set(`${row}::${column}`, cell);
  });

  return (
    <section className="metric-card space-y-3">
      <div>
        <h3 className="text-sm font-semibold font-mono">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <TooltipProvider delayDuration={150}>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[680px]">
            <thead>
              <tr>
                <th>{heatmap.row_label}</th>
                {heatmap.columns.map((column) => (
                  <th key={column} className="text-center">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.rows.map((row) => (
                <tr key={row}>
                  <td className="text-xs font-mono">{row}</td>
                  {heatmap.columns.map((column) => {
                    const cell = byKey.get(`${row}::${column}`);
                    if (!cell) {
                      return (
                        <td key={`${row}-${column}`} className="text-center text-xs text-muted-foreground">
                          -
                        </td>
                      );
                    }

                    return (
                      <td key={`${row}-${column}`} className="text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={`w-full rounded-lg border px-2 py-2 text-xs font-mono transition-colors ${levelClass(
                                cell.level_key,
                              )}`}
                            >
                              {cell.score.toFixed(1)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px] text-[11px] leading-5">
                            <p className="font-semibold">Nivel: {cell.level_label}</p>
                            <p>Driver: {cell.primary_driver_label}</p>
                            <p>Forecast: {pickMetric(cell, "final_forecast").toLocaleString("pt-BR")}</p>
                            <p>Crescimento: {pickMetric(cell, "growth_impact_pct").toFixed(2)}%</p>
                            <p>Concentracao: {pickMetric(cell, "customer_concentration_pct").toFixed(1)}%</p>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TooltipProvider>
    </section>
  );
}
