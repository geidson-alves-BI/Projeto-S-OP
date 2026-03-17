import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Grid3X3, ListChecks, Package, RefreshCw } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import MetricCard from "@/components/MetricCard";
import MultiSelect from "@/components/MultiSelect";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ABCParetoChart, ABCCompleteChart, ABCXYZMatrix, ProductSeriesChart } from "@/components/Charts";
import { useAppData } from "@/contexts/AppDataContext";
import { useAbcXyzAnalysis } from "@/hooks/use-abc-xyz-analysis";
import { sanitizeProductCopy } from "@/lib/analytics-consumption";
import type { ProductData } from "@/lib/pcpEngine";
import type { AbcXyzAnalysisProduct } from "@/types/analytics";

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

export default function AbcXyzPage() {
  const { hydrationStatus, hydrationError } = useAppData();
  const [topN, setTopN] = useState(40);
  const [selectedProds, setSelectedProds] = useState<string[]>([]);

  const shouldLoadAnalysis = hydrationStatus === "success";
  const {
    analysis,
    loading: analysisLoading,
    error: analysisError,
    refresh,
    availability,
  } = useAbcXyzAnalysis({ autoLoad: shouldLoadAnalysis });

  const products = useMemo(
    () => (analysis?.produtos ?? []).map(mapAnalysisProductToChartProduct),
    [analysis?.produtos],
  );
  const monthCols = useMemo(() => {
    const first = products[0];
    if (!first) {
      return [];
    }
    return Object.keys(first.monthValues).sort();
  }, [products]);

  const productOptions = useMemo(() => products.map((item) => item.SKU_LABEL), [products]);
  const selectedProductsList = useMemo(
    () => products.filter((item) => selectedProds.includes(item.SKU_LABEL)),
    [products, selectedProds],
  );

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
          <Button className="mt-4" variant="outline" onClick={() => void refresh()}>
            Tentar novamente
          </Button>
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

  const summary = analysis.indicadores_resumidos;
  const isPartial = analysis.status === "partial" || availability.state === "partial";
  const confidenceLabel = `${analysis.confiabilidade.nivel} (${analysis.confiabilidade.score}%)`;
  const partialUpdateMessage =
    analysisError ?? (availability.state === "partial" ? availability.message : null);

  return (
    <PageTransition className="space-y-6 p-6">
      <section className="rounded-2xl border border-border/70 bg-card/90 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Classificacao ABC/XYZ</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Leitura consolidada por SKU com base oficial carregada.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={analysisLoading}>
            <RefreshCw className={`h-4 w-4 ${analysisLoading ? "animate-spin" : ""}`} />
            Atualizar analise
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MetricCard label="SKUs classificados" value={summary.total_skus} />
          <MetricCard label="Volume total" value={`${Math.round(summary.volume_total).toLocaleString()} kg`} />
          <MetricCard label="Concentracao top 10" value={`${summary.concentracao_top10_percent.toFixed(1)}%`} />
          <MetricCard label="Confiabilidade" value={confidenceLabel} />
        </div>

        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${isPartial ? "border-warning/30 bg-warning/10 text-foreground" : "border-success/30 bg-success/10 text-foreground"}`}>
          {isPartial
            ? "Analise parcial disponivel. A tela segue funcional com o que foi consolidado."
            : "Analise completa disponivel para leitura executiva e operacional."}
        </div>

        {partialUpdateMessage ? (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
            Atualizacao parcial detectada: {sanitizeProductCopy(partialUpdateMessage)}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/85 p-5">
          <h2 className="text-sm font-semibold text-foreground">Base utilizada</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {analysis.base_utilizada.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/85 p-5">
          <h2 className="text-sm font-semibold text-foreground">Abrangencia da analise</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Escopo: {analysis.abrangencia_analise.escopo}
          </p>
          <p className="text-sm text-muted-foreground">
            Periodo: {analysis.abrangencia_analise.periodo_inicial ?? "n/d"} ate {analysis.abrangencia_analise.periodo_final ?? "n/d"}
          </p>
          <p className="text-sm text-muted-foreground">
            Meses considerados: {analysis.abrangencia_analise.meses_considerados}
          </p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/85 p-5">
          <h2 className="text-sm font-semibold text-foreground">Criterio de classificacao</h2>
          <p className="mt-2 text-sm text-muted-foreground">{analysis.criterio_classificacao.abc}</p>
          <p className="mt-1 text-sm text-muted-foreground">{analysis.criterio_classificacao.xyz}</p>
          <p className="mt-1 text-sm text-muted-foreground">{analysis.criterio_classificacao.combinada}</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/85 p-5">
          <h2 className="text-sm font-semibold text-foreground">Limitacoes da analise</h2>
          {analysis.limitacoes.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {analysis.limitacoes.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma limitacao critica registrada nesta leitura.</p>
          )}
        </article>
      </section>

      <Tabs defaultValue="visao-geral" className="w-full">
        <TabsList className="mb-4 h-10 flex-wrap border border-border bg-secondary">
          <TabsTrigger value="visao-geral" className="gap-1.5 text-xs font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="h-3.5 w-3.5" /> Visao geral
          </TabsTrigger>
          <TabsTrigger value="matriz" className="gap-1.5 text-xs font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Grid3X3 className="h-3.5 w-3.5" /> Matriz combinada
          </TabsTrigger>
          <TabsTrigger value="recomendacao" className="gap-1.5 text-xs font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Priorizacao
          </TabsTrigger>
          <TabsTrigger value="produto" className="gap-1.5 text-xs font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="h-3.5 w-3.5" /> Produto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-4">
          <div className="metric-card space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-muted-foreground">Top N</span>
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
            <h3 className="text-sm font-semibold text-foreground">Curva ABC por volume consolidado</h3>
            <ABCParetoChart data={products} topN={effectiveTopN} />
            <h3 className="text-sm font-semibold text-foreground">Curva acumulada completa</h3>
            <ABCCompleteChart data={products} />
          </div>
        </TabsContent>

        <TabsContent value="matriz">
          <div className="metric-card space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Matriz ABC/XYZ por quantidade de SKUs</h3>
            <ABCXYZMatrix data={products} />
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Classe A" value={summary.classes_abc.A} />
              <MetricCard label="Classe B" value={summary.classes_abc.B} />
              <MetricCard label="Classe C" value={summary.classes_abc.C} />
              <MetricCard label="Classe X" value={summary.classes_xyz.X} />
              <MetricCard label="Classe Y" value={summary.classes_xyz.Y} />
              <MetricCard label="Classe Z" value={summary.classes_xyz.Z} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recomendacao">
          <div className="metric-card space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Priorizacao executiva resumida</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {summary.priorizacao_executiva.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="data-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>SKU</th>
                    <th>ABC/XYZ</th>
                    <th>Vol. anual</th>
                    <th>Media mensal</th>
                    <th>Tendencia</th>
                    <th>Estrategia</th>
                    <th>Dias alvo</th>
                    <th>Prioridade</th>
                  </tr>
                </thead>
                <tbody>
                  {products.slice(0, 80).map((product) => (
                    <tr key={product.SKU_LABEL}>
                      <td className="max-w-[220px] truncate text-xs" title={product.SKU_LABEL}>
                        {product.SKU_LABEL}
                      </td>
                      <td>
                        <ABCBadge classe={product.abcXyz} />
                      </td>
                      <td className="text-right font-mono text-xs">{Math.round(product.volumeAnual).toLocaleString()}</td>
                      <td className="text-right font-mono text-xs">{Math.round(product.mediaMensal).toLocaleString()}</td>
                      <td className="text-xs">{product.trendLabel}</td>
                      <td>
                        <StratBadge strat={product.estrategiaFinal ?? product.estrategiaBase} />
                      </td>
                      <td className="text-right font-mono text-xs">{product.diasAlvoAjustado ?? product.diasAlvoBase}</td>
                      <td className="text-right font-mono text-xs">{product.prioridadeMTS}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="produto">
          <div className="metric-card space-y-4">
            <MultiSelect
              options={productOptions}
              selected={selectedProds}
              onChange={setSelectedProds}
              placeholder="Buscar produto por codigo ou descricao..."
            />

            {selectedProductsList.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <MetricCard
                  label="Volume total selecionado"
                  value={`${Math.round(selectedProductsList.reduce((sum, item) => sum + item.volumeAnual, 0)).toLocaleString()} kg`}
                  sub={`${selectedProductsList.length} produto(s)`}
                />
              </div>
            ) : null}

            {selectedProductsList.map((product) => (
              <div key={product.SKU_LABEL} className="space-y-4 rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">Serie mensal - {product.codigoProduto}</h3>
                <ProductSeriesChart data={product} monthCols={monthCols} />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricCard label="Volume anual" value={`${Math.round(product.volumeAnual).toLocaleString()} kg`} />
                  <MetricCard label="Classe combinada" value={product.abcXyz} />
                  <MetricCard label="Variabilidade (CV)" value={product.cv.toFixed(2)} />
                  <MetricCard
                    label="Tendencia"
                    value={product.trendLabel}
                    sub={product.trendPct != null ? `${product.trendPct.toFixed(1)}%` : undefined}
                  />
                </div>
                {product.top1Cliente ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <MetricCard label="Principal cliente" value={product.top1Cliente} />
                    <MetricCard label="Participacao principal" value={`${((product.top1ShareProduto ?? 0) * 100).toFixed(1)}%`} />
                    <MetricCard label="Concentracao (HHI)" value={(product.hhiProduto ?? 0).toFixed(3)} />
                  </div>
                ) : null}
              </div>
            ))}

            {selectedProds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Selecione um ou mais produtos para leitura detalhada por SKU.
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}
