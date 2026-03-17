import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Factory, RefreshCcw, ShieldAlert, BrainCircuit } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AnalysisStatusPanel from "@/components/AnalysisStatusPanel";
import MetricCard from "@/components/MetricCard";
import MultiSelect from "@/components/MultiSelect";
import PageTransition from "@/components/PageTransition";
import RiskHeatmap from "@/components/planning/RiskHeatmap";
import RiskWeightsPanel from "@/components/planning/RiskWeightsPanel";
import { useUploadCenter } from "@/hooks/use-upload-center";
import {
  exportPlanningProductionCSV,
  exportPlanningProductionPDF,
  getLatestPlanningProduction,
  runPlanningProduction,
} from "@/lib/api";
import type {
  ForecastMethodName,
  PlanningRiskScoring,
  PlanningProductionResult,
  PlanningProductionRunRequest,
} from "@/types/analytics";

const METHOD_OPTIONS: Array<{ value: ForecastMethodName; label: string }> = [
  { value: "auto", label: "Auto (melhor erro)" },
  { value: "moving_average", label: "Media movel" },
  { value: "weighted_moving_average", label: "Media movel ponderada" },
  { value: "simple_exponential_smoothing", label: "Suavizacao exponencial simples" },
  { value: "holt_trend", label: "Holt (tendencia)" },
  { value: "holt_winters_additive", label: "Holt-Winters aditivo" },
  { value: "holt_winters_multiplicative", label: "Holt-Winters multiplicativo" },
  { value: "historical_baseline_growth", label: "Baseline historico + crescimento" },
];

function parseGrowthMap(raw: string) {
  const parsed: Record<string, number> = {};
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [keyPart, valuePart] = line.split(/[:=]/);
      const key = (keyPart ?? "").trim();
      if (!key) {
        return;
      }
      const numeric = Number(String(valuePart ?? "").replace(",", ".").trim());
      if (Number.isFinite(numeric)) {
        parsed[key] = numeric;
      }
    });
  return parsed;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown) {
  return toNumber(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function pickString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const raw = row[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return "-";
}

function asRows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function formatPercent(value: unknown, digits = 1) {
  return `${toNumber(value).toFixed(digits)}%`;
}

function formatCurrency(value: unknown) {
  return toNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("pt-BR");
}

function normalizeWeights(weights: Record<string, number>) {
  const entries = Object.entries(weights).map(([key, value]) => [key, Math.max(toNumber(value), 0)] as const);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) {
    const even = entries.length > 0 ? 1 / entries.length : 0;
    return Object.fromEntries(entries.map(([key]) => [key, even]));
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

function scoreLevel(score: number, levels: PlanningRiskScoring["level_thresholds"] | undefined) {
  const safeScore = toNumber(score);
  const matched = (levels ?? []).find((level) => safeScore >= level.min && safeScore < level.max);
  if (matched) {
    return matched;
  }
  return { key: "critical", label: "critico", min: 75, max: 100, color_token: "destructive" };
}

function levelClass(levelKey: string) {
  const normalized = String(levelKey || "").toLowerCase();
  if (normalized === "critical") {
    return "bg-destructive/20 border border-destructive/40 text-destructive";
  }
  if (normalized === "high") {
    return "bg-warning/20 border border-warning/40 text-warning";
  }
  if (normalized === "moderate") {
    return "bg-warning/10 border border-warning/30 text-warning";
  }
  return "bg-success/20 border border-success/40 text-success";
}

export default function PlanningProductionPage() {
  const { uploadCenter } = useUploadCenter(true);
  const [result, setResult] = useState<PlanningProductionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scenarioName, setScenarioName] = useState("Cenario principal");
  const [method, setMethod] = useState<ForecastMethodName>("auto");
  const [horizonMonths, setHorizonMonths] = useState(6);
  const [seasonalPeriods, setSeasonalPeriods] = useState(12);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mtsCoverageDays, setMtsCoverageDays] = useState(45);
  const [mtuCoverageDays, setMtuCoverageDays] = useState(20);
  const [excessMultiplier, setExcessMultiplier] = useState(1.35);

  const [globalGrowth, setGlobalGrowth] = useState(0);
  const [growthByProductRaw, setGrowthByProductRaw] = useState("");
  const [growthByCustomerRaw, setGrowthByCustomerRaw] = useState("");
  const [growthByGroupRaw, setGrowthByGroupRaw] = useState("");
  const [growthByClassRaw, setGrowthByClassRaw] = useState("");

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [analyticView, setAnalyticView] = useState<"product" | "customer" | "group" | "class">("product");
  const [growthScenario, setGrowthScenario] = useState("base");
  const [operationalWeights, setOperationalWeights] = useState<Record<string, number>>({});
  const [commercialWeights, setCommercialWeights] = useState<Record<string, number>>({});
  const [integratedWeights, setIntegratedWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    if (growthScenario === "base") {
      setGlobalGrowth(0);
      return;
    }
    if (growthScenario === "conservador") {
      setGlobalGrowth(3);
      return;
    }
    setGlobalGrowth(8);
  }, [growthScenario]);

  useEffect(() => {
    let active = true;
    const loadLatest = async () => {
      setLoading(true);
      setError(null);
      try {
        const latest = await getLatestPlanningProduction();
        if (!active) {
          return;
        }
        if (latest.available && latest.data) {
          setResult(latest.data);
          setScenarioName(latest.data.scenario_name || "Cenario principal");
          setMethod((latest.data.selected_method || "auto") as ForecastMethodName);
          if (latest.data.risk_scoring?.weights) {
            setOperationalWeights(normalizeWeights(latest.data.risk_scoring.weights.operational ?? {}));
            setCommercialWeights(normalizeWeights(latest.data.risk_scoring.weights.commercial ?? {}));
            setIntegratedWeights(normalizeWeights(latest.data.risk_scoring.weights.integrated ?? {}));
          }
        }
      } catch (requestError) {
        if (!active) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : String(requestError));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void loadLatest();
    return () => {
      active = false;
    };
  }, []);

  const productOptions = useMemo(
    () =>
      asRows(result?.summary_by_product)
        .map((row) => pickString(row, "product_code"))
        .filter((value, index, arr) => value !== "-" && arr.indexOf(value) === index),
    [result],
  );
  const customerOptions = useMemo(
    () =>
      asRows(result?.summary_by_customer)
        .map((row) => pickString(row, "customer_label", "customer_name", "customer_code"))
        .filter((value, index, arr) => value !== "-" && arr.indexOf(value) === index),
    [result],
  );
  const groupOptions = useMemo(
    () =>
      asRows(result?.summary_by_group)
        .map((row) => pickString(row, "product_group"))
        .filter((value, index, arr) => value !== "-" && arr.indexOf(value) === index),
    [result],
  );
  const classOptions = useMemo(
    () =>
      asRows(result?.summary_by_class)
        .map((row) => pickString(row, "abc_class"))
        .filter((value, index, arr) => value !== "-" && arr.indexOf(value) === index),
    [result],
  );

  const requestPayload = useMemo<PlanningProductionRunRequest>(
    () => ({
      scenario_name: scenarioName,
      method,
      horizon_months: horizonMonths,
      seasonal_periods: seasonalPeriods,
      filters: {
        product_codes: selectedProducts,
        customer_codes: selectedCustomers,
        product_groups: selectedGroups,
        abc_classes: selectedClasses,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      },
      growth: {
        global_pct: globalGrowth,
        by_product: parseGrowthMap(growthByProductRaw),
        by_customer: parseGrowthMap(growthByCustomerRaw),
        by_group: parseGrowthMap(growthByGroupRaw),
        by_class: parseGrowthMap(growthByClassRaw),
      },
      mts_mtu: {
        mts_coverage_days: mtsCoverageDays,
        mtu_coverage_days: mtuCoverageDays,
        excess_multiplier: excessMultiplier,
      },
    }),
    [
      scenarioName,
      method,
      horizonMonths,
      seasonalPeriods,
      selectedProducts,
      selectedCustomers,
      selectedGroups,
      selectedClasses,
      startDate,
      endDate,
      globalGrowth,
      growthByProductRaw,
      growthByCustomerRaw,
      growthByGroupRaw,
      growthByClassRaw,
      mtsCoverageDays,
      mtuCoverageDays,
      excessMultiplier,
    ],
  );

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await runPlanningProduction(requestPayload);
      setResult(payload);
      if (payload.risk_scoring?.weights) {
        setOperationalWeights(normalizeWeights(payload.risk_scoring.weights.operational ?? {}));
        setCommercialWeights(normalizeWeights(payload.risk_scoring.weights.commercial ?? {}));
        setIntegratedWeights(normalizeWeights(payload.risk_scoring.weights.integrated ?? {}));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setError(null);
    try {
      await exportPlanningProductionCSV({
        request: requestPayload,
        use_latest_if_available: false,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  };

  const handleExportPdf = async () => {
    setError(null);
    try {
      await exportPlanningProductionPDF({
        request: requestPayload,
        use_latest_if_available: false,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  };

  const methodMetrics = result?.method_metrics ? Object.entries(result.method_metrics) : [];
  const summaryByProduct = asRows(result?.summary_by_product).slice(0, 30);
  const summaryByCustomer = asRows(result?.summary_by_customer).slice(0, 20);
  const summaryByGroup = asRows(result?.summary_by_group).slice(0, 20);
  const summaryByClass = asRows(result?.summary_by_class).slice(0, 10);
  const summaryByGroupCustomer = asRows(result?.summary_by_group_customer).slice(0, 60);
  const mtsMtuRows = asRows(result?.mts_mtu_scenarios).slice(0, 30);

  const totals = result?.totals;
  const risk = result?.risk_alerts;
  const riskScoring = result?.risk_scoring;
  const scoreLabels = riskScoring?.component_labels ?? {};
  const forecastViewRows = result?.forecast_visual?.by_dimension?.[analyticView] ?? [];
  const historyMonthly = result?.forecast_visual?.historical_monthly ?? [];
  const forecastMonthly = result?.forecast_visual?.forecast_monthly ?? [];
  const levels = riskScoring?.level_thresholds ?? [];

  const topGroup = summaryByGroup[0];
  const growthChampion = [...summaryByClass].sort((a, b) => toNumber(b.growth_impact_pct) - toNumber(a.growth_impact_pct))[0];
  const estimatedRevenue = toNumber(totals?.estimated_revenue);
  const forecastConfidence = toNumber(result?.forecast_confidence?.percent);
  const analysisStatus = result ? (result.data_warnings.length > 0 ? "Parcial" : "Pronto") : "Aguardando";
  const analysisStatusClass =
    analysisStatus === "Pronto" ? "status-ok" : analysisStatus === "Parcial" ? "status-warn" : "status-error";
  const datasets = Array.isArray(uploadCenter?.datasets) ? uploadCenter.datasets : [];
  const salesOrdersDataset = datasets.find((dataset) => dataset.id === "sales_orders");
  const productionDataset = datasets.find((dataset) => dataset.id === "production");
  const hasSalesOrders =
    Boolean(salesOrdersDataset?.uploaded) && salesOrdersDataset?.availability_status !== "unavailable";
  const hasProduction =
    Boolean(productionDataset?.uploaded) && productionDataset?.availability_status !== "unavailable";
  const showProductionGuidance = hasProduction && !hasSalesOrders;

  const recomputeHeatmap = (
    heatmap: PlanningRiskScoring["operational_heatmap"] | undefined,
    weights: Record<string, number>,
  ) => {
    if (!heatmap) {
      return heatmap;
    }
    const normalizedWeights = normalizeWeights(weights);
    return {
      ...heatmap,
      weights: normalizedWeights,
      cells: heatmap.cells.map((cell) => {
        const weightedEntries = Object.entries(normalizedWeights).map(([key, weight]) => {
          const component = toNumber(cell.components?.[key]);
          return [key, component * weight * 100] as const;
        });
        const score = weightedEntries.reduce((sum, [, value]) => sum + value, 0);
        const level = scoreLevel(score, levels);
        const topDriver = weightedEntries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "growth";
        return {
          ...cell,
          score,
          level_key: level.key,
          level_label: level.label,
          primary_driver_key: topDriver,
          primary_driver_label: scoreLabels[topDriver] ?? topDriver,
          contributions: Object.fromEntries(weightedEntries),
        };
      }),
    };
  };

  const operationalHeatmap = useMemo(
    () =>
      recomputeHeatmap(
        riskScoring?.operational_heatmap,
        Object.keys(operationalWeights).length > 0
          ? operationalWeights
          : riskScoring?.operational_heatmap?.weights ?? {},
      ),
    [riskScoring, operationalWeights],
  );
  const commercialHeatmap = useMemo(
    () =>
      recomputeHeatmap(
        riskScoring?.commercial_heatmap,
        Object.keys(commercialWeights).length > 0
          ? commercialWeights
          : riskScoring?.commercial_heatmap?.weights ?? {},
      ),
    [riskScoring, commercialWeights],
  );
  const integratedHeatmap = useMemo(
    () =>
      recomputeHeatmap(
        riskScoring?.integrated_heatmap,
        Object.keys(integratedWeights).length > 0
          ? integratedWeights
          : riskScoring?.integrated_heatmap?.weights ?? {},
      ),
    [riskScoring, integratedWeights],
  );

  const topRisks = useMemo(() => {
    const allCells = [
      ...(operationalHeatmap?.cells ?? []).map((cell) => ({ ...cell, heatmap_type: "operational" })),
      ...(commercialHeatmap?.cells ?? []).map((cell) => ({ ...cell, heatmap_type: "commercial" })),
      ...(integratedHeatmap?.cells ?? []).map((cell) => ({ ...cell, heatmap_type: "integrated" })),
    ];

    return allCells
      .sort((a, b) => toNumber(b.score) - toNumber(a.score))
      .slice(0, 10)
      .map((cell) => ({
        heatmap: cell.heatmap_type,
        group: pickString(cell.metrics ?? {}, "product_group"),
        abc: pickString(cell.metrics ?? {}, "abc_class"),
        customer: pickString(cell.metrics ?? {}, "customer_label", "top_customer_label"),
        product: pickString(cell.metrics ?? {}, "top_product_code"),
        forecast: toNumber((cell.metrics ?? {}).final_forecast),
        growth: toNumber((cell.metrics ?? {}).growth_impact_pct),
        score: toNumber(cell.score),
        levelKey: String(cell.level_key ?? "moderate"),
        levelLabel: String(cell.level_label ?? "-"),
        driver: String(cell.primary_driver_label ?? "-"),
      }));
  }, [operationalHeatmap, commercialHeatmap, integratedHeatmap]);

  const forecastBars = forecastViewRows
    .slice(0, 12)
    .map((row) => ({
      entity: pickString(row, "entity"),
      historico: toNumber(row.historical_quantity),
      base: toNumber(row.forecast_base),
      ajustado: toNumber(row.forecast_adjusted),
    }));

  const timelineRows = [
    ...historyMonthly.map((row) => ({
      period: pickString(row, "period"),
      historico: toNumber(row.historical_quantity),
      base: 0,
      ajustado: 0,
    })),
    ...forecastMonthly.map((row) => ({
      period: pickString(row, "period"),
      historico: 0,
      base: toNumber(row.forecast_base),
      ajustado: toNumber(row.forecast_adjusted),
    })),
  ];

  return (
    <PageTransition className="p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Inicio</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Analise e Planejamento de Demanda</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section className="metric-card flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" /> Analise e Planejamento de Demanda
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            Leitura comercial de demanda, crescimento, risco e decisao MTS/MTO no planning executivo.
          </p>
          <span className="inline-flex rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
            Fonte principal: Vendas/Pedidos (sales_orders)
          </span>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground">Ultima atualizacao: {formatDateTime(result?.generated_at)}</span>
            <span className={analysisStatusClass}>Analise: {analysisStatus}</span>
            <span className="text-[11px] text-muted-foreground">
              Cenario: {growthScenario === "agressivo" ? "Agressivo" : growthScenario === "conservador" ? "Conservador" : "Base"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="font-mono text-xs gap-2" onClick={handleRun} disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5" />
            {loading ? "Atualizando..." : "Atualizar cenario"}
          </Button>
          <Button variant="outline" className="font-mono text-xs gap-2" onClick={handleExportCsv} disabled={loading}>
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
          <Button variant="outline" className="font-mono text-xs gap-2" onClick={handleExportPdf} disabled={loading}>
            <Download className="h-3.5 w-3.5" />
            Exportar PDF
          </Button>
        </div>
      </section>

      <AnalysisStatusPanel
        uploadCenter={uploadCenter}
        moduleKey="planning_production"
        title="Prontidao para Analise e Planejamento de Demanda"
        description="Pre-requisitos comerciais para liberar a leitura de demanda."
        summaryOverride="Obrigatorio: sales_orders. Opcionais: customers e raw_material_inventory."
        requiredDatasetIds={["sales_orders"]}
        optionalDatasetIds={["customers", "raw_material_inventory"]}
        primarySource="Vendas/Pedidos (sales_orders)"
      />

      {showProductionGuidance ? (
        <section className="rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground">
          A base de producao foi carregada com sucesso, mas este modulo usa sales_orders. Para usar producao, acesse{" "}
          <Link to="/mts" className="font-semibold text-primary underline underline-offset-2">
            MTS/MTO
          </Link>
          .
        </section>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <MetricCard label="Demanda prevista total" value={formatNumber(totals?.final_forecast)} accent />
        <MetricCard label="Crescimento projetado" value={formatPercent(totals?.growth_impact_pct, 2)} />
        <MetricCard label="Receita estimada" value={formatCurrency(estimatedRevenue)} />
        <MetricCard
          label="Compra MP projetada"
          value={formatNumber(totals?.projected_purchase_need_qty)}
          sub={`${formatNumber(totals?.materials_with_purchase_need)} itens`}
        />
        <MetricCard
          label="Grupo maior demanda"
          value={pickString(topGroup ?? {}, "product_group")}
          sub={formatNumber(topGroup?.final_forecast)}
        />
        <MetricCard
          label="Classe maior crescimento"
          value={pickString(growthChampion ?? {}, "abc_class")}
          sub={formatPercent(growthChampion?.growth_impact_pct, 2)}
        />
        <MetricCard label="Metodo selecionado" value={result?.selected_method ?? method} />
        <MetricCard
          label="Confianca da previsao"
          value={`${forecastConfidence.toFixed(1)}%`}
          sub={result?.forecast_confidence?.label ?? "sem leitura"}
        />
      </section>

      <section className="metric-card space-y-4">
        <h3 className="text-sm font-semibold font-mono">Barra de filtros executivos</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Cenario</label>
            <input
              value={scenarioName}
              onChange={(event) => setScenarioName(event.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Cenario de crescimento</label>
            <Select value={growthScenario} onValueChange={setGrowthScenario}>
              <SelectTrigger className="font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="conservador">Conservador</SelectItem>
                <SelectItem value="agressivo">Agressivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Metodo de forecast</label>
            <Select value={method} onValueChange={(value) => setMethod(value as ForecastMethodName)}>
              <SelectTrigger className="font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Horizonte (meses)</label>
            <input
              type="number"
              min={1}
              max={24}
              value={horizonMonths}
              onChange={(event) => setHorizonMonths(Math.max(1, Math.min(24, Number(event.target.value) || 1)))}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Sazonalidade</label>
            <input
              type="number"
              min={2}
              max={24}
              value={seasonalPeriods}
              onChange={(event) => setSeasonalPeriods(Math.max(2, Math.min(24, Number(event.target.value) || 12)))}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Visao analitica</label>
            <Select value={analyticView} onValueChange={(value) => setAnalyticView(value as "product" | "customer" | "group" | "class")}>
              <SelectTrigger className="font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Produto</SelectItem>
                <SelectItem value="customer">Cliente</SelectItem>
                <SelectItem value="group">Grupo</SelectItem>
                <SelectItem value="class">Classe ABC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Periodo inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Periodo final</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Cobertura MTS (dias)</label>
            <input
              type="number"
              min={1}
              value={mtsCoverageDays}
              onChange={(event) => setMtsCoverageDays(Math.max(1, Number(event.target.value) || 1))}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Cobertura MTO (dias)</label>
            <input
              type="number"
              min={1}
              value={mtuCoverageDays}
              onChange={(event) => setMtuCoverageDays(Math.max(1, Number(event.target.value) || 1))}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Multiplicador de excesso</label>
            <input
              type="number"
              min={1}
              step={0.05}
              value={excessMultiplier}
              onChange={(event) => setExcessMultiplier(Math.max(1, Number(event.target.value) || 1))}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Crescimento global (%)</label>
            <input
              type="number"
              step={0.1}
              value={globalGrowth}
              onChange={(event) => setGlobalGrowth(Number(event.target.value) || 0)}
              className="w-full bg-background border border-border rounded px-2 py-2 text-xs font-mono"
            />
          </div>
        </div>
      </section>

      <section className="metric-card space-y-4">
        <h3 className="text-sm font-semibold font-mono">Filtros executivos</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Produtos</label>
            <MultiSelect
              options={productOptions}
              selected={selectedProducts}
              onChange={setSelectedProducts}
              placeholder="Todos os produtos"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Clientes</label>
            <MultiSelect
              options={customerOptions}
              selected={selectedCustomers}
              onChange={setSelectedCustomers}
              placeholder="Todos os clientes"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Grupos</label>
            <MultiSelect
              options={groupOptions}
              selected={selectedGroups}
              onChange={setSelectedGroups}
              placeholder="Todos os grupos"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Classe ABC</label>
            <MultiSelect
              options={classOptions}
              selected={selectedClasses}
              onChange={setSelectedClasses}
              placeholder="A, B, C"
            />
          </div>
        </div>
      </section>

      <section className="metric-card space-y-4">
        <h3 className="text-sm font-semibold font-mono">Crescimento comercial por dimensao</h3>
        <p className="text-xs text-muted-foreground">
          Formato: uma linha por ajuste em <span className="font-mono">chave=percentual</span>. Ex.:{" "}
          <span className="font-mono">A=12</span> ou <span className="font-mono">P001=7</span>.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Por produto</label>
            <textarea
              value={growthByProductRaw}
              onChange={(event) => setGrowthByProductRaw(event.target.value)}
              className="w-full min-h-[110px] bg-background border border-border rounded px-2 py-2 text-xs font-mono"
              placeholder="P001=7"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Por cliente</label>
            <textarea
              value={growthByCustomerRaw}
              onChange={(event) => setGrowthByCustomerRaw(event.target.value)}
              className="w-full min-h-[110px] bg-background border border-border rounded px-2 py-2 text-xs font-mono"
              placeholder="CLI_01=18"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Por grupo</label>
            <textarea
              value={growthByGroupRaw}
              onChange={(event) => setGrowthByGroupRaw(event.target.value)}
              className="w-full min-h-[110px] bg-background border border-border rounded px-2 py-2 text-xs font-mono"
              placeholder="Floral=9"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-mono block mb-1">Por classe ABC</label>
            <textarea
              value={growthByClassRaw}
              onChange={(event) => setGrowthByClassRaw(event.target.value)}
              className="w-full min-h-[110px] bg-background border border-border rounded px-2 py-2 text-xs font-mono"
              placeholder="A=12"
            />
          </div>
        </div>
      </section>

      {result ? (
        <>
          <section className="metric-card space-y-3">
            <h3 className="text-sm font-semibold font-mono">Comparativo de metodos (MAE, MAPE, RMSE, Bias)</h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metodo</th>
                    <th>MAE</th>
                    <th>MAPE</th>
                    <th>RMSE</th>
                    <th>Bias</th>
                    <th>Suporte</th>
                    <th>Produtos avaliados</th>
                  </tr>
                </thead>
                <tbody>
                  {methodMetrics.map(([methodName, metric]) => (
                    <tr key={methodName}>
                      <td className="font-mono text-xs">{methodName}</td>
                      <td className="text-right font-mono text-xs">{metric.mae != null ? formatNumber(metric.mae) : "-"}</td>
                      <td className="text-right font-mono text-xs">{metric.mape != null ? `${formatNumber(metric.mape)}%` : "-"}</td>
                      <td className="text-right font-mono text-xs">{metric.rmse != null ? formatNumber(metric.rmse) : "-"}</td>
                      <td className="text-right font-mono text-xs">{metric.bias != null ? formatNumber(metric.bias) : "-"}</td>
                      <td className="text-right font-mono text-xs">{metric.support ?? 0}</td>
                      <td className="text-right font-mono text-xs">{metric.products_evaluated ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="metric-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold font-mono">Visual principal do forecast</h3>
                <p className="text-xs text-muted-foreground">
                  Historico vs forecast base vs forecast ajustado com alternancia por visao analitica.
                </p>
              </div>
              <Select value={analyticView} onValueChange={(value) => setAnalyticView(value as "product" | "customer" | "group" | "class")}>
                <SelectTrigger className="font-mono text-xs w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Produto</SelectItem>
                  <SelectItem value="customer">Cliente</SelectItem>
                  <SelectItem value="group">Grupo</SelectItem>
                  <SelectItem value="class">Classe ABC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Comparativo por entidade</p>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecastBars}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="entity" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={0} angle={-25} textAnchor="end" height={64} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="historico" fill="hsl(var(--muted-foreground))" name="Historico" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="base" fill="hsl(var(--primary))" name="Forecast base" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="ajustado" fill="hsl(var(--success))" name="Forecast ajustado" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Timeline historico e projetado</p>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="historico" stroke="hsl(var(--muted-foreground))" name="Historico" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="base" stroke="hsl(var(--primary))" name="Forecast base" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="ajustado" stroke="hsl(var(--success))" name="Forecast ajustado" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="metric-card space-y-3">
              <h3 className="text-sm font-semibold font-mono">Resumo por produto</h3>
              <div className="overflow-x-auto max-h-[360px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Grupo</th>
                      <th>Classe</th>
                      <th>Metodo</th>
                      <th>Historico</th>
                      <th>Base</th>
                      <th>Final</th>
                      <th>Receita estimada</th>
                      <th>Impacto (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryByProduct.map((row, index) => (
                      <tr key={`${pickString(row, "product_code")}-${index}`}>
                        <td className="font-mono text-xs">{pickString(row, "product_code")}</td>
                        <td className="text-xs">{pickString(row, "product_group")}</td>
                        <td className="text-xs">{pickString(row, "abc_class")}</td>
                        <td className="font-mono text-xs">{pickString(row, "method_used")}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.historical_quantity)}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.base_forecast)}</td>
                        <td className="text-right font-mono text-xs font-bold">{formatNumber(row.final_forecast)}</td>
                        <td className="text-right font-mono text-xs">{formatCurrency(row.estimated_revenue)}</td>
                        <td className="text-right font-mono text-xs">{toNumber(row.growth_impact_pct).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="metric-card space-y-3">
              <h3 className="text-sm font-semibold font-mono">Resumo por cliente</h3>
              <div className="overflow-x-auto max-h-[360px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Historico</th>
                      <th>Base</th>
                      <th>Final</th>
                      <th>Receita estimada</th>
                      <th>Impacto (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryByCustomer.map((row, index) => (
                      <tr key={`${pickString(row, "customer_label", "customer_name")}-${index}`}>
                        <td className="text-xs">{pickString(row, "customer_label", "customer_name", "customer_code")}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.historical_quantity)}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.base_forecast)}</td>
                        <td className="text-right font-mono text-xs font-bold">{formatNumber(row.final_forecast)}</td>
                        <td className="text-right font-mono text-xs">{formatCurrency(row.estimated_revenue)}</td>
                        <td className="text-right font-mono text-xs">{toNumber(row.growth_impact_pct).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="metric-card space-y-3">
              <h3 className="text-sm font-semibold font-mono">Resumo por grupo</h3>
              <div className="overflow-x-auto max-h-[320px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      <th>Historico</th>
                      <th>Base</th>
                      <th>Final</th>
                      <th>Receita estimada</th>
                      <th>Impacto (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryByGroup.map((row, index) => (
                      <tr key={`${pickString(row, "product_group")}-${index}`}>
                        <td className="text-xs">{pickString(row, "product_group")}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.historical_quantity)}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.base_forecast)}</td>
                        <td className="text-right font-mono text-xs font-bold">{formatNumber(row.final_forecast)}</td>
                        <td className="text-right font-mono text-xs">{formatCurrency(row.estimated_revenue)}</td>
                        <td className="text-right font-mono text-xs">{toNumber(row.growth_impact_pct).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="metric-card space-y-3">
              <h3 className="text-sm font-semibold font-mono">Resumo por classe ABC</h3>
              <div className="overflow-x-auto max-h-[320px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Classe</th>
                      <th>Historico</th>
                      <th>Base</th>
                      <th>Final</th>
                      <th>Receita estimada</th>
                      <th>Impacto (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryByClass.map((row, index) => (
                      <tr key={`${pickString(row, "abc_class")}-${index}`}>
                        <td className="text-xs">{pickString(row, "abc_class")}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.historical_quantity)}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.base_forecast)}</td>
                        <td className="text-right font-mono text-xs font-bold">{formatNumber(row.final_forecast)}</td>
                        <td className="text-right font-mono text-xs">{formatCurrency(row.estimated_revenue)}</td>
                        <td className="text-right font-mono text-xs">{toNumber(row.growth_impact_pct).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="metric-card space-y-3">
            <h3 className="text-sm font-semibold font-mono">Cenario MTS e MTO (decisao)</h3>
            <div className="overflow-x-auto max-h-[360px]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Demanda prevista</th>
                    <th>Estoque</th>
                    <th>Cobertura (dias)</th>
                    <th>MTS recomendado</th>
                    <th>MTO recomendado</th>
                    <th>Nec. compra?</th>
                    <th>Valor proj. U$</th>
                    <th>Politica sugerida</th>
                    <th>Risco</th>
                  </tr>
                </thead>
                <tbody>
                  {mtsMtuRows.map((row, index) => (
                    <tr key={`${pickString(row, "product_code")}-${index}`}>
                      <td className="font-mono text-xs">{pickString(row, "product_code")}</td>
                      <td className="text-right font-mono text-xs">{formatNumber(row.demand_forecast)}</td>
                      <td className="text-right font-mono text-xs">{row.stock_available != null ? formatNumber(row.stock_available) : "-"}</td>
                      <td className="text-right font-mono text-xs">{row.coverage_days != null ? formatNumber(row.coverage_days) : "-"}</td>
                      <td className="text-right font-mono text-xs">{formatNumber(row.mts_recommended_volume)}</td>
                      <td className="text-right font-mono text-xs">{formatNumber(row.mtu_recommended_volume)}</td>
                      <td className="text-xs">{row.purchase_needed === true ? "Sim" : row.purchase_needed === false ? "Nao" : "-"}</td>
                      <td className="text-right font-mono text-xs">{formatNumber(row.projected_purchase_value_usd)}</td>
                      <td className="text-xs">{pickString(row, "suggested_policy")}</td>
                      <td className="text-xs">{pickString(row, "risk_status")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <RiskWeightsPanel
              title="Pesos risco operacional"
              weights={operationalWeights}
              labels={scoreLabels}
              onChange={setOperationalWeights}
            />
            <RiskWeightsPanel
              title="Pesos risco comercial"
              weights={commercialWeights}
              labels={scoreLabels}
              onChange={setCommercialWeights}
            />
            <RiskWeightsPanel
              title="Pesos risco integrado"
              weights={integratedWeights}
              labels={scoreLabels}
              onChange={setIntegratedWeights}
            />
          </section>

          <RiskHeatmap
            title="Heatmap de Risco Operacional"
            description="Classe ABC + crescimento + confianca de forecast + cobertura/estoque."
            heatmap={operationalHeatmap}
            emptyLabel="Sem granularidade suficiente para risco operacional."
          />
          <RiskHeatmap
            title="Heatmap de Risco Comercial"
            description="Crescimento + concentracao de clientes + valor/volume + confianca historica."
            heatmap={commercialHeatmap}
            emptyLabel="Sem granularidade suficiente para risco comercial."
          />
          <RiskHeatmap
            title="Heatmap Integrado"
            description="Cruzamento de grupo x classe com crescimento, concentracao, confianca e cobertura."
            heatmap={integratedHeatmap}
            emptyLabel="Sem cruzamento de dados para risco integrado."
          />

          <section className="metric-card space-y-3">
            <h3 className="text-sm font-semibold font-mono">Top riscos executivos</h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Heatmap</th>
                    <th>Grupo</th>
                    <th>Classe</th>
                    <th>Cliente</th>
                    <th>Produto</th>
                    <th>Crescimento</th>
                    <th>Forecast</th>
                    <th>Score</th>
                    <th>Faixa</th>
                    <th>Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {topRisks.map((riskRow, index) => (
                    <tr key={`${riskRow.heatmap}-${riskRow.group}-${riskRow.customer}-${index}`}>
                      <td className="text-xs">{riskRow.heatmap}</td>
                      <td className="text-xs">{riskRow.group}</td>
                      <td className="text-xs">{riskRow.abc}</td>
                      <td className="text-xs">{riskRow.customer}</td>
                      <td className="text-xs">{riskRow.product}</td>
                      <td className="text-right font-mono text-xs">{riskRow.growth.toFixed(2)}%</td>
                      <td className="text-right font-mono text-xs">{formatNumber(riskRow.forecast)}</td>
                      <td className="text-right font-mono text-xs font-bold">{riskRow.score.toFixed(1)}</td>
                      <td>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${levelClass(String(riskRow.levelKey))}`}>
                          {riskRow.levelLabel}
                        </span>
                      </td>
                      <td className="text-xs">{riskRow.driver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="metric-card space-y-3">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold font-mono">Insights executivos da IA</h3>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs">
                Classe com maior crescimento: <span className="font-mono">{pickString(growthChampion ?? {}, "abc_class")}</span>{" "}
                ({formatPercent(growthChampion?.growth_impact_pct, 2)})
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs">
                Grupo de maior demanda: <span className="font-mono">{pickString(topGroup ?? {}, "product_group")}</span>{" "}
                ({formatNumber(topGroup?.final_forecast)})
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs">
                Risco de ruptura: <span className="font-mono">{risk?.rupture_risk_count ?? 0}</span> produtos.
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs">
                Confianca de previsao: <span className="font-mono">{forecastConfidence.toFixed(1)}%</span>.
              </div>
            </div>
            {riskScoring?.data_limitations?.length ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                Limitacoes atuais: {riskScoring.data_limitations.join(" | ")}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sem limitacoes criticas sinalizadas para a leitura de risco.</p>
            )}
          </section>

          {summaryByGroupCustomer.length > 0 && (
            <section className="metric-card space-y-3">
              <h3 className="text-sm font-semibold font-mono">Segmentacao comercial grupo x cliente</h3>
              <div className="overflow-x-auto max-h-[320px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      <th>Cliente</th>
                      <th>Historico</th>
                      <th>Base</th>
                      <th>Final</th>
                      <th>Receita estimada</th>
                      <th>Impacto (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryByGroupCustomer.map((row, index) => (
                      <tr key={`${pickString(row, "product_group")}-${pickString(row, "customer_label")}-${index}`}>
                        <td className="text-xs">{pickString(row, "product_group")}</td>
                        <td className="text-xs">{pickString(row, "customer_label")}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.historical_quantity)}</td>
                        <td className="text-right font-mono text-xs">{formatNumber(row.base_forecast)}</td>
                        <td className="text-right font-mono text-xs font-bold">{formatNumber(row.final_forecast)}</td>
                        <td className="text-right font-mono text-xs">{formatCurrency(row.estimated_revenue)}</td>
                        <td className="text-right font-mono text-xs">{formatPercent(row.growth_impact_pct, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="metric-card space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <h3 className="text-sm font-semibold font-mono">Painel de alertas executivos</h3>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                Risco de ruptura: <span className="font-mono">{risk?.rupture_risk_count ?? 0}</span>
              </div>
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                Risco de excesso: <span className="font-mono">{risk?.excess_risk_count ?? 0}</span>
              </div>
              <div className="rounded-lg border border-border px-3 py-2 text-xs">
                Itens sem estoque/cobertura: <span className="font-mono">{risk?.missing_stock_count ?? 0}</span>
              </div>
            </div>
          </section>

          {result.data_warnings.length > 0 && (
            <section className="metric-card space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-warning" />
                <h3 className="text-sm font-semibold font-mono">Alertas executivos</h3>
              </div>
              <div className="grid gap-2">
                {result.data_warnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                    {warning}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="metric-card text-sm text-muted-foreground">
          Nenhum cenario executado ainda. Clique em "Atualizar cenario" apos validar os pre-requisitos.
        </section>
      )}

      {error && <p className="text-xs font-mono text-destructive">{error}</p>}
    </PageTransition>
  );
}


