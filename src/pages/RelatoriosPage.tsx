import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import { useAppData } from "@/contexts/AppDataContext";
import { getRMSummary } from "@/lib/rmEngine";
import { downloadFileFromPost } from "@/lib/api";

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAllSheets(sheets: { name: string; rows: string[][] }[]) {
  sheets.forEach((sheet, idx) => {
    setTimeout(() => downloadCSV(sheet.rows, `pack_sop_${sheet.name}.csv`), idx * 200);
  });
}

export default function RelatoriosPage() {
  const { state, rmData } = useAppData();
  const navigate = useNavigate();
  const [strategyLoading, setStrategyLoading] = useState<"csv" | "excel" | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [strategyMessage, setStrategyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!state && !rmData) navigate("/upload");
  }, [state, rmData, navigate]);

  const rmSummary = useMemo(() => (rmData ? getRMSummary(rmData, 95) : null), [rmData]);

  const summaryData = useMemo(() => {
    if (!state) return null;
    const countA = state.products.filter(p => p.classeABC === "A").length;
    const countB = state.products.filter(p => p.classeABC === "B").length;
    const countC = state.products.filter(p => p.classeABC === "C").length;
    const countMTS = state.products.filter(p => (p.estrategiaFinal ?? p.estrategiaBase).includes("MTS")).length;
    const countMTO = state.products.length - countMTS;
    const volTotal = state.products.reduce((s, p) => s + p.volumeAnual, 0);
    const targetTotal = state.products.reduce((s, p) => s + (p.targetKgAjustado ?? p.consumoDiario * p.diasAlvoBase), 0);
    return { countA, countB, countC, countMTS, countMTO, volTotal, targetTotal };
  }, [state]);

  const handleExportPack = () => {
    const sheets: { name: string; rows: string[][] }[] = [];

    if (state && summaryData) {
      sheets.push({
        name: "resumo_executivo",
        rows: [
          ["PACK S&OP - RESUMO EXECUTIVO"],
          ["Gerado em", new Date().toISOString().split("T")[0]],
          [],
          ["Metrica", "Valor"],
          ["Total SKUs", String(state.products.length)],
          ["Meses analisados", String(state.monthCols.length)],
          ["Vol. Total (kg)", String(Math.round(summaryData.volTotal))],
          ["SKUs Classe A", String(summaryData.countA)],
          ["SKUs Classe B", String(summaryData.countB)],
          ["SKUs Classe C", String(summaryData.countC)],
          ["Candidatos MTS", String(summaryData.countMTS)],
          ["MTO", String(summaryData.countMTO)],
          ["Target Estoque Total (kg)", String(Math.round(summaryData.targetTotal))],
          ...(state.portfolioConc
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
                ["Investimento p/ SLA (R$)", String(Math.round(rmSummary.investimentoTotal))],
              ]
            : []),
        ],
      });
    }

    if (state) {
      const header = [
        "SKU", "Codigo", "Denominacao", "ABC", "XYZ", "ABC-XYZ",
        "Vol. Anual (kg)", "Media/Mes (kg)", "CV", "Tendencia", "Tendencia %",
        "Estrategia", "Dias Alvo", "Target Estoque (kg)", "Prioridade MTS",
        ...(state.hasClientes ? ["Top1 Cliente", "Top1 Share (%)", "HHI"] : []),
      ];
      const rows = state.products.map(p => [
        p.SKU_LABEL,
        p.codigoProduto,
        p.denominacao,
        p.classeABC,
        p.classeXYZ,
        p.abcXyz,
        String(Math.round(p.volumeAnual)),
        String(Math.round(p.mediaMensal)),
        p.cv.toFixed(2),
        p.trendLabel,
        p.trendPct != null ? p.trendPct.toFixed(1) : "",
        p.estrategiaFinal ?? p.estrategiaBase,
        String(p.diasAlvoAjustado ?? p.diasAlvoBase),
        String(Math.round(p.targetKgAjustado ?? p.consumoDiario * p.diasAlvoBase)),
        String(p.prioridadeMTS),
        ...(state.hasClientes
          ? [
              p.top1Cliente ?? "",
              p.top1ShareProduto != null ? (p.top1ShareProduto * 100).toFixed(1) : "",
              p.hhiProduto != null ? p.hhiProduto.toFixed(3) : "",
            ]
          : []),
      ]);
      sheets.push({ name: "produtos_completo", rows: [header, ...rows] });
    }

    if (state) {
      const header = ["SKU", "Codigo", "ABC", ...state.monthCols, "Total"];
      const rows = state.products.map(p => [
        p.SKU_LABEL,
        p.codigoProduto,
        p.classeABC,
        ...state.monthCols.map(m => String(Math.round(p.monthValues[m] || 0))),
        String(Math.round(p.volumeAnual)),
      ]);
      sheets.push({ name: "historico_mensal", rows: [header, ...rows] });
    }

    if (rmData) {
      const header = ["Cod. Produto", "Denominacao", "Fornecedor", "Origem", "Estoque Disp.", "Est. Seguranca", "Consumo 30d", "CM 90d", "TR (dias)", "Cobertura (dias)", "Custo U$", "Target SLA 95%"];
      const rows = rmData.map(rm => [
        rm.codProduto,
        rm.denominacao,
        rm.fornecedor,
        rm.origem,
        String(Math.round(rm.estoqueDisponivel)),
        String(Math.round(rm.estoqueSeguranca)),
        String(Math.round(rm.consumo30d)),
        String(Math.round(rm.cm90d)),
        String(rm.tempoReposicao),
        String(rm.coberturaDias),
        rm.custoLiquidoUS.toFixed(2),
        String(rm.slaTargets[95] ?? 0),
      ]);
      sheets.push({ name: "materia_prima", rows: [header, ...rows] });
    }

    if (sheets.length === 0) return;
    downloadAllSheets(sheets);
  };

  const handleExportStrategy = async (format: "csv" | "excel") => {
    try {
      setStrategyError(null);
      setStrategyMessage(format === "csv" ? "Exportando CSV..." : "Exportando Excel...");
      setStrategyLoading(format);

      const fallbackName = format === "excel" ? "strategy_report.xlsx" : "strategy_report.csv";
      await downloadFileFromPost(
        "/analytics/export_strategy_report",
        { file_format: format },
        fallbackName,
      );

      setStrategyMessage("Download iniciado");
    } catch (err) {
      setStrategyMessage(null);
      setStrategyError(err instanceof Error ? err.message : String(err));
    } finally {
      setStrategyLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" /> Relatorios - Pack S&OP
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">Geracao de relatorio consolidado exportavel</p>
      </div>

      {summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total SKUs" value={state!.products.length} />
          <MetricCard label="Vol. Total" value={`${Math.round(summaryData.volTotal).toLocaleString()} kg`} />
          <MetricCard label="MTS / MTO" value={`${summaryData.countMTS} / ${summaryData.countMTO}`} />
          {rmSummary && <MetricCard label="RMs carregadas" value={rmSummary.total} />}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold font-mono text-foreground">Conteudo do Pack S&OP</h3>

        {[
          { name: "Resumo Executivo", desc: "KPIs globais, contagens ABC, estrategias, HHI", available: !!state },
          { name: "Produtos Completo", desc: "Tabela completa com ABC-XYZ, tendencia, estrategia, prioridade", available: !!state },
          { name: "Historico Mensal", desc: "Serie mensal de producao por SKU", available: !!state },
          { name: "Materia-Prima", desc: "Base RM com consumos, cobertura e targets SLA", available: !!rmData },
        ].map(sheet => (
          <div key={sheet.name} className={`metric-card flex items-center justify-between ${!sheet.available ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-3">
              {sheet.available ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div>
                <p className="text-sm font-mono font-semibold text-foreground">{sheet.name}</p>
                <p className="text-xs text-muted-foreground">{sheet.desc}</p>
              </div>
            </div>
            <span className={`text-xs font-mono ${sheet.available ? "text-success" : "text-muted-foreground"}`}>{sheet.available ? "Disponivel" : "Sem dados"}</span>
          </div>
        ))}
      </div>

      <div className="metric-card space-y-4">
        <h3 className="text-sm font-bold font-mono text-foreground">Relatorio estrategico (backend analytics)</h3>
        <p className="text-xs text-muted-foreground font-mono">
          Exporte a classificacao estrategica em CSV ou Excel a partir do endpoint de analytics.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => handleExportStrategy("csv")}
            variant="secondary"
            className="font-mono text-sm"
            disabled={strategyLoading !== null}
          >
            {strategyLoading === "csv" ? "Exportando..." : "Exportar CSV"}
          </Button>
          <Button
            onClick={() => handleExportStrategy("excel")}
            variant="secondary"
            className="font-mono text-sm"
            disabled={strategyLoading !== null}
          >
            {strategyLoading === "excel" ? "Exportando..." : "Exportar Excel"}
          </Button>
        </div>

        {strategyMessage && <p className="text-xs font-mono text-muted-foreground">{strategyMessage}</p>}
        {strategyError && <p className="text-xs font-mono text-destructive">{strategyError}</p>}
      </div>

      <div className="metric-card text-center py-6 space-y-4">
        <FileSpreadsheet className="h-10 w-10 text-primary mx-auto" />
        <h3 className="text-base font-bold font-mono text-foreground">Exportar Pack S&OP Completo</h3>
        <p className="text-xs text-muted-foreground font-mono max-w-md mx-auto">
          Gera multiplos CSVs com Resumo Executivo, Tabela Completa, Historico Mensal e Materia-Prima.
        </p>

        <Button onClick={handleExportPack} disabled={!state && !rmData} className="font-mono text-sm" size="lg">
          <Download className="h-4 w-4 mr-2" /> Gerar Pack S&OP
        </Button>
      </div>
    </div>
  );
}


