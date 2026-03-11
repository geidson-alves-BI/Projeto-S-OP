import { useMemo, useState } from "react";
import { DollarSign, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import AnalysisStatusPanel from "@/components/AnalysisStatusPanel";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { useAppData } from "@/contexts/AppDataContext";
import { useUploadCenter } from "@/hooks/use-upload-center";
import { downloadCSV } from "@/lib/downloadCSV";

export default function FinanceiroPage() {
  const { state, rmData } = useAppData();
  const { uploadCenter } = useUploadCenter(true);
  const [sortBySku, setSortBySku] = useState<"investimento" | "volume">("investimento");
  const [sortByRm, setSortByRm] = useState<"investimento" | "cobertura">("investimento");
  const [slaLevel, setSlaLevel] = useState(84);

  const skuInvestment = useMemo(() => {
    if (!state) {
      return [];
    }
    return state.products
      .map((product) => {
        const days = product.diasAlvoAjustado ?? product.diasAlvoBase;
        const targetKg = product.consumoDiario * days;
        return { ...product, days, targetKg };
      })
      .sort((left, right) => (sortBySku === "investimento" ? right.targetKg - left.targetKg : right.volumeAnual - left.volumeAnual));
  }, [sortBySku, state]);

  const totalSkuTarget = skuInvestment.reduce((sum, product) => sum + product.targetKg, 0);

  const rmInvestment = useMemo(() => {
    if (!rmData) {
      return [];
    }
    return rmData
      .map((material) => {
        const target = material.slaTargets[slaLevel] ?? 0;
        const gap = Math.max(0, target - material.estoqueDisponivel);
        const investimento = gap * material.custoLiquidoUS;
        return { ...material, target, gap, investimento };
      })
      .sort((left, right) => (sortByRm === "investimento" ? right.investimento - left.investimento : left.coberturaDias - right.coberturaDias));
  }, [rmData, slaLevel, sortByRm]);

  const totalRmInvestimento = rmInvestment.reduce((sum, material) => sum + material.investimento, 0);
  const totalRmEstoque = rmData ? rmData.reduce((sum, material) => sum + material.estoqueDisponivel * material.custoLiquidoUS, 0) : 0;

  const handleExportSku = () => {
    const header = ["SKU", "Codigo", "ABC-XYZ", "Estrategia", "Consumo/Dia (kg)", "Dias Alvo", "Target Estoque (kg)", "Vol. Anual (kg)"];
    const rows = skuInvestment.map((product) => [
      product.SKU_LABEL,
      product.codigoProduto,
      product.abcXyz,
      product.estrategiaFinal ?? product.estrategiaBase,
      String(Math.round(product.consumoDiario)),
      String(product.days),
      String(Math.round(product.targetKg)),
      String(Math.round(product.volumeAnual)),
    ]);
    downloadCSV([header, ...rows], "financeiro_sku.csv");
  };

  const handleExportRm = () => {
    const header = ["Cod. Produto", "Denominacao", "Fornecedor", "Estoque Disp.", `Target SLA ${slaLevel}%`, "Gap", "Custo Unit. U$", "Investimento U$"];
    const rows = rmInvestment.map((material) => [
      material.codProduto,
      material.denominacao,
      material.fornecedor,
      String(Math.round(material.estoqueDisponivel)),
      String(material.target),
      String(Math.round(material.gap)),
      material.custoLiquidoUS.toFixed(2),
      material.investimento.toFixed(2),
    ]);
    downloadCSV([header, ...rows], `financeiro_rm_sla${slaLevel}.csv`);
  };

  return (
    <PageTransition className="p-6 space-y-6">
      <div className="page-header">
        <h2>
          <DollarSign className="h-5 w-5 text-primary" /> Financeiro - capital, valor e documentos
        </h2>
        <p>O upload saiu desta aba. Agora ela consome a central de planilhas e documentos financeiros para leitura executiva.</p>
      </div>

      <AnalysisStatusPanel
        uploadCenter={uploadCenter}
        moduleKey="finance"
        title="Prontidao financeira"
        description="Planilhas e documentos financeiros passaram para a central de upload. Esta aba usa a cobertura operacional ja registrada para traduzir impacto economico."
        datasetIds={["finance_documents", "raw_material_inventory", "bom", "sales_orders"]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {state && <MetricCard label="SKUs" value={state.products.length} accent />}
        {state && <MetricCard label="Target Estoque FG" value={`${Math.round(totalSkuTarget).toLocaleString()} kg`} />}
        {rmData && <MetricCard label="Estoque RM Atual (U$)" value={`U$ ${Math.round(totalRmEstoque).toLocaleString()}`} />}
        {rmData && <MetricCard label="Investimento RM p/ SLA" value={`U$ ${Math.round(totalRmInvestimento).toLocaleString()}`} sub={`SLA ${slaLevel}%`} />}
      </div>

      {state || rmData ? (
        <Tabs defaultValue={state ? "sku" : "rm"} className="w-full">
          <TabsList className="bg-secondary border border-border mb-4">
            {state && <TabsTrigger value="sku" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Por SKU</TabsTrigger>}
            {rmData && <TabsTrigger value="rm" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Por Materia-Prima</TabsTrigger>}
          </TabsList>

          {state && (
            <TabsContent value="sku" className="space-y-4">
              <div className="metric-card flex items-center gap-4">
                <div>
                  <label className="text-[11px] text-muted-foreground font-mono mb-1 block uppercase tracking-wider">Ordenar por</label>
                  <Select value={sortBySku} onValueChange={(value) => setSortBySku(value as "investimento" | "volume")}>
                    <SelectTrigger className="w-44 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investimento">Target Estoque</SelectItem>
                      <SelectItem value="volume">Volume Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" className="font-mono text-xs ml-auto gap-1.5" onClick={handleExportSku}>
                  <Download className="h-3.5 w-3.5" /> Exportar
                </Button>
              </div>

              <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="data-table">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th>#</th><th>SKU</th><th>ABC-XYZ</th><th>Estrategia</th>
                      <th>Consumo/Dia</th><th>Dias Alvo</th><th>Target Estoque (kg)</th><th>Vol. Anual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuInvestment.slice(0, 80).map((product, index) => (
                      <tr key={product.SKU_LABEL}>
                        <td className="text-xs text-muted-foreground">{index + 1}</td>
                        <td className="max-w-[200px] truncate text-xs" title={product.SKU_LABEL}>{product.SKU_LABEL}</td>
                        <td><ABCBadge classe={product.abcXyz} /></td>
                        <td><StratBadge strat={product.estrategiaFinal ?? product.estrategiaBase} /></td>
                        <td className="text-right font-mono text-xs">{Math.round(product.consumoDiario).toLocaleString()}</td>
                        <td className="text-right font-mono text-xs">{product.days}</td>
                        <td className="text-right font-mono text-xs font-bold">{Math.round(product.targetKg).toLocaleString()}</td>
                        <td className="text-right font-mono text-xs">{Math.round(product.volumeAnual).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}

          {rmData && (
            <TabsContent value="rm" className="space-y-4">
              <div className="metric-card flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-[11px] text-muted-foreground font-mono mb-1 block uppercase tracking-wider">SLA</label>
                  <Select value={String(slaLevel)} onValueChange={(value) => setSlaLevel(Number(value))}>
                    <SelectTrigger className="w-28 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50%</SelectItem>
                      <SelectItem value="84">84%</SelectItem>
                      <SelectItem value="98">98%</SelectItem>
                      <SelectItem value="99.9">99.9%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-mono mb-1 block uppercase tracking-wider">Ordenar por</label>
                  <Select value={sortByRm} onValueChange={(value) => setSortByRm(value as "investimento" | "cobertura")}>
                    <SelectTrigger className="w-44 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investimento">Maior Investimento</SelectItem>
                      <SelectItem value="cobertura">Menor Cobertura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" className="font-mono text-xs ml-auto gap-1.5" onClick={handleExportRm}>
                  <Download className="h-3.5 w-3.5" /> Exportar
                </Button>
              </div>

              <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="data-table">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th>#</th><th>Cod. Produto</th><th>Denominacao</th><th>Fornecedor</th>
                      <th>Estoque Disp.</th><th>Target SLA</th><th>Gap</th><th>Custo U$</th><th>Investimento U$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rmInvestment.slice(0, 80).map((material, index) => (
                      <tr key={material.codProduto + index}>
                        <td className="text-xs text-muted-foreground">{index + 1}</td>
                        <td className="font-mono text-xs font-semibold">{material.codProduto}</td>
                        <td className="text-xs max-w-[200px] truncate" title={material.denominacao}>{material.denominacao}</td>
                        <td className="text-xs max-w-[120px] truncate">{material.fornecedor || "-"}</td>
                        <td className="text-right font-mono text-xs">{Math.round(material.estoqueDisponivel).toLocaleString()}</td>
                        <td className="text-right font-mono text-xs">{material.target.toLocaleString()}</td>
                        <td className={`text-right font-mono text-xs font-bold ${material.gap > 0 ? "text-destructive" : "text-success"}`}>
                          {material.gap > 0 ? `+${Math.round(material.gap).toLocaleString()}` : "0"}
                        </td>
                        <td className="text-right font-mono text-xs">{material.custoLiquidoUS.toFixed(2)}</td>
                        <td className="text-right font-mono text-xs font-bold">
                          {material.investimento > 0 ? `U$ ${Math.round(material.investimento).toLocaleString()}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <section className="metric-card text-center py-10">
          <p className="text-sm text-muted-foreground">
            Carregue a base operacional e a cobertura de insumos na central para liberar a traducao financeira.
          </p>
        </section>
      )}
    </PageTransition>
  );
}
