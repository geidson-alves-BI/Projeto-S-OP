import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Database,
  FileText,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import PageTransition from "@/components/PageTransition";
import UploadDatasetCard, { type UploadFeedback } from "@/components/UploadDatasetCard";
import { ExecutiveReadinessPanel } from "@/components/ExecutiveReadinessPanel";
import { AnalyticCoveragePanel } from "@/components/AnalyticCoveragePanel";
import { CriticalGapsPanel } from "@/components/CriticalGapsPanel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import type {
  UploadCompatibilityStatus,
  UploadDataset,
  UploadDatasetKey,
  UploadValidationReport,
} from "@/types/analytics";

type FeedbackMap = Partial<Record<UploadDatasetKey, UploadFeedback | null>>;
type LoadingMap = Partial<Record<UploadDatasetKey, boolean>>;

type UploadCardDefinition = {
  key: UploadDatasetKey;
  dataset: UploadDataset | null;
  file: File | null;
  onFileSelect: (file: File) => void;
  onUpload: () => Promise<void>;
  loading: boolean;
  feedback?: UploadFeedback | null;
  actionLabel: string;
  description?: string;
  usedIn?: string;
};

const PRIMARY_UPLOAD_KEYS: UploadDatasetKey[] = [
  "production",
  "sales_orders",
  "customers",
  "bom",
  "raw_material_inventory",
  "finance_documents",
];

function formatCompatibilityStatus(status: UploadCompatibilityStatus) {
  if (status === "compatible") {
    return "Compativel";
  }
  if (status === "partial") {
    return "Parcial";
  }
  return "Incompativel";
}

function getCompatibilityClasses(status: UploadCompatibilityStatus) {
  if (status === "compatible") {
    return "border-success/30 bg-success/10 text-foreground";
  }
  if (status === "partial") {
    return "border-warning/30 bg-warning/10 text-foreground";
  }
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

function flattenAliases(aliases: Record<string, string[]>) {
  return Object.entries(aliases).flatMap(([canonical, acceptedAliases]) =>
    acceptedAliases.map((alias) => `${alias} -> ${canonical}`),
  );
}

export default function UploadPage() {
  const {
    loading: contextLoading,
    error: contextError,
    loadProductionFile,
    loadClientsFile,
    loadRawMaterialFile,
  } = useAppData();
  const { uploadCenter, loading, error, refresh } = useUploadCenter(true);

  const [datasetLoading, setDatasetLoading] = useState<LoadingMap>({});
  const [feedback, setFeedback] = useState<FeedbackMap>({});
  const [openDictionaryId, setOpenDictionaryId] = useState<string | undefined>(undefined);

  const [productionFile, setProductionFile] = useState<File | null>(null);
  const [salesOrdersFile, setSalesOrdersFile] = useState<File | null>(null);
  const [customersFile, setCustomersFile] = useState<File | null>(null);
  const [forecastFile, setForecastFile] = useState<File | null>(null);
  const [bomFile, setBomFile] = useState<File | null>(null);
  const [rawMaterialFile, setRawMaterialFile] = useState<File | null>(null);
  const [financeDocumentsFile, setFinanceDocumentsFile] = useState<File | null>(null);

  const dictionarySectionRef = useRef<HTMLElement | null>(null);

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
        message: `${result.productsCount} produtos e ${result.monthCount} meses liberados para MTS/MTO Operacional (Produção).`,
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
          "Carteira comercial validada e pronta para Planejamento de Demanda (Comercial).",
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
          : "Clientes registrados; a conexao completa acontece quando a base de Produção estiver carregada.",
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

  const uploadCards: UploadCardDefinition[] = [
    {
      key: "production",
      dataset: productionDataset,
      file: productionFile,
      onFileSelect: setProductionFile,
      onUpload: handleProductionUpload,
      loading: Boolean(datasetLoading.production),
      feedback: feedback.production,
      actionLabel: "Atualizar Produção",
      usedIn: "MTS/MTO Operacional (Produção)",
    },
    {
      key: "sales_orders",
      dataset: salesOrdersDataset,
      file: salesOrdersFile,
      onFileSelect: setSalesOrdersFile,
      onUpload: handleSalesOrdersUpload,
      loading: Boolean(datasetLoading.sales_orders),
      feedback: feedback.sales_orders,
      actionLabel: "Atualizar vendas",
      usedIn: "Planejamento de Demanda (Comercial)",
    },
    {
      key: "customers",
      dataset: customersDataset,
      file: customersFile,
      onFileSelect: setCustomersFile,
      onUpload: handleCustomersUpload,
      loading: Boolean(datasetLoading.customers),
      feedback: feedback.customers,
      actionLabel: "Atualizar clientes",
      usedIn: "Planejamento de Demanda (Comercial) e MTS/MTO Operacional (Produção)",
    },
    {
      key: "bom",
      dataset: bomDataset,
      file: bomFile,
      onFileSelect: setBomFile,
      onUpload: handleBomUpload,
      loading: Boolean(datasetLoading.bom),
      feedback: feedback.bom,
      actionLabel: "Atualizar estrutura",
      usedIn: "MTS/MTO Operacional (Produção) (opcional futuro)",
    },
    {
      key: "raw_material_inventory",
      dataset: rawMaterialDataset,
      file: rawMaterialFile,
      onFileSelect: setRawMaterialFile,
      onUpload: handleRawMaterialUpload,
      loading: Boolean(datasetLoading.raw_material_inventory),
      feedback: feedback.raw_material_inventory,
      actionLabel: "Atualizar estoque MP",
      usedIn: "Planejamento de Demanda (Comercial) e MTS/MTO Operacional (Produção), quando aplicavel",
    },
    {
      key: "finance_documents",
      dataset: financeDocumentsDataset,
      file: financeDocumentsFile,
      onFileSelect: setFinanceDocumentsFile,
      onUpload: handleFinanceDocumentsUpload,
      loading: Boolean(datasetLoading.finance_documents),
      feedback: feedback.finance_documents,
      actionLabel: "Anexar documentos",
      description:
        "Formatos aceitos: .pdf, .xlsx, .xls, .csv, .png, .jpg, .jpeg, .webp, .txt, .docx",
      usedIn: "Financeiro e IA Executiva",
    },
    {
      key: "forecast_input",
      dataset: forecastInputDataset,
      file: forecastFile,
      onFileSelect: setForecastFile,
      onUpload: handleForecastUpload,
      loading: Boolean(datasetLoading.forecast_input),
      feedback: feedback.forecast_input,
      actionLabel: "Atualizar forecast",
      usedIn: "Forecast e IA Executiva",
    },
  ];

  const visibleUploadCards = uploadCards.filter(
    (card): card is UploadCardDefinition & { dataset: UploadDataset } => card.dataset !== null,
  );
  const primaryUploadCards = visibleUploadCards.filter((card) => PRIMARY_UPLOAD_KEYS.includes(card.key));
  const secondaryUploadCards = visibleUploadCards.filter((card) => !PRIMARY_UPLOAD_KEYS.includes(card.key));
  const dictionaryCards = visibleUploadCards;

  const openDictionaryFor = (datasetId: UploadDatasetKey) => {
    setOpenDictionaryId(datasetId);
    dictionarySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PageTransition className="space-y-6 p-6">
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
              Visao Executiva
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Central de Prontidao Executiva
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Visao integrada da cobertura de dados, prontidao dos modulos analiticos e lacunas
                criticas para a tomada de decisao.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Bases disponiveis
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {availableCount}/{totalCount}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Cobertura analitica
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatCoveragePercent(coveragePercent)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Confianca analitica
              </p>
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

      <section className="metric-card space-y-3 border-primary/20 bg-card/95">
        <div className="flex flex-wrap items-end justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary/90" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Central unica de upload
              </p>
              <h2 className="text-lg font-semibold text-foreground">
                Faixa principal para envio das bases
              </h2>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/90">
            Upload primeiro, dicionario como apoio contratual.
          </p>
        </div>

        <div className="flex snap-x snap-mandatory items-stretch gap-2.5 overflow-x-auto pb-2 pr-1 sm:gap-3">
          {primaryUploadCards.map((card) => (
            <UploadDatasetCard
              key={card.key}
              dataset={card.dataset}
              file={card.file}
              onFileSelect={card.onFileSelect}
              onUpload={card.onUpload}
              loading={card.loading}
              feedback={card.feedback}
              actionLabel={card.actionLabel}
              description={card.description}
              usedIn={card.usedIn}
              onOpenDictionary={() => openDictionaryFor(card.key)}
            />
          ))}
        </div>
        {secondaryUploadCards.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Base complementar fora da faixa principal:{" "}
            {secondaryUploadCards.map((card) => card.dataset.name).join(", ")}.
          </p>
        ) : null}
      </section>

      <section ref={dictionarySectionRef} className="metric-card space-y-3 border-border/70 bg-card/92">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary/90" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Dicionario por base
            </p>
            <h2 className="text-lg font-semibold text-foreground">Contrato e compatibilidade por dataset</h2>
          </div>
        </div>

        <Accordion
          type="single"
          collapsible
          value={openDictionaryId}
          onValueChange={(value) => setOpenDictionaryId(value || undefined)}
          className="space-y-2.5"
        >
          {dictionaryCards.map((card) => {
            const dataset = card.dataset;
            const aliasList = flattenAliases(dataset.column_aliases);
            const aliasEntries = Object.entries(dataset.column_aliases).filter(
              ([, acceptedAliases]) => acceptedAliases.length > 0,
            );
            const lastValidation = dataset.last_validation;

            return (
              <AccordionItem
                key={dataset.id}
                value={dataset.id}
                className="rounded-2xl border border-border/60 bg-background/35 px-4"
              >
                <AccordionTrigger className="py-3.5 text-left hover:no-underline">
                  <div className="flex w-full flex-wrap items-center justify-between gap-3 pr-3">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        {dataset.category}
                      </p>
                      <p className="text-sm font-semibold text-foreground">{dataset.name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${getStatusClasses(
                          dataset.validation_status,
                        )}`}
                      >
                        {dataset.last_upload_status}
                      </span>
                      <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-foreground">
                        Score {dataset.compatibility_summary.compatibility_score}%
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-0.5">
                  <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                          Objetivo da base
                        </p>
                        <p className="mt-2 text-sm text-foreground">{dataset.objective}</p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-primary">
                            Colunas obrigatorias
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {dataset.required_columns.length > 0
                              ? dataset.required_columns.map((column) => (
                                  <span
                                    key={`${dataset.id}-required-${column}`}
                                    className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-foreground"
                                  >
                                    {column}
                                  </span>
                                ))
                              : (
                                  <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                                    Nao se aplica
                                  </span>
                                )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                            Colunas opcionais
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {dataset.optional_columns.length > 0
                              ? dataset.optional_columns.map((column) => (
                                  <span
                                    key={`${dataset.id}-optional-${column}`}
                                    className="rounded-full border border-border/70 bg-background/65 px-2 py-0.5 text-[11px] text-foreground"
                                  >
                                    {column}
                                  </span>
                                ))
                              : (
                                  <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                                    Nao se aplica
                                  </span>
                                )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/55 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                          Aliases aceitos
                        </p>
                        {aliasEntries.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {aliasEntries.map(([canonical, acceptedAliases]) => (
                              <div
                                key={`${dataset.id}-alias-${canonical}`}
                                className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5"
                              >
                                <p className="text-[11px] font-semibold text-foreground">{canonical}</p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {acceptedAliases.map((alias) => (
                                    <span
                                      key={`${dataset.id}-alias-${canonical}-${alias}`}
                                      className="rounded-full border border-border/70 bg-background/75 px-2 py-0.5 text-[10px] text-muted-foreground"
                                    >
                                      {alias}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">Sem aliases cadastrados.</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                          Formatos aceitos
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {dataset.accepted_formats.map((format) => (
                            <span
                              key={`${dataset.id}-format-${format}`}
                              className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-foreground"
                            >
                              {format}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                          Status do ultimo upload
                        </p>
                        <p className="mt-2 text-sm text-foreground">{dataset.latest_message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dataset.filename ?? "Nenhum arquivo"} | {formatTimestamp(dataset.uploaded_at)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                          Compatibilidade do ultimo upload
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${getCompatibilityClasses(
                              dataset.compatibility_summary.compatibility_status,
                            )}`}
                          >
                            {formatCompatibilityStatus(dataset.compatibility_summary.compatibility_status)}
                          </span>
                          <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground">
                            Score {dataset.compatibility_summary.compatibility_score}%
                          </span>
                          <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground">
                            Confianca {dataset.compatibility_summary.confidence_score}%
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {lastValidation?.summary ?? dataset.compatibility_summary.summary}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Aliases mapeados: {aliasList.length}
                        </p>
                        {(dataset.compatibility_summary.missing_required_columns.length > 0 ||
                          dataset.compatibility_summary.quality_gaps.length > 0) && (
                          <div className="mt-2 rounded-lg border border-warning/25 bg-warning/10 px-2.5 py-2 text-xs text-foreground">
                            {dataset.compatibility_summary.missing_required_columns.length > 0
                              ? `Faltando obrigatorias: ${dataset.compatibility_summary.missing_required_columns.join(
                                  ", ",
                                )}. `
                              : ""}
                            {dataset.compatibility_summary.quality_gaps.length > 0
                              ? `Lacunas: ${dataset.compatibility_summary.quality_gaps.join(", ")}.`
                              : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground/90" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Governanca e historico
            </p>
            <h2 className="text-sm font-semibold text-foreground">
              Manifesto, historico, cobertura e lacunas em segundo nivel
            </h2>
          </div>
        </div>

        <Accordion type="multiple" className="space-y-2">
          <AccordionItem
            value="manifest"
            className="rounded-xl border border-border/50 bg-background/25 px-4"
          >
            <AccordionTrigger className="py-3.5 text-left hover:no-underline">
              <div className="flex items-center gap-2 pr-3">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Manifesto e governanca contratual</p>
                  <p className="text-xs text-muted-foreground">
                    Versao {contractRegistry?.version ?? "n/d"} | Status IA{" "}
                    {formatAvailabilityStatus(aiReadinessStatus)}
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-0.5">
              <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="space-y-4 rounded-2xl border border-border/60 bg-background/45 p-4">
                  <h3 className="text-base font-semibold text-foreground">
                    Compatibilidade, lacunas e confianca
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Score medio
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">
                        {averageCompatibility}%
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Confianca media
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{averageConfidence}%</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Confianca IA
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{aiConfidence}%</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Maiores lacunas atuais
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {largestGaps.length > 0 ? (
                        largestGaps.map((gap) => (
                          <span
                            key={gap}
                            className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-foreground"
                          >
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

                <article className="space-y-4 rounded-2xl border border-border/60 bg-background/45 p-4">
                  <h3 className="text-base font-semibold text-foreground">Registry oficial</h3>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Versao do registry
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {contractRegistry?.version ?? "Carregando..."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Compatibilidade legada
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {Object.entries(contractRegistry?.aliases ?? {}).length > 0
                        ? Object.entries(contractRegistry?.aliases ?? {})
                            .map(([legacy, current]) => `${legacy} -> ${current}`)
                            .join(", ")
                        : "Sem aliases legados registrados."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Leitura executiva
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Cada upload registra contrato oficial, colunas reconhecidas, aliases aceitos,
                      impacto analitico, lacunas de qualidade e nivel de confianca para a camada de
                      IA executiva.
                    </p>
                  </div>
                </article>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="history"
            className="rounded-xl border border-border/50 bg-background/25 px-4"
          >
            <AccordionTrigger className="py-3.5 text-left hover:no-underline">
              <div className="flex items-center gap-2 pr-3">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Historico de uploads</p>
                  <p className="text-xs text-muted-foreground">{historyCount} registro(s)</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-0.5">
              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/55">
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
                          <td className="text-xs text-muted-foreground">
                            {formatTimestamp(item.uploaded_at)}
                          </td>
                          <td className="text-xs text-muted-foreground">{item.format}</td>
                          <td>
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClasses(
                                item.validation_status,
                              )}`}
                            >
                              {formatValidationStatus(item.validation_status)}
                            </span>
                          </td>
                          <td className="text-xs text-muted-foreground">
                            {item.compatibility_score}%
                            {item.missing_required_columns.length > 0
                              ? ` | Faltando: ${item.missing_required_columns.join(", ")}`
                              : ""}
                          </td>
                          <td className="text-xs text-muted-foreground">
                            {item.readiness_impact.join(", ")}
                          </td>
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="coverage"
            className="rounded-xl border border-border/50 bg-background/25 px-4"
          >
            <AccordionTrigger className="py-3.5 text-left hover:no-underline">
              <div className="flex items-center gap-2 pr-3">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Informacoes auxiliares de cobertura
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Datasets carregados, faltantes e disponibilidade de DRE
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-0.5">
              <AnalyticCoveragePanel compact />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="gaps" className="rounded-xl border border-border/50 bg-background/25 px-4">
            <AccordionTrigger className="py-3.5 text-left hover:no-underline">
              <div className="flex items-center gap-2 pr-3">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Painel de lacunas criticas</p>
                  <p className="text-xs text-muted-foreground">Visao complementar de riscos de dados</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-0.5">
              <CriticalGapsPanel compact />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </PageTransition>
  );
}
