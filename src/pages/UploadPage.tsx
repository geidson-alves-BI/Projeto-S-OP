import { useMemo, useState } from "react";
import { Activity, Database, FileText, RefreshCcw, ShieldCheck } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import UploadDatasetCard, { type UploadFeedback } from "@/components/UploadDatasetCard";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/contexts/AppDataContext";
import { useUploadCenter } from "@/hooks/use-upload-center";
import { parseFile } from "@/lib/fileParser";
import {
  formatValidationStatus,
  buildStructuredUploadPayload,
  formatReadinessStatus,
  formatTimestamp,
  getDataset,
  getStatusClasses,
  parseForecastInputRows,
} from "@/lib/upload-center";
import { postJSON, postMultipart, registerStructuredUpload, uploadDatasetFile } from "@/lib/api";
import type { UploadDatasetKey } from "@/types/analytics";

type FeedbackMap = Partial<Record<UploadDatasetKey, UploadFeedback | null>>;
type LoadingMap = Partial<Record<UploadDatasetKey, boolean>>;

const READINESS_ORDER = ["overall", "forecast", "mts_mto", "raw_material", "finance", "executive_ai"] as const;

export default function UploadPage() {
  const {
    state,
    rmData,
    loading: contextLoading,
    error: contextError,
    loadProductionFile,
    loadClientsFile,
    loadRawMaterialFile,
  } = useAppData();
  const { uploadCenter, loading, error, refresh } = useUploadCenter(true);

  const [datasetLoading, setDatasetLoading] = useState<LoadingMap>({});
  const [feedback, setFeedback] = useState<FeedbackMap>({});

  const [productionFile, setProductionFile] = useState<File | null>(null);
  const [salesOrdersFile, setSalesOrdersFile] = useState<File | null>(null);
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  const [forecastFile, setForecastFile] = useState<File | null>(null);
  const [bomFile, setBomFile] = useState<File | null>(null);
  const [rawMaterialFile, setRawMaterialFile] = useState<File | null>(null);
  const [financeSheetsFile, setFinanceSheetsFile] = useState<File | null>(null);
  const [financeDocumentsFile, setFinanceDocumentsFile] = useState<File | null>(null);

  const datasetMap = useMemo(
    () => new Map(uploadCenter?.datasets.map((dataset) => [dataset.id, dataset]) ?? []),
    [uploadCenter],
  );

  const availableCount = uploadCenter?.available_dataset_count ?? 0;
  const totalCount = uploadCenter?.total_dataset_count ?? 0;
  const coveragePercent = uploadCenter?.coverage_percent ?? 0;
  const historyCount = uploadCenter?.history.length ?? 0;

  const executeUpload = async (
    datasetId: UploadDatasetKey,
    action: () => Promise<UploadFeedback>,
  ) => {
    try {
      setDatasetLoading((current) => ({ ...current, [datasetId]: true }));
      setFeedback((current) => ({ ...current, [datasetId]: null }));
      const result = await action();
      await refresh();
      setFeedback((current) => ({ ...current, [datasetId]: result }));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setFeedback((current) => ({
        ...current,
        [datasetId]: {
          tone: "error",
          message,
        },
      }));
    } finally {
      setDatasetLoading((current) => ({ ...current, [datasetId]: false }));
    }
  };

  const handleProductionUpload = async () => {
    if (!productionFile) {
      return;
    }

    await executeUpload("production", async () => {
      const result = await loadProductionFile(productionFile);
      await registerStructuredUpload(
        buildStructuredUploadPayload(
          "production",
          productionFile,
          result.rowCount,
          result.columns,
          "valid",
          `${result.productsCount} produtos preparados para leitura executiva.`,
        ),
      );
      setProductionFile(null);
      return {
        tone: "success",
        message: `${result.productsCount} produtos e ${result.monthCount} meses liberados para o modulo operacional.`,
      };
    });
  };

  const handleSalesOrdersUpload = async () => {
    if (!salesOrdersFile) {
      return;
    }

    await executeUpload("sales_orders", async () => {
      await uploadDatasetFile("sales_orders", salesOrdersFile);
      setSalesOrdersFile(null);
      return {
        tone: "info",
        message: "Carteira comercial registrada. A integracao analitica ficou preparada para a proxima etapa.",
      };
    });
  };

  const handleClientsUpload = async () => {
    if (!clientsFile) {
      return;
    }

    await executeUpload("clients", async () => {
      const result = await loadClientsFile(clientsFile);
      await registerStructuredUpload(
        buildStructuredUploadPayload(
          "clients",
          clientsFile,
          result.rowCount,
          result.columns,
          "valid",
          result.hasProductionLoaded
            ? "Base de clientes conectada ao historico operacional."
            : "Base de clientes registrada e aguardando producao para consolidacao cruzada.",
        ),
      );
      setClientsFile(null);
      return {
        tone: "success",
        message: result.hasProductionLoaded
          ? "Clientes conectados ao historico para leitura de concentracao comercial."
          : "Clientes registrados; a conexao completa acontece quando a base de producao estiver carregada.",
      };
    });
  };

  const handleForecastUpload = async () => {
    if (!forecastFile) {
      return;
    }

    await executeUpload("forecast_input", async () => {
      const rows = await parseFile(forecastFile);
      const items = parseForecastInputRows(rows);

      if (items.length === 0) {
        throw new Error("A base de forecast precisa de product_code e ao menos um historico de demanda.");
      }

      await postJSON("/analytics/forecast_demand", {
        items,
        source_filename: forecastFile.name,
      });
      setForecastFile(null);
      return {
        tone: "success",
        message: `${items.length} linhas de forecast enviadas para consolidacao analitica.`,
      };
    });
  };

  const handleBomUpload = async () => {
    if (!bomFile) {
      return;
    }

    await executeUpload("bom", async () => {
      const formData = new FormData();
      formData.append("file", bomFile);
      const response = (await postMultipart("/analytics/upload_bom", formData)) as {
        count?: number;
        products?: number;
      };
      setBomFile(null);
      return {
        tone: "success",
        message: `${response.count ?? 0} linhas e ${response.products ?? 0} produtos conectados na estrutura de insumos.`,
      };
    });
  };

  const handleRawMaterialUpload = async () => {
    if (!rawMaterialFile) {
      return;
    }

    await executeUpload("raw_material_inventory", async () => {
      const result = await loadRawMaterialFile(rawMaterialFile);
      const validationStatus = result.validation.valid ? "valid" : "invalid";
      await registerStructuredUpload(
        buildStructuredUploadPayload(
          "raw_material_inventory",
          rawMaterialFile,
          result.rowCount,
          result.columns,
          validationStatus,
          result.validation.valid
            ? "Estoque de materia-prima pronto para cobertura e SLA."
            : `Colunas obrigatorias ausentes: ${result.validation.missing.join(", ")}`,
        ),
      );
      if (!result.validation.valid) {
        return {
          tone: "error",
          message: `Upload registrado com pendencia. Faltando: ${result.validation.missing.join(", ")}.`,
        };
      }
      setRawMaterialFile(null);
      return {
        tone: "success",
        message: `${result.rowCount} linhas de estoque de materia-prima prontas para cobertura e risco.`,
      };
    });
  };

  const handleFinanceSheetsUpload = async () => {
    if (!financeSheetsFile) {
      return;
    }

    await executeUpload("finance_spreadsheets", async () => {
      await uploadDatasetFile("finance_spreadsheets", financeSheetsFile);
      setFinanceSheetsFile(null);
      return {
        tone: "info",
        message: "Planilha financeira registrada. A camada de leitura estruturada ficou preparada para a proxima etapa.",
      };
    });
  };

  const handleFinanceDocumentsUpload = async () => {
    if (!financeDocumentsFile) {
      return;
    }

    await executeUpload("finance_documents", async () => {
      await uploadDatasetFile("finance_documents", financeDocumentsFile);
      setFinanceDocumentsFile(null);
      return {
        tone: "info",
        message: "Documento financeiro anexado. O pipeline ficou preparado para leitura inteligente futura.",
      };
    });
  };

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[30px] border border-border/70 bg-card/90 px-6 py-7 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 32%), radial-gradient(circle at right, rgba(251,191,36,0.16), transparent 28%), linear-gradient(135deg, rgba(15,23,42,0.12), rgba(2,6,23,0.62))",
          }}
        />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-primary">
              Upload de Dados
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Central de ingestao e prontidao analitica</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Toda a ingestao do Operion passa por esta central. As demais abas ficam orientadas a leitura, simulacao
                e decisao, enquanto esta tela controla cobertura analitica, dicionario de dados e governanca dos uploads.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Bases disponiveis</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {availableCount}/{totalCount}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Cobertura analitica</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{coveragePercent}%</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Historico de uploads</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{historyCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Camada local ativa</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {state ? `${state.products.length} produtos carregados` : "Sem producao ativa"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {rmData ? `${rmData.length} insumos em memoria` : "Sem estoque de materia-prima em memoria"}
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => void refresh()}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar painel
          </Button>
          <p className="text-xs text-muted-foreground">
            Ultima leitura central: {formatTimestamp(uploadCenter?.history[0]?.uploaded_at ?? null)}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Prontidao de dados</p>
            <h2 className="text-xl font-semibold text-foreground">Painel de cobertura e prontidao analitica</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {READINESS_ORDER.map((key) => {
            const item = uploadCenter?.readiness[key];
            if (!item) {
              return null;
            }
            return (
              <article key={item.key} className="metric-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{item.label}</p>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">{formatReadinessStatus(item.status)}</h3>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${getStatusClasses(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{item.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {item.missing_datasets.length > 0
                    ? `Faltando: ${item.missing_datasets.join(", ")}`
                    : "Cobertura registrada para este modulo."}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {(error || contextError) && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? contextError}
        </section>
      )}

      {(loading || contextLoading) && (
        <section className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Atualizando a central de upload e os indicadores executivos...
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Operacoes e demanda</p>
            <h2 className="text-xl font-semibold text-foreground">Bases estruturadas do ciclo operacional</h2>
          </div>
        </div>

        <div className="space-y-4">
          {getDataset(uploadCenter, "production") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("production")!}
              file={productionFile}
              onFileSelect={setProductionFile}
              onUpload={handleProductionUpload}
              loading={Boolean(datasetLoading.production)}
              feedback={feedback.production}
              actionLabel="Atualizar producao"
            />
          ) : null}

          {getDataset(uploadCenter, "sales_orders") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("sales_orders")!}
              file={salesOrdersFile}
              onFileSelect={setSalesOrdersFile}
              onUpload={handleSalesOrdersUpload}
              loading={Boolean(datasetLoading.sales_orders)}
              feedback={feedback.sales_orders}
              actionLabel="Registrar vendas / pedidos"
            />
          ) : null}

          {getDataset(uploadCenter, "clients") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("clients")!}
              file={clientsFile}
              onFileSelect={setClientsFile}
              onUpload={handleClientsUpload}
              loading={Boolean(datasetLoading.clients)}
              feedback={feedback.clients}
              actionLabel="Atualizar clientes"
            />
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Planejamento e supply</p>
            <h2 className="text-xl font-semibold text-foreground">Bases para previsao, politica e insumos</h2>
          </div>
        </div>

        <div className="space-y-4">
          {getDataset(uploadCenter, "forecast_input") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("forecast_input")!}
              file={forecastFile}
              onFileSelect={setForecastFile}
              onUpload={handleForecastUpload}
              loading={Boolean(datasetLoading.forecast_input)}
              feedback={feedback.forecast_input}
              actionLabel="Consolidar forecast"
            />
          ) : null}

          {getDataset(uploadCenter, "bom") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("bom")!}
              file={bomFile}
              onFileSelect={setBomFile}
              onUpload={handleBomUpload}
              loading={Boolean(datasetLoading.bom)}
              feedback={feedback.bom}
              actionLabel="Atualizar estrutura de produto"
            />
          ) : null}

          {getDataset(uploadCenter, "raw_material_inventory") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("raw_material_inventory")!}
              file={rawMaterialFile}
              onFileSelect={setRawMaterialFile}
              onUpload={handleRawMaterialUpload}
              loading={Boolean(datasetLoading.raw_material_inventory)}
              feedback={feedback.raw_material_inventory}
              actionLabel="Atualizar estoque de materia-prima"
            />
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Financeiro e governanca</p>
            <h2 className="text-xl font-semibold text-foreground">Planilhas e documentos para leitura executiva</h2>
          </div>
        </div>

        <div className="space-y-4">
          {getDataset(uploadCenter, "finance_spreadsheets") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("finance_spreadsheets")!}
              file={financeSheetsFile}
              onFileSelect={setFinanceSheetsFile}
              onUpload={handleFinanceSheetsUpload}
              loading={Boolean(datasetLoading.finance_spreadsheets)}
              feedback={feedback.finance_spreadsheets}
              actionLabel="Registrar planilha financeira"
            />
          ) : null}

          {getDataset(uploadCenter, "finance_documents") ? (
            <UploadDatasetCard
              dataset={datasetMap.get("finance_documents")!}
              file={financeDocumentsFile}
              onFileSelect={setFinanceDocumentsFile}
              onUpload={handleFinanceDocumentsUpload}
              loading={Boolean(datasetLoading.finance_documents)}
              feedback={feedback.finance_documents}
              actionLabel="Anexar documento financeiro"
              description="Formatos aceitos: .pdf, .xlsx, .xls, .csv, .png, .jpg, .jpeg, .webp, .txt, .docx"
            />
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Historico e governanca</p>
            <h2 className="text-xl font-semibold text-foreground">Manifesto central de uploads</h2>
          </div>
        </div>

        <div className="metric-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Base</th>
                <th>Arquivo</th>
                <th>Data / hora</th>
                <th>Formato</th>
                <th>Status</th>
                <th>Impacto nas analises</th>
              </tr>
            </thead>
            <tbody>
              {(uploadCenter?.history.length ?? 0) > 0 ? (
                uploadCenter?.history.map((item, index) => (
                  <tr key={`${item.dataset_id}-${item.uploaded_at}-${index}`}>
                    <td className="text-xs font-medium text-foreground">{item.dataset_name}</td>
                    <td className="text-xs text-muted-foreground">{item.filename}</td>
                    <td className="text-xs text-muted-foreground">{formatTimestamp(item.uploaded_at)}</td>
                    <td className="text-xs text-muted-foreground">{item.format}</td>
                    <td>
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClasses(item.validation_status)}`}>
                        {formatValidationStatus(item.validation_status)}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">{item.readiness_impact.join(", ")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum upload registrado na governanca central ate o momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PageTransition>
  );
}
