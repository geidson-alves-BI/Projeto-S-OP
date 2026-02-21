import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Package } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { useAppData } from "@/contexts/AppDataContext";

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MtsPage() {
  const { state } = useAppData();
  const navigate = useNavigate();
  useEffect(() => { if (!state) navigate("/upload"); }, [state, navigate]);

  const [filterStrat, setFilterStrat] = useState("MTS (candidato)");
  const [sortBy, setSortBy] = useState<"prioridade" | "volume" | "dias">("prioridade");

  const filtered = useMemo(() => {
    if (!state) return [];
    let list = state.products;
    if (filterStrat !== "Todos") {
      list = list.filter(p => (p.estrategiaFinal ?? p.estrategiaBase) === filterStrat);
    }
    return [...list].sort((a, b) => {
      if (sortBy === "prioridade") return b.prioridadeMTS - a.prioridadeMTS;
      if (sortBy === "volume") return b.volumeAnual - a.volumeAnual;
      return (b.diasAlvoAjustado ?? b.diasAlvoBase) - (a.diasAlvoAjustado ?? a.diasAlvoBase);
    });
  }, [state, filterStrat, sortBy]);

  const totalVolMTS = filtered.reduce((s, p) => s + (p.targetKgAjustado ?? p.consumoDiario * p.diasAlvoBase), 0);
  const totalVolAnual = filtered.reduce((s, p) => s + p.volumeAnual, 0);

  const handleExport = () => {
    const header = [
      "SKU", "Código", "ABC-XYZ", "Estratégia", "Vol. Anual (kg)", "Média/Mês (kg)",
      "Consumo Diário (kg)", "Dias Alvo", "Target Estoque (kg)", "Prioridade MTS",
      "Tendência", "CV",
      ...(state?.hasClientes ? ["Top1 Cliente", "Top1 Share (%)", "HHI"] : []),
    ];
    const rows = filtered.map(p => [
      p.SKU_LABEL, p.codigoProduto, p.abcXyz,
      p.estrategiaFinal ?? p.estrategiaBase,
      String(Math.round(p.volumeAnual)),
      String(Math.round(p.mediaMensal)),
      String(Math.round(p.consumoDiario)),
      String(p.diasAlvoAjustado ?? p.diasAlvoBase),
      String(Math.round(p.targetKgAjustado ?? p.consumoDiario * p.diasAlvoBase)),
      String(p.prioridadeMTS),
      p.trendLabel,
      p.cv.toFixed(2),
      ...(state?.hasClientes ? [
        p.top1Cliente ?? "",
        p.top1ShareProduto != null ? (p.top1ShareProduto * 100).toFixed(1) : "",
        p.hhiProduto != null ? p.hhiProduto.toFixed(3) : "",
      ] : []),
    ]);
    downloadCSV([header, ...rows], `mts_recomendacoes_${filterStrat.replace(/\s/g, "_")}.csv`);
  };

  if (!state) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Recomendação MTS / MTO
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">SKUs candidatos a estoque com volumes e prioridades</p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
        </Button>
      </div>

      {/* Controls */}
      <div className="metric-card flex flex-wrap items-center gap-4">
        <div>
          <label className="text-xs text-muted-foreground font-mono mb-1 block">Estratégia</label>
          <Select value={filterStrat} onValueChange={setFilterStrat}>
            <SelectTrigger className="w-48 font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              <SelectItem value="MTS (candidato)">MTS (candidato)</SelectItem>
              <SelectItem value="MTO">MTO</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-mono mb-1 block">Ordenar por</label>
          <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
            <SelectTrigger className="w-40 font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prioridade">Prioridade</SelectItem>
              <SelectItem value="volume">Volume Anual</SelectItem>
              <SelectItem value="dias">Dias Alvo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="SKUs Filtrados" value={filtered.length} />
        <MetricCard label="Vol. Anual Total" value={`${Math.round(totalVolAnual).toLocaleString()} kg`} />
        <MetricCard label="Target Estoque Total" value={`${Math.round(totalVolMTS).toLocaleString()} kg`} />
        <MetricCard label="Estratégia" value={filterStrat} />
      </div>

      {/* Table */}
      <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>ABC-XYZ</th>
              <th>Estratégia</th>
              <th>Vol. Anual</th>
              <th>Consumo/Dia</th>
              <th>Dias Alvo</th>
              <th>Target Estoque</th>
              <th>Prioridade</th>
              <th>Tendência</th>
              {state.hasClientes && <th>Top1 Cliente</th>}
              {state.hasClientes && <th>HHI</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((p, i) => (
              <tr key={p.SKU_LABEL}>
                <td className="text-xs text-muted-foreground">{i + 1}</td>
                <td className="max-w-[200px] truncate text-xs" title={p.SKU_LABEL}>{p.SKU_LABEL}</td>
                <td><ABCBadge classe={p.abcXyz} /></td>
                <td><StratBadge strat={p.estrategiaFinal ?? p.estrategiaBase} /></td>
                <td className="text-right font-mono text-xs">{Math.round(p.volumeAnual).toLocaleString()}</td>
                <td className="text-right font-mono text-xs">{Math.round(p.consumoDiario).toLocaleString()}</td>
                <td className="text-right font-mono text-xs">{p.diasAlvoAjustado ?? p.diasAlvoBase}</td>
                <td className="text-right font-mono text-xs font-bold">{Math.round(p.targetKgAjustado ?? p.consumoDiario * p.diasAlvoBase).toLocaleString()}</td>
                <td className="text-right font-mono text-xs">{p.prioridadeMTS}</td>
                <td className="text-xs">{p.trendLabel}</td>
                {state.hasClientes && <td className="text-xs max-w-[120px] truncate">{p.top1Cliente ?? "-"}</td>}
                {state.hasClientes && <td className="text-right font-mono text-xs">{p.hhiProduto != null ? p.hhiProduto.toFixed(3) : "-"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
