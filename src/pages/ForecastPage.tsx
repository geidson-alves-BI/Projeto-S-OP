import { useEffect, useMemo, useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import MultiSelect from "@/components/MultiSelect";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import AnalysisStatusPanel from "@/components/AnalysisStatusPanel";
import { useAppData } from "@/contexts/AppDataContext";
import { useUploadCenter } from "@/hooks/use-upload-center";
import type { ProductData } from "@/lib/pcpEngine";
import { downloadCSV } from "@/lib/downloadCSV";
import { getForecastResults } from "@/lib/api";
import { parseForecastResults } from "@/lib/upload-center";
import type { ForecastResult } from "@/types/analytics";

function forecastProduct(product: ProductData, horizonMonths: number, growthPct: number) {
  const baseMonthly = product.mediaMensal;
  const growthFactor = 1 + growthPct / 100;
  let total = 0;

  for (let month = 1; month <= horizonMonths; month += 1) {
    total += baseMonthly * Math.pow(growthFactor, month / 12);
  }

  return {
    totalForecast: Math.round(total),
    dailyRate: Math.round(total / (horizonMonths * 30)),
  };
}

export default function ForecastPage() {
  const { state } = useAppData();
  const { uploadCenter } = useUploadCenter(true);
  const [horizon, setHorizon] = useState("6");
  const [growthPct, setGrowthPct] = useState(0);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [filterABC, setFilterABC] = useState("Todos");
  const [backendForecast, setBackendForecast] = useState<ForecastResult[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadResults = async () => {
      try {
        const payload = await getForecastResults();
        if (!active) {
          return;
        }
        setBackendForecast(parseForecastResults(payload));
        setBackendError(null);
      } catch (requestError) {
        if (!active) {
          return;
        }
        setBackendError(requestError instanceof Error ? requestError.message : String(requestError));
      }
    };

    void loadResults();
    return () => {
      active = false;
    };
  }, [uploadCenter]);

  const productOptions = useMemo(() => state?.products.map((product) => product.SKU_LABEL) ?? [], [state]);

  const filteredProducts = useMemo(() => {
    if (!state) {
      return [];
    }
    let products = state.products;
    if (filterABC !== "Todos") {
      products = products.filter((product) => product.classeABC === filterABC);
    }
    if (selectedSkus.length > 0) {
      products = products.filter((product) => selectedSkus.includes(product.SKU_LABEL));
    }
    return products;
  }, [filterABC, selectedSkus, state]);

  const forecastData = useMemo(() => {
    const parsedHorizon = Number(horizon);
    return filteredProducts.map((product) => ({
      product,
      forecast: forecastProduct(product, parsedHorizon, growthPct),
    }));
  }, [filteredProducts, growthPct, horizon]);

  const totalForecastVol = forecastData.reduce((sum, row) => sum + row.forecast.totalForecast, 0);

  const handleExport = () => {
    const parsedHorizon = Number(horizon);
    const header = [
      "SKU",
      "ABC-XYZ",
      "Media Mensal (kg)",
      "Crescimento (%)",
      "Horizonte (meses)",
      "Forecast Total (kg)",
      "Taxa Diaria (kg)",
    ];
    const rows = forecastData.map((row) => [
      row.product.SKU_LABEL,
      row.product.abcXyz,
      String(Math.round(row.product.mediaMensal)),
      String(growthPct),
      String(parsedHorizon),
      String(row.forecast.totalForecast),
      String(row.forecast.dailyRate),
    ]);
    downloadCSV([header, ...rows], `forecast_${horizon}m_${growthPct}pct.csv`);
  };

  return (
    <PageTransition className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Forecast e previsao executiva
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Esta aba usa as bases centralizadas para leitura de tendencia e consolidacao de demanda.
          </p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={handleExport} disabled={!state}>
          <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
        </Button>
      </div>

      <AnalysisStatusPanel
        uploadCenter={uploadCenter}
        moduleKey="forecast"
        title="Prontidao para previsao de demanda"
        description="A carga do forecast agora acontece na central. Aqui ficam a leitura analitica e o consumo do forecast consolidado."
        datasetIds={["production", "sales_orders", "forecast_input"]}
      />

      {!state ? (
        <section className="metric-card text-center py-10">
          <p className="text-sm text-muted-foreground">
            Carregue producao, vendas ou a base para previsao de demanda na central para liberar este modulo.
          </p>
        </section>
      ) : (
        <>
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
                <Slider value={[growthPct]} onValueChange={(value) => setGrowthPct(value[0])} min={-30} max={50} step={1} />
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
            <MetricCard label="Forecast backend" value={backendForecast.length} sub="registros consolidados" />
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
                {forecastData.slice(0, 100).map((row) => (
                  <tr key={row.product.SKU_LABEL}>
                    <td className="max-w-[200px] truncate text-xs" title={row.product.SKU_LABEL}>{row.product.SKU_LABEL}</td>
                    <td><ABCBadge classe={row.product.abcXyz} /></td>
                    <td className="text-right font-mono text-xs">{Math.round(row.product.mediaMensal).toLocaleString()}</td>
                    <td><StratBadge strat={row.product.estrategiaFinal ?? row.product.estrategiaBase} /></td>
                    <td className="text-right font-mono text-xs font-bold">{row.forecast.totalForecast.toLocaleString()}</td>
                    <td className="text-right font-mono text-xs">{row.forecast.dailyRate.toLocaleString()}</td>
                    <td className="text-xs">{row.product.trendLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className="metric-card space-y-3">
        <h3 className="text-sm font-bold font-mono text-foreground">Forecast consolidado na central</h3>
        <p className="text-sm text-muted-foreground">
          O input do forecast foi removido desta aba. Sempre que uma base para previsao for enviada pela central de upload,
          os resultados consolidados aparecem aqui.
        </p>

        {backendError ? (
          <p className="text-xs font-mono text-destructive">{backendError}</p>
        ) : backendForecast.length > 0 ? (
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
                {backendForecast.map((item, index) => (
                  <tr key={`${item.product_code}-${index}`}>
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
        ) : (
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Nenhum forecast consolidado foi enviado ainda pela central.
          </div>
        )}
      </section>
    </PageTransition>
  );
}
