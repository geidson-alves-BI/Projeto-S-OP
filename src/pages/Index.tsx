import { useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, Grid3X3, ListChecks, Package, Users, Upload as UploadIcon, Loader2 } from "lucide-react";

import FileUpload from "@/components/FileUpload";
import MetricCard from "@/components/MetricCard";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { ABCParetoChart, ABCCompleteChart, ABCXYZMatrix, ProductSeriesChart } from "@/components/Charts";

import { parseFile } from "@/lib/fileParser";
import {
  prepProducao, prepClientes, mergeWithClientes,
  toWide, pipeline, concentrationMetrics, applyConcentrationAdjustment,
  getUniqueClientes,
  type ProductData, type LongRow, type ProductConcentration, type PortfolioConcentration,
} from "@/lib/pcpEngine";

interface AppState {
  products: ProductData[];
  monthCols: string[];
  prodLong: LongRow[];
  prodConc: ProductConcentration[];
  portfolioConc: PortfolioConcentration | null;
  clientes: string[];
  hasClientes: boolean;
}

const Index = () => {
  const [fileProd, setFileProd] = useState<File | null>(null);
  const [fileCli, setFileCli] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);

  // Filters
  const [topN, setTopN] = useState(40);
  const [estratFilter, setEstratFilter] = useState("Todos");
  const [selectedProd, setSelectedProd] = useState<string>("");
  const [selectedCliente, setSelectedCliente] = useState("Todos");

  const handleLoad = useCallback(async () => {
    if (!fileProd) { setError("Envie a base de Produção primeiro."); return; }
    setLoading(true);
    setError(null);
    try {
      const rawProd = await parseFile(fileProd);
      let prodLong = prepProducao(rawProd);

      let hasClientes = false;
      if (fileCli) {
        const rawCli = await parseFile(fileCli);
        const clientes = prepClientes(rawCli);
        prodLong = mergeWithClientes(prodLong, clientes);
        hasClientes = true;
      }

      const { wide, monthCols } = toWide(prodLong);
      let products = pipeline(wide, monthCols);

      let prodConc: ProductConcentration[] = [];
      let portfolioConc: PortfolioConcentration | null = null;

      if (hasClientes) {
        const conc = concentrationMetrics(prodLong);
        prodConc = conc.prodConc;
        portfolioConc = conc.portfolioConc;
        products = applyConcentrationAdjustment(products, prodConc);
      } else {
        products = products.map(p => ({
          ...p,
          diasAlvoAjustado: p.diasAlvoBase,
          estrategiaFinal: p.estrategiaBase,
          targetKgAjustado: p.consumoDiario * p.diasAlvoBase,
        }));
      }

      const clientesList = getUniqueClientes(prodLong);

      setState({
        products,
        monthCols,
        prodLong,
        prodConc,
        portfolioConc,
        clientes: clientesList,
        hasClientes,
      });
      setSelectedProd(products[0]?.SKU_LABEL ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fileProd, fileCli]);

  // Client-filtered view
  const clienteView = useMemo(() => {
    if (!state || selectedCliente === "Todos") return null;
    const { wide, monthCols } = toWide(state.prodLong, selectedCliente);
    const products = pipeline(wide, monthCols);
    return { products, monthCols };
  }, [state, selectedCliente]);

  const filteredRec = useMemo(() => {
    if (!state) return [];
    let list = state.products;
    if (estratFilter !== "Todos") {
      list = list.filter(p => (p.estrategiaFinal ?? p.estrategiaBase) === estratFilter);
    }
    return list;
  }, [state, estratFilter]);

  const selectedProduct = useMemo(() => {
    return state?.products.find(p => p.SKU_LABEL === selectedProd) ?? null;
  }, [state, selectedProd]);

  // Upload screen
  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <Activity className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold glow-text font-mono">CONTROL TOWER</h1>
            </div>
            <p className="text-muted-foreground">PCP — ABC / XYZ / MTS Intelligence</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FileUpload label="Base de Produção" file={fileProd} onFileSelect={setFileProd} />
            <FileUpload label="Base de Clientes (opcional)" file={fileCli} onFileSelect={setFileCli} />
          </div>

          {error && <p className="text-sm text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded-lg p-3">{error}</p>}

          <Button
            onClick={handleLoad}
            disabled={!fileProd || loading}
            className="w-full h-12 text-base font-mono"
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UploadIcon className="mr-2 h-5 w-5" />}
            {loading ? "Processando..." : "Carregar Bases"}
          </Button>
        </div>
      </div>
    );
  }

  const countA = state.products.filter(p => p.classeABC === "A").length;
  const countB = state.products.filter(p => p.classeABC === "B").length;
  const countC = state.products.filter(p => p.classeABC === "C").length;
  const countMTS = state.products.filter(p => (p.estrategiaFinal ?? p.estrategiaBase).includes("MTS")).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold font-mono glow-text">CONTROL TOWER</h1>
            <span className="text-xs text-muted-foreground font-mono ml-2">
              {state.products.length} SKUs · {state.monthCols.length} meses
              {state.hasClientes && ` · ${state.clientes.length} clientes`}
            </span>
          </div>
          <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => { setState(null); setFileProd(null); setFileCli(null); }}>
            Nova Análise
          </Button>
        </div>
      </header>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 px-6 py-4">
        <MetricCard label="Total SKUs" value={state.products.length} />
        <MetricCard label="Classe A" value={countA} sub={`${Math.round(countA / state.products.length * 100)}% dos SKUs`} />
        <MetricCard label="Classe B" value={countB} />
        <MetricCard label="Classe C" value={countC} />
        <MetricCard label="Candidatos MTS" value={countMTS} />
        {state.portfolioConc && (
          <MetricCard label="HHI Portfólio" value={state.portfolioConc.hhiPortfolio.toFixed(3)} sub={`Top1: ${(state.portfolioConc.top1SharePortfolio * 100).toFixed(1)}%`} />
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 pb-6">
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

          {/* ABC Executivo */}
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

          {/* ABC Completo */}
          <TabsContent value="abc-full">
            <div className="metric-card">
              <h3 className="text-sm font-semibold mb-3 text-foreground">Curva ABC Completa — Acumulado</h3>
              <ABCCompleteChart data={state.products} />
            </div>
          </TabsContent>

          {/* Matriz */}
          <TabsContent value="matrix">
            <div className="metric-card">
              <h3 className="text-sm font-semibold mb-4 text-foreground">Matriz ABC-XYZ (qtde de produtos)</h3>
              <ABCXYZMatrix data={state.products} />
            </div>
          </TabsContent>

          {/* Recomendações */}
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
                      <th>SKU</th>
                      <th>ABC-XYZ</th>
                      <th>Vol. Anual</th>
                      <th>Média/Mês</th>
                      <th>Tendência</th>
                      <th>Estratégia</th>
                      <th>Dias Alvo</th>
                      <th>Prioridade</th>
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

          {/* Produto */}
          <TabsContent value="produto">
            <div className="metric-card space-y-4">
              <Select value={selectedProd} onValueChange={setSelectedProd}>
                <SelectTrigger className="w-full font-mono text-xs"><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {state.products.map(p => (
                    <SelectItem key={p.SKU_LABEL} value={p.SKU_LABEL} className="font-mono text-xs">{p.SKU_LABEL}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedProduct && (
                <>
                  <h3 className="text-sm font-semibold text-foreground">Série Mensal — {selectedProduct.codigoProduto}</h3>
                  <ProductSeriesChart data={selectedProduct} monthCols={state.monthCols} />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard label="Volume Anual" value={`${Math.round(selectedProduct.volumeAnual).toLocaleString()} kg`} />
                    <MetricCard label="ABC-XYZ" value={selectedProduct.abcXyz} />
                    <MetricCard label="CV" value={selectedProduct.cv.toFixed(2)} />
                    <MetricCard label="Tendência" value={selectedProduct.trendLabel} sub={selectedProduct.trendPct != null ? `${selectedProduct.trendPct.toFixed(1)}%` : undefined} />
                  </div>

                  {selectedProduct.top1Cliente && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <MetricCard label="Top1 Cliente" value={selectedProduct.top1Cliente} />
                      <MetricCard label="Top1 Share" value={`${((selectedProduct.top1ShareProduto ?? 0) * 100).toFixed(1)}%`} />
                      <MetricCard label="HHI Produto" value={(selectedProduct.hhiProduto ?? 0).toFixed(3)} />
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* Cliente Mix */}
          {state.hasClientes && (
            <TabsContent value="cliente">
              <div className="metric-card space-y-4">
                <Select value={selectedCliente} onValueChange={setSelectedCliente}>
                  <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="Todos">Todos</SelectItem>
                    {state.clientes.map(c => (
                      <SelectItem key={c} value={c} className="font-mono text-xs">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCliente === "Todos" ? (
                  <p className="text-sm text-muted-foreground">Selecione um cliente para ver o mix (ABC/XYZ do cliente).</p>
                ) : clienteView ? (
                  <>
                    <p className="text-xs text-muted-foreground font-mono">
                      Cliente: {selectedCliente} · {clienteView.products.length} produtos · {clienteView.monthCols.length} meses
                    </p>
                    <ABCParetoChart data={clienteView.products} topN={Math.min(40, clienteView.products.length)} />
                    <ABCXYZMatrix data={clienteView.products} />

                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="data-table">
                        <thead className="sticky top-0 z-10">
                          <tr>
                            <th>SKU</th>
                            <th>ABC-XYZ</th>
                            <th>Vol. Anual</th>
                            <th>Média/Mês</th>
                            <th>Tendência</th>
                            <th>Estratégia</th>
                            <th>Prioridade</th>
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
                  <p className="text-sm text-muted-foreground">Sem dados para este cliente.</p>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
