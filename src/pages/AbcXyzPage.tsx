import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Grid3X3, ListChecks, Package, Users } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import MetricCard from "@/components/MetricCard";
import MultiSelect from "@/components/MultiSelect";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ABCParetoChart, ABCCompleteChart, ABCXYZMatrix, ProductSeriesChart } from "@/components/Charts";
import { useAppData } from "@/contexts/AppDataContext";
import { useAbcXyzAnalysis } from "@/hooks/use-abc-xyz-analysis";
import { pipeline, toWide, type ProductData } from "@/lib/pcpEngine";
import type { AbcXyzAnalysisProduct, AbcXyzAnalysisResponse } from "@/types/analytics";

function mapAnalysisProductToChartProduct(product: AbcXyzAnalysisProduct): ProductData {
  return {
    SKU_LABEL: product.sku_label,
    codigoProduto: product.sku,
    denominacao: product.descricao,
    monthValues: product.month_values,
    volumeAnual: product.volume_anual,
    percAcumulado: product.percentual_acumulado,
    classeABC: product.classe_abc,
    mediaMensal: product.media_mensal,
    desvioPadrao: product.desvio_padrao,
    cv: product.cv,
    classeXYZ: product.classe_xyz,
    abcXyz: product.classe_combinada,
    trendPct: product.tendencia_percentual,
    trendLabel: product.tendencia,
    consumoDiario: product.consumo_diario,
    diasAlvoBase: product.dias_alvo,
    estrategiaBase: product.estrategia,
    targetKg30: product.consumo_diario * 30,
    targetKg60: product.consumo_diario * 60,
    targetKg90: product.consumo_diario * 90,
    prioridadeMTS: product.prioridade,
    top1Cliente: product.top1_cliente || undefined,
    top1ShareProduto: product.top1_share || undefined,
    hhiProduto: product.hhi_cliente || undefined,
    diasAlvoAjustado: product.dias_alvo,
    estrategiaFinal: product.estrategia,
    targetKgAjustado: product.consumo_diario * product.dias_alvo,
  };
}

function hasCommercialSignal(baseUtilizada: string[]) {
  return baseUtilizada.some((item) => /(carteira|comercial|venda|pedido)/i.test(item));
}

function recommendationReliability(analysis: AbcXyzAnalysisResponse) {
  if (!hasCommercialSignal(analysis.base_utilizada)) {
    return "Indicativa: recomendacao operacional baseada apenas na base de producao.";
  }

  if (analysis.confiabilidade.nivel === "alta") {
    return "Robusta: sinais operacionais e comerciais suficientes para decisao de politica.";
  }

  if (analysis.confiabilidade.nivel === "media") {
    return "Moderada: use a recomendacao com validacao de carteira e nivel de servico.";
  }

  return "Baixa: revise a base antes de consolidar mudanca de politica.";
}

export default function AbcXyzPage() {
  const { hydrationStatus, hydrationError, state } = useAppData();
  const [topN, setTopN] = useState(40);
  const [estratFilter, setEstratFilter] = useState("Todos");
  const [selectedProds, setSelectedProds] = useState<string[]>([]);
  const [selectedClientes, setSelectedClientes] = useState<string[]>([]);

  const shouldLoadAnalysis = hydrationStatus === "success";
  const {
    analysis,
    loading: analysisLoading,
    error: analysisError,
  } = useAbcXyzAnalysis({ autoLoad: shouldLoadAnalysis });

  const products = useMemo(
    () => (analysis?.produtos ?? []).map(mapAnalysisProductToChartProduct),
    [analysis?.produtos],
  );

  const monthCols = useMemo(() => {
    const first = products[0];
    if (!first) return [];
    return Object.keys(first.monthValues).sort();
  }, [products]);

  const clienteView = useMemo(() => {
    if (!state || selectedClientes.length === 0) return null;
    const filteredLong = state.prodLong.filter((row) => selectedClientes.includes((row as { cliente?: string }).cliente ?? ""));
    if (filteredLong.length === 0) return null;
    const { wide, monthCols: clienteMonthCols } = toWide(filteredLong);
    const clienteProducts = pipeline(wide, clienteMonthCols);
    return { products: clienteProducts, monthCols: clienteMonthCols };
  }, [state, selectedClientes]);

  const filteredRec = useMemo(() => {
    let list = products;
    if (estratFilter !== "Todos") {
      list = list.filter((product) => (product.estrategiaFinal ?? product.estrategiaBase) === estratFilter);
    }
    return list;
  }, [products, estratFilter]);

  const selectedProductsList = useMemo(
    () => products.filter((product) => selectedProds.includes(product.SKU_LABEL)),
    [products, selectedProds],
  );

  const productOptions = useMemo(() => products.map((product) => product.SKU_LABEL), [products]);
  const sliderMax = Math.max(10, Math.min(120, products.length || 10));
  const effectiveTopN = Math.min(topN, Math.max(products.length, 1));

  if (hydrationStatus === "loading" || hydrationStatus === "idle") {
    return (
      <PageTransition className="space-y-6 p-6">
        <section className="rounded-2xl border border-border/70 bg-card/90 p-6">
          <h1 className="text-2xl font-semibold text-foreground">Classificacao ABC/XYZ</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sincronizando os dados da base principal para liberar a analise.
          </p>
        </section>
      </PageTransition>
    );
  }

  if (hydrationStatus === "error") {
    return (
      <PageTransition className="space-y-6 p-6">
        <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <h1 className="text-2xl font-semibold text-foreground">Falha ao carregar a base</h1>
          <p className="mt-2 text-sm text-destructive">
            {hydrationError ?? "Nao foi possivel concluir a sincronizacao da base para esta analise."}
          </p>
          <div className="mt-4">
            <Link to="/upload" className="text-sm font-medium text-primary underline underline-offset-4">
              Revisar uploads da base
            </Link>
          </div>
        </section>
      </PageTransition>
    );
  }

  if (analysisLoading && !analysis) {
    return (
      <PageTransition className="space-y-6 p-6">
        <section className="rounded-2xl border border-border/70 bg-card/90 p-6">
          <h1 className="text-2xl font-semibold text-foreground">Classificacao ABC/XYZ</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Consolidando indicadores e classificacao por SKU.
          </p>
        </section>
      </PageTransition>
    );
  }

  if (analysisError && !analysis) {
    return (
      <PageTransition className="space-y-6 p-6">
        <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <h1 className="text-2xl font-semibold text-foreground">Falha ao carregar a analise ABC/XYZ</h1>
          <p className="mt-2 text-sm text-destructive">{analysisError}</p>
          <div className="mt-4">
            <Link to="/upload" className="text-sm font-medium text-primary underline underline-offset-4">
              Revisar uploads da base
            </Link>
          </div>
        </section>
      </PageTransition>
    );
  }

  if (!analysis || analysis.status === "unavailable") {
    return (
      <PageTransition className="space-y-6 p-6">
        <section className="rounded-2xl border border-warning/30 bg-warning/10 p-6">
          <h1 className="text-2xl font-semibold text-foreground">Base nao disponivel para classificacao ABC/XYZ</h1>
          <p className="mt-2 text-sm text-foreground">
            Envie a base de producao para liberar a leitura por SKU e a matriz combinada.
          </p>
          <div className="mt-4">
            <Link to="/upload" className="text-sm font-medium text-primary underline underline-offset-4">
              Ir para upload de dados
            </Link>
          </div>
        </section>
      </PageTransition>
    );
  }

  const hasClientes = Boolean(state?.hasClientes);
  const reliabilityText = recommendationReliability(analysis);
  const limitacoesText = analysis.limitacoes.length > 0
    ? analysis.limitacoes.join(" ")
    : "Sem limitacoes criticas registradas nesta leitura.";

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
            <ListChecks className="h-3.5 w-3.5" /> Recomendacoes
          </TabsTrigger>
          <TabsTrigger value="produto" className="font-mono text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="h-3.5 w-3.5" /> Produto
          </TabsTrigger>
          {hasClientes && (
            <TabsTrigger value="cliente" className="font-mono text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-3.5 w-3.5" /> Cliente (Mix)
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="abc-exec" className="space-y-4">
          <div className="metric-card">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-xs text-muted-foreground font-mono">Top N:</span>
              <Slider
                value={[Math.min(topN, sliderMax)]}
                onValueChange={(value) => setTopN(value[0])}
                min={10}
                max={sliderMax}
                step={5}
                className="w-48"
              />
              <span className="text-sm font-mono text-primary">{Math.min(topN, sliderMax)}</span>
            </div>
            <h3 className="text-sm font-semibold mb-3 text-foreground">Curva ABC Executiva - Volume Produzido (kg)</h3>
            <ABCParetoChart data={products} topN={effectiveTopN} />
          </div>
        </TabsContent>

        <TabsContent value="abc-full">
          <div className="metric-card">
            <h3 className="text-sm font-semibold mb-3 text-foreground">Curva ABC Completa - Acumulado</h3>
            <ABCCompleteChart data={products} />
          </div>
        </TabsContent>

        <TabsContent value="matrix">
          <div className="metric-card">
            <h3 className="text-sm font-semibold mb-4 text-foreground">Matriz ABC-XYZ (qtde de produtos)</h3>
            <ABCXYZMatrix data={products} />
          </div>
        </TabsContent>

        <TabsContent value="rec" forceMount>
          <div className="metric-card space-y-4">
            <div className="rounded-lg border border-border p-4 text-sm text-foreground space-y-2">
              <p><span className="font-semibold">Criterio utilizado:</span> combinacao ABC/XYZ por SKU, tendencia recente e dias alvo por classe para sugerir MTS (candidato) ou MTO.</p>
              <p><span className="font-semibold">Base utilizada:</span> {analysis.base_utilizada.join(" + ") || "Sem base consolidada"}.</p>
              <p><span className="font-semibold">Confiabilidade da recomendacao:</span> {reliabilityText}</p>
              <p><span className="font-semibold">Limitacoes da analise:</span> {limitacoesText}</p>
            </div>

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
                    <th>SKU</th><th>ABC-XYZ</th><th>Vol. Anual</th><th>Media/Mes</th>
                    <th>Tendencia</th><th>Estrategia</th><th>Dias Alvo</th><th>Prioridade</th>
                    {hasClientes && <th>Top1 Cliente</th>}
                    {hasClientes && <th>Top1 Share</th>}
                    {hasClientes && <th>HHI</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRec.slice(0, 80).map((product) => (
                    <tr key={product.SKU_LABEL}>
                      <td className="max-w-[200px] truncate text-xs" title={product.SKU_LABEL}>{product.SKU_LABEL}</td>
                      <td><ABCBadge classe={product.abcXyz} /></td>
                      <td className="text-right font-mono text-xs">{Math.round(product.volumeAnual).toLocaleString()}</td>
                      <td className="text-right font-mono text-xs">{Math.round(product.mediaMensal).toLocaleString()}</td>
                      <td className="text-xs">{product.trendLabel}</td>
                      <td><StratBadge strat={product.estrategiaFinal ?? product.estrategiaBase} /></td>
                      <td className="text-right font-mono text-xs">{product.diasAlvoAjustado ?? product.diasAlvoBase}</td>
                      <td className="text-right font-mono text-xs">{product.prioridadeMTS}</td>
                      {hasClientes && <td className="text-xs max-w-[120px] truncate">{product.top1Cliente ?? "-"}</td>}
                      {hasClientes && <td className="text-right font-mono text-xs">{product.top1ShareProduto != null ? `${(product.top1ShareProduto * 100).toFixed(1)}%` : "-"}</td>}
                      {hasClientes && <td className="text-right font-mono text-xs">{product.hhiProduto != null ? product.hhiProduto.toFixed(3) : "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="produto">
          <div className="metric-card space-y-4">
            <MultiSelect options={productOptions} selected={selectedProds} onChange={setSelectedProds} placeholder="Buscar produto por codigo ou palavra-chave..." />
            {selectedProductsList.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MetricCard label="Vol. Total Selecionado" value={`${Math.round(selectedProductsList.reduce((sum, product) => sum + product.volumeAnual, 0)).toLocaleString()} kg`} sub={`${selectedProductsList.length} produto(s)`} />
              </div>
            )}
            {selectedProductsList.map((product) => (
              <div key={product.SKU_LABEL} className="space-y-4 border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground">Serie Mensal - {product.codigoProduto}</h3>
                <ProductSeriesChart data={product} monthCols={monthCols} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard label="Volume Anual" value={`${Math.round(product.volumeAnual).toLocaleString()} kg`} />
                  <MetricCard label="ABC-XYZ" value={product.abcXyz} />
                  <MetricCard label="CV" value={product.cv.toFixed(2)} />
                  <MetricCard label="Tendencia" value={product.trendLabel} sub={product.trendPct != null ? `${product.trendPct.toFixed(1)}%` : undefined} />
                </div>
                {product.top1Cliente && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetricCard label="Top1 Cliente" value={product.top1Cliente} />
                    <MetricCard label="Top1 Share" value={`${((product.top1ShareProduto ?? 0) * 100).toFixed(1)}%`} />
                    <MetricCard label="HHI Produto" value={(product.hhiProduto ?? 0).toFixed(3)} />
                  </div>
                )}
              </div>
            ))}
            {selectedProds.length === 0 && <p className="text-sm text-muted-foreground">Selecione um ou mais produtos para visualizar.</p>}
          </div>
        </TabsContent>

        {hasClientes && (
          <TabsContent value="cliente">
            <div className="metric-card space-y-4">
              <MultiSelect options={state?.clientes ?? []} selected={selectedClientes} onChange={setSelectedClientes} placeholder="Buscar cliente por codigo ou palavra-chave..." />
              {selectedClientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Selecione um ou mais clientes para ver o mix (ABC/XYZ).</p>
              ) : clienteView ? (
                <>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedClientes.length} cliente(s) - {clienteView.products.length} produtos - {clienteView.monthCols.length} meses
                  </p>
                  <ABCParetoChart data={clienteView.products} topN={Math.min(40, clienteView.products.length)} />
                  <ABCXYZMatrix data={clienteView.products} />
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="data-table">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th>SKU</th><th>ABC-XYZ</th><th>Vol. Anual</th><th>Media/Mes</th>
                          <th>Tendencia</th><th>Estrategia</th><th>Prioridade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clienteView.products.slice(0, 60).map((product) => (
                          <tr key={product.SKU_LABEL}>
                            <td className="max-w-[200px] truncate text-xs">{product.SKU_LABEL}</td>
                            <td><ABCBadge classe={product.abcXyz} /></td>
                            <td className="text-right font-mono text-xs">{Math.round(product.volumeAnual).toLocaleString()}</td>
                            <td className="text-right font-mono text-xs">{Math.round(product.mediaMensal).toLocaleString()}</td>
                            <td className="text-xs">{product.trendLabel}</td>
                            <td><StratBadge strat={product.estrategiaBase} /></td>
                            <td className="text-right font-mono text-xs">{product.prioridadeMTS}</td>
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

