import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Upload, CheckCircle2, XCircle, AlertTriangle, BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileUpload from "@/components/FileUpload";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import { useAppData } from "@/contexts/AppDataContext";
import { parseFile } from "@/lib/fileParser";
import { ProductSeriesChart } from "@/components/Charts";
import { downloadCSV } from "@/lib/downloadCSV";

const FG_DATA_DICT = [
  { col: "Mês", tipo: "Texto/Num", obrigatório: true, desc: "Mês de referência (1-12 ou nome)" },
  { col: "Ano referência", tipo: "Numérico", obrigatório: true, desc: "Ano (ex: 2024)" },
  { col: "Código Produto", tipo: "Texto", obrigatório: true, desc: "Identificador único do SKU" },
  { col: "Denominação", tipo: "Texto", obrigatório: true, desc: "Nome/descrição do produto" },
  { col: "Quantidade Produzida", tipo: "Numérico", obrigatório: true, desc: "Volume produzido (kg)" },
  { col: "Cliente", tipo: "Texto", obrigatório: false, desc: "Nome do cliente (para concentração)" },
];

export default function DemandaFGPage() {
  const { state, fileProd, setFileProd, fileCli, setFileCli, handleLoad, loading, error } = useAppData();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"upload" | "historico">(state ? "historico" : "upload");
  const [filterABC, setFilterABC] = useState("Todos");

  useEffect(() => {
    if (state) setViewMode("historico");
  }, [state]);

  const filteredProducts = useMemo(() => {
    if (!state) return [];
    let list = state.products;
    if (filterABC !== "Todos") list = list.filter(p => p.classeABC === filterABC);
    return list;
  }, [state, filterABC]);

  const handleExportHistorico = () => {
    if (!state) return;
    const header = ["SKU", "Código", "ABC", "XYZ", ...state.monthCols, "Vol. Total"];
    const rows = filteredProducts.map(p => [
      p.SKU_LABEL, p.codigoProduto, p.classeABC, p.classeXYZ,
      ...state.monthCols.map(m => String(Math.round(p.monthValues[m] || 0))),
      String(Math.round(p.volumeAnual)),
    ]);
    downloadCSV([header, ...rows], "demanda_fg_historico.csv");
  };

  return (
    <PageTransition className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2>
            <BarChart3 className="h-5 w-5 text-primary" /> Demanda FG — Finished Goods
          </h2>
          <p>Upload, validação e visão histórica de demanda</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "upload" ? "default" : "outline"}
            size="sm"
            className="font-mono text-xs gap-1.5"
            onClick={() => setViewMode("upload")}
          >
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
          {state && (
            <Button
              variant={viewMode === "historico" ? "default" : "outline"}
              size="sm"
              className="font-mono text-xs gap-1.5"
              onClick={() => setViewMode("historico")}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Histórico
            </Button>
          )}
        </div>
      </div>

      {viewMode === "upload" && (
        <>
          <div className="metric-card">
            <h3 className="text-sm font-bold font-mono text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Dicionário de Dados — Colunas Esperadas
            </h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Coluna</th><th>Tipo</th><th>Obrigatório</th><th>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {FG_DATA_DICT.map(d => (
                    <tr key={d.col}>
                      <td className="font-mono text-xs font-semibold">{d.col}</td>
                      <td className="text-xs">{d.tipo}</td>
                      <td>
                        {d.obrigatório
                          ? <span className="text-xs text-destructive font-bold">Sim</span>
                          : <span className="text-xs text-muted-foreground">Não</span>}
                      </td>
                      <td className="text-xs text-muted-foreground">{d.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <FileUpload label="Base de Produção (obrigatório)" file={fileProd} onFileSelect={setFileProd} />
            <FileUpload label="Base de Clientes (opcional)" file={fileCli} onFileSelect={setFileCli} />
          </div>

          {error && (
            <div className="alert-error">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive font-mono">{error}</p>
            </div>
          )}

          <Button onClick={handleLoad} disabled={!fileProd || loading} className="font-mono text-sm">
            {loading ? "Processando..." : "Validar & Carregar"}
          </Button>

          {state && (
            <div className="alert-success">
              <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-success font-mono font-bold">
                  ✓ {state.products.length} SKUs · {state.monthCols.length} meses carregados
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  Navegue para "Histórico" para visualizar a demanda.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === "historico" && state && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Total SKUs" value={state.products.length} accent />
            <MetricCard label="Meses" value={state.monthCols.length} sub={`${state.monthCols[0]} → ${state.monthCols[state.monthCols.length - 1]}`} />
            <MetricCard label="Vol. Total" value={`${Math.round(state.products.reduce((s, p) => s + p.volumeAnual, 0)).toLocaleString()} kg`} />
            <MetricCard label="Classe A" value={state.products.filter(p => p.classeABC === "A").length} />
            <MetricCard label="Clientes" value={state.hasClientes ? state.clientes.length : "N/A"} />
          </div>

          <div className="metric-card flex flex-wrap items-center gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground font-mono mb-1 block uppercase tracking-wider">Filtro ABC</label>
              <Select value={filterABC} onValueChange={setFilterABC}>
                <SelectTrigger className="w-36 font-mono text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="A">Classe A</SelectItem>
                  <SelectItem value="B">Classe B</SelectItem>
                  <SelectItem value="C">Classe C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{filteredProducts.length} SKUs</span>
            <Button variant="outline" size="sm" className="font-mono text-xs ml-auto gap-1.5" onClick={handleExportHistorico}>
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
          </div>

          <div className="metric-card overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="data-table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>SKU</th>
                  <th>ABC</th>
                  <th>XYZ</th>
                  {state.monthCols.map(m => <th key={m} className="text-center">{m}</th>)}
                  <th>Total</th>
                  <th>Média</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 80).map(p => (
                  <tr key={p.SKU_LABEL}>
                    <td className="max-w-[180px] truncate text-xs" title={p.SKU_LABEL}>{p.SKU_LABEL}</td>
                    <td className="text-xs font-bold text-center">{p.classeABC}</td>
                    <td className="text-xs text-center">{p.classeXYZ}</td>
                    {state.monthCols.map(m => (
                      <td key={m} className="text-right font-mono text-xs">
                        {Math.round(p.monthValues[m] || 0).toLocaleString()}
                      </td>
                    ))}
                    <td className="text-right font-mono text-xs font-bold">{Math.round(p.volumeAnual).toLocaleString()}</td>
                    <td className="text-right font-mono text-xs">{Math.round(p.mediaMensal).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="metric-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Top 5 SKUs — Série Histórica</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProducts.slice(0, 5).map(p => (
                <div key={p.SKU_LABEL} className="border border-border/60 rounded-xl p-4">
                  <p className="text-xs font-mono text-muted-foreground mb-2 truncate" title={p.SKU_LABEL}>{p.SKU_LABEL}</p>
                  <ProductSeriesChart data={p} monthCols={state.monthCols} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </PageTransition>
  );
}
