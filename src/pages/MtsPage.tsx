import { useMemo, useState } from "react";
import { Download, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import AnalysisStatusPanel from "@/components/AnalysisStatusPanel";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useAppData } from "@/contexts/AppDataContext";
import { useUploadCenter } from "@/hooks/use-upload-center";
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
  const { uploadCenter } = useUploadCenter(true);
  const [filterStrat, setFilterStrat] = useState("MTS (candidato)");
  const [sortBy, setSortBy] = useState<"prioridade" | "volume" | "dias">("prioridade");
  const [simulationInputs, setSimulationInputs] = useState<SimulationInputRow[]>([
    { id: 1, product_code: "", forecast_demand: "" },
  ]);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationResults, setSimulationResults] = useState<SimulationResult[]>([]);
  const datasets = Array.isArray(uploadCenter?.datasets) ? uploadCenter.datasets : [];
  const productionDataset = datasets.find((dataset) => dataset.id === "production");
  const salesOrdersDataset = datasets.find((dataset) => dataset.id === "sales_orders");
  const bomDataset = datasets.find((dataset) => dataset.id === "bom");
  const hasProduction =
    Boolean(productionDataset?.uploaded) && productionDataset?.availability_status !== "unavailable";
  const hasSalesOrders =
    Boolean(salesOrdersDataset?.uploaded) && salesOrdersDataset?.availability_status !== "unavailable";
  const hasBom =
    Boolean(bomDataset?.uploaded) && bomDataset?.availability_status !== "unavailable";
  const showSalesOnlyGuidance = hasSalesOrders && !hasProduction;

  const filtered = useMemo(() => {
    if (!state) {
      return [];
    }
    let products = state.products;
    if (filterStrat !== "Todos") {
      products = products.filter((product) => (product.estrategiaFinal ?? product.estrategiaBase) === filterStrat);
    }
    return [...products].sort((left, right) => {
      if (sortBy === "prioridade") {
        return right.prioridadeMTS - left.prioridadeMTS;
      }
      if (sortBy === "volume") {
        return right.volumeAnual - left.volumeAnual;
      }
      return (right.diasAlvoAjustado ?? right.diasAlvoBase) - (left.diasAlvoAjustado ?? left.diasAlvoBase);
    });
  }, [filterStrat, sortBy, state]);

  const totalVolMTS = filtered.reduce((sum, product) => sum + (product.targetKgAjustado ?? product.consumoDiario * product.diasAlvoBase), 0);
  const totalVolAnual = filtered.reduce((sum, product) => sum + product.volumeAnual, 0);

  const handleExport = () => {
    if (!state) {
      return;
    }
    const header = [
      "SKU",
      "Codigo",
      "ABC-XYZ",
      "Estrategia",
      "Vol. Anual (kg)",
      "Media/Mes (kg)",
      "Consumo Diario (kg)",
      "Dias Alvo",
      "Target Estoque (kg)",
      "Prioridade MTS",
      "Tendencia",
      "CV",
      ...(state.hasClientes ? ["Top1 Cliente", "Top1 Share (%)", "HHI"] : []),
    ];
    const rows = filtered.map((product) => [
      product.SKU_LABEL,
      product.codigoProduto,
      product.abcXyz,
      product.estrategiaFinal ?? product.estrategiaBase,
      String(Math.round(product.volumeAnual)),
      String(Math.round(product.mediaMensal)),
      String(Math.round(product.consumoDiario)),
      String(product.diasAlvoAjustado ?? product.diasAlvoBase),
      String(Math.round(product.targetKgAjustado ?? product.consumoDiario * product.diasAlvoBase)),
      String(product.prioridadeMTS),
      product.trendLabel,
      product.cv.toFixed(2),
      ...(state.hasClientes
        ? [
            product.top1Cliente ?? "",
            product.top1ShareProduto != null ? (product.top1ShareProduto * 100).toFixed(1) : "",
            product.hhiProduto != null ? product.hhiProduto.toFixed(3) : "",
          ]
        : []),
    ]);
    downloadCSV([header, ...rows], `mts_recomendacoes_${filterStrat.replace(/\s/g, "_")}.csv`);
  };

  const updateSimulationInput = (id: number, field: keyof SimulationInputRow, value: string) => {
    setSimulationInputs((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addSimulationRow = () => {
    setSimulationInputs((current) => [...current, { id: Date.now(), product_code: "", forecast_demand: "" }]);
  };

  const removeSimulationRow = (id: number) => {
    setSimulationInputs((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  };

  const handleSimulateMTS = async () => {
    if (!hasBom) {
      setSimulationError("A simulacao MTS exige BOM carregada. A tabela MTS/MTO continua disponivel sem BOM.");
      return;
    }
    try {
      setSimulationLoading(true);
      setSimulationError(null);
      const items = simulationInputs
        .filter((row) => row.product_code.trim() !== "")
        .map((row) => ({
          product_code: row.product_code.trim(),
          forecast_demand: parseFlexibleNumber(row.forecast_demand),
        }));

      if (items.length === 0) {
        setSimulationError("Informe ao menos um product_code para simular.");
        return;
      }

      const response = await postJSON("/analytics/simulate_mts_production", { items });
      setSimulationResults(parseSimulationResponse(response));
    } catch (requestError) {
      setSimulationError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSimulationLoading(false);
    }
  };

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
            <BreadcrumbPage>MTS/MTO</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> MTS/MTO
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Leitura operacional baseada na Base Operacional para priorizacao e simulacao de politica MTS/MTO.
          </p>
          <span className="mt-2 inline-flex rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
            Fonte principal: Base Operacional (production)
          </span>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={handleExport} disabled={!state}>
          <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
        </Button>
      </div>

      <AnalysisStatusPanel
        uploadCenter={uploadCenter}
        moduleKey="mts_mto"
        title="Prontidao para MTS/MTO"
        description="Pre-requisitos operacionais para leitura da politica MTS/MTO."
        summaryOverride="Obrigatorio para leitura: production. BOM e opcional para tabela, mas obrigatoria para simulacao."
        requiredDatasetIds={["production"]}
        optionalDatasetIds={["customers", "bom"]}
        primarySource="Base Operacional (production)"
      />

      {showSalesOnlyGuidance ? (
        <section className="rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Esta visao operacional requer production. Para analise baseada em vendas, use{" "}
          <Link to="/planejamento-producao" className="font-semibold text-primary underline underline-offset-2">
            Analise e Planejamento de Demanda
          </Link>
          .
        </section>
      ) : null}

      {!state ? (
        <section className="metric-card text-center py-10">
          <p className="text-sm text-muted-foreground">
            Sem historico operacional consolidado para priorizar candidatos no MTS/MTO.
          </p>
        </section>
      ) : (
        <>
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
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as "prioridade" | "volume" | "dias")}>
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
                {filtered.slice(0, 100).map((product, index) => (
                  <tr key={product.SKU_LABEL}>
                    <td className="text-xs text-muted-foreground">{index + 1}</td>
                    <td className="max-w-[200px] truncate text-xs" title={product.SKU_LABEL}>{product.SKU_LABEL}</td>
                    <td><ABCBadge classe={product.abcXyz} /></td>
                    <td><StratBadge strat={product.estrategiaFinal ?? product.estrategiaBase} /></td>
                    <td className="text-right font-mono text-xs">{Math.round(product.volumeAnual).toLocaleString()}</td>
                    <td className="text-right font-mono text-xs">{Math.round(product.consumoDiario).toLocaleString()}</td>
                    <td className="text-right font-mono text-xs">{product.diasAlvoAjustado ?? product.diasAlvoBase}</td>
                    <td className="text-right font-mono text-xs font-bold">{Math.round(product.targetKgAjustado ?? product.consumoDiario * product.diasAlvoBase).toLocaleString()}</td>
                    <td className="text-right font-mono text-xs">{product.prioridadeMTS}</td>
                    <td className="text-xs">{product.trendLabel}</td>
                    {state.hasClientes && <td className="text-xs max-w-[120px] truncate">{product.top1Cliente ?? "-"}</td>}
                    {state.hasClientes && <td className="text-right font-mono text-xs">{product.hhiProduto != null ? product.hhiProduto.toFixed(3) : "-"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className="metric-card space-y-3">
        <h3 className="text-sm font-bold font-mono text-foreground">Simulacao de decisao MTS</h3>
        <p className="text-sm text-muted-foreground">
          A simulacao continua nesta aba porque representa uma decisao de cenario, nao um upload primario.
        </p>
        {!hasBom ? (
          <div className="rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground">
            A tabela MTS/MTO pode ser consultada sem BOM. Para executar a simulacao, carregue a BOM na Central de Upload.
          </div>
        ) : null}

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
              {simulationInputs.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      value={row.product_code}
                      onChange={(event) => updateSimulationInput(row.id, "product_code", event.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono"
                      placeholder="P001"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.forecast_demand}
                      onChange={(event) => updateSimulationInput(row.id, "forecast_demand", event.target.value)}
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
          <Button className="font-mono text-sm" onClick={handleSimulateMTS} disabled={simulationLoading || !hasBom}>
            {simulationLoading ? "Simulando..." : hasBom ? "Simular Producao MTS" : "Carregue BOM para simular"}
          </Button>
        </div>

        {simulationError && <p className="text-xs font-mono text-destructive">{simulationError}</p>}

        {simulationResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">
              Total geral (total_production_cost):{" "}
              {simulationResults.reduce((sum, row) => sum + Number(row.total_production_cost ?? 0), 0).toFixed(2)}
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
                  {simulationResults.map((row, index) => (
                    <tr key={`${row.product_code}-${row.raw_material_code}-${index}`}>
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
      </section>
    </PageTransition>
  );
}
