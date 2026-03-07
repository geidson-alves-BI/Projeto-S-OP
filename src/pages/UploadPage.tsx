import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCcw,
  Upload as UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/FileUpload";
import PageTransition from "@/components/PageTransition";
import { useAppData } from "@/contexts/AppDataContext";
import { buildContextPackViewModel, mergeContextPackWithLoadedData } from "@/lib/context-pack";
import { getAnalyticsDataStatus, getContextPack } from "@/lib/api";
import type { AnalyticsDataStatus, ContextPack } from "@/types/analytics";

type UploadStatus = "carregado" | "parcial" | "ausente";

type UploadCard = {
  key: string;
  label: string;
  status: UploadStatus;
  lastUpdated: string | null;
  detail: string;
  impactContext: string;
  impactAI: string;
  actionLabel: string | null;
  actionTo: string | null;
  actionHint: string | null;
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Ainda nao registrado";
  }

  return new Date(value).toLocaleString("pt-BR");
}

function hasContent(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function getStatusLabel(status: UploadStatus) {
  if (status === "carregado") {
    return "Carregado";
  }
  if (status === "parcial") {
    return "Parcial";
  }
  return "Ausente";
}

function getStatusClasses(status: UploadStatus) {
  if (status === "carregado") {
    return "border-success/30 bg-success/10 text-foreground";
  }
  if (status === "parcial") {
    return "border-warning/30 bg-warning/10 text-foreground";
  }
  return "border-border/70 bg-muted/20 text-muted-foreground";
}

export default function UploadPage() {
  const navigate = useNavigate();
  const {
    state,
    fileProd,
    fileCli,
    setFileProd,
    setFileCli,
    loading,
    error,
    handleLoad,
    rmData,
    lastFGImportAt,
    lastClientesImportAt,
    lastRMImportAt,
  } = useAppData();

  const [backendStatus, setBackendStatus] = useState<AnalyticsDataStatus | null>(null);
  const [backendContext, setBackendContext] = useState<ContextPack | null>(null);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadBackendStatus = async () => {
      try {
        setBackendLoading(true);
        setBackendError(null);

        const [statusPayload, contextPayload] = await Promise.all([
          getAnalyticsDataStatus(),
          getContextPack().catch(() => null),
        ]);

        if (!active) {
          return;
        }

        setBackendStatus(statusPayload);
        setBackendContext(contextPayload);
      } catch (requestError) {
        if (!active) {
          return;
        }
        setBackendError(requestError instanceof Error ? requestError.message : String(requestError));
      } finally {
        if (active) {
          setBackendLoading(false);
        }
      }
    };

    void loadBackendStatus();

    return () => {
      active = false;
    };
  }, [state, rmData]);

  const effectiveContext = useMemo(
    () => mergeContextPackWithLoadedData(backendContext, state, rmData),
    [backendContext, state, rmData],
  );

  const contextViewModel = useMemo(
    () => buildContextPackViewModel(effectiveContext, state, rmData),
    [effectiveContext, state, rmData],
  );

  const cards = useMemo<UploadCard[]>(() => {
    const hasFG = Boolean(state?.products.length);
    const hasClientes = Boolean(state?.hasClientes);
    const hasForecast = Boolean(backendStatus?.forecast.loaded) || hasContent(effectiveContext?.forecast_summary);
    const hasRMBase = Boolean(rmData?.length);
    const hasRMContext = Boolean(backendStatus?.rawMaterialForecast.loaded) || hasContent(effectiveContext?.raw_material_impact);
    const hasBOM = Boolean(backendStatus?.bom.loaded);
    const hasFinancialContext = hasContent(effectiveContext?.financial_impact);

    return [
      {
        key: "fg",
        label: "FG / Producao",
        status: hasFG ? "carregado" : "ausente",
        lastUpdated: lastFGImportAt,
        detail: hasFG
          ? `${state?.products.length ?? 0} SKUs e ${state?.monthCols.length ?? 0} meses carregados.`
          : "Base principal ainda nao carregada.",
        impactContext: "Libera resumo executivo, historico mensal, concentracao de portfolio e candidatos MTS/MTO.",
        impactAI: "Supply, CEO e COO passam a ter leitura inicial do negocio.",
        actionLabel: null,
        actionTo: null,
        actionHint: "Use o bloco de carga principal acima para atualizar esta base.",
      },
      {
        key: "clientes",
        label: "Clientes",
        status: hasClientes ? "carregado" : "ausente",
        lastUpdated: lastClientesImportAt,
        detail: hasClientes
          ? `${state?.clientes.length ?? 0} clientes conectados na camada local.`
          : "Sem base de clientes: concentracao comercial fica limitada.",
        impactContext: "Amplia concentracao de carteira e dependencia de clientes.",
        impactAI: "CFO e CEO ganham leitura de exposicao comercial mais robusta.",
        actionLabel: null,
        actionTo: null,
        actionHint: "Use o bloco de carga principal acima para atualizar esta base.",
      },
      {
        key: "abc_xyz",
        label: "ABC / XYZ",
        status: hasFG ? (backendStatus?.strategyReport.loaded ? "carregado" : "parcial") : "ausente",
        lastUpdated: backendStatus?.strategyReport.updatedAt ?? lastFGImportAt,
        detail: hasFG
          ? backendStatus?.strategyReport.loaded
            ? "Segmentacao consolidada no backend."
            : "Segmentacao disponivel na camada local, mas ainda nao consolidada no pipeline analitico."
          : "Sem FG carregado: segmentacao indisponivel.",
        impactContext: "Eleva prioridade por criticidade e melhora a politica MTS/MTO.",
        impactAI: "Supply e COO recebem leitura mais precisa de mix, variabilidade e prioridade.",
        actionLabel: "Abrir ABC / XYZ",
        actionTo: "/abc-xyz",
        actionHint: null,
      },
      {
        key: "forecast",
        label: "Forecast",
        status: backendStatus?.forecast.loaded ? "carregado" : hasForecast ? "parcial" : "ausente",
        lastUpdated: backendStatus?.forecast.updatedAt ?? effectiveContext?.generated_at ?? null,
        detail: backendStatus?.forecast.loaded
          ? `${backendStatus.forecast.rowCount} registros consolidados no backend.`
          : hasForecast
            ? "Leitura de tendencia parcial derivada da base FG carregada."
            : "Sem forecast consolidado: leitura de tendencia limitada.",
        impactContext: "Aprimora tendencia, antecipacao de demanda e variabilidade do ciclo.",
        impactAI: "Supply, CEO e COO passam a operar com leitura mais confiavel de curto prazo.",
        actionLabel: "Abrir Forecast",
        actionTo: "/forecast",
        actionHint: null,
      },
      {
        key: "materia_prima",
        label: "Materia-prima",
        status: hasRMBase && hasRMContext ? "carregado" : hasRMBase || hasRMContext ? "parcial" : "ausente",
        lastUpdated: backendStatus?.rawMaterialForecast.updatedAt ?? lastRMImportAt,
        detail: hasRMBase
          ? hasRMContext
            ? `${rmData?.length ?? 0} materiais com cobertura refletida no contexto.`
            : `${rmData?.length ?? 0} materiais carregados, mas cobertura de insumos ainda parcial.`
          : "Cobertura de insumos indisponivel.",
        impactContext: "Abre visao de cobertura, criticidade e risco de ruptura por insumo.",
        impactAI: "Supply e COO passam a enxergar gargalos e continuidade de abastecimento.",
        actionLabel: "Abrir Materia-prima",
        actionTo: "/rm-upload",
        actionHint: null,
      },
      {
        key: "bom",
        label: "BOM",
        status: hasBOM ? "carregado" : "ausente",
        lastUpdated: backendStatus?.bom.updatedAt ?? null,
        detail: hasBOM
          ? `${backendStatus?.bom.rowsCount ?? 0} linhas e ${backendStatus?.bom.productsCount ?? 0} produtos relacionados.`
          : "Sem BOM carregada: dependencias de insumo ficam incompletas.",
        impactContext: "Relaciona produto final, materia-prima e consumo por unidade.",
        impactAI: "Supply e COO ganham explicacao mais robusta de cobertura e gargalos de execucao.",
        actionLabel: "Abrir BOM / RM",
        actionTo: "/rm-upload",
        actionHint: null,
      },
      {
        key: "financeiro",
        label: "Financeiro",
        status:
          backendStatus?.mtsSimulation.loaded && hasFinancialContext
            ? "carregado"
            : hasFinancialContext
              ? "parcial"
              : "ausente",
        lastUpdated: backendStatus?.mtsSimulation.updatedAt ?? effectiveContext?.generated_at ?? null,
        detail:
          backendStatus?.mtsSimulation.loaded && hasFinancialContext
            ? "Camada financeira refletida no contexto consolidado."
            : hasFinancialContext
              ? "Camada financeira parcial derivada dos dados hoje carregados."
              : "Sem impacto financeiro consolidado: leitura de caixa fica parcial.",
        impactContext: "Traduz estoque, insumos e simulacao em impacto economico.",
        impactAI: "CFO e CEO recebem leitura mais forte de custo, capital empatado e trade-off.",
        actionLabel: "Abrir Financeiro",
        actionTo: "/financeiro",
        actionHint: null,
      },
      {
        key: "custos",
        label: "Custos",
        status: hasFinancialContext ? "parcial" : "ausente",
        lastUpdated: backendStatus?.mtsSimulation.updatedAt ?? null,
        detail: hasFinancialContext
          ? "Custos hoje entram de forma indireta via materia-prima, BOM e simulacao."
          : "Camada de custos dedicada ainda nao esta estruturada no piloto.",
        impactContext: "Aprofunda margem, custo unitario, impostos e exposicao economica.",
        impactAI: "CFO ganha granularidade real de margem, caixa e risco financeiro.",
        actionLabel: null,
        actionTo: null,
        actionHint: "Esta camada ainda nao possui upload dedicado; hoje ela depende de BOM, materia-prima e simulacoes.",
      },
      {
        key: "pedidos_futuros",
        label: "Pedidos futuros",
        status: backendStatus?.forecast.loaded ? "parcial" : "ausente",
        lastUpdated: backendStatus?.forecast.updatedAt ?? null,
        detail: backendStatus?.forecast.loaded
          ? "Hoje o app usa o forecast consolidado como proxy; ainda nao ha upload dedicado de pedidos futuros."
          : "Modulo ainda nao operacional no piloto atual.",
        impactContext: "Ajuda a separar tendencia prevista de demanda ja confirmada na carteira.",
        impactAI: "Supply, CEO e CFO ganham leitura mais confiavel de risco futuro e continuidade.",
        actionLabel: backendStatus?.forecast.loaded ? "Abrir Forecast" : null,
        actionTo: backendStatus?.forecast.loaded ? "/forecast" : null,
        actionHint: backendStatus?.forecast.loaded
          ? null
          : "Modulo ainda nao operacional no piloto atual, mas mantido visivel para orientar a evolucao da base.",
      },
    ];
  }, [
    backendStatus,
    effectiveContext,
    lastClientesImportAt,
    lastFGImportAt,
    lastRMImportAt,
    rmData,
    state,
  ]);

  const loadedCount = cards.filter((card) => card.status === "carregado").length;
  const partialCount = cards.filter((card) => card.status === "parcial").length;
  const missingCount = cards.filter((card) => card.status === "ausente").length;

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/90 px-6 py-7 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-85"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 32%), radial-gradient(circle at right, rgba(56,189,248,0.14), transparent 24%), linear-gradient(135deg, rgba(15,23,42,0.18), rgba(2,6,23,0.58))",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
              Upload de Dados
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Central unica de bases do Operion</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Esta aba concentra o checklist de robustez analitica do produto. Cada base mostra impacto no
                Contexto Executivo Consolidado, na IA Executiva e nos relatorios.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" className="gap-2" onClick={() => window.location.reload()}>
              <RefreshCcw className="h-4 w-4" />
              Atualizar painel
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="metric-card space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Carga principal</p>
            <h2 className="text-xl font-semibold text-foreground">FG e clientes do piloto</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FileUpload label="FG / Producao" file={fileProd} onFileSelect={(file) => setFileProd(file)} />
            <FileUpload label="Clientes (opcional)" file={fileCli} onFileSelect={(file) => setFileCli(file)} />
          </div>

          {error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleLoad} disabled={!fileProd || loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
              {loading ? "Processando carga..." : "Carregar bases principais"}
            </Button>
            <p className="text-xs font-mono text-muted-foreground">
              Ultima carga FG: {formatTimestamp(lastFGImportAt)}. Ultima carga clientes: {formatTimestamp(lastClientesImportAt)}.
            </p>
          </div>
        </div>

        <div className="metric-card space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Robustez atual</p>
            <h2 className="text-xl font-semibold text-foreground">Checklist de prontidao analitica</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Bases carregadas</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{loadedCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Bases parciais</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{partialCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Lacunas abertas</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{missingCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cobertura do contexto</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{contextViewModel.coveragePercent}%</p>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
            {contextViewModel.summary}
          </div>

          {backendLoading && <p className="text-xs font-mono text-muted-foreground">Lendo status do backend analitico...</p>}
          {backendError && <p className="text-xs font-mono text-destructive">{backendError}</p>}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Bases disponiveis</p>
            <h2 className="text-xl font-semibold text-foreground">Checklist de upload e impacto analitico</h2>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <article key={card.key} className="metric-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{card.label}</p>
                  <h3 className="text-lg font-semibold text-foreground">{getStatusLabel(card.status)}</h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${getStatusClasses(card.status)}`}>
                  {card.status}
                </span>
              </div>

              <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                <p className="text-sm text-foreground">{card.detail}</p>
                <p className="text-xs text-muted-foreground">Ultima atualizacao: {formatTimestamp(card.lastUpdated)}</p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Impacto no contexto</p>
                  <p className="mt-2 text-sm text-foreground">{card.impactContext}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Impacto na IA</p>
                  <p className="mt-2 text-sm text-foreground">{card.impactAI}</p>
                </div>
              </div>

              {card.actionLabel && card.actionTo ? (
                <Button variant="outline" className="gap-2" onClick={() => navigate(card.actionTo)}>
                  {card.actionLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                  {card.actionHint ??
                    "Esta base ainda nao possui fluxo dedicado no piloto atual. O painel a mantem visivel para evitar lacunas esquecidas."}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="metric-card space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Transparencia</p>
              <h2 className="text-xl font-semibold text-foreground">O que ja esta disponivel hoje</h2>
            </div>
          </div>
          <div className="grid gap-2">
            {contextViewModel.inputsAvailable
              .filter((source) => source.available)
              .map((source) => (
                <div key={source.key} className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
                  {source.label}: {source.detail}
                </div>
              ))}
          </div>
        </div>

        <div className="metric-card space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Lacunas e impacto</p>
              <h2 className="text-xl font-semibold text-foreground">Como isso afeta IA, relatorios e contexto</h2>
            </div>
          </div>
          <div className="grid gap-2">
            {contextViewModel.limitations.length > 0 ? (
              contextViewModel.limitations.map((limitation, index) => (
                <div key={`${limitation}-${index}`} className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                  {limitation}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
                O contexto atual esta com alta cobertura para IA e relatorios executivos.
              </div>
            )}
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
