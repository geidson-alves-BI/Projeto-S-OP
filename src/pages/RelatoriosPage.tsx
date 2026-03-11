import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Download, FileSpreadsheet, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ContextPackOverview from "@/components/ContextPackOverview";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import { useContextPack } from "@/hooks/use-context-pack";
import { useAppData } from "@/contexts/AppDataContext";
import { downloadFileFromPost } from "@/lib/api";
import { downloadCSV } from "@/lib/downloadCSV";
import { getRMSummary } from "@/lib/rmEngine";

function downloadAllSheets(sheets: { name: string; rows: string[][] }[]) {
  sheets.forEach((sheet, index) => {
    setTimeout(() => downloadCSV(sheet.rows, `pack_sop_${sheet.name}.csv`), index * 200);
  });
}

function resolveStrategyLabel(strategyFinal: unknown, strategyBase: unknown) {
  if (typeof strategyFinal === "string") {
    return strategyFinal;
  }

  if (typeof strategyBase === "string") {
    return strategyBase;
  }

  return "";
}

export default function RelatoriosPage() {
  const { state, rmData } = useAppData();
  const navigate = useNavigate();
  const { refresh, loading, error, viewModel } = useContextPack(Boolean(state || rmData));
  const [strategyLoading, setStrategyLoading] = useState<"csv" | "excel" | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [strategyMessage, setStrategyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!state && !rmData) {
      navigate("/upload");
    }
  }, [state, rmData, navigate]);

  const products = useMemo(() => (Array.isArray(state?.products) ? state.products : []), [state]);
  const monthCols = useMemo(() => (Array.isArray(state?.monthCols) ? state.monthCols : []), [state]);
  const hasClientes = Boolean(state?.hasClientes);
  const rmSummary = useMemo(() => (rmData ? getRMSummary(rmData, 95) : null), [rmData]);

  const summaryData = useMemo(() => {
    if (!state || products.length === 0) return null;
    const countA = products.filter((product) => product.classeABC === "A").length;
    const countMTS = products.filter((product) =>
      resolveStrategyLabel(product.estrategiaFinal, product.estrategiaBase).includes("MTS"),
    ).length;
    const countMTO = products.length - countMTS;
    const volTotal = products.reduce((sum, product) => sum + product.volumeAnual, 0);
    const targetTotal = products.reduce(
      (sum, product) => sum + (product.targetKgAjustado ?? product.consumoDiario * product.diasAlvoBase),
      0,
    );
    return { countA, countMTS, countMTO, volTotal, targetTotal };
  }, [state, products]);

  const reportBlocks = useMemo(() => {
    const isAvailable = (label: string) => viewModel.componentsAvailable.some((component) => component.label === label);

    return [
      {
        name: "Resumo executivo",
        description: "KPIs, concentracao, criticidade e sinais de decisao para a lideranca.",
        ready: isAvailable("Resumo executivo"),
      },
      {
        name: "Portfolio priorizado",
        description: "Segmentacao ABC/XYZ e recorte de produtos prioritarios.",
        ready: isAvailable("Segmentacao ABC/XYZ") && isAvailable("Produtos prioritarios"),
      },
      {
        name: "Historico mensal",
        description: "Serie temporal para sustentar leitura de tendencia e narrativa do ciclo.",
        ready: isAvailable("Historico mensal"),
      },
      {
        name: "Politica MTS/MTO",
        description: "Recomendacao de politica de atendimento e estrategia de abastecimento.",
        ready: isAvailable("Estrategia MTS/MTO"),
      },
      {
        name: "Materia-prima",
        description: "Cobertura de insumo, gargalos e impacto de abastecimento.",
        ready: isAvailable("Impacto de materia-prima"),
      },
      {
        name: "Financeiro",
        description: "Investimento, custo e traducao da operacao para caixa.",
        ready: isAvailable("Impacto financeiro"),
      },
    ];
  }, [viewModel.componentsAvailable]);

  const readyBlocks = reportBlocks.filter((block) => block.ready).length;

  const handleExportPack = () => {
    const sheets: { name: string; rows: string[][] }[] = [];

    if (summaryData) {
      sheets.push({
        name: "resumo_executivo",
        rows: [
          ["PACK S&OP - RESUMO EXECUTIVO"],
          ["Gerado em", new Date().toISOString().split("T")[0]],
          [],
          ["Metrica", "Valor"],
          ["Total SKUs", String(products.length)],
          ["Meses analisados", String(monthCols.length)],
          ["Vol. Total (kg)", String(Math.round(summaryData.volTotal))],
          ["SKUs Classe A", String(summaryData.countA)],
          ["Candidatos MTS", String(summaryData.countMTS)],
          ["MTO", String(summaryData.countMTO)],
          ["Target Estoque Total (kg)", String(Math.round(summaryData.targetTotal))],
          ["Cobertura do contexto (%)", String(viewModel.coveragePercent)],
          ["Blocos disponiveis", `${viewModel.availableComponentsCount}/${viewModel.totalComponentsCount}`],
          ...(state?.portfolioConc
            ? [
                ["HHI Portfolio", state.portfolioConc.hhiPortfolio.toFixed(3)],
                ["Top1 Share Portfolio", `${(state.portfolioConc.top1SharePortfolio * 100).toFixed(1)}%`],
              ]
            : []),
          ...(rmSummary
            ? [
                [],
                ["--- MATERIA-PRIMA ---"],
                ["Total RMs", String(rmSummary.total)],
                ["Abaixo SLA 95%", String(rmSummary.belowSLA)],
                ["Investimento p/ SLA (U$)", String(Math.round(rmSummary.investimentoTotal))],
              ]
            : []),
        ],
      });
    }

    if (state) {
      const header = [
        "SKU",
        "Codigo",
        "Denominacao",
        "ABC",
        "XYZ",
        "ABC-XYZ",
        "Vol. Anual (kg)",
        "Media/Mes (kg)",
        "CV",
        "Tendencia",
        "Tendencia %",
        "Estrategia",
        "Dias Alvo",
        "Target Estoque (kg)",
        "Prioridade MTS",
        ...(hasClientes ? ["Top1 Cliente", "Top1 Share (%)", "HHI"] : []),
      ];
      const rows = products.map((product) => [
        product.SKU_LABEL,
        product.codigoProduto,
        product.denominacao,
        product.classeABC,
        product.classeXYZ,
        product.abcXyz,
        String(Math.round(product.volumeAnual)),
        String(Math.round(product.mediaMensal)),
        product.cv.toFixed(2),
        product.trendLabel,
        product.trendPct != null ? product.trendPct.toFixed(1) : "",
        resolveStrategyLabel(product.estrategiaFinal, product.estrategiaBase),
        String(product.diasAlvoAjustado ?? product.diasAlvoBase),
        String(Math.round(product.targetKgAjustado ?? product.consumoDiario * product.diasAlvoBase)),
        String(product.prioridadeMTS),
        ...(hasClientes
          ? [
              product.top1Cliente ?? "",
              product.top1ShareProduto != null ? (product.top1ShareProduto * 100).toFixed(1) : "",
              product.hhiProduto != null ? product.hhiProduto.toFixed(3) : "",
            ]
          : []),
      ]);
      sheets.push({ name: "produtos_completo", rows: [header, ...rows] });
    }

    if (state) {
      const header = ["SKU", "Codigo", "ABC", ...monthCols, "Total"];
      const rows = products.map((product) => [
        product.SKU_LABEL,
        product.codigoProduto,
        product.classeABC,
        ...monthCols.map((month) => String(Math.round(product.monthValues?.[month] || 0))),
        String(Math.round(product.volumeAnual)),
      ]);
      sheets.push({ name: "historico_mensal", rows: [header, ...rows] });
    }

    if (rmData) {
      const header = [
        "Cod. Produto",
        "Denominacao",
        "Fornecedor",
        "Origem",
        "Estoque Disp.",
        "Est. Seguranca",
        "Consumo 30d",
        "CM 90d",
        "TR (dias)",
        "Cobertura (dias)",
        "Custo U$",
        "Target SLA 95%",
      ];
      const rows = rmData.map((material) => [
        material.codProduto,
        material.denominacao,
        material.fornecedor,
        material.origem,
        String(Math.round(material.estoqueDisponivel)),
        String(Math.round(material.estoqueSeguranca)),
        String(Math.round(material.consumo30d)),
        String(Math.round(material.cm90d)),
        String(material.tempoReposicao),
        String(material.coberturaDias),
        material.custoLiquidoUS.toFixed(2),
        String(material.slaTargets[95] ?? 0),
      ]);
      sheets.push({ name: "materia_prima", rows: [header, ...rows] });
    }

    if (sheets.length === 0) {
      return;
    }

    downloadAllSheets(sheets);
  };

  const handleExportStrategy = async (format: "csv" | "excel") => {
    try {
      setStrategyError(null);
      setStrategyMessage(format === "csv" ? "Exportando CSV..." : "Exportando Excel...");
      setStrategyLoading(format);
      const fallbackName = format === "excel" ? "strategy_report.xlsx" : "strategy_report.csv";
      await downloadFileFromPost("/analytics/export_strategy_report", { file_format: format }, fallbackName);
      setStrategyMessage("Download iniciado");
    } catch (exportError) {
      setStrategyMessage(null);
      setStrategyError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setStrategyLoading(null);
    }
  };

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/90 px-6 py-7 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-85"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 32%), linear-gradient(140deg, rgba(15,23,42,0.2), rgba(2,6,23,0.6))",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
              Pack S&OP
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">O Pack S&OP e um entregavel do contexto analitico consolidado</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Esta tela mostra o quanto do contexto ja esta pronto para sustentar relatorios executivos, quais blocos
                entram no pack e o que ainda depende de bases ausentes.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
              {loading ? "Atualizando..." : "Atualizar contexto"}
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/ia">
                Abrir IA
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Cobertura do contexto" value={`${viewModel.coveragePercent}%`} accent />
        <MetricCard label="Blocos prontos" value={`${readyBlocks} / ${reportBlocks.length}`} />
        <MetricCard label="Componentes disponiveis" value={`${viewModel.availableComponentsCount} / ${viewModel.totalComponentsCount}`} />
        {summaryData && <MetricCard label="Volume monitorado" value={`${Math.round(summaryData.volTotal).toLocaleString()} kg`} />}
        <MetricCard
          label="Modulos ausentes"
          value={viewModel.inputsAvailable.filter((source) => !source.available).length}
          sub={viewModel.inputsAvailable.filter((source) => !source.available).map((source) => source.label).join(", ") || "Nenhum"}
        />
      </div>

      <ContextPackOverview
        viewModel={viewModel}
        loading={loading}
        error={error}
        actions={
          <Button className="gap-2" onClick={handleExportPack} disabled={!state && !rmData}>
            <Download className="h-4 w-4" />
            Gerar pack consolidado
          </Button>
        }
      />

      <section className="metric-card space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Blocos do entregavel</p>
          <h2 className="text-xl font-semibold text-foreground">Completude do Pack S&OP</h2>
        </div>
        <div className="grid gap-3">
          {reportBlocks.map((block) => (
            <div key={block.name} className={`rounded-2xl border p-4 ${block.ready ? "border-success/30 bg-success/10" : "border-border/70 bg-muted/20"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{block.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{block.description}</p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] ${
                    block.ready
                      ? "border-success/35 bg-success/10 text-success"
                      : "border-border/70 bg-background/50 text-muted-foreground"
                  }`}
                >
                  {block.ready ? "Pronto" : "Pendente"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="metric-card space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Exportacao estrategica</p>
            <h2 className="text-xl font-semibold text-foreground">Relatorio estrategico do backend</h2>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Exporte a classificacao estrategica em CSV ou Excel com base no contexto analitico consolidado no backend.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void handleExportStrategy("csv")} variant="secondary" disabled={strategyLoading !== null}>
              {strategyLoading === "csv" ? "Exportando..." : "Exportar CSV"}
            </Button>
            <Button onClick={() => void handleExportStrategy("excel")} variant="secondary" disabled={strategyLoading !== null}>
              {strategyLoading === "excel" ? "Exportando..." : "Exportar Excel"}
            </Button>
          </div>
          {strategyMessage && <p className="text-xs font-mono text-muted-foreground">{strategyMessage}</p>}
          {strategyError && <p className="text-xs font-mono text-destructive">{strategyError}</p>}
        </section>

        <section className="metric-card space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Leitura executiva</p>
            <h2 className="text-xl font-semibold text-foreground">Como o contexto alimenta o pack</h2>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm leading-6 text-foreground">
              O Pack S&OP consolida resumo executivo, portfolio priorizado, historico, politica de atendimento,
              materia-prima e traducao financeira conforme o contexto disponivel.
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm leading-6 text-foreground">
              Quando um modulo estiver ausente, o relatorio continua exportavel, mas a narrativa executiva fica menos
              robusta e isso aparece na completude acima.
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/ia">
                Levar contexto para interpretacao por IA
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
