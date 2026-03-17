import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BrainCircuit,
  ClipboardList,
  MessageSquareQuote,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ContextPackOverview from "@/components/ContextPackOverview";
import PageTransition from "@/components/PageTransition";
import { useContextPack } from "@/hooks/use-context-pack";
import { useAppData } from "@/contexts/AppDataContext";
import { loadLocalSettings, mergeLocalIntegrationSettings } from "@/lib/local-settings";
import { getAIConfig, interpretAI, runSOPPipeline } from "@/lib/api";
import { mergeContextPackWithLoadedData } from "@/lib/context-pack";
import type {
  AIConnectionStatus,
  AIInterpretResponse,
  AIPersona,
  RunSOPPipelineResponse,
} from "@/types/analytics";

const PERSONA_LABEL: Record<AIPersona, string> = {
  SUPPLY: "Diretor de Operacoes",
  CFO: "CFO",
  CEO: "CEO",
  COO: "COO",
};

const PERSONA_DESCRIPTION: Record<AIPersona, string> = {
  SUPPLY:
    "Leitura de PCP senior com foco em planejamento, compras, cobertura de estoque, risco de ruptura, capacidade e politica MTS/MTO.",
  CFO:
    "Leitura financeira com foco em capital de giro, impacto financeiro, concentracao de receita, dependencia de clientes e exposicao economica.",
  CEO:
    "Leitura estrategica com foco em concentracao do negocio, robustez do portfolio, crescimento e continuidade operacional.",
  COO:
    "Leitura operacional com foco em estabilidade da execucao, gargalos, dependencia de insumos e continuidade da operacao.",
};

const SEVERITY_STYLE: Record<AIInterpretResponse["risks"][number]["severity"], string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-destructive",
};

const IMPACT_STYLE: Record<AIInterpretResponse["actions"][number]["impact"], string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-destructive",
};

function getConnectionStatusLabel(status: AIConnectionStatus | null) {
  switch (status) {
    case "success":
      return "Conexao validada";
    case "fallback_only":
      return "Fallback local ativo";
    case "provider_not_configured":
      return "OpenAI nao configurado";
    case "invalid_key":
      return "Chave invalida";
    case "model_not_found":
      return "Modelo nao encontrado";
    case "network_error":
      return "Erro de rede";
    case "openai_error":
      return "Erro OpenAI";
    default:
      return "Nao testado";
  }
}

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildMarkdownReport(insights: AIInterpretResponse): string {
  const lines: string[] = [];
  lines.push(`# Relatorio IA - ${PERSONA_LABEL[insights.persona]}`);
  lines.push("");
  lines.push(`Provider used: ${insights.providerUsed}`);
  lines.push(`Model used: ${insights.modelUsed}`);
  lines.push(`Used fallback: ${insights.usedFallback ? "yes" : "no"}`);
  lines.push(`Fallback reason: ${insights.reasonFallback ?? "n/a"}`);
  lines.push("");
  lines.push("## Analysis Scope");
  lines.push(insights.analysisScope);
  lines.push("");
  lines.push("## Inputs Available");
  insights.inputsAvailable.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Inputs Missing");
  insights.inputsMissing.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Executive Summary");
  insights.executive_summary.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Risks");
  insights.risks.forEach((risk) => {
    lines.push(`- ${risk.title} [${risk.severity}]`);
    risk.evidence.forEach((ev) => lines.push(`  - evidence: ${ev.path} = ${formatEvidenceValue(ev.value)}`));
  });
  lines.push("");
  lines.push("## Opportunities");
  insights.opportunities.forEach((opportunity) => {
    lines.push(`- ${opportunity.title} [impact ${opportunity.impact}]`);
    opportunity.evidence.forEach((ev) => lines.push(`  - evidence: ${ev.path} = ${formatEvidenceValue(ev.value)}`));
  });
  lines.push("");
  lines.push("## Actions");
  insights.actions.forEach((action) => {
    lines.push(`- ${action.title} [${action.horizon} | impact ${action.impact}]`);
    action.evidence.forEach((ev) => lines.push(`  - evidence: ${ev.path} = ${formatEvidenceValue(ev.value)}`));
  });
  lines.push("");
  lines.push("## Limitations");
  insights.limitations.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Questions to Validate");
  insights.questions_to_validate.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Data Quality Flags");
  insights.data_quality_flags.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Disclaimer");
  lines.push(insights.disclaimer);
  lines.push("");
  lines.push(`## ${insights.appImprovementTitle}`);
  insights.appImprovementSuggestions.forEach((item) => lines.push(`- ${item}`));
  return lines.join("\n");
}

function formatPipelineSummary(summary: RunSOPPipelineResponse["execution_summary"]): string {
  const executed = summary.executed_steps.length > 0 ? summary.executed_steps.join(", ") : "nenhum";
  const skipped = summary.skipped_steps.length > 0 ? summary.skipped_steps.join(" | ") : "nenhum";
  return `Executado: ${executed}. Pulado: ${skipped}.`;
}

export default function AIPage() {
  const { state, rmData } = useAppData();
  const [integrationSettings, setIntegrationSettings] = useState(() => loadLocalSettings().integrations);
  const { contextPack, setContextPack, refresh, loading, error, viewModel } = useContextPack(Boolean(state || rmData));

  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [copyContextStatus, setCopyContextStatus] = useState<string | null>(null);

  const [persona, setPersona] = useState<AIPersona>("SUPPLY");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insights, setInsights] = useState<AIInterpretResponse | null>(null);
  const [copyReportStatus, setCopyReportStatus] = useState<string | null>(null);
  const [hasGeneratedInsights, setHasGeneratedInsights] = useState(false);

  useEffect(() => {
    let active = true;

    getAIConfig()
      .then((payload) => {
        if (!active) {
          return;
        }

        const cachedSettings = loadLocalSettings().integrations;
        const nextIntegrations = {
          ...cachedSettings,
          provider: payload.provider,
          apiKey: "",
          apiKeyMasked: payload.apiKeyMasked,
          hasApiKey: payload.hasApiKey,
          model: payload.model,
          providerActive: payload.providerActive,
          modelActive: payload.modelActive,
          connectionStatus: payload.connectionStatus,
          usingEnvironmentKey: payload.usingEnvironmentKey,
          lastTestedAt: payload.lastTestedAt,
          lastStatus: payload.lastTestMessage,
        };
        setIntegrationSettings(nextIntegrations);
        mergeLocalIntegrationSettings(nextIntegrations);
      })
      .catch(() => {
        // Keep cached local snapshot if backend config is temporarily unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  const handleRefreshContext = async () => {
    const payload = await refresh();
    if (payload) {
      setCopyContextStatus(null);
    }
  };

  const handleRunSOP = async () => {
    try {
      setPipelineLoading(true);
      setPipelineStatus(null);
      const response = await runSOPPipeline({
        file_format: "none",
        simulate_mts: true,
      });
      setContextPack(response.context_pack_2_0);
      setPipelineStatus(formatPipelineSummary(response.execution_summary));
      setCopyContextStatus(null);
    } catch (runError) {
      setPipelineStatus(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleCopyContextPack = async () => {
    if (!contextPack) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(contextPack, null, 2));
      setCopyContextStatus("Contexto consolidado copiado.");
    } catch (copyError) {
      setCopyContextStatus(copyError instanceof Error ? copyError.message : String(copyError));
    }
  };

  const handleGenerateInsights = async (targetPersona = persona) => {
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      const backendPayload = contextPack ?? (await refresh());
      const effectivePayload = mergeContextPackWithLoadedData(backendPayload, state, rmData);

      if (!effectivePayload) {
        throw new Error("Nao foi possivel consolidar o contexto antes da interpretacao.");
      }

      setContextPack(effectivePayload);

      const aiResponse = await interpretAI({
        persona: targetPersona,
        context_pack: effectivePayload,
        language: "pt-BR",
      });
      setInsights(aiResponse);
      setHasGeneratedInsights(true);
      setCopyReportStatus(null);
    } catch (generateError) {
      setInsightsError(generateError instanceof Error ? generateError.message : String(generateError));
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleCopyReport = async () => {
    if (!insights) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildMarkdownReport(insights));
      setCopyReportStatus("Relatorio copiado");
    } catch (copyError) {
      setCopyReportStatus(copyError instanceof Error ? copyError.message : String(copyError));
    }
  };

  const handlePersonaChange = (nextPersona: string) => {
    const normalizedPersona = nextPersona as AIPersona;
    setPersona(normalizedPersona);

    if (hasGeneratedInsights) {
      void handleGenerateInsights(normalizedPersona);
    }
  };

  if (!state && !rmData) {
    return (
      <PageTransition className="p-6">
        <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/90 px-6 py-8 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(circle at top left, rgba(14,165,233,0.22), transparent 38%), linear-gradient(135deg, rgba(15,23,42,0.1), rgba(2,6,23,0.55))",
            }}
          />
          <div className="relative mx-auto max-w-3xl space-y-5 text-center">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
              Chat Executivo
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">O Chat Executivo interpreta o contexto consolidado do negocio</h1>
              <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground">
                Antes de gerar leituras executivas, o Operion precisa montar o contexto analitico com dados de
                operacao. Carregue as bases para liberar o pacote de contexto que alimenta IA e relatorios.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 text-left">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider</p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {integrationSettings.providerActive === "openai" ? "OpenAI ativo" : "Fallback local"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 text-left">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Modelo</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{integrationSettings.modelActive}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 text-left">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Proximo passo</p>
                <p className="mt-2 text-lg font-semibold text-foreground">Carregar bases</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild className="gap-2">
                <Link to="/upload">
                  Carregar dados
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/configuracoes?tab=integracoes">
                  Ajustar integracoes
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/90 px-6 py-7 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-85"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.2), transparent 32%), radial-gradient(circle at right, rgba(56,189,248,0.14), transparent 24%), linear-gradient(135deg, rgba(15,23,42,0.18), rgba(2,6,23,0.58))",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
              Chat Executivo
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Chat Executivo com leitura unica por persona</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Quanto mais modulos analiticos entram no contexto, maior a qualidade das recomendacoes para Operacoes,
                CFO, CEO e COO. Sem contexto consolidado, a interpretacao fica limitada.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider ativo</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {integrationSettings.providerActive === "openai" ? "OpenAI ativo" : "Fallback local ativo"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Contexto</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{viewModel.coveragePercent}% de cobertura</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Conexao IA</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {getConnectionStatusLabel(integrationSettings.connectionStatus)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ContextPackOverview
          viewModel={viewModel}
          loading={loading}
          error={error}
          actions={
            <>
              <Button variant="secondary" className="gap-2" onClick={handleRefreshContext} disabled={loading || pipelineLoading}>
                <RefreshCcw className="h-4 w-4" />
                {loading ? "Atualizando..." : "Atualizar contexto"}
              </Button>
              <Button className="gap-2" onClick={handleRunSOP} disabled={loading || pipelineLoading}>
                <Sparkles className="h-4 w-4" />
                {pipelineLoading ? "Consolidando..." : "Rodar pipeline S&OP"}
              </Button>
            </>
          }
          footer={
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" className="gap-2" onClick={handleCopyContextPack} disabled={!contextPack}>
                  <ClipboardList className="h-4 w-4" />
                  Copiar contexto bruto
                </Button>
                {copyContextStatus && <p className="text-xs font-mono text-muted-foreground">{copyContextStatus}</p>}
                {pipelineStatus && <p className="text-xs font-mono text-muted-foreground">{pipelineStatus}</p>}
              </div>
              {contextPack && (
                <details className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">Ver estrutura tecnica do pacote</summary>
                  <pre className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-border/70 bg-background/70 p-3 text-xs font-mono">
                    {JSON.stringify(contextPack, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          }
        />

        <div className="space-y-6">
          <section className="metric-card space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Interpretacao</p>
              <h2 className="text-xl font-semibold text-foreground">Gerar leitura executiva</h2>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm leading-6 text-foreground">
              A IA interpreta o pacote de contexto consolidado. Se o contexto estiver parcial, as recomendacoes
              permanecem uteis, mas com menor profundidade de cobertura analitica.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Modo atual</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {integrationSettings.providerActive === "openai" ? "OpenAI ativo" : "Fallback local ativo"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Modelo ativo: {integrationSettings.modelActive}. Ultimo teste: {getConnectionStatusLabel(integrationSettings.connectionStatus)}.
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Dependencia do contexto</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {viewModel.status === "ready" ? "Contexto pronto para leituras mais robustas" : "Contexto ainda limita a profundidade da recomendacao"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sem contexto consolidado, a interpretacao usa o que estiver disponivel e explicita as limitacoes.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Selecionar leitura executiva</label>
              <Select value={persona} onValueChange={handlePersonaChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPPLY">Diretor de Operacoes</SelectItem>
                  <SelectItem value="CFO">CFO</SelectItem>
                  <SelectItem value="CEO">CEO</SelectItem>
                  <SelectItem value="COO">COO</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm leading-6 text-muted-foreground">{PERSONA_DESCRIPTION[persona]}</p>
            </div>
            <Button className="w-full gap-2" onClick={() => void handleGenerateInsights(persona)} disabled={insightsLoading}>
              <BrainCircuit className="h-4 w-4" />
              {insightsLoading ? "Atualizando leitura..." : "Gerar leitura executiva"}
            </Button>
            {insightsError && <p className="text-xs font-mono text-destructive">{insightsError}</p>}
            {copyReportStatus && <p className="text-xs font-mono text-muted-foreground">{copyReportStatus}</p>}
            <Button asChild variant="outline" className="w-full gap-2">
              <Link to="/configuracoes?tab=integracoes">
                Ajustar provider e modelo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </section>

          <section className="metric-card space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Perguntas sugeridas</p>
                <h2 className="text-xl font-semibold text-foreground">O que a IA pode responder</h2>
              </div>
            </div>
            <div className="grid gap-3">
              {viewModel.questionSuggestions.map((question, index) => (
                <div key={`${question}-${index}`} className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                  {question}
                </div>
              ))}
            </div>
          </section>

          <section className="metric-card space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Dependencia do contexto</p>
                <h2 className="text-xl font-semibold text-foreground">Quanto melhor o contexto, melhor a leitura</h2>
              </div>
            </div>
            <div className="grid gap-3">
              {viewModel.inputsAvailable
                .filter((source) => !source.available)
                .slice(0, 3)
                .map((source) => (
                  <div key={source.key} className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-foreground">
                    {source.detail}
                  </div>
                ))}
              {viewModel.inputsAvailable.every((source) => source.available) && (
                <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
                  O contexto esta amplamente preenchido para leituras executivas mais robustas.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {insights && (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="metric-card">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Persona</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{PERSONA_LABEL[insights.persona]}</p>
            </div>
            <div className="metric-card">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Resumo</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights.executive_summary.length} pontos</p>
            </div>
            <div className="metric-card">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Riscos</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights.risks.length}</p>
            </div>
            <div className="metric-card">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Acoes</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights.actions.length}</p>
            </div>
            <div className="metric-card">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider usado</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {insights.providerUsed === "openai" ? "OpenAI" : "Fallback local"}
              </p>
            </div>
            <div className="metric-card">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Modelo usado</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights.modelUsed}</p>
            </div>
          </div>

            <div className="rounded-2xl border border-border/70 bg-card/70 px-5 py-4 text-sm text-foreground">
            <p className="font-semibold">{insights.analysisScope}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {insights.inputsAvailable.map((item) => (
                <span key={item} className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-foreground">
                  Disponivel: {item}
                </span>
              ))}
              {insights.inputsMissing.map((item) => (
                <span key={item} className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-foreground">
                  Lacuna: {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 px-5 py-4 text-sm text-foreground">
            <p className="font-semibold">
              {insights.usedFallback
                ? "Leitura gerada em fallback local."
                : "Leitura gerada com provider OpenAI ativo."}
            </p>
            <p className="mt-2 text-muted-foreground">
              {insights.usedFallback
                ? `Motivo do fallback: ${insights.reasonFallback ?? "nao informado"}.`
                : "O provider configurado respondeu normalmente para esta interpretacao."}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Leitura pronta</p>
              <h2 className="text-xl font-semibold text-foreground">Relatorio de interpretacao</h2>
            </div>
            <Button variant="outline" className="gap-2" onClick={handleCopyReport}>
              <ClipboardList className="h-4 w-4" />
              Copiar relatorio
            </Button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <section className="metric-card space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">Resumo executivo</h3>
                </div>
                <div className="grid gap-3">
                  {insights.executive_summary.map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section className="metric-card space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <h3 className="text-base font-semibold text-foreground">Riscos qualificados</h3>
                </div>
                {insights.risks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem riscos qualificados pela camada de IA.</p>
                ) : (
                  <div className="grid gap-3">
                    {insights.risks.map((risk, index) => (
                      <div key={`${risk.title}-${index}`} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{risk.title}</p>
                          <span className={`text-[11px] uppercase tracking-[0.22em] ${SEVERITY_STYLE[risk.severity]}`}>
                            {risk.severity}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1">
                          {risk.evidence.map((evidence, evidenceIndex) => (
                            <p key={`${evidence.path}-${evidenceIndex}`} className="text-xs text-muted-foreground break-all">
                              {evidence.path}: {formatEvidenceValue(evidence.value)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="metric-card space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-success" />
                  <h3 className="text-base font-semibold text-foreground">Oportunidades</h3>
                </div>
                {insights.opportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem oportunidades qualificadas pela leitura atual.</p>
                ) : (
                  <div className="grid gap-3">
                    {insights.opportunities.map((opportunity, index) => (
                      <div key={`${opportunity.title}-${index}`} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{opportunity.title}</p>
                          <span className={`text-[11px] uppercase tracking-[0.22em] ${IMPACT_STYLE[opportunity.impact]}`}>
                            {opportunity.impact}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1">
                          {opportunity.evidence.map((evidence, evidenceIndex) => (
                            <p key={`${evidence.path}-${evidenceIndex}`} className="text-xs text-muted-foreground break-all">
                              {evidence.path}: {formatEvidenceValue(evidence.value)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="metric-card space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">Acoes recomendadas</h3>
                </div>
                {insights.actions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem acoes priorizadas no momento.</p>
                ) : (
                  <div className="grid gap-3">
                    {insights.actions.map((action, index) => (
                      <div key={`${action.title}-${index}`} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{action.title}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{action.horizon}</span>
                            <span className={`text-[11px] uppercase tracking-[0.22em] ${IMPACT_STYLE[action.impact]}`}>
                              {action.impact}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 space-y-1">
                          {action.evidence.map((evidence, evidenceIndex) => (
                            <p key={`${evidence.path}-${evidenceIndex}`} className="text-xs text-muted-foreground break-all">
                              {evidence.path}: {formatEvidenceValue(evidence.value)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="metric-card space-y-3">
                <h3 className="text-base font-semibold text-foreground">Limitacoes</h3>
                {insights.limitations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem limitacoes adicionais registradas para esta leitura.</p>
                ) : (
                  <div className="grid gap-2">
                    {insights.limitations.map((limitation, index) => (
                      <div key={`${limitation}-${index}`} className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                        {limitation}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="metric-card space-y-3">
                <h3 className="text-base font-semibold text-foreground">Perguntas a validar</h3>
                <div className="grid gap-2">
                  {insights.questions_to_validate.map((question, index) => (
                    <div key={`${question}-${index}`} className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                      {question}
                    </div>
                  ))}
                </div>
              </section>

              <section className="metric-card space-y-3">
                <h3 className="text-base font-semibold text-foreground">Qualidade dos dados</h3>
                {insights.data_quality_flags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem flags abertas na leitura atual.</p>
                ) : (
                  <div className="grid gap-2">
                    {insights.data_quality_flags.map((flag, index) => (
                      <div key={`${flag}-${index}`} className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                        {flag}
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                  {insights.disclaimer}
                </div>
              </section>

              <section className="metric-card space-y-3">
                <h3 className="text-base font-semibold text-foreground">{insights.appImprovementTitle}</h3>
                <div className="grid gap-2">
                  {insights.appImprovementSuggestions.map((suggestion, index) => (
                    <div key={`${suggestion}-${index}`} className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
                      {suggestion}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
