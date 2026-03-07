import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/FileUpload";
import { useAppData } from "@/contexts/AppDataContext";
import { parseFile } from "@/lib/fileParser";
import { postMultipart } from "@/lib/api";
import {
  RM_DATA_DICTIONARY,
  processRM,
  validateRMColumns,
  type RMColumnValidation,
} from "@/lib/rmEngine";

const DATA_DICT = RM_DATA_DICTIONARY;

export default function RMUploadPage() {
  const navigate = useNavigate();
  const { setRMData } = useAppData();

  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<RMColumnValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);

  const [bomFile, setBomFile] = useState<File | null>(null);
  const [bomLoading, setBomLoading] = useState(false);
  const [bomError, setBomError] = useState<string | null>(null);
  const [bomSuccess, setBomSuccess] = useState<string | null>(null);
  const [bomDetails, setBomDetails] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setValidation(null);

    try {
      const raw = await parseFile(file);
      if (raw.length === 0) {
        setError("Arquivo vazio ou sem dados validos.");
        return;
      }

      const cols = Object.keys(raw[0]);
      const result = validateRMColumns(cols);
      setValidation(result);

      if (!result.valid) return;

      const rmData = processRM(raw, result.rename);
      setRowCount(rmData.length);
      setRMData(rmData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleBOMUpload = async () => {
    if (!bomFile) return;

    setBomLoading(true);
    setBomError(null);
    setBomSuccess(null);
    setBomDetails(null);

    try {
      const formData = new FormData();
      formData.append("file", bomFile);

      const response = (await postMultipart("/analytics/upload_bom", formData)) as Record<string, unknown>;

      const details = [
        typeof response.rows === "number" ? `${response.rows} linhas` : null,
        typeof response.total_rows === "number" ? `${response.total_rows} linhas` : null,
        typeof response.products === "number" ? `${response.products} produtos` : null,
        typeof response.product_count === "number" ? `${response.product_count} produtos` : null,
      ].filter(Boolean);

      setBomSuccess("BOM carregada com sucesso");
      setBomDetails(details.length > 0 ? details.join(" - ") : null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setBomError(`Falha ao carregar BOM: ${message}`);
    } finally {
      setBomLoading(false);
    }
  };

  let lastGroup = "";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" /> Upload Materia-Prima (RM)
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          Envie a base de materias-primas para analise de SLA e cobertura.
        </p>
      </div>

      <div className="metric-card">
        <h3 className="text-sm font-bold font-mono text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" /> Dicionario de Dados - Colunas Esperadas
        </h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Coluna</th>
                <th>Tipo</th>
                <th>Obrigatorio</th>
                <th>Descricao</th>
              </tr>
            </thead>
            <tbody>
              {DATA_DICT.map(item => {
                const showGroup = item.group !== lastGroup;
                lastGroup = item.group;

                return (
                  <tr key={item.field}>
                    <td className="text-xs font-semibold whitespace-nowrap">{showGroup ? item.group : ""}</td>
                    <td className="font-mono text-xs font-semibold">{item.col}</td>
                    <td className="text-xs">{item.tipo}</td>
                    <td>
                      {item.obrigatorio ? (
                        <span className="text-xs text-destructive font-bold">Sim</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nao</span>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">{item.desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="max-w-md">
        <FileUpload label="Base de Materia-Prima" file={file} onFileSelect={setFile} />
      </div>

      <div className="metric-card space-y-3 max-w-2xl">
        <h3 className="text-sm font-bold font-mono text-foreground">Importar BOM (Materia-prima por produto)</h3>
        <p className="text-xs text-muted-foreground font-mono">
          Colunas esperadas: product_code, raw_material_code, raw_material_name, qty_per_unit, unit_cost
        </p>

        <div className="max-w-md">
          <FileUpload
            label="Arquivo BOM (CSV/XLSX)"
            file={bomFile}
            onFileSelect={setBomFile}
            accept=".csv,.xlsx,.xls"
          />
        </div>

        <Button onClick={handleBOMUpload} disabled={!bomFile || bomLoading} className="font-mono text-sm w-full max-w-md">
          {bomLoading ? "Enviando BOM..." : "Importar BOM"}
        </Button>

        {bomSuccess && <p className="text-xs font-mono text-success">{bomSuccess}</p>}
        {bomDetails && <p className="text-xs font-mono text-muted-foreground">{bomDetails}</p>}
        {bomError && <p className="text-xs font-mono text-destructive">{bomError}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleValidate} disabled={!file || loading} className="font-mono text-sm">
          {loading ? "Validando..." : "Validar e carregar"}
        </Button>

        {validation?.valid && rowCount != null && (
          <Button variant="outline" onClick={() => navigate("/rm-sla")} className="font-mono text-sm gap-1">
            Ir para Gestao SLA <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

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
            <p className="text-sm text-destructive font-mono font-bold">Colunas obrigatorias ausentes:</p>
            <ul className="mt-1 space-y-0.5">
              {validation.missing.map(missing => (
                <li key={missing} className="text-xs text-destructive font-mono">- {missing}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {validation?.unmapped?.length > 0 && (
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-warning font-mono font-bold">Colunas nao mapeadas (ignorado no upload):</p>
            <ul className="mt-1 space-y-0.5">
              {validation.unmapped.map(col => (
                <li key={col} className="text-xs text-warning font-mono">- {col}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {validation?.valid && rowCount != null && (
        <div className="flex items-start gap-2 bg-success/10 border border-success/20 rounded-lg p-3">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-success font-mono font-bold">Validacao OK - {rowCount} materiais carregados</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Navegue para "Gestao SLA" para visualizar o painel dinamico.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
