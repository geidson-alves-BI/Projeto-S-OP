import { useMemo, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import AnalysisStatusPanel from "@/components/AnalysisStatusPanel";
import { useAppData } from "@/contexts/AppDataContext";
import { useUploadCenter } from "@/hooks/use-upload-center";
import { ProductSeriesChart } from "@/components/Charts";
import { downloadCSV } from "@/lib/downloadCSV";

export default function DemandaFGPage() {
  const { state } = useAppData();
  const { uploadCenter } = useUploadCenter(true);
  const [filterABC, setFilterABC] = useState("Todos");

  const filteredProducts = useMemo(() => {
    if (!state) {
      return [];
    }
    if (filterABC === "Todos") {
      return state.products;
    }
    return state.products.filter((product) => product.classeABC === filterABC);
  }, [filterABC, state]);

  const handleExportHistorico = () => {
    if (!state) {
      return;
    }
    const header = ["SKU", "Codigo", "ABC", "XYZ", ...state.monthCols, "Vol. Total"];
    const rows = filteredProducts.map((product) => [
      product.SKU_LABEL,
      product.codigoProduto,
      product.classeABC,
      product.classeXYZ,
      ...state.monthCols.map((month) => String(Math.round(product.monthValues[month] || 0))),
      String(Math.round(product.volumeAnual)),
    ]);
    downloadCSV([header, ...rows], "demanda_fg_historico.csv");
  };

  return (
    <PageTransition className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2>
            <BarChart3 className="h-5 w-5 text-primary" /> Base Operacional - Demanda e historico
          </h2>
          <p>Leitura historica da operacao e cobertura da base para os modulos S&OP.</p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs gap-1.5" onClick={handleExportHistorico} disabled={!state}>
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </div>

      <AnalysisStatusPanel
        uploadCenter={uploadCenter}
        moduleKey="overall"
        title="Prontidao da Base Operacional"
        description="A ingestao ficou centralizada em Upload de Dados. Esta aba consome o overall_status da base operacional consolidada no backend."
        datasetIds={["production", "sales_orders", "customers"]}
      />

      {!state ? (
        <section className="metric-card text-center py-10">
          <p className="text-sm text-muted-foreground">
            Nenhuma base operacional foi consolidada ainda. Use a central para carregar producao, vendas e clientes.
          </p>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Total SKUs" value={state.products.length} accent />
            <MetricCard
              label="Meses"
              value={state.monthCols.length}
              sub={`${state.monthCols[0]} ate ${state.monthCols[state.monthCols.length - 1]}`}
            />
            <MetricCard
              label="Vol. Total"
              value={`${Math.round(state.products.reduce((sum, product) => sum + product.volumeAnual, 0)).toLocaleString()} kg`}
            />
            <MetricCard label="Classe A" value={state.products.filter((product) => product.classeABC === "A").length} />
            <MetricCard label="Clientes" value={state.hasClientes ? state.clientes.length : "N/A"} />
          </div>

          <div className="metric-card flex flex-wrap items-center gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground font-mono mb-1 block uppercase tracking-wider">Filtro ABC</label>
              <Select value={filterABC} onValueChange={setFilterABC}>
                <SelectTrigger className="w-36 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="A">Classe A</SelectItem>
                  <SelectItem value="B">Classe B</SelectItem>
                  <SelectItem value="C">Classe C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{filteredProducts.length} SKUs em leitura</span>
          </div>

          <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="data-table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>SKU</th>
                  <th>ABC</th>
                  <th>XYZ</th>
                  {state.monthCols.map((month) => (
                    <th key={month} className="text-center">{month}</th>
                  ))}
                  <th>Total</th>
                  <th>Media</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 80).map((product) => (
                  <tr key={product.SKU_LABEL}>
                    <td className="max-w-[180px] truncate text-xs" title={product.SKU_LABEL}>{product.SKU_LABEL}</td>
                    <td className="text-xs font-bold text-center">{product.classeABC}</td>
                    <td className="text-xs text-center">{product.classeXYZ}</td>
                    {state.monthCols.map((month) => (
                      <td key={month} className="text-right font-mono text-xs">
                        {Math.round(product.monthValues[month] || 0).toLocaleString()}
                      </td>
                    ))}
                    <td className="text-right font-mono text-xs font-bold">{Math.round(product.volumeAnual).toLocaleString()}</td>
                    <td className="text-right font-mono text-xs">{Math.round(product.mediaMensal).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="metric-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Top 5 SKUs - Serie historica</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProducts.slice(0, 5).map((product) => (
                <div key={product.SKU_LABEL} className="border border-border/60 rounded-xl p-4">
                  <p className="text-xs font-mono text-muted-foreground mb-2 truncate" title={product.SKU_LABEL}>
                    {product.SKU_LABEL}
                  </p>
                  <ProductSeriesChart data={product} monthCols={state.monthCols} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </PageTransition>
  );
}
