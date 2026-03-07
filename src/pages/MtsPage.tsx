import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Package } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { useAppData } from "@/contexts/AppDataContext";
import { postJSON } from "@/lib/api";
import { downloadCSV } from "@/lib/downloadCSV";
import type { SimulationResult } from "@/types/analytics";

interface SimulationInputRow {
  id: number;
  product_code: string;
  forecast_demand: string;
}

function parseSimulationResponse(payload: unknown): SimulationResult[] {
  if (Array.isArray(payload)) {
    return payload as SimulationResult[];
  }

  if (payload && typeof payload === "object") {
    const maybeRecord = payload as Record<string, unknown>;

    if (Array.isArray(maybeRecord.items)) {
      return maybeRecord.items as SimulationResult[];
    }

    if (Array.isArray(maybeRecord.data)) {
      return maybeRecord.data as SimulationResult[];
    }

    if (typeof maybeRecord.product_code === "string") {
      return [maybeRecord as SimulationResult];
    }
  }

  return [];
}

function parseFlexibleNumber(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return 0;
  }

  let normalized = cleaned;
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}


export default function MtsPage() {
  const { state } = useAppData();
  const navigate = useNavigate();
  useEffect(() => {
    if (!state) navigate("/upload");
  }, [state, navigate]);

  const [filterStrat, setFilterStrat] = useState("MTS (candidato)");
  const [sortBy, setSortBy] = useState<"prioridade" | "volume" | "dias">("prioridade");

  const [simulationInputs, setSimulationInputs] = useState<SimulationInputRow[]>([
    { id: 1, product_code: "", forecast_demand: "" },
  ]);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationResults, setSimulationResults] = useState<SimulationResult[]>([]);

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
      "SKU", "Codigo", "ABC-XYZ", "Estrategia", "Vol. Anual (kg)", "Media/Mes (kg)",
      "Consumo Diario (kg)", "Dias Alvo", "Target Estoque (kg)", "Prioridade MTS",
      "Tendencia", "CV",
      ...(state?.hasClientes ? ["Top1 Cliente", "Top1 Share (%)", "HHI"] : []),
    ];
    const rows = filtered.map(p => [
      p.SKU_LABEL,
      p.codigoProduto,
      p.abcXyz,
      p.estrategiaFinal ?? p.estrategiaBase,
      String(Math.round(p.volumeAnual)),
      String(Math.round(p.mediaMensal)),
      String(Math.round(p.consumoDiario)),
      String(p.diasAlvoAjustado ?? p.diasAlvoBase),
      String(Math.round(p.targetKgAjustado ?? p.consumoDiario * p.diasAlvoBase)),
      String(p.prioridadeMTS),
      p.trendLabel,
      p.cv.toFixed(2),
      ...(state?.hasClientes
        ? [
            p.top1Cliente ?? "",
            p.top1ShareProduto != null ? (p.top1ShareProduto * 100).toFixed(1) : "",
            p.hhiProduto != null ? p.hhiProduto.toFixed(3) : "",
          ]
        : []),
    ]);
    downloadCSV([header, ...rows], `mts_recomendacoes_${filterStrat.replace(/\s/g, "_")}.csv`);
  };

  const updateSimulationInput = (id: number, field: keyof SimulationInputRow, value: string) => {
    setSimulationInputs(prev => prev.map(row => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addSimulationRow = () => {
    setSimulationInputs(prev => [...prev, { id: Date.now(), product_code: "", forecast_demand: "" }]);
  };

  const removeSimulationRow = (id: number) => {
    setSimulationInputs(prev => (prev.length > 1 ? prev.filter(row => row.id !== id) : prev));
  };

  const handleSimulateMTS = async () => {
    try {
      setSimulationLoading(true);
      setSimulationError(null);

      const items = simulationInputs
        .filter(row => row.product_code.trim() !== "")
        .map(row => ({
          product_code: row.product_code.trim(),
          forecast_demand: parseFlexibleNumber(row.forecast_demand),
        }));

      if (items.length === 0) {
        setSimulationError("Informe ao menos um product_code para simular.");
        return;
      }

      let response: unknown;

      if (items.length === 1) {
        try {
          response = await postJSON("/analytics/simulate_mts_production", items[0]);
        } catch (_singleError) {
          response = await postJSON("/analytics/simulate_mts_production", { items });
        }
      } else {
        response = await postJSON("/analytics/simulate_mts_production", { items });
      }

      setSimulationResults(parseSimulationResponse(response));
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulationLoading(false);
    }
  };

  if (!state) return null;

  return (
    <PageTransition className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Recomendacao MTS / MTO
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">SKUs candidatos a estoque com volumes e prioridades</p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
        </Button>
      </div>

      <div className="metric-card flex flex-wrap items-center gap-4">
        <div>
          <label className="text-xs text-muted-foreground font-mono mb-1 block">Estrategia</label>
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
          <Select value={sortBy} onValueChange={v => setSortBy(v as "prioridade" | "volume" | "dias")}>
            <SelectTrigger className="w-40 font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prioridade">Prioridade</SelectItem>
              <SelectItem value="volume">Volume Anual</SelectItem>
              <SelectItem value="dias">Dias Alvo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="SKUs Filtrados" value={filtered.length} />
        <MetricCard label="Vol. Anual Total" value={`${Math.round(totalVolAnual).toLocaleString()} kg`} />
        <MetricCard label="Target Estoque Total" value={`${Math.round(totalVolMTS).toLocaleString()} kg`} />
        <MetricCard label="Estrategia" value={filterStrat} />
      </div>

      <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>ABC-XYZ</th>
              <th>Estrategia</th>
              <th>Vol. Anual</th>
              <th>Consumo/Dia</th>
              <th>Dias Alvo</th>
              <th>Target Estoque</th>
              <th>Prioridade</th>
              <th>Tendencia</th>
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

      <div className="metric-card space-y-3">
        <h3 className="text-sm font-bold font-mono text-foreground">Simulacao de producao MTS</h3>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>product_code</th>
                <th>forecast_demand</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {simulationInputs.map(row => (
                <tr key={row.id}>
                  <td>
                    <input
                      value={row.product_code}
                      onChange={e => updateSimulationInput(row.id, "product_code", e.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono"
                      placeholder="P001"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.forecast_demand}
                      onChange={e => updateSimulationInput(row.id, "forecast_demand", e.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono"
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => removeSimulationRow(row.id)}>
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="font-mono text-xs" onClick={addSimulationRow}>Adicionar linha</Button>
          <Button className="font-mono text-sm" onClick={handleSimulateMTS} disabled={simulationLoading}>
            {simulationLoading ? "Simulando..." : "Simular producao MTS"}
          </Button>
        </div>

        {simulationError && <p className="text-xs font-mono text-destructive">{simulationError}</p>}

        {simulationResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">
              Total geral (total_production_cost): {simulationResults
                .reduce((sum, row) => sum + Number(row.total_production_cost ?? 0), 0)
                .toFixed(2)}
            </p>
            <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>product_code</th>
                  <th>production_qty</th>
                  <th>raw_material_code</th>
                  <th>raw_material_required</th>
                  <th>raw_material_cost</th>
                  <th>total_production_cost</th>
                </tr>
              </thead>
              <tbody>
                {simulationResults.map((row, idx) => (
                  <tr key={`${row.product_code}-${row.raw_material_code}-${idx}`}>
                    <td className="font-mono text-xs">{row.product_code}</td>
                    <td className="text-right font-mono text-xs">{Number(row.production_qty ?? 0).toFixed(2)}</td>
                    <td className="font-mono text-xs">{row.raw_material_code}</td>
                    <td className="text-right font-mono text-xs">{Number(row.raw_material_required ?? 0).toFixed(2)}</td>
                    <td className="text-right font-mono text-xs">{Number(row.raw_material_cost ?? 0).toFixed(2)}</td>
                    <td className="text-right font-mono text-xs font-bold">{Number(row.total_production_cost ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

