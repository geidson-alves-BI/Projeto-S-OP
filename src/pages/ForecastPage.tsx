import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import MultiSelect from "@/components/MultiSelect";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { useAppData } from "@/contexts/AppDataContext";
import type { ProductData } from "@/lib/pcpEngine";

function forecastProduct(p: ProductData, horizonMonths: number, growthPct: number) {
  const baseMonthly = p.mediaMensal;
  const growthFactor = 1 + growthPct / 100;
  const months: { month: number; forecast: number }[] = [];
  let total = 0;
  for (let i = 1; i <= horizonMonths; i++) {
    const val = baseMonthly * Math.pow(growthFactor, i / 12);
    months.push({ month: i, forecast: Math.round(val) });
    total += val;
  }
  return { months, totalForecast: Math.round(total), dailyRate: Math.round(total / (horizonMonths * 30)) };
}

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

export default function ForecastPage() {
  const { state } = useAppData();
  const navigate = useNavigate();
  useEffect(() => { if (!state) navigate("/upload"); }, [state, navigate]);

  const [horizon, setHorizon] = useState("6");
  const [growthPct, setGrowthPct] = useState(0);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [filterABC, setFilterABC] = useState("Todos");

  const productOptions = useMemo(() => state?.products.map(p => p.SKU_LABEL) ?? [], [state]);

  const filteredProducts = useMemo(() => {
    if (!state) return [];
    let list = state.products;
    if (filterABC !== "Todos") list = list.filter(p => p.classeABC === filterABC);
    if (selectedSkus.length > 0) list = list.filter(p => selectedSkus.includes(p.SKU_LABEL));
    return list;
  }, [state, filterABC, selectedSkus]);

  const forecastData = useMemo(() => {
    const h = parseInt(horizon);
    return filteredProducts.map(p => ({
      product: p,
      forecast: forecastProduct(p, h, growthPct),
    }));
  }, [filteredProducts, horizon, growthPct]);

  const totalForecastVol = forecastData.reduce((s, d) => s + d.forecast.totalForecast, 0);

  const handleExport = () => {
    const h = parseInt(horizon);
    const header = ["SKU", "ABC-XYZ", "Média Mensal (kg)", "Crescimento (%)", "Horizonte (meses)", "Forecast Total (kg)", "Taxa Diária (kg)"];
    const rows = forecastData.map(d => [
      d.product.SKU_LABEL,
      d.product.abcXyz,
      String(Math.round(d.product.mediaMensal)),
      String(growthPct),
      String(h),
      String(d.forecast.totalForecast),
      String(d.forecast.dailyRate),
    ]);
    downloadCSV([header, ...rows], `forecast_${horizon}m_${growthPct}pct.csv`);
  };

  if (!state) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Forecast de Demanda
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">Projeção baseada em média histórica + % crescimento</p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={handleExport} disabled={forecastData.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
        </Button>
      </div>

      {/* Controls */}
      <div className="metric-card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs text-muted-foreground font-mono mb-1 block">Horizonte</label>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="9">9 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono mb-1 block">Crescimento: {growthPct}%</label>
            <Slider value={[growthPct]} onValueChange={v => setGrowthPct(v[0])} min={-30} max={50} step={1} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono mb-1 block">Filtro ABC</label>
            <Select value={filterABC} onValueChange={setFilterABC}>
              <SelectTrigger className="font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                <SelectItem value="A">Classe A</SelectItem>
                <SelectItem value="B">Classe B</SelectItem>
                <SelectItem value="C">Classe C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono mb-1 block">Produtos</label>
            <MultiSelect options={productOptions} selected={selectedSkus} onChange={setSelectedSkus} placeholder="Todos ou selecione..." />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="SKUs no Forecast" value={forecastData.length} />
        <MetricCard label="Vol. Total Forecast" value={`${totalForecastVol.toLocaleString()} kg`} sub={`${horizon} meses`} />
        <MetricCard label="Crescimento Aplicado" value={`${growthPct}%`} />
        <MetricCard label="Horizonte" value={`${horizon} meses`} />
      </div>

      {/* Table */}
      <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>SKU</th>
              <th>ABC-XYZ</th>
              <th>Média Mensal</th>
              <th>Estratégia</th>
              <th>Forecast Total</th>
              <th>Taxa Diária</th>
              <th>Tendência</th>
            </tr>
          </thead>
          <tbody>
            {forecastData.slice(0, 100).map(d => (
              <tr key={d.product.SKU_LABEL}>
                <td className="max-w-[200px] truncate text-xs" title={d.product.SKU_LABEL}>{d.product.SKU_LABEL}</td>
                <td><ABCBadge classe={d.product.abcXyz} /></td>
                <td className="text-right font-mono text-xs">{Math.round(d.product.mediaMensal).toLocaleString()}</td>
                <td><StratBadge strat={d.product.estrategiaFinal ?? d.product.estrategiaBase} /></td>
                <td className="text-right font-mono text-xs font-bold">{d.forecast.totalForecast.toLocaleString()}</td>
                <td className="text-right font-mono text-xs">{d.forecast.dailyRate.toLocaleString()}</td>
                <td className="text-xs">{d.product.trendLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
