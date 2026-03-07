import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { BarChart3, TrendingUp, Package, FileSpreadsheet } from "lucide-react";
import { useAppData } from "@/contexts/AppDataContext";
import MetricCard from "@/components/MetricCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_URL, getContextPack, interpretAI, runSOPPipeline } from "@/lib/api";
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

type UpdaterStatusSnapshot = {
  phase?: string;
  message?: string;
  percent?: number;
  version?: string | null;
  availableVersion?: string | null;
  installedMessage?: string | null;
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
  insights.executive_summary.forEach(item => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Risks");
  insights.risks.forEach(risk => {
    lines.push(`- ${risk.title} [${risk.severity}]`);
    risk.evidence.forEach(ev => lines.push(`  - evidence: ${ev.path} = ${formatEvidenceValue(ev.value)}`));
  });
  lines.push("");
  lines.push("## Actions");
  insights.actions.forEach(action => {
    lines.push(`- ${action.title} [${action.horizon} | impact ${action.impact}]`);
    action.evidence.forEach(ev => lines.push(`  - evidence: ${ev.path} = ${formatEvidenceValue(ev.value)}`));
  });
  lines.push("");
  lines.push("## Questions to Validate");
  insights.questions_to_validate.forEach(item => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Data Quality Flags");
  insights.data_quality_flags.forEach(item => lines.push(`- ${item}`));
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

export default function HomePage() {
  const { state } = useAppData();
  const navigate = useNavigate();

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
  const [appVersion, setAppVersion] = useState<string>("n/a");
  const [updaterSnapshot, setUpdaterSnapshot] = useState<UpdaterStatusSnapshot>({
    phase: "idle",
    message: "Sem verificacao de atualizacao",
    percent: 0,
    version: null,
    installedMessage: null,
  });
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [openLogsBusy, setOpenLogsBusy] = useState(false);
  const desktopBridge = typeof window !== "undefined" ? window.desktop : undefined;

  useEffect(() => {
    if (!state) navigate("/upload");
  }, [state, navigate]);

  useEffect(() => {
    let active = true;

    if (desktopBridge?.getVersion) {
      desktopBridge
        .getVersion()
        .then(version => {
          if (active) {
            setAppVersion(version);
          }
        })
        .catch(error => {
          if (active) {
            setAppVersion("n/a");
            setDiagnosticError(error instanceof Error ? error.message : String(error));
          }
        });
    } else {
      setAppVersion("web");
    }

    const updater = window.__OPERION_UPDATER__;
    if (!updater) {
      setUpdaterSnapshot({
        phase: "disabled",
        message: "Updater indisponivel no ambiente atual",
        percent: 0,
        version: null,
        installedMessage: null,
      });
      return () => {
        active = false;
      };
    }

    let unsubscribe = () => {};

    updater
      .getStatus()
      .then((status: UpdaterStatusSnapshot) => {
        if (active) {
          setUpdaterSnapshot(status);
        }
      })
      .catch(error => {
        if (active) {
          setUpdaterSnapshot({
            phase: "error",
            message: error instanceof Error ? error.message : String(error),
            percent: 0,
            version: null,
            installedMessage: null,
          });
        }
      });

    unsubscribe = updater.onStatus((status: UpdaterStatusSnapshot) => {
      if (active) {
        setUpdaterSnapshot(status);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktopBridge]);

  if (!state) return null;

  const countA = state.products.filter(p => p.classeABC === "A").length;
  const countB = state.products.filter(p => p.classeABC === "B").length;
  const countC = state.products.filter(p => p.classeABC === "C").length;
  const countMTS = state.products.filter(p => (p.estrategiaFinal ?? p.estrategiaBase).includes("MTS")).length;
  const volumeTotal = state.products.reduce((sum, p) => sum + p.volumeAnual, 0);

  const modules = [
    { to: "/abc-xyz", icon: BarChart3, label: "ABC / XYZ", desc: "Classificacao e matriz" },
    { to: "/forecast", icon: TrendingUp, label: "Forecast", desc: "Projecao de demanda" },
    { to: "/mts", icon: Package, label: "MTS / MTO", desc: "Recomendacoes e export" },
    { to: "/relatorios", icon: FileSpreadsheet, label: "Relatorios", desc: "Pack S&OP" },
  ];

  const handleContextPack = async () => {
    try {
      setContextPackLoading(true);
      setContextPackError(null);
      const payload = await getContextPack();
      setContextPack(payload);
      setCopyContextStatus(null);
    } catch (err) {
      setContextPackError(err instanceof Error ? err.message : String(err));
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
    } catch (err) {
      setContextPackError(err instanceof Error ? err.message : String(err));
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
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : String(err));
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

  const handleOpenLogs = async () => {
    if (!desktopBridge?.openLogs) {
      setDiagnosticError("Abrir logs disponivel apenas no app desktop.");
      return;
    }

    try {
      setOpenLogsBusy(true);
      setDiagnosticError(null);
      await desktopBridge.openLogs();
      setDiagnosticStatus("Pasta de logs aberta.");
    } catch (error) {
      setDiagnosticStatus(null);
      setDiagnosticError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpenLogsBusy(false);
    }
  };

  const updaterProgress = Math.max(0, Math.min(100, Math.round(updaterSnapshot.percent || 0)));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground">Home Executiva - S&OE / S&OP</h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {state.products.length} SKUs - {state.monthCols.length} meses
          {state.hasClientes && ` - ${state.clientes.length} clientes`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Total SKUs" value={state.products.length} />
        <MetricCard label="Vol. Total Produzido" value={`${Math.round(volumeTotal).toLocaleString()} kg`} />
        <MetricCard label="Classe A" value={countA} sub={`${Math.round((countA / state.products.length) * 100)}% dos SKUs`} />
        <MetricCard label="Classe B" value={countB} />
        <MetricCard label="Classe C" value={countC} />
        <MetricCard label="Candidatos MTS" value={countMTS} />
        {state.portfolioConc && (
          <MetricCard
            label="HHI Portfolio"
            value={state.portfolioConc.hhiPortfolio.toFixed(3)}
            sub={`Top1: ${(state.portfolioConc.top1SharePortfolio * 100).toFixed(1)}%`}
          />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {modules.map(m => (
          <Link key={m.to} to={m.to} className="metric-card hover:border-primary/50 transition-colors group cursor-pointer">
            <m.icon className="h-5 w-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-sm font-bold font-mono text-foreground">{m.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
          </Link>
        ))}
      </div>

      <div className="metric-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold font-mono text-foreground">Diagnostico</h3>
          <Button
            variant="secondary"
            className="font-mono text-sm"
            onClick={handleOpenLogs}
            disabled={openLogsBusy || !desktopBridge?.openLogs}
          >
            {openLogsBusy ? "Abrindo..." : "Abrir logs"}
          </Button>
        </div>

        <div className="grid gap-2 text-xs font-mono">
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Versao do app:</span> {appVersion}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2 break-all">
            <span className="text-muted-foreground">Backend URL:</span> {API_URL}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Ultimo status do updater:</span> {updaterSnapshot.message || "Sem status"}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Ultima versao encontrada:</span> {updaterSnapshot.version ?? "n/a"}
          </div>
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Progresso do download:</span> {updaterProgress}%
          </div>
        </div>

        {(updaterSnapshot.phase === "downloading" || updaterSnapshot.phase === "downloaded") && (
          <div className="rounded border border-border bg-muted/20 px-3 py-3">
            <div className="h-2 overflow-hidden rounded-full bg-border/60">
              <div
                className={`h-full rounded-full transition-all ${
                  updaterSnapshot.phase === "downloaded" ? "bg-success" : "bg-primary"
                }`}
                style={{ width: `${updaterProgress}%` }}
              />
            </div>
          </div>
        )}

        {updaterSnapshot.installedMessage && (
          <div className="rounded border border-success/40 bg-success/10 px-3 py-2">
            <p className="text-xs font-mono font-semibold text-success">{updaterSnapshot.installedMessage}</p>
          </div>
        )}

        {diagnosticStatus && <p className="text-xs font-mono text-muted-foreground">{diagnosticStatus}</p>}
        {diagnosticError && <p className="text-xs font-mono text-destructive">{diagnosticError}</p>}
      </div>

      <div className="metric-card space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="text-sm font-bold font-mono text-foreground">Context Pack 2.0</h3>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Button
              variant="secondary"
              className="font-mono text-sm"
              onClick={handleContextPack}
              disabled={contextPackLoading || pipelineLoading}
            >
              {contextPackLoading ? "Carregando..." : "Gerar Context Pack"}
            </Button>
            <Button
              className="font-mono text-sm"
              onClick={handleRunSOP}
              disabled={contextPackLoading || pipelineLoading}
            >
              {pipelineLoading ? "Rodando..." : "Rodar S&OP"}
            </Button>
          </div>
        </div>

        {pipelineStatus && <p className="text-xs font-mono text-muted-foreground">{pipelineStatus}</p>}
        {contextPackError && <p className="text-xs font-mono text-destructive">{contextPackError}</p>}

        {contextPack && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono text-muted-foreground">
                generated_at: {String(contextPack.generated_at ?? "n/a")}
              </p>
              <Button variant="outline" className="font-mono text-xs" onClick={handleCopyContextPack}>
                Copiar Context Pack
              </Button>
            </div>
            {copyContextStatus && <p className="text-xs font-mono text-muted-foreground">{copyContextStatus}</p>}
            <pre className="w-full overflow-auto rounded border border-border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(contextPack, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="metric-card space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-sm font-bold font-mono text-foreground">IA Interpretadora</h3>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Select value={persona} onValueChange={value => setPersona(value as AIPersona)}>
              <SelectTrigger className="w-full md:w-56 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUPPLY">Diretor Supply Chain</SelectItem>
                <SelectItem value="CFO">CFO</SelectItem>
                <SelectItem value="CEO">CEO</SelectItem>
              </SelectContent>
            </Select>
            <Button className="font-mono text-sm" onClick={handleGenerateInsights} disabled={insightsLoading}>
              {insightsLoading ? "Gerando..." : "Gerar Insights IA"}
            </Button>
          </div>
        </div>

        {insightsError && <p className="text-xs font-mono text-destructive">{insightsError}</p>}

        {insights && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono text-muted-foreground">Persona ativa: {PERSONA_LABEL[insights.persona]}</p>
              <Button variant="outline" className="font-mono text-xs" onClick={handleCopyReport}>
                Copiar relatorio
              </Button>
            </div>

            {copyReportStatus && <p className="text-xs font-mono text-muted-foreground">{copyReportStatus}</p>}

            <div className="space-y-2">
              <h4 className="text-sm font-bold font-mono text-foreground">Executive Summary</h4>
              <ul className="space-y-1 text-xs font-mono text-foreground">
                {insights.executive_summary.map((item, idx) => (
                  <li key={`${item}-${idx}`} className="rounded border border-border bg-muted/30 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold font-mono text-foreground">Risks</h4>
              {insights.risks.length === 0 ? (
                <p className="text-xs font-mono text-muted-foreground">Sem riscos qualificados.</p>
              ) : (
                <div className="grid gap-2">
                  {insights.risks.map((risk, idx) => (
                    <div key={`${risk.title}-${idx}`} className="rounded border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-mono font-semibold text-foreground">{risk.title}</p>
                        <span className={`text-[11px] font-mono uppercase ${SEVERITY_STYLE[risk.severity]}`}>{risk.severity}</span>
                      </div>
                      <div className="space-y-1">
                        {risk.evidence.map((evidence, evidenceIdx) => (
                          <p key={`${evidence.path}-${evidenceIdx}`} className="text-[11px] font-mono text-muted-foreground break-all">
                            {evidence.path}: {formatEvidenceValue(evidence.value)}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold font-mono text-foreground">Actions</h4>
              {insights.actions.length === 0 ? (
                <p className="text-xs font-mono text-muted-foreground">Sem acoes priorizadas.</p>
              ) : (
                <div className="grid gap-2">
                  {insights.actions.map((action, idx) => (
                    <div key={`${action.title}-${idx}`} className="rounded border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-mono font-semibold text-foreground">{action.title}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-muted-foreground">{action.horizon}</span>
                          <span className={`text-[11px] font-mono uppercase ${IMPACT_STYLE[action.impact]}`}>{action.impact}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {action.evidence.map((evidence, evidenceIdx) => (
                          <p key={`${evidence.path}-${evidenceIdx}`} className="text-[11px] font-mono text-muted-foreground break-all">
                            {evidence.path}: {formatEvidenceValue(evidence.value)}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold font-mono text-foreground">Questions to Validate</h4>
              <ul className="space-y-1 text-xs font-mono text-muted-foreground">
                {insights.questions_to_validate.map((question, idx) => (
                  <li key={`${question}-${idx}`} className="rounded border border-border bg-muted/20 px-3 py-2">
                    {question}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold font-mono text-foreground">Data Quality Flags</h4>
              {insights.data_quality_flags.length === 0 ? (
                <p className="text-xs font-mono text-muted-foreground">Sem flags de qualidade.</p>
              ) : (
                <ul className="space-y-1 text-xs font-mono text-warning">
                  {insights.data_quality_flags.map((flag, idx) => (
                    <li key={`${flag}-${idx}`} className="rounded border border-warning/30 bg-warning/10 px-3 py-2">
                      {flag}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded border border-border bg-muted/20 px-3 py-2">
              <p className="text-xs font-mono text-muted-foreground">{insights.disclaimer}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
