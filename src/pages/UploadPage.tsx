import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
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
  actionLabel: string | null;
  actionTo: string | null;
};

function getStatusClasses(status: UploadStatus) {
  if (status === "carregado") {
    return "border-success/30 bg-success/10 text-success";
  }
  if (status === "parcial") {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  return "border-border/70 bg-muted/20 text-muted-foreground";
}

function getStatusLabel(status: UploadStatus) {
  if (status === "carregado") return "Carregado";
  if (status === "parcial") return "Parcial";
  return "Ausente";
}

function hasContent(value: unknown) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
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

        if (!active) return;

        setBackendStatus(statusPayload);
        setBackendContext(contextPayload);
      } catch (requestError) {
        if (!active) return;
        setBackendError(requestError instanceof Error ? requestError.message : String(requestError));
      } finally {
        if (active) setBackendLoading(false);
      }
    };

    void loadBackendStatus();
    return () => { active = false; };
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
        actionLabel: null,
        actionTo: null,
      },
      {
        key: "clientes",
        label: "Clientes",
        status: hasClientes ? "carregado" : "ausente",
        actionLabel: null,
        actionTo: null,
      },
      {
        key: "abc_xyz",
        label: "ABC / XYZ",
        status: hasFG ? (backendStatus?.strategyReport.loaded ? "carregado" : "parcial") : "ausente",
        actionLabel: "Abrir ABC / XYZ",
        actionTo: "/abc-xyz",
      },
      {
        key: "forecast",
        label: "Forecast",
        status: backendStatus?.forecast.loaded ? "carregado" : hasForecast ? "parcial" : "ausente",
        actionLabel: "Abrir Forecast",
        actionTo: "/forecast",
      },
      {
        key: "materia_prima",
        label: "Materia-prima",
        status: hasRMBase && hasRMContext ? "carregado" : hasRMBase || hasRMContext ? "parcial" : "ausente",
        actionLabel: "Abrir Materia-prima",
        actionTo: "/rm-upload",
      },
      {
        key: "bom",
        label: "BOM",
        status: hasBOM ? "carregado" : "ausente",
        actionLabel: "Abrir BOM / RM",
        actionTo: "/rm-upload",
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
        actionLabel: "Abrir Financeiro",
        actionTo: "/financeiro",
      },
      {
        key: "custos",
        label: "Custos",
        status: hasFinancialContext ? "parcial" : "ausente",
        actionLabel: null,
        actionTo: null,
      },
      {
        key: "pedidos_futuros",
        label: "Pedidos futuros",
        status: backendStatus?.forecast.loaded ? "parcial" : "ausente",
        actionLabel: backendStatus?.forecast.loaded ? "Abrir Forecast" : null,
        actionTo: backendStatus?.forecast.loaded ? "/forecast" : null,
      },
    ];
  }, [backendStatus, effectiveContext, rmData, state]);

  const loadedCount = cards.filter((c) => c.status === "carregado").length;
  const partialCount = cards.filter((c) => c.status === "parcial").length;
  const missingCount = cards.filter((c) => c.status === "ausente").length;

  return (
    <PageTransition className="p-6 space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/90 px-6 py-7 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-85"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 32%), radial-gradient(circle at right, rgba(56,189,248,0.14), transparent 24%), linear-gradient(135deg, rgba(15,23,42,0.18), rgba(2,6,23,0.58))",
          }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
              Upload de Dados
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Central de bases do Operion</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Carregue e acompanhe o status de cada base necessaria para alimentar a plataforma.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => window.location.reload()}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </section>

      {/* Upload principal + checklist lado a lado */}
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="metric-card space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Carga principal</p>
            <h2 className="text-xl font-semibold text-foreground">FG e Clientes</h2>
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

          <Button onClick={handleLoad} disabled={!fileProd || loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
            {loading ? "Processando..." : "Carregar bases"}
          </Button>
        </div>

        {/* Checklist simplificado */}
        <div className="metric-card space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Prontidao</p>
            <h2 className="text-xl font-semibold text-foreground">Verificacao rapida</h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{loadedCount}</p>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground mt-1">Carregadas</p>
            </div>
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{partialCount}</p>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground mt-1">Parciais</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{missingCount}</p>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground mt-1">Ausentes</p>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Cobertura do contexto</span>
              <span className="text-lg font-semibold text-foreground">{contextViewModel.coveragePercent}%</span>
            </div>
          </div>

          {backendLoading && <p className="text-xs font-mono text-muted-foreground">Lendo status do backend...</p>}
          {backendError && <p className="text-xs font-mono text-destructive">{backendError}</p>}
        </div>
      </section>

      {/* Grid de bases — compacto */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">Bases disponiveis</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] ${getStatusClasses(card.status)}`}>
                  {getStatusLabel(card.status)}
                </span>
                <span className="text-sm font-medium text-foreground truncate">{card.label}</span>
              </div>
              {card.actionLabel && card.actionTo ? (
                <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-xs text-primary" onClick={() => navigate(card.actionTo!)}>
                  {card.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Disponibilidade e lacunas */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="metric-card space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <h2 className="text-lg font-semibold text-foreground">Disponivel</h2>
          </div>
          <div className="grid gap-2">
            {contextViewModel.inputsAvailable
              .filter((s) => s.available)
              .map((s) => (
                <div key={s.key} className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-foreground">
                  {s.label}
                </div>
              ))}
          </div>
        </div>

        <div className="metric-card space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-warning" />
            <h2 className="text-lg font-semibold text-foreground">Lacunas</h2>
          </div>
          <div className="grid gap-2">
            {contextViewModel.limitations.length > 0 ? (
              contextViewModel.limitations.map((l, i) => (
                <div key={i} className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  {l}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-foreground">
                Cobertura completa para analise executiva.
              </div>
            )}
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
