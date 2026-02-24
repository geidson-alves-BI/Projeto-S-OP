import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import { useAppData } from "@/contexts/AppDataContext";
import { getRMSummary } from "@/lib/rmEngine";

const SLA_OPTIONS = [90, 95, 98, 99];

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

export default function RMSlaPage() {
  const { rmData } = useAppData();
  const navigate = useNavigate();
  const [slaLevel, setSlaLevel] = useState(95);
  const [sortBy, setSortBy] = useState<"gap" | "cobertura" | "investimento">("gap");

  const summary = useMemo(() => rmData ? getRMSummary(rmData, slaLevel) : null, [rmData, slaLevel]);

  const enriched = useMemo(() => {
    if (!rmData) return [];
    return rmData.map(rm => {
      const target = rm.slaTargets[slaLevel] ?? 0;
      const gap = target - rm.estoqueDisponivel;
      const investimento = Math.max(0, gap) * rm.custoLiquidoUS;
      const status = rm.estoqueDisponivel >= target ? "ok" : "below";
      return { ...rm, target, gap, investimento, status };
    }).sort((a, b) => {
      if (sortBy === "gap") return b.gap - a.gap;
      if (sortBy === "cobertura") return a.coberturaDias - b.coberturaDias;
      return b.investimento - a.investimento;
    });
  }, [rmData, slaLevel, sortBy]);

  if (!rmData || rmData.length === 0) {
    return (
      <div className="p-6 space-y-4 max-w-2xl mx-auto text-center">
        <Shield className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-lg font-bold font-mono text-foreground">Gestão SLA — Matéria-Prima</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Nenhuma base RM carregada. Faça o upload primeiro.
        </p>
        <Button variant="outline" className="font-mono text-sm" onClick={() => navigate("/rm-upload")}>
          Ir para Upload RM
        </Button>
      </div>
    );
  }

  const handleExport = () => {
    const header = [
      "Cód. Produto", "Denominação", "Fornecedor", "Origem",
      "Estoque Disponível", "Estoque Segurança", "Estoque Pedido",
      "Consumo 30d", "CM 90d", "Consumo/Dia",
      "TR (dias)", "Cobertura (dias)", `Target SLA ${slaLevel}%`,
      "Gap", "Custo Unit. U$", "Investimento U$", "Status",
    ];
    const rows = enriched.map(rm => [
      rm.codProduto, rm.denominacao, rm.fornecedor, rm.origem,
      String(Math.round(rm.estoqueDisponivel)),
      String(Math.round(rm.estoqueSeguranca)),
      String(Math.round(rm.estoquePedido)),
      String(Math.round(rm.consumo30d)),
      String(Math.round(rm.cm90d)),
      String(Math.round(rm.consumoDiario)),
      String(rm.tempoReposicao),
      String(rm.coberturaDias),
      String(rm.target),
      String(Math.round(rm.gap)),
      rm.custoLiquidoUS.toFixed(2),
      rm.investimento.toFixed(2),
      rm.status === "ok" ? "OK" : "Abaixo SLA",
    ]);
    downloadCSV([header, ...rows], `rm_sla_${slaLevel}.csv`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Gestão SLA — Matéria-Prima
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Painel dinâmico de nível de serviço por matéria-prima
          </p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
        </Button>
      </div>

      {/* Controls */}
      <div className="metric-card space-y-4">
        <div>
          <label className="text-xs text-muted-foreground font-mono mb-2 block">
            Nível de Serviço (SLA): <span className="text-primary font-bold">{slaLevel}%</span>
          </label>
          <div className="max-w-md">
            <Slider
              min={90}
              max={99}
              step={1}
              value={[slaLevel]}
              onValueChange={([v]) => {
                const nearest = SLA_OPTIONS.reduce((prev, curr) =>
                  Math.abs(curr - v) < Math.abs(prev - v) ? curr : prev
                );
                setSlaLevel(nearest);
              }}
            />
            <div className="flex justify-between mt-1">
              {SLA_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setSlaLevel(s)}
                  className={`text-xs font-mono px-2 py-0.5 rounded transition-colors ${
                    slaLevel === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-muted-foreground font-mono mb-1 block">Ordenar por</label>
            <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
              <SelectTrigger className="w-44 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gap">Maior Gap</SelectItem>
                <SelectItem value="cobertura">Menor Cobertura</SelectItem>
                <SelectItem value="investimento">Maior Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Total RMs" value={summary.total} />
          <MetricCard label="Abaixo SLA" value={summary.belowSLA} />
          <MetricCard label="Dentro SLA" value={summary.aboveSLA} />
          <MetricCard label="Cobertura Média" value={`${summary.coberturMedia} dias`} />
          <MetricCard label="Investimento p/ SLA" value={`U$ ${summary.investimentoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} />
        </div>
      )}

      {/* Table */}
      <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>#</th>
              <th>Cód. Produto</th>
              <th>Denominação</th>
              <th>Fornecedor</th>
              <th>Estoque Disp.</th>
              <th>Est. Seg.</th>
              <th>Pedido</th>
              <th>Consumo/Dia</th>
              <th>TR (dias)</th>
              <th>Cobertura</th>
              <th>Target SLA</th>
              <th>Gap</th>
              <th>Investimento U$</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {enriched.slice(0, 100).map((rm, i) => (
              <tr key={rm.codProduto + i}>
                <td className="text-xs text-muted-foreground">{i + 1}</td>
                <td className="font-mono text-xs font-semibold">{rm.codProduto}</td>
                <td className="text-xs max-w-[200px] truncate" title={rm.denominacao}>{rm.denominacao}</td>
                <td className="text-xs max-w-[120px] truncate" title={rm.fornecedor}>{rm.fornecedor || "-"}</td>
                <td className="text-right font-mono text-xs">{Math.round(rm.estoqueDisponivel).toLocaleString()}</td>
                <td className="text-right font-mono text-xs">{Math.round(rm.estoqueSeguranca).toLocaleString() || "-"}</td>
                <td className="text-right font-mono text-xs">{Math.round(rm.estoquePedido).toLocaleString() || "-"}</td>
                <td className="text-right font-mono text-xs">{Math.round(rm.consumoDiario).toLocaleString()}</td>
                <td className="text-right font-mono text-xs">{rm.tempoReposicao || "-"}</td>
                <td className="text-right font-mono text-xs">{rm.coberturaDias} d</td>
                <td className="text-right font-mono text-xs font-bold">{rm.target.toLocaleString()}</td>
                <td className={`text-right font-mono text-xs font-bold ${rm.gap > 0 ? "text-destructive" : "text-success"}`}>
                  {rm.gap > 0 ? `+${Math.round(rm.gap).toLocaleString()}` : Math.round(rm.gap).toLocaleString()}
                </td>
                <td className="text-right font-mono text-xs">
                  {rm.investimento > 0 ? `U$ ${rm.investimento.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "-"}
                </td>
                <td>
                  {rm.status === "ok"
                    ? <span className="inline-flex items-center gap-1 text-xs text-success font-mono"><CheckCircle2 className="h-3 w-3" /> OK</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-destructive font-mono"><AlertTriangle className="h-3 w-3" /> Abaixo</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
