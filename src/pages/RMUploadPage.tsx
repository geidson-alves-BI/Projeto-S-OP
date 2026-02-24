import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/FileUpload";
import { useAppData } from "@/contexts/AppDataContext";
import { parseFile } from "@/lib/fileParser";
import { validateRMColumns, processRM } from "@/lib/rmEngine";

const DATA_DICT = [
  // Identificação
  { group: "🧾 Identificação", col: "Cód. Produto", tipo: "Texto", obrigatório: true, desc: "Código identificador do produto / matéria-prima" },
  { group: "🧾 Identificação", col: "Denominação", tipo: "Texto", obrigatório: true, desc: "Nome / descrição do material" },
  { group: "🧾 Identificação", col: "Fornecedor", tipo: "Texto", obrigatório: false, desc: "Nome do fornecedor principal" },
  { group: "🧾 Identificação", col: "Origem", tipo: "Texto", obrigatório: false, desc: "Nacional / Importado" },
  // Estoque
  { group: "📦 Estoque", col: "Estoque Disponível (SE)", tipo: "Numérico", obrigatório: true, desc: "Saldo em estoque disponível" },
  { group: "📦 Estoque", col: "Estoque Segurança (ES)", tipo: "Numérico", obrigatório: false, desc: "Nível de estoque de segurança definido" },
  { group: "📦 Estoque", col: "Estoque em Pedido (PC aberto)", tipo: "Numérico", obrigatório: false, desc: "Quantidade em pedidos de compra abertos" },
  // Consumo
  { group: "📈 Consumo", col: "Consumo Total 30 Dias", tipo: "Numérico", obrigatório: true, desc: "Consumo acumulado nos últimos 30 dias" },
  { group: "📈 Consumo", col: "Consumo Total 90 Dias", tipo: "Numérico", obrigatório: false, desc: "Consumo acumulado nos últimos 90 dias" },
  { group: "📈 Consumo", col: "Consumo Total 180 Dias", tipo: "Numérico", obrigatório: false, desc: "Consumo acumulado nos últimos 180 dias" },
  { group: "📈 Consumo", col: "Consumo Total 365 Dias", tipo: "Numérico", obrigatório: false, desc: "Consumo acumulado nos últimos 365 dias" },
  { group: "📈 Consumo", col: "CM - Consumo Médio 90 Dias", tipo: "Numérico", obrigatório: false, desc: "Consumo médio mensal (base 90 dias)" },
  { group: "📈 Consumo", col: "CM - Consumo Médio 180 Dias", tipo: "Numérico", obrigatório: false, desc: "Consumo médio mensal (base 180 dias)" },
  { group: "📈 Consumo", col: "CM - Consumo Médio 365 Dias", tipo: "Numérico", obrigatório: false, desc: "Consumo médio mensal (base 365 dias)" },
  // Lead Time
  { group: "🚚 Lead Time", col: "Tempo Reposição (TR)", tipo: "Numérico", obrigatório: false, desc: "Prazo de reposição em dias" },
  // Financeiro
  { group: "🟧 Financeiro", col: "Custo Líquido Última Entrada U$", tipo: "Numérico", obrigatório: false, desc: "Custo unitário da última entrada (USD)" },
  { group: "🟧 Financeiro", col: "QTD Compra Último Ano", tipo: "Numérico", obrigatório: false, desc: "Quantidade comprada nos últimos 12 meses" },
  { group: "🟧 Financeiro", col: "Valor Estoque U$ 90 Dias", tipo: "Numérico", obrigatório: false, desc: "Valor do estoque projetado a 90 dias (USD)" },
  { group: "🟧 Financeiro", col: "Valor Estoque U$ 180 Dias", tipo: "Numérico", obrigatório: false, desc: "Valor do estoque projetado a 180 dias (USD)" },
];

export default function RMUploadPage() {
  const navigate = useNavigate();
  const { setRMData } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; missing: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);

  const handleValidate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setValidation(null);
    try {
      const raw = await parseFile(file);
      if (raw.length === 0) {
        setError("Arquivo vazio ou sem dados válidos.");
        return;
      }
      const cols = Object.keys(raw[0]);
      const result = validateRMColumns(cols);
      setValidation(result);

      if (result.valid) {
        const rmData = processRM(raw, result.rename);
        setRowCount(rmData.length);
        setRMData(rmData);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Group rows for rendering
  let lastGroup = "";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" /> Upload Matéria-Prima (RM)
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          Envie a base de matérias-primas para análise de SLA e cobertura
        </p>
      </div>

      {/* Data Dictionary */}
      <div className="metric-card">
        <h3 className="text-sm font-bold font-mono text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" /> Dicionário de Dados — Colunas Esperadas
        </h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Coluna</th>
                <th>Tipo</th>
                <th>Obrigatório</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {DATA_DICT.map(d => {
                const showGroup = d.group !== lastGroup;
                lastGroup = d.group;
                return (
                  <tr key={d.col}>
                    <td className="text-xs font-semibold whitespace-nowrap">
                      {showGroup ? d.group : ""}
                    </td>
                    <td className="font-mono text-xs font-semibold">{d.col}</td>
                    <td className="text-xs">{d.tipo}</td>
                    <td>
                      {d.obrigatório
                        ? <span className="text-xs text-destructive font-bold">Sim</span>
                        : <span className="text-xs text-muted-foreground">Não</span>}
                    </td>
                    <td className="text-xs text-muted-foreground">{d.desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload */}
      <div className="max-w-md">
        <FileUpload label="Base de Matéria-Prima" file={file} onFileSelect={setFile} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleValidate}
          disabled={!file || loading}
          className="font-mono text-sm"
        >
          {loading ? "Validando..." : "Validar & Carregar"}
        </Button>

        {validation?.valid && rowCount && (
          <Button
            variant="outline"
            onClick={() => navigate("/rm-sla")}
            className="font-mono text-sm gap-1"
          >
            Ir para Gestão SLA <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Validation Results */}
      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive font-mono">{error}</p>
        </div>
      )}

      {validation && !validation.valid && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-destructive font-mono font-bold">Colunas obrigatórias ausentes:</p>
            <ul className="mt-1 space-y-0.5">
              {validation.missing.map(m => (
                <li key={m} className="text-xs text-destructive font-mono">• {m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {validation?.valid && rowCount != null && (
        <div className="flex items-start gap-2 bg-success/10 border border-success/20 rounded-lg p-3">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-success font-mono font-bold">
              Validação OK — {rowCount} materiais carregados
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Navegue para "Gestão SLA" para visualizar o painel dinâmico.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
