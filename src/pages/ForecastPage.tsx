import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import MultiSelect from "@/components/MultiSelect";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { useAppData } from "@/contexts/AppDataContext";
import type { ProductData } from "@/lib/pcpEngine";
import { postJSON } from "@/lib/api";
import { downloadCSV } from "@/lib/downloadCSV";
import type { ForecastResult } from "@/types/analytics";

interface ForecastInputRow {
  id: number;
  product_code: string;
  last_30_days: string;
  last_90_days: string;
  last_180_days: string;
  last_365_days: string;
}

function parseForecastResponse(payload: unknown): ForecastResult[] {
  if (Array.isArray(payload)) {
    return payload as ForecastResult[];
  }

  if (payload && typeof payload === "object") {
    const maybeRecord = payload as Record<string, unknown>;

    if (Array.isArray(maybeRecord.items)) {
      return maybeRecord.items as ForecastResult[];
    }

    if (Array.isArray(maybeRecord.data)) {
      return maybeRecord.data as ForecastResult[];
    }

    if (typeof maybeRecord.product_code === "string") {
      return [maybeRecord as ForecastResult];
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


export default function ForecastPage() {
  const { state } = useAppData();
  const navigate = useNavigate();
  useEffect(() => {
    if (!state) navigate("/upload");
  }, [state, navigate]);

  const [horizon, setHorizon] = useState("6");
  const [growthPct, setGrowthPct] = useState(0);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [filterABC, setFilterABC] = useState("Todos");

  const [forecastInputs, setForecastInputs] = useState<ForecastInputRow[]>([
    { id: 1, product_code: "", last_30_days: "", last_90_days: "", last_180_days: "", last_365_days: "" },
  ]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiResults, setApiResults] = useState<ForecastResult[]>([]);

  const productOptions = useMemo(() => state?.products.map(p => p.SKU_LABEL) ?? [], [state]);

  const filteredProducts = useMemo(() => {
    if (!state) return [];
    let list = state.products;
    if (filterABC !== "Todos") list = list.filter(p => p.classeABC === filterABC);
    if (selectedSkus.length > 0) list = list.filter(p => selectedSkus.includes(p.SKU_LABEL));
    return list;
  }, [state, filterABC, selectedSkus]);

  const forecastData = useMemo(() => {
    const h = parseInt(horizon, 10);
    return filteredProducts.map(p => ({
      product: p,
      forecast: forecastProduct(p, h, growthPct),
    }));
  }, [filteredProducts, horizon, growthPct]);

  const totalForecastVol = forecastData.reduce((s, d) => s + d.forecast.totalForecast, 0);

  const handleExport = () => {
    const h = parseInt(horizon, 10);
    const header = ["SKU", "ABC-XYZ", "Media Mensal (kg)", "Crescimento (%)", "Horizonte (meses)", "Forecast Total (kg)", "Taxa Diaria (kg)"];
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

  const updateInput = (id: number, field: keyof ForecastInputRow, value: string) => {
    setForecastInputs(prev => prev.map(row => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addInputRow = () => {
    setForecastInputs(prev => [
      ...prev,
      { id: Date.now(), product_code: "", last_30_days: "", last_90_days: "", last_180_days: "", last_365_days: "" },
    ]);
  };

  const removeInputRow = (id: number) => {
    setForecastInputs(prev => (prev.length > 1 ? prev.filter(row => row.id !== id) : prev));
  };

  const handleCalculateDemandForecast = async () => {
    try {
      setApiLoading(true);
      setApiError(null);

      const items = forecastInputs
        .filter(row => row.product_code.trim() !== "")
        .map(row => ({
          product_code: row.product_code.trim(),
          last_30_days: parseFlexibleNumber(row.last_30_days),
          last_90_days: parseFlexibleNumber(row.last_90_days),
          last_180_days: parseFlexibleNumber(row.last_180_days),
          last_365_days: parseFlexibleNumber(row.last_365_days),
        }));

      if (items.length === 0) {
        setApiError("Informe ao menos um product_code para calcular a previsao.");
        return;
      }

      let response: unknown;

      if (items.length === 1) {
        try {
          response = await postJSON("/analytics/forecast_demand", items[0]);
        } catch (_singleError) {
          response = await postJSON("/analytics/forecast_demand", { items });
        }
      } else {
        response = await postJSON("/analytics/forecast_demand", { items });
      }

      setApiResults(parseForecastResponse(response));
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setApiLoading(false);
    }
  };

  if (!state) return null;

  return (
    <PageTransition className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Forecast de Demanda
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">Projecao baseada em media historica + % crescimento</p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={handleExport} disabled={forecastData.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
        </Button>
      </div>

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="SKUs no Forecast" value={forecastData.length} />
        <MetricCard label="Vol. Total Forecast" value={`${totalForecastVol.toLocaleString()} kg`} sub={`${horizon} meses`} />
        <MetricCard label="Crescimento Aplicado" value={`${growthPct}%`} />
        <MetricCard label="Horizonte" value={`${horizon} meses`} />
      </div>

      <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>SKU</th>
              <th>ABC-XYZ</th>
              <th>Media Mensal</th>
              <th>Estrategia</th>
              <th>Forecast Total</th>
              <th>Taxa Diaria</th>
              <th>Tendencia</th>
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

      <div className="metric-card space-y-3">
        <h3 className="text-sm font-bold font-mono text-foreground">Calculo via backend analytics</h3>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>product_code</th>
                <th>last_30_days</th>
                <th>last_90_days</th>
                <th>last_180_days</th>
                <th>last_365_days</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {forecastInputs.map(row => (
                <tr key={row.id}>
                  <td>
                    <input
                      value={row.product_code}
                      onChange={e => updateInput(row.id, "product_code", e.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono"
                      placeholder="P001"
                    />
                  </td>
                  {(["last_30_days", "last_90_days", "last_180_days", "last_365_days"] as const).map(field => (
                    <td key={field}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row[field]}
                        onChange={e => updateInput(row.id, field, e.target.value)}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono"
                        placeholder="0"
                      />
                    </td>
                  ))}
                  <td>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => removeInputRow(row.id)}>
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="font-mono text-xs" onClick={addInputRow}>Adicionar linha</Button>
          <Button className="font-mono text-sm" onClick={handleCalculateDemandForecast} disabled={apiLoading}>
            {apiLoading ? "Calculando..." : "Calcular previsao de demanda"}
          </Button>
        </div>

        {apiError && <p className="text-xs font-mono text-destructive">{apiError}</p>}

        {apiResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>product_code</th>
                  <th>moving_average</th>
                  <th>seasonal_forecast</th>
                  <th>trend_forecast</th>
                  <th>final_forecast</th>
                </tr>
              </thead>
              <tbody>
                {apiResults.map((item, idx) => (
                  <tr key={`${item.product_code}-${idx}`}>
                    <td className="font-mono text-xs">{item.product_code}</td>
                    <td className="text-right font-mono text-xs">{Number(item.moving_average ?? item.moving_average_forecast ?? 0).toFixed(2)}</td>
                    <td className="text-right font-mono text-xs">{Number(item.seasonal_forecast ?? 0).toFixed(2)}</td>
                    <td className="text-right font-mono text-xs">{Number(item.trend_forecast ?? 0).toFixed(2)}</td>
                    <td className="text-right font-mono text-xs font-bold">{Number(item.final_forecast ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


