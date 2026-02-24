import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { DollarSign, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import { ABCBadge, StratBadge } from "@/components/ABCBadge";
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

export default function FinanceiroPage() {
  const { state, rmData } = useAppData();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state && !rmData) navigate("/upload");
  }, [state, rmData, navigate]);

  const [sortBySku, setSortBySku] = useState<"investimento" | "volume">("investimento");
  const [sortByRm, setSortByRm] = useState<"investimento" | "cobertura">("investimento");
  const [slaLevel, setSlaLevel] = useState(95);

  // SKU Investment: target stock value (using consumoDiario * diasAlvo as proxy)
  const skuInvestment = useMemo(() => {
    if (!state) return [];
    return state.products.map(p => {
      const dias = p.diasAlvoAjustado ?? p.diasAlvoBase;
      const targetKg = p.consumoDiario * dias;
      // estimate cost: use mediaMensal as proxy weight
      const estimatedValue = targetKg; // in kg (no cost data for FG)
      return { ...p, diasAlvo: dias, targetKg, estimatedValue };
    }).sort((a, b) => sortBySku === "investimento" ? b.targetKg - a.targetKg : b.volumeAnual - a.volumeAnual);
  }, [state, sortBySku]);

  const totalSkuTarget = skuInvestment.reduce((s, p) => s + p.targetKg, 0);

  // RM Investment
  const rmInvestment = useMemo(() => {
    if (!rmData) return [];
    return rmData.map(rm => {
      const target = rm.slaTargets[slaLevel] ?? 0;
      const gap = Math.max(0, target - rm.estoqueAtual);
      const investimento = gap * rm.custoUnitario;
      return { ...rm, target, gap, investimento };
    }).sort((a, b) => sortByRm === "investimento" ? b.investimento - a.investimento : a.coberturaDias - b.coberturaDias);
  }, [rmData, slaLevel, sortByRm]);

  const totalRmInvestimento = rmInvestment.reduce((s, r) => s + r.investimento, 0);
  const totalRmEstoque = rmData ? rmData.reduce((s, r) => s + r.estoqueAtual * r.custoUnitario, 0) : 0;

  const handleExportSku = () => {
    const header = ["SKU", "Código", "ABC-XYZ", "Estratégia", "Consumo/Dia (kg)", "Dias Alvo", "Target Estoque (kg)", "Vol. Anual (kg)"];
    const rows = skuInvestment.map(p => [
      p.SKU_LABEL, p.codigoProduto, p.abcXyz,
      p.estrategiaFinal ?? p.estrategiaBase,
      String(Math.round(p.consumoDiario)),
      String(p.diasAlvo),
      String(Math.round(p.targetKg)),
      String(Math.round(p.volumeAnual)),
    ]);
    downloadCSV([header, ...rows], "financeiro_sku.csv");
  };

  const handleExportRm = () => {
    const header = ["Código RM", "Descrição", "Un.", "Estoque Atual", `Target SLA ${slaLevel}%`, "Gap", "Custo Unit.", "Investimento (R$)"];
    const rows = rmInvestment.map(r => [
      r.codigoRM, r.descricao, r.unidade,
      String(Math.round(r.estoqueAtual)),
      String(r.target),
      String(Math.round(r.gap)),
      r.custoUnitario.toFixed(2),
      r.investimento.toFixed(2),
    ]);
    downloadCSV([header, ...rows], `financeiro_rm_sla${slaLevel}.csv`);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" /> Financeiro — Investimento
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">Investimento em estoque por SKU e por Matéria-Prima</p>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {state && <MetricCard label="SKUs" value={state.products.length} />}
        {state && <MetricCard label="Target Estoque FG" value={`${Math.round(totalSkuTarget).toLocaleString()} kg`} />}
        {rmData && <MetricCard label="Estoque RM Atual (R$)" value={`R$ ${Math.round(totalRmEstoque).toLocaleString()}`} />}
        {rmData && <MetricCard label="Investimento RM p/ SLA" value={`R$ ${Math.round(totalRmInvestimento).toLocaleString()}`} sub={`SLA ${slaLevel}%`} />}
      </div>

      <Tabs defaultValue={state ? "sku" : "rm"} className="w-full">
        <TabsList className="bg-secondary border border-border mb-4">
          {state && <TabsTrigger value="sku" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Por SKU</TabsTrigger>}
          {rmData && <TabsTrigger value="rm" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Por Matéria-Prima</TabsTrigger>}
        </TabsList>

        {state && (
          <TabsContent value="sku" className="space-y-4">
            <div className="metric-card flex items-center gap-4">
              <div>
                <label className="text-xs text-muted-foreground font-mono mb-1 block">Ordenar por</label>
                <Select value={sortBySku} onValueChange={v => setSortBySku(v as any)}>
                  <SelectTrigger className="w-44 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investimento">Target Estoque</SelectItem>
                    <SelectItem value="volume">Volume Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="font-mono text-xs ml-auto" onClick={handleExportSku}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar
              </Button>
            </div>

            <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="data-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>#</th><th>SKU</th><th>ABC-XYZ</th><th>Estratégia</th>
                    <th>Consumo/Dia</th><th>Dias Alvo</th><th>Target Estoque (kg)</th><th>Vol. Anual</th>
                  </tr>
                </thead>
                <tbody>
                  {skuInvestment.slice(0, 80).map((p, i) => (
                    <tr key={p.SKU_LABEL}>
                      <td className="text-xs text-muted-foreground">{i + 1}</td>
                      <td className="max-w-[200px] truncate text-xs" title={p.SKU_LABEL}>{p.SKU_LABEL}</td>
                      <td><ABCBadge classe={p.abcXyz} /></td>
                      <td><StratBadge strat={p.estrategiaFinal ?? p.estrategiaBase} /></td>
                      <td className="text-right font-mono text-xs">{Math.round(p.consumoDiario).toLocaleString()}</td>
                      <td className="text-right font-mono text-xs">{p.diasAlvo}</td>
                      <td className="text-right font-mono text-xs font-bold">{Math.round(p.targetKg).toLocaleString()}</td>
                      <td className="text-right font-mono text-xs">{Math.round(p.volumeAnual).toLocaleString()}</td>
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
                <label className="text-xs text-muted-foreground font-mono mb-1 block">SLA</label>
                <Select value={String(slaLevel)} onValueChange={v => setSlaLevel(Number(v))}>
                  <SelectTrigger className="w-28 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">90%</SelectItem>
                    <SelectItem value="95">95%</SelectItem>
                    <SelectItem value="98">98%</SelectItem>
                    <SelectItem value="99">99%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-mono mb-1 block">Ordenar por</label>
                <Select value={sortByRm} onValueChange={v => setSortByRm(v as any)}>
                  <SelectTrigger className="w-44 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investimento">Maior Investimento</SelectItem>
                    <SelectItem value="cobertura">Menor Cobertura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="font-mono text-xs ml-auto" onClick={handleExportRm}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar
              </Button>
            </div>

            <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="data-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>#</th><th>Código RM</th><th>Descrição</th><th>Un.</th>
                    <th>Estoque Atual</th><th>Target SLA</th><th>Gap</th><th>Custo Unit.</th><th>Investimento (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {rmInvestment.slice(0, 80).map((r, i) => (
                    <tr key={r.codigoRM + i}>
                      <td className="text-xs text-muted-foreground">{i + 1}</td>
                      <td className="font-mono text-xs font-semibold">{r.codigoRM}</td>
                      <td className="text-xs max-w-[200px] truncate" title={r.descricao}>{r.descricao}</td>
                      <td className="text-xs text-muted-foreground">{r.unidade}</td>
                      <td className="text-right font-mono text-xs">{Math.round(r.estoqueAtual).toLocaleString()}</td>
                      <td className="text-right font-mono text-xs">{r.target.toLocaleString()}</td>
                      <td className={`text-right font-mono text-xs font-bold ${r.gap > 0 ? "text-destructive" : "text-success"}`}>
                        {r.gap > 0 ? `+${Math.round(r.gap).toLocaleString()}` : "0"}
                      </td>
                      <td className="text-right font-mono text-xs">{r.custoUnitario.toFixed(2)}</td>
                      <td className="text-right font-mono text-xs font-bold">
                        {r.investimento > 0 ? `R$ ${Math.round(r.investimento).toLocaleString()}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {!state && !rmData && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground font-mono">Carregue a base de Produção (FG) ou Matéria-Prima (RM) primeiro.</p>
        </div>
      )}
    </div>
  );
}
