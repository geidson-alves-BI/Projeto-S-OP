import { useState, useMemo, useCallback } from "react";
import { Puzzle, Upload, Download, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileUpload from "@/components/FileUpload";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import { ABCBadge } from "@/components/ABCBadge";
import { useAppData } from "@/contexts/AppDataContext";
import { parseFile } from "@/lib/fileParser";
import { downloadCSV } from "@/lib/downloadCSV";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ComplexityData {
  codigoProduto: string;
  denominacao: string;
  numItens: number;
  ranking: number;
  faixa: "Baixa" | "Média" | "Alta";
  abc?: string;
  abcXyz?: string;
}

const COMPLEX_DATA_DICT = [
  { col: "Código Produto", tipo: "Texto", obrigatório: true, desc: "Identificador do SKU" },
  { col: "Denominação", tipo: "Texto", obrigatório: false, desc: "Nome do produto" },
  { col: "Nº Itens Fórmula", tipo: "Numérico", obrigatório: true, desc: "Qtde de itens na fórmula/receita" },
];

const ALIAS: Record<string, string> = {
  "codigo produto": "Código Produto",
  "código produto": "Código Produto",
  "codigo_produto": "Código Produto",
  "cod produto": "Código Produto",
  "sku": "Código Produto",
  "denominacao": "Denominação",
  "denominação": "Denominação",
  "descricao": "Denominação",
  "descrição": "Denominação",
  "n itens formula": "Nº Itens Fórmula",
  "nº itens fórmula": "Nº Itens Fórmula",
  "num itens": "Nº Itens Fórmula",
  "itens formula": "Nº Itens Fórmula",
  "itens_formula": "Nº Itens Fórmula",
  "qtd itens": "Nº Itens Fórmula",
  "complexidade": "Nº Itens Fórmula",
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\n\t]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
}


export default function ComplexidadePage() {
  const { state } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ComplexityData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"ranking" | "itens">("ranking");

  const handleLoad = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await parseFile(file);
      if (raw.length === 0) { setError("Arquivo vazio."); return; }

      const cols = Object.keys(raw[0]);
      const rename: Record<string, string> = {};
      for (const col of cols) {
        const key = normalize(col);
        if (ALIAS[key]) rename[col] = ALIAS[key];
      }

      const resolved = new Set([...cols.map(c => c.trim()), ...Object.values(rename)]);
      const required = ["Código Produto", "Nº Itens Fórmula"];
      const missing = required.filter(r => !resolved.has(r));
      if (missing.length > 0) {
        setError(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);
        return;
      }

      const processed = raw.map(row => {
        const r: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          r[rename[k] ?? k] = v;
        }
        const numItens = Number(String(r["Nº Itens Fórmula"] ?? "0").replace(/,/g, ".")) || 0;
        return {
          codigoProduto: String(r["Código Produto"] ?? "").trim(),
          denominacao: String(r["Denominação"] ?? "").trim(),
          numItens,
          ranking: 0,
          faixa: "Baixa" as const,
        };
      }).filter(r => r.codigoProduto !== "")
        .sort((a, b) => b.numItens - a.numItens);

      // Assign ranking and faixas
      const p33 = processed[Math.floor(processed.length * 0.33)]?.numItens ?? 0;
      const p66 = processed[Math.floor(processed.length * 0.66)]?.numItens ?? 0;

      const result = processed.map((item, idx) => ({
        ...item,
        ranking: idx + 1,
        faixa: item.numItens >= p33 ? "Alta" as const : item.numItens >= p66 ? "Média" as const : "Baixa" as const,
      }));

      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [file]);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => sortBy === "ranking" ? a.ranking - b.ranking : b.numItens - a.numItens);
  }, [data, sortBy]);

  // Merge with ABC data if available
  const enriched = useMemo(() => {
    if (!sorted.length) return sorted;
    if (!state) return sorted;
    const abcMap = new Map(state.products.map(p => [p.codigoProduto, p]));
    return sorted.map(item => ({
      ...item,
      abc: abcMap.get(item.codigoProduto)?.classeABC as string | undefined,
      abcXyz: abcMap.get(item.codigoProduto)?.abcXyz as string | undefined,
    }));
  }, [sorted, state]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const faixas = { Alta: 0, Média: 0, Baixa: 0 };
    data.forEach(d => faixas[d.faixa]++);
    return [
      { name: "Alta", value: faixas.Alta, fill: "hsl(0 72% 51%)" },
      { name: "Média", value: faixas.Média, fill: "hsl(38 92% 50%)" },
      { name: "Baixa", value: faixas.Baixa, fill: "hsl(142 76% 36%)" },
    ];
  }, [data]);

  const histogramData = useMemo(() => {
    if (!data) return [];
    const buckets: Record<string, number> = {};
    data.forEach(d => {
      const bucket = Math.floor(d.numItens / 5) * 5;
      const label = `${bucket}-${bucket + 4}`;
      buckets[label] = (buckets[label] || 0) + 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, count }));
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const header = ["Ranking", "Código Produto", "Denominação", "Nº Itens Fórmula", "Faixa", ...(state ? ["ABC", "ABC-XYZ"] : [])];
    const rows = enriched.map(d => [
      String(d.ranking), d.codigoProduto, d.denominacao,
      String(d.numItens), d.faixa,
      ...("abc" in d ? [d.abc ?? "-", d.abcXyz ?? "-"] : []),
    ]);
    downloadCSV([header, ...rows], "complexidade_produtiva.csv");
  };

  return (
    <PageTransition className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-primary" /> Complexidade Produtiva
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          Upload de fórmula por SKU, ranking e gráficos de complexidade
        </p>
      </div>

      {!data && (
        <>
          {/* Data Dictionary */}
          <div className="metric-card">
            <h3 className="text-sm font-bold font-mono text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Dicionário de Dados
            </h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>Coluna</th><th>Tipo</th><th>Obrigatório</th><th>Descrição</th></tr>
                </thead>
                <tbody>
                  {COMPLEX_DATA_DICT.map(d => (
                    <tr key={d.col}>
                      <td className="font-mono text-xs font-semibold">{d.col}</td>
                      <td className="text-xs">{d.tipo}</td>
                      <td>{d.obrigatório ? <span className="text-xs text-destructive font-bold">Sim</span> : <span className="text-xs text-muted-foreground">Não</span>}</td>
                      <td className="text-xs text-muted-foreground">{d.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="max-w-md">
            <FileUpload label="Base de Complexidade (SKU + Nº Itens)" file={file} onFileSelect={setFile} />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive font-mono">{error}</p>
            </div>
          )}

          <Button onClick={handleLoad} disabled={!file || loading} className="font-mono text-sm">
            {loading ? "Processando..." : "Validar & Carregar"}
          </Button>
        </>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Total SKUs" value={data.length} />
            <MetricCard label="Média Itens" value={(data.reduce((s, d) => s + d.numItens, 0) / data.length).toFixed(1)} />
            <MetricCard label="Máx. Itens" value={data[0]?.numItens ?? 0} sub={data[0]?.codigoProduto} />
            <MetricCard label="Alta Complexidade" value={data.filter(d => d.faixa === "Alta").length} />
            <MetricCard label="Baixa Complexidade" value={data.filter(d => d.faixa === "Baixa").length} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="metric-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">Distribuição por Faixa</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 20%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 13%)", border: "1px solid hsl(220 14% 20%)", borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="metric-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">Histograma — Nº Itens</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={histogramData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 20%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 13%)", border: "1px solid hsl(220 14% 20%)", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Controls + Table */}
          <div className="metric-card flex items-center gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-mono mb-1 block">Ordenar por</label>
              <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
                <SelectTrigger className="w-40 font-mono text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ranking">Ranking</SelectItem>
                  <SelectItem value="itens">Nº Itens</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{data.length} SKUs</span>
            <Button variant="outline" size="sm" className="font-mono text-xs ml-auto" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
            </Button>
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => { setData(null); setFile(null); setError(null); }}>
              Nova Base
            </Button>
          </div>

          <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="data-table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>#</th><th>Código</th><th>Denominação</th><th>Nº Itens</th><th>Faixa</th>
                  {state && <th>ABC</th>}
                  {state && <th>ABC-XYZ</th>}
                </tr>
              </thead>
              <tbody>
                {enriched.slice(0, 100).map((d, i) => (
                  <tr key={d.codigoProduto + i}>
                    <td className="text-xs text-muted-foreground">{d.ranking}</td>
                    <td className="font-mono text-xs font-semibold">{d.codigoProduto}</td>
                    <td className="text-xs max-w-[200px] truncate" title={d.denominacao}>{d.denominacao || "-"}</td>
                    <td className="text-right font-mono text-xs font-bold">{d.numItens}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${
                        d.faixa === "Alta" ? "bg-destructive/20 text-destructive" :
                        d.faixa === "Média" ? "bg-warning/20 text-warning" :
                        "bg-success/20 text-success"
                      }`}>
                        {d.faixa}
                      </span>
                    </td>
                    {state && <td className="text-xs text-center">{"abc" in d ? d.abc ?? "-" : "-"}</td>}
                    {state && <td>{"abcXyz" in d && d.abcXyz ? <ABCBadge classe={d.abcXyz} /> : <span className="text-xs text-muted-foreground">-</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageTransition>
  );
}
