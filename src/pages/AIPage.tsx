import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BrainCircuit,
  ClipboardList,
  FileJson,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageTransition from "@/components/PageTransition";
import { useAppData } from "@/contexts/AppDataContext";
import { loadLocalSettings } from "@/lib/local-settings";
import { getContextPack, interpretAI, runSOPPipeline } from "@/lib/api";
import type {
  AIInterpretResponse,
  AIPersona,
  ContextPack,
  RunSOPPipelineResponse,
} from "@/types/analytics";

const PERSONA_LABEL: Record<AIPersona, string> = {
  SUPPLY: "Diretor Supply Chain",
  CFO: "CFO",
  CEO: "CEO",
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
  lines.push("## Executive Summary");
  insights.executive_summary.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Risks");
  insights.risks.forEach((risk) => {
    lines.push(`- ${risk.title} [${risk.severity}]`);
    risk.evidence.forEach((ev) => lines.push(`  - evidence: ${ev.path} = ${formatEvidenceValue(ev.value)}`));
  });
  lines.push("");
  lines.push("## Actions");
  insights.actions.forEach((action) => {
    lines.push(`- ${action.title} [${action.horizon} | impact ${action.impact}]`);
    action.evidence.forEach((ev) => lines.push(`  - evidence: ${ev.path} = ${formatEvidenceValue(ev.value)}`));
  });
  lines.push("");
  lines.push("## Questions to Validate");
  insights.questions_to_validate.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Data Quality Flags");
  insights.data_quality_flags.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Disclaimer");
  lines.push(insights.disclaimer);
  return lines.join("\n");
}

function formatPipelineSummary(summary: RunSOPPipelineResponse["execution_summary"]): string {
  const executed = summary.executed_steps.length > 0 ? summary.executed_steps.join(", ") : "nenhum";
  const skipped = summary.skipped_steps.length > 0 ? summary.skipped_steps.join(" | ") : "nenhum";
  return `Executado: ${executed}. Pulado: ${skipped}.`;
}

export default function AIPage() {
  const { state } = useAppData();
  const integrationSettings = loadLocalSettings().integrations;

  const [contextPack, setContextPack] = useState<ContextPack | null>(null);
  const [contextPackLoading, setContextPackLoading] = useState(false);
  const [contextPackError, setContextPackError] = useState<string | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [copyContextStatus, setCopyContextStatus] = useState<string | null>(null);

  const [persona, setPersona] = useState<AIPersona>("SUPPLY");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insights, setInsights] = useState<AIInterpretResponse | null>(null);
  const [copyReportStatus, setCopyReportStatus] = useState<string | null>(null);

  const handleContextPack = async () => {
    try {
      setContextPackLoading(true);
      setContextPackError(null);
      const payload = await getContextPack();
      setContextPack(payload);
      setCopyContextStatus(null);
    } catch (error) {
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setContextPackLoading(false);
    }
  };

  const handleRunSOP = async () => {
    try {
      setPipelineLoading(true);
      setContextPackError(null);
      setPipelineStatus(null);
      const response = await runSOPPipeline({
        file_format: "none",
        simulate_mts: true,
      });
      setContextPack(response.context_pack_2_0);
      setPipelineStatus(formatPipelineSummary(response.execution_summary));
      setCopyContextStatus(null);
    } catch (error) {
      setContextPackError(error instanceof Error ? error.message : String(error));
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
      setCopyContextStatus("Context pack copiado");
    } catch (error) {
      setCopyContextStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleGenerateInsights = async () => {
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      const payload = contextPack ?? (await getContextPack());
      if (!contextPack) {
        setContextPack(payload);
      }
      const aiResponse = await interpretAI({
        persona,
        context_pack: payload,
        language: "pt-BR",
      });
      setInsights(aiResponse);
      setCopyReportStatus(null);
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : String(error));
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
    } catch (error) {
      setCopyReportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  if (!state) {
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
              IA Operion
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Interprete o contexto com foco executivo</h1>
              <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground">
                A camada de IA depende de um contexto operacional carregado. Faca a carga das bases e depois gere
                leituras orientadas para Supply, CFO e CEO.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 text-left">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{integrationSettings.provider === "openai" ? "OpenAI" : "Deterministico"}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 text-left">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Modelo</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{integrationSettings.model}</p>
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
              IA e interpretacao
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Camada de decisao assistida</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Estruture o contexto, rode o pipeline analitico e gere uma leitura executiva pronta para decisao.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider ativo</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{integrationSettings.provider === "openai" ? "OpenAI" : "Deterministico"}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Contexto</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{contextPack ? "Pronto" : "Pendente"}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Insights</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights ? insights.actions.length : 0} acoes</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="metric-card space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Orquestracao</p>
              <h2 className="text-xl font-semibold text-foreground">Preparar contexto analitico</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="gap-2" onClick={handleContextPack} disabled={contextPackLoading || pipelineLoading}>
                <FileJson className="h-4 w-4" />
                {contextPackLoading ? "Gerando..." : "Gerar Context Pack"}
              </Button>
              <Button className="gap-2" onClick={handleRunSOP} disabled={contextPackLoading || pipelineLoading}>
                <RefreshCcw className="h-4 w-4" />
                {pipelineLoading ? "Processando..." : "Rodar pipeline S&OP"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Dados monitorados</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{state.products.length} SKUs</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Janela</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{state.monthCols.length} meses</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Clientes</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{state.hasClientes ? state.clientes.length : "Nao integrado"}</p>
            </div>
          </div>

          {pipelineStatus && <p className="text-xs font-mono text-muted-foreground">{pipelineStatus}</p>}
          {contextPackError && <p className="text-xs font-mono text-destructive">{contextPackError}</p>}

          {contextPack && (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-background/45 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Pacote pronto</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    generated_at: {String(contextPack.generated_at ?? "n/a")}
                  </p>
                </div>
                <Button variant="outline" className="gap-2" onClick={handleCopyContextPack}>
                  <ClipboardList className="h-4 w-4" />
                  Copiar Context Pack
                </Button>
              </div>
              {copyContextStatus && <p className="text-xs font-mono text-muted-foreground">{copyContextStatus}</p>}
              <details className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <summary className="cursor-pointer text-sm font-medium text-foreground">Ver estrutura tecnica</summary>
                <pre className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-border/70 bg-background/70 p-3 text-xs font-mono">
                  {JSON.stringify(contextPack, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>

        <section className="metric-card space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Interpretacao</p>
              <h2 className="text-xl font-semibold text-foreground">Gerar leitura executiva</h2>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/configuracoes?tab=integracoes">
                Ajustar provider
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <label className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Persona executiva</label>
              <Select value={persona} onValueChange={(value) => setPersona(value as AIPersona)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPPLY">Diretor Supply Chain</SelectItem>
                  <SelectItem value="CFO">CFO</SelectItem>
                  <SelectItem value="CEO">CEO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Configuracao atual</p>
              <div className="mt-2 space-y-1 text-sm text-foreground">
                <p>Provider: {integrationSettings.provider === "openai" ? "OpenAI" : "Deterministico"}</p>
                <p>Modelo: {integrationSettings.model}</p>
                <p>Status salvo: {integrationSettings.lastStatus ?? "Sem validacao recente"}</p>
              </div>
            </div>
          </div>

          <Button className="w-full gap-2" onClick={handleGenerateInsights} disabled={insightsLoading}>
            <Sparkles className="h-4 w-4" />
            {insightsLoading ? "Gerando leitura..." : "Gerar insights executivos"}
          </Button>

          {insightsError && <p className="text-xs font-mono text-destructive">{insightsError}</p>}
          {copyReportStatus && <p className="text-xs font-mono text-muted-foreground">{copyReportStatus}</p>}
        </section>
      </div>

      {insights && (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
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
            </div>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
