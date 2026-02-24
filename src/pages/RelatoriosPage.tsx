import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import { useAppData } from "@/contexts/AppDataContext";
import { getRMSummary } from "@/lib/rmEngine";

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
  // Export as multiple CSVs in one click (zip not available, use multiple downloads)
  sheets.forEach((sheet, idx) => {
    setTimeout(() => downloadCSV(sheet.rows, `pack_sop_${sheet.name}.csv`), idx * 200);
  });
}

export default function RelatoriosPage() {
  const { state, rmData } = useAppData();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state && !rmData) navigate("/upload");
  }, [state, rmData, navigate]);

  const rmSummary = useMemo(() => rmData ? getRMSummary(rmData, 95) : null, [rmData]);

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

    // Sheet 1: Executive Summary
    if (state && summaryData) {
      sheets.push({
        name: "resumo_executivo",
        rows: [
          ["PACK S&OP — RESUMO EXECUTIVO"],
          ["Gerado em", new Date().toISOString().split("T")[0]],
          [],
          ["Métrica", "Valor"],
          ["Total SKUs", String(state.products.length)],
          ["Meses analisados", String(state.monthCols.length)],
          ["Vol. Total (kg)", String(Math.round(summaryData.volTotal))],
          ["SKUs Classe A", String(summaryData.countA)],
          ["SKUs Classe B", String(summaryData.countB)],
          ["SKUs Classe C", String(summaryData.countC)],
          ["Candidatos MTS", String(summaryData.countMTS)],
          ["MTO", String(summaryData.countMTO)],
          ["Target Estoque Total (kg)", String(Math.round(summaryData.targetTotal))],
          ...(state.portfolioConc ? [
            ["HHI Portfólio", state.portfolioConc.hhiPortfolio.toFixed(3)],
            ["Top1 Share Portfólio", `${(state.portfolioConc.top1SharePortfolio * 100).toFixed(1)}%`],
          ] : []),
          ...(rmSummary ? [
            [],
            ["--- MATÉRIA-PRIMA ---"],
            ["Total RMs", String(rmSummary.total)],
            ["Abaixo SLA 95%", String(rmSummary.belowSLA)],
            ["Investimento p/ SLA (R$)", String(Math.round(rmSummary.investimentoTotal))],
          ] : []),
        ],
      });
    }

    // Sheet 2: Full product list
    if (state) {
      const header = [
        "SKU", "Código", "Denominação", "ABC", "XYZ", "ABC-XYZ",
        "Vol. Anual (kg)", "Média/Mês (kg)", "CV", "Tendência", "Tendência %",
        "Estratégia", "Dias Alvo", "Target Estoque (kg)", "Prioridade MTS",
        ...(state.hasClientes ? ["Top1 Cliente", "Top1 Share (%)", "HHI"] : []),
      ];
      const rows = state.products.map(p => [
        p.SKU_LABEL, p.codigoProduto, p.denominacao,
        p.classeABC, p.classeXYZ, p.abcXyz,
        String(Math.round(p.volumeAnual)),
        String(Math.round(p.mediaMensal)),
        p.cv.toFixed(2),
        p.trendLabel,
        p.trendPct != null ? p.trendPct.toFixed(1) : "",
        p.estrategiaFinal ?? p.estrategiaBase,
        String(p.diasAlvoAjustado ?? p.diasAlvoBase),
        String(Math.round(p.targetKgAjustado ?? p.consumoDiario * p.diasAlvoBase)),
        String(p.prioridadeMTS),
        ...(state.hasClientes ? [
          p.top1Cliente ?? "",
          p.top1ShareProduto != null ? (p.top1ShareProduto * 100).toFixed(1) : "",
          p.hhiProduto != null ? p.hhiProduto.toFixed(3) : "",
        ] : []),
      ]);
      sheets.push({ name: "produtos_completo", rows: [header, ...rows] });
    }

    // Sheet 3: Historical demand
    if (state) {
      const header = ["SKU", "Código", "ABC", ...state.monthCols, "Total"];
      const rows = state.products.map(p => [
        p.SKU_LABEL, p.codigoProduto, p.classeABC,
        ...state.monthCols.map(m => String(Math.round(p.monthValues[m] || 0))),
        String(Math.round(p.volumeAnual)),
      ]);
      sheets.push({ name: "historico_mensal", rows: [header, ...rows] });
    }

    // Sheet 4: RM data
    if (rmData) {
      const header = ["Código RM", "Descrição", "Un.", "Consumo Mensal", "Lead Time", "Estoque Atual", "Cobertura (dias)", "Custo Unit.", "Target SLA 95%"];
      const rows = rmData.map(rm => [
        rm.codigoRM, rm.descricao, rm.unidade,
        String(Math.round(rm.consumoMensal)),
        String(rm.leadTimeDias),
        String(Math.round(rm.estoqueAtual)),
        String(rm.coberturaDias),
        rm.custoUnitario.toFixed(2),
        String(rm.slaTargets[95] ?? 0),
      ]);
      sheets.push({ name: "materia_prima", rows: [header, ...rows] });
    }

    if (sheets.length === 0) return;
    downloadAllSheets(sheets);
  };

  const handleExportSingle = (sheetName: string) => {
    // Generate only that specific sheet
    handleExportPack(); // simplified: export all for now
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" /> Relatórios — Pack S&OP
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          Geração de relatório consolidado exportável
        </p>
      </div>

      {/* Summary */}
      {summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total SKUs" value={state!.products.length} />
          <MetricCard label="Vol. Total" value={`${Math.round(summaryData.volTotal).toLocaleString()} kg`} />
          <MetricCard label="MTS / MTO" value={`${summaryData.countMTS} / ${summaryData.countMTO}`} />
          {rmSummary && <MetricCard label="RMs carregadas" value={rmSummary.total} />}
        </div>
      )}

      {/* Pack contents */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold font-mono text-foreground">Conteúdo do Pack S&OP</h3>

        {[
          { name: "Resumo Executivo", desc: "KPIs globais, contagens ABC, estratégias, HHI", available: !!state },
          { name: "Produtos Completo", desc: "Tabela completa com ABC-XYZ, tendência, estratégia, prioridade", available: !!state },
          { name: "Histórico Mensal", desc: "Série mensal de produção por SKU", available: !!state },
          { name: "Matéria-Prima", desc: "Base RM com consumos, cobertura e targets SLA", available: !!rmData },
        ].map(sheet => (
          <div key={sheet.name} className={`metric-card flex items-center justify-between ${!sheet.available ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-3">
              {sheet.available
                ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                : <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div>
                <p className="text-sm font-mono font-semibold text-foreground">{sheet.name}</p>
                <p className="text-xs text-muted-foreground">{sheet.desc}</p>
              </div>
            </div>
            <span className={`text-xs font-mono ${sheet.available ? "text-success" : "text-muted-foreground"}`}>
              {sheet.available ? "Disponível" : "Sem dados"}
            </span>
          </div>
        ))}
      </div>

      {/* Export */}
      <div className="metric-card text-center py-6 space-y-4">
        <FileSpreadsheet className="h-10 w-10 text-primary mx-auto" />
        <h3 className="text-base font-bold font-mono text-foreground">Exportar Pack S&OP Completo</h3>
        <p className="text-xs text-muted-foreground font-mono max-w-md mx-auto">
          Gera múltiplos CSVs com Resumo Executivo, Tabela Completa, Histórico Mensal e Matéria-Prima.
        </p>
        <Button
          onClick={handleExportPack}
          disabled={!state && !rmData}
          className="font-mono text-sm"
          size="lg"
        >
          <Download className="h-4 w-4 mr-2" /> Gerar Pack S&OP
        </Button>
      </div>
    </div>
  );
}
