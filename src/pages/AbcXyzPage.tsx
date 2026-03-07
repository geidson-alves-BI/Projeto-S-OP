import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { BarChart3, Grid3X3, ListChecks, Package, Users } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import MetricCard from "@/components/MetricCard";
import MultiSelect from "@/components/MultiSelect";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { ABCParetoChart, ABCCompleteChart, ABCXYZMatrix, ProductSeriesChart } from "@/components/Charts";
import { useAppData } from "@/contexts/AppDataContext";
import { toWide, pipeline } from "@/lib/pcpEngine";

export default function AbcXyzPage() {
  const { state } = useAppData();
  const navigate = useNavigate();

  useEffect(() => { if (!state) navigate("/upload"); }, [state, navigate]);

  const [topN, setTopN] = useState(40);
  const [estratFilter, setEstratFilter] = useState("Todos");
  const [selectedProds, setSelectedProds] = useState<string[]>([]);
  const [selectedClientes, setSelectedClientes] = useState<string[]>([]);

  const clienteView = useMemo(() => {
    if (!state || selectedClientes.length === 0) return null;
    const filteredLong = state.prodLong.filter(r => selectedClientes.includes((r as any).cliente ?? ""));
    if (filteredLong.length === 0) return null;
    const { wide, monthCols } = toWide(filteredLong);
    const products = pipeline(wide, monthCols);
    return { products, monthCols };
  }, [state, selectedClientes]);

  const filteredRec = useMemo(() => {
    if (!state) return [];
    let list = state.products;
    if (estratFilter !== "Todos") {
      list = list.filter(p => (p.estrategiaFinal ?? p.estrategiaBase) === estratFilter);
    }
    return list;
  }, [state, estratFilter]);

  const selectedProductsList = useMemo(() => {
    if (!state || selectedProds.length === 0) return [];
    return state.products.filter(p => selectedProds.includes(p.SKU_LABEL));
  }, [state, selectedProds]);

  const productOptions = useMemo(() => state?.products.map(p => p.SKU_LABEL) ?? [], [state]);

  if (!state) return null;

  return (
    <PageTransition className="p-6">
      <Tabs defaultValue="abc-exec" className="w-full">
        <TabsList className="bg-secondary border border-border mb-4 h-10 flex-wrap">
          <TabsTrigger value="abc-exec" className="font-mono text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="h-3.5 w-3.5" /> ABC Executivo
          </TabsTrigger>
          <TabsTrigger value="abc-full" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            ABC Completo
          </TabsTrigger>
          <TabsTrigger value="matrix" className="font-mono text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Grid3X3 className="h-3.5 w-3.5" /> Matriz ABC-XYZ
          </TabsTrigger>
          <TabsTrigger value="rec" className="font-mono text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Recomendações
          </TabsTrigger>
          <TabsTrigger value="produto" className="font-mono text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="h-3.5 w-3.5" /> Produto
          </TabsTrigger>
          {state.hasClientes && (
            <TabsTrigger value="cliente" className="font-mono text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-3.5 w-3.5" /> Cliente (Mix)
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="abc-exec" className="space-y-4">
          <div className="metric-card">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-xs text-muted-foreground font-mono">Top N:</span>
              <Slider value={[topN]} onValueChange={v => setTopN(v[0])} min={10} max={Math.min(120, state.products.length)} step={5} className="w-48" />
              <span className="text-sm font-mono text-primary">{topN}</span>
            </div>
            <h3 className="text-sm font-semibold mb-3 text-foreground">Curva ABC Executiva — Volume Produzido (kg)</h3>
            <ABCParetoChart data={state.products} topN={topN} />
          </div>
        </TabsContent>

        <TabsContent value="abc-full">
          <div className="metric-card">
            <h3 className="text-sm font-semibold mb-3 text-foreground">Curva ABC Completa — Acumulado</h3>
            <ABCCompleteChart data={state.products} />
          </div>
        </TabsContent>

        <TabsContent value="matrix">
          <div className="metric-card">
            <h3 className="text-sm font-semibold mb-4 text-foreground">Matriz ABC-XYZ (qtde de produtos)</h3>
            <ABCXYZMatrix data={state.products} />
          </div>
        </TabsContent>

        <TabsContent value="rec">
          <div className="metric-card space-y-4">
            <div className="flex items-center gap-4">
              <Select value={estratFilter} onValueChange={setEstratFilter}>
                <SelectTrigger className="w-48 font-mono text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="MTS (candidato)">MTS (candidato)</SelectItem>
                  <SelectItem value="MTO">MTO</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground font-mono">{filteredRec.length} registros</span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="data-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>SKU</th><th>ABC-XYZ</th><th>Vol. Anual</th><th>Média/Mês</th>
                    <th>Tendência</th><th>Estratégia</th><th>Dias Alvo</th><th>Prioridade</th>
                    {state.hasClientes && <th>Top1 Cliente</th>}
                    {state.hasClientes && <th>Top1 Share</th>}
                    {state.hasClientes && <th>HHI</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRec.slice(0, 80).map(p => (
                    <tr key={p.SKU_LABEL}>
                      <td className="max-w-[200px] truncate text-xs" title={p.SKU_LABEL}>{p.SKU_LABEL}</td>
                      <td><ABCBadge classe={p.abcXyz} /></td>
                      <td className="text-right font-mono text-xs">{Math.round(p.volumeAnual).toLocaleString()}</td>
                      <td className="text-right font-mono text-xs">{Math.round(p.mediaMensal).toLocaleString()}</td>
                      <td className="text-xs">{p.trendLabel}</td>
                      <td><StratBadge strat={p.estrategiaFinal ?? p.estrategiaBase} /></td>
                      <td className="text-right font-mono text-xs">{p.diasAlvoAjustado ?? p.diasAlvoBase}</td>
                      <td className="text-right font-mono text-xs">{p.prioridadeMTS}</td>
                      {state.hasClientes && <td className="text-xs max-w-[120px] truncate">{p.top1Cliente ?? "-"}</td>}
                      {state.hasClientes && <td className="text-right font-mono text-xs">{p.top1ShareProduto != null ? `${(p.top1ShareProduto * 100).toFixed(1)}%` : "-"}</td>}
                      {state.hasClientes && <td className="text-right font-mono text-xs">{p.hhiProduto != null ? p.hhiProduto.toFixed(3) : "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="produto">
          <div className="metric-card space-y-4">
            <MultiSelect options={productOptions} selected={selectedProds} onChange={setSelectedProds} placeholder="Buscar produto por código ou palavra-chave..." />
            {selectedProductsList.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MetricCard label="Vol. Total Selecionado" value={`${Math.round(selectedProductsList.reduce((s, p) => s + p.volumeAnual, 0)).toLocaleString()} kg`} sub={`${selectedProductsList.length} produto(s)`} />
              </div>
            )}
            {selectedProductsList.map(prod => (
              <div key={prod.SKU_LABEL} className="space-y-4 border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground">Série Mensal — {prod.codigoProduto}</h3>
                <ProductSeriesChart data={prod} monthCols={state.monthCols} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard label="Volume Anual" value={`${Math.round(prod.volumeAnual).toLocaleString()} kg`} />
                  <MetricCard label="ABC-XYZ" value={prod.abcXyz} />
                  <MetricCard label="CV" value={prod.cv.toFixed(2)} />
                  <MetricCard label="Tendência" value={prod.trendLabel} sub={prod.trendPct != null ? `${prod.trendPct.toFixed(1)}%` : undefined} />
                </div>
                {prod.top1Cliente && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetricCard label="Top1 Cliente" value={prod.top1Cliente} />
                    <MetricCard label="Top1 Share" value={`${((prod.top1ShareProduto ?? 0) * 100).toFixed(1)}%`} />
                    <MetricCard label="HHI Produto" value={(prod.hhiProduto ?? 0).toFixed(3)} />
                  </div>
                )}
              </div>
            ))}
            {selectedProds.length === 0 && <p className="text-sm text-muted-foreground">Selecione um ou mais produtos para visualizar.</p>}
          </div>
        </TabsContent>

        {state.hasClientes && (
          <TabsContent value="cliente">
            <div className="metric-card space-y-4">
              <MultiSelect options={state.clientes} selected={selectedClientes} onChange={setSelectedClientes} placeholder="Buscar cliente por código ou palavra-chave..." />
              {selectedClientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Selecione um ou mais clientes para ver o mix (ABC/XYZ).</p>
              ) : clienteView ? (
                <>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedClientes.length} cliente(s) · {clienteView.products.length} produtos · {clienteView.monthCols.length} meses
                  </p>
                  <ABCParetoChart data={clienteView.products} topN={Math.min(40, clienteView.products.length)} />
                  <ABCXYZMatrix data={clienteView.products} />
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="data-table">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th>SKU</th><th>ABC-XYZ</th><th>Vol. Anual</th><th>Média/Mês</th>
                          <th>Tendência</th><th>Estratégia</th><th>Prioridade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clienteView.products.slice(0, 60).map(p => (
                          <tr key={p.SKU_LABEL}>
                            <td className="max-w-[200px] truncate text-xs">{p.SKU_LABEL}</td>
                            <td><ABCBadge classe={p.abcXyz} /></td>
                            <td className="text-right font-mono text-xs">{Math.round(p.volumeAnual).toLocaleString()}</td>
                            <td className="text-right font-mono text-xs">{Math.round(p.mediaMensal).toLocaleString()}</td>
                            <td className="text-xs">{p.trendLabel}</td>
                            <td><StratBadge strat={p.estrategiaBase} /></td>
                            <td className="text-right font-mono text-xs">{p.prioridadeMTS}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados para os clientes selecionados.</p>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </PageTransition>
  );
}
