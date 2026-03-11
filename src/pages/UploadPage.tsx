import { useMemo, useState } from "react";
import { Activity, Database, FileText, RefreshCcw, ShieldCheck } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import UploadDatasetCard, { type UploadFeedback } from "@/components/UploadDatasetCard";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/contexts/AppDataContext";
import { useUploadCenter } from "@/hooks/use-upload-center";
import {
  formatAvailabilityStatus,
  formatCoveragePercent,
  formatValidationStatus,
  formatTimestamp,
  getDataset,
  getStatusClasses,
  resolveAIReadinessStatus,
} from "@/lib/upload-center";
import { uploadDatasetFile } from "@/lib/api";
import type { UploadDatasetKey, UploadValidationReport } from "@/types/analytics";
import { ExecutiveReadinessPanel } from "@/components/ExecutiveReadinessPanel";
import { AnalyticCoveragePanel } from "@/components/AnalyticCoveragePanel";
import { CriticalGapsPanel } from "@/components/CriticalGapsPanel";


type FeedbackMap = Partial<Record<UploadDatasetKey, UploadFeedback | null>>;
type LoadingMap = Partial<Record<UploadDatasetKey, boolean>>;

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
  const [customersFile, setCustomersFile] = useState<File | null>(null);
  const [forecastFile, setForecastFile] = useState<File | null>(null);
  const [bomFile, setBomFile] = useState<File | null>(null);
  const [rawMaterialFile, setRawMaterialFile] = useState<File | null>(null);
  const [financeDocumentsFile, setFinanceDocumentsFile] = useState<File | null>(null);

  const historyItems = useMemo(
    () => (Array.isArray(uploadCenter?.history) ? uploadCenter.history : []),
    [uploadCenter],
  );
  const compatibilitySummary = uploadCenter?.compatibility_summary;
  const contractRegistry = uploadCenter?.contract_registry;
  const aiReadinessStatus = resolveAIReadinessStatus(uploadCenter);
  const availableCount = uploadCenter?.available_dataset_count ?? 0;
  const totalCount = uploadCenter?.total_dataset_count ?? 0;
  const coveragePercent = uploadCenter?.coverage_percent ?? 0;
  const historyCount = historyItems.length;
  const averageCompatibility = compatibilitySummary?.average_compatibility_score ?? 0;
  const averageConfidence = compatibilitySummary?.average_confidence_score ?? 0;
  const aiConfidence = compatibilitySummary?.ai_readiness?.confidence_score ?? 0;
  const largestGaps = compatibilitySummary?.largest_gaps ?? [];

  const productionDataset = getDataset(uploadCenter, "production");
  const salesOrdersDataset = getDataset(uploadCenter, "sales_orders");
  const customersDataset = getDataset(uploadCenter, "customers");
  const forecastInputDataset = getDataset(uploadCenter, "forecast_input");
  const bomDataset = getDataset(uploadCenter, "bom");
  const rawMaterialDataset = getDataset(uploadCenter, "raw_material_inventory");
  const financeDocumentsDataset = getDataset(uploadCenter, "finance_documents");

  const toneFromValidation = (validation: UploadValidationReport): UploadFeedback["tone"] => {
    if (validation.availability_status === "ready") {
      return "success";
    }
    if (validation.availability_status === "partial") {
      return "info";
    }
    return "error";
  };

  const messageFromValidation = (validation: UploadValidationReport, readyMessage?: string) => {
    if (validation.availability_status === "ready" && readyMessage) {
      return readyMessage;
    }
    return validation.quality_gaps[0] ?? validation.summary;
  };

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
      const response = await uploadDatasetFile("production", productionFile);
      if (response.validation.availability_status !== "ready") {
        return {
          tone: toneFromValidation(response.validation),
          message: messageFromValidation(response.validation),
        };
      }

      const result = await loadProductionFile(productionFile);
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
      const response = await uploadDatasetFile("sales_orders", salesOrdersFile);
      if (response.validation.availability_status !== "unavailable") {
        setSalesOrdersFile(null);
      }
      return {
        tone: toneFromValidation(response.validation),
        message: messageFromValidation(
          response.validation,
          "Carteira comercial validada e pronta para governanca central.",
        ),
      };
    });
  };

  const handleCustomersUpload = async () => {
    if (!customersFile) {
      return;
    }

    await executeUpload("customers", async () => {
      const response = await uploadDatasetFile("customers", customersFile);
      if (response.validation.availability_status !== "ready") {
        return {
          tone: toneFromValidation(response.validation),
          message: messageFromValidation(response.validation),
        };
      }

      const result = await loadClientsFile(customersFile);
      setCustomersFile(null);
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
      const response = await uploadDatasetFile("forecast_input", forecastFile);
      if (response.validation.availability_status !== "unavailable") {
        setForecastFile(null);
      }
      return {
        tone: toneFromValidation(response.validation),
        message: messageFromValidation(
          response.validation,
          "Forecast consolidado a partir do contrato oficial da base.",
        ),
      };
    });
  };

  const handleBomUpload = async () => {
    if (!bomFile) {
      return;
    }

    await executeUpload("bom", async () => {
      const response = await uploadDatasetFile("bom", bomFile);
      if (response.validation.availability_status !== "unavailable") {
        setBomFile(null);
      }
      return {
        tone: toneFromValidation(response.validation),
        message: messageFromValidation(
          response.validation,
          "Estrutura de produto validada pelo contrato oficial e registrada no backend.",
        ),
      };
    });
  };

  const handleRawMaterialUpload = async () => {
    if (!rawMaterialFile) {
      return;
    }

    await executeUpload("raw_material_inventory", async () => {
      const response = await uploadDatasetFile("raw_material_inventory", rawMaterialFile);
      if (response.validation.availability_status !== "ready") {
        return {
          tone: toneFromValidation(response.validation),
          message: messageFromValidation(response.validation),
        };
      }

      const result = await loadRawMaterialFile(rawMaterialFile);
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

  const handleFinanceDocumentsUpload = async () => {
    if (!financeDocumentsFile) {
      return;
    }

    await executeUpload("finance_documents", async () => {
      const response = await uploadDatasetFile("finance_documents", financeDocumentsFile);
      setFinanceDocumentsFile(null);
      return {
        tone: toneFromValidation(response.validation),
        message: messageFromValidation(
          response.validation,
          "Documento financeiro anexado para governanca e leitura inteligente futura.",
        ),
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
              Visão Executiva
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Central de Prontidão Executiva</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Visão integrada da cobertura de dados, prontidão dos módulos analíticos e lacunas críticas para a tomada de decisão.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Bases disponiveis</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {availableCount}/{totalCount}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Cobertura analitica</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formatCoveragePercent(coveragePercent)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Confianca analitica</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{averageConfidence}%</p>
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => void refresh()}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar painel
          </Button>
          <p className="text-xs text-muted-foreground">
            Ultima leitura central: {formatTimestamp(historyItems[0]?.uploaded_at ?? null)}
          </p>
        </div>
      </section>

      <ExecutiveReadinessPanel />
      <AnalyticCoveragePanel />
      <CriticalGapsPanel />

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="metric-card space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Governanca contratual</p>
            <h2 className="text-xl font-semibold text-foreground">Compatibilidade, lacunas e confianca</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Score medio</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{averageCompatibility}%</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Confianca media</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{averageConfidence}%</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Status IA</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatAvailabilityStatus(aiReadinessStatus)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Maiores lacunas atuais</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {largestGaps.length > 0 ? (
                largestGaps.map((gap) => (
                  <span key={gap} className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-foreground">
                    {gap}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-foreground">
                  Sem lacunas abertas na ultima rodada.
                </span>
              )}
            </div>
          </div>
        </article>

        <article className="metric-card space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Registry oficial</p>
            <h2 className="text-xl font-semibold text-foreground">Contrato unificado por dataset</h2>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Versao do registry</p>
            <p className="mt-2 text-sm font-medium text-foreground">{contractRegistry?.version ?? "Carregando..."}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Compatibilidade legada</p>
            <p className="mt-2 text-sm text-foreground">
              {Object.entries(contractRegistry?.aliases ?? {}).length > 0
                ? Object.entries(contractRegistry?.aliases ?? {})
                    .map(([legacy, current]) => `${legacy} -> ${current}`)
                    .join(", ")
                : "Sem aliases legados registrados."}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Leitura executiva</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Cada upload agora registra contrato oficial, colunas reconhecidas, aliases aceitos, impacto analitico,
              lacunas de qualidade e nivel de confianca para a futura camada de IA.
            </p>
          </div>
        </article>
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
          {productionDataset ? (
            <UploadDatasetCard
              dataset={productionDataset}
              file={productionFile}
              onFileSelect={setProductionFile}
              onUpload={handleProductionUpload}
              loading={Boolean(datasetLoading.production)}
              feedback={feedback.production}
              actionLabel="Atualizar producao"
            />
          ) : null}

          {salesOrdersDataset ? (
            <UploadDatasetCard
              dataset={salesOrdersDataset}
              file={salesOrdersFile}
              onFileSelect={setSalesOrdersFile}
              onUpload={handleSalesOrdersUpload}
              loading={Boolean(datasetLoading.sales_orders)}
              feedback={feedback.sales_orders}
              actionLabel="Registrar vendas / pedidos"
            />
          ) : null}

          {customersDataset ? (
            <UploadDatasetCard
              dataset={customersDataset}
              file={customersFile}
              onFileSelect={setCustomersFile}
              onUpload={handleCustomersUpload}
              loading={Boolean(datasetLoading.customers)}
              feedback={feedback.customers}
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
          {forecastInputDataset ? (
            <UploadDatasetCard
              dataset={forecastInputDataset}
              file={forecastFile}
              onFileSelect={setForecastFile}
              onUpload={handleForecastUpload}
              loading={Boolean(datasetLoading.forecast_input)}
              feedback={feedback.forecast_input}
              actionLabel="Consolidar forecast"
            />
          ) : null}

          {bomDataset ? (
            <UploadDatasetCard
              dataset={bomDataset}
              file={bomFile}
              onFileSelect={setBomFile}
              onUpload={handleBomUpload}
              loading={Boolean(datasetLoading.bom)}
              feedback={feedback.bom}
              actionLabel="Atualizar estrutura de produto"
            />
          ) : null}

          {rawMaterialDataset ? (
            <UploadDatasetCard
              dataset={rawMaterialDataset}
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
          {financeDocumentsDataset ? (
            <UploadDatasetCard
              dataset={financeDocumentsDataset}
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
                <th>Score</th>
                <th>Impacto nas analises</th>
              </tr>
            </thead>
            <tbody>
              {historyItems.length > 0 ? (
                historyItems.map((item, index) => (
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
                    <td className="text-xs text-muted-foreground">
                      {item.compatibility_score}%{item.missing_required_columns.length > 0 ? ` | Faltando: ${item.missing_required_columns.join(", ")}` : ""}
                    </td>
                    <td className="text-xs text-muted-foreground">{item.readiness_impact.join(", ")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
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
