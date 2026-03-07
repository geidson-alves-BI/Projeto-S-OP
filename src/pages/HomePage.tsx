import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Factory,
  FileText,
  Package,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/contexts/AppDataContext";
import { useContextPack } from "@/hooks/use-context-pack";
import { getContextPackStatusLabel } from "@/lib/context-pack";
import { loadLocalSettings } from "@/lib/local-settings";
import { getRMSummary } from "@/lib/rmEngine";
import { hasUpdaterAttention } from "@/lib/updater";
import { useOperionDesktopStatus } from "@/hooks/use-operion-desktop";

type ExecutiveAlert = {
  id: string;
  title: string;
  description: string;
  impact: string;
  action: string;
  to: string;
  tone: "high" | "medium" | "low";
  priority: number;
};

const toneClassName: Record<ExecutiveAlert["tone"], string> = {
  high: "border-destructive/35 bg-destructive/10 text-destructive",
  medium: "border-warning/35 bg-warning/10 text-warning",
  low: "border-primary/25 bg-primary/10 text-primary",
};

export default function HomePage() {
  const { state, rmData } = useAppData();
  const { viewModel: contextViewModel } = useContextPack(Boolean(state || rmData));
  const preferences = loadLocalSettings().general;
  const integrationSettings = loadLocalSettings().integrations;
  const { updaterStatus } = useOperionDesktopStatus();

  if (!state) {
    return (
      <PageTransition className="p-6 space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-border/70 bg-card/90 px-6 py-8 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(circle at top left, rgba(14,165,233,0.2), transparent 34%), radial-gradient(circle at 85% 20%, rgba(16,185,129,0.14), transparent 26%), linear-gradient(140deg, rgba(15,23,42,0.24), rgba(2,6,23,0.65))",
            }}
          />
          <div className="relative mx-auto max-w-4xl space-y-6">
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
                Operion executive home
              </span>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground">
                  Uma camada de decisao pronta para Supply, CFO, CEO e COO
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Carregue as bases de operacao para transformar dados em prioridades, impacto financeiro e acoes
                  recomendadas. Atualizacoes, diagnosticos e integracoes ficam fora desta tela para manter foco.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Camada executiva</p>
                <p className="mt-3 text-lg font-semibold text-foreground">Resumo, impacto e acao</p>
                <p className="mt-2 text-sm text-muted-foreground">A Home responde o que esta acontecendo, o que exige atencao e o que fazer agora.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">IA preparada</p>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  {integrationSettings.providerActive === "openai" ? "OpenAI ativo" : "Fallback local ativo"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">Ajuste provider, chave e modelo em Configuracoes para governanca da camada de IA.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Operacao</p>
                <p className="mt-3 text-lg font-semibold text-foreground">Nova carga necessaria</p>
                <p className="mt-2 text-sm text-muted-foreground">Importe dados de producao, clientes e materia-prima para liberar a visao executiva.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <Link to="/upload">
                  Carregar bases
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/configuracoes?tab=integracoes">
                  Abrir configuracoes
                  <Settings2 className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/ia">
                  Ver camada de IA
                  <Bot className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </PageTransition>
    );
  }

  const totalProducts = state.products.length;
  const volumeTotal = state.products.reduce((sum, product) => sum + product.volumeAnual, 0);
  const countA = state.products.filter((product) => product.classeABC === "A").length;
  const countMTS = state.products.filter((product) => (product.estrategiaFinal ?? product.estrategiaBase).includes("MTS")).length;
  const classAShare = totalProducts > 0 ? countA / totalProducts : 0;
  const mtsShare = totalProducts > 0 ? countMTS / totalProducts : 0;
  const top1Share = state.portfolioConc?.top1SharePortfolio ?? 0;
  const hhiPortfolio = state.portfolioConc?.hhiPortfolio ?? null;
  const rmSummary = rmData ? getRMSummary(rmData, 95) : null;

  const alerts: ExecutiveAlert[] = [
    ...(top1Share >= 0.35
      ? [
          {
            id: "portfolio-concentration",
            title: "Concentracao elevada no portfolio",
            description: `O principal cliente concentra ${(top1Share * 100).toFixed(1)}% do portfolio monitorado.`,
            impact: "Maior exposicao operacional e financeira caso haja oscilacao de demanda.",
            action: "Validar contingencia comercial e revisar buffers.",
            to: "/relatorios",
            tone: "high" as const,
            priority: 100,
          },
        ]
      : []),
    ...(!state.hasClientes
      ? [
          {
            id: "client-layer",
            title: "Camada de clientes ainda nao integrada",
            description: "A leitura executiva esta sem concentracao por cliente e perde sensibilidade comercial.",
            impact: "Reduz precisao da priorizacao para Supply e diretoria.",
            action: "Complementar a carga de clientes na proxima rodada.",
            to: "/demanda",
            tone: "medium" as const,
            priority: 92,
          },
        ]
      : []),
    ...(mtsShare >= 0.25
      ? [
          {
            id: "mts-policy",
            title: "Politica MTS requer calibracao",
            description: `${countMTS} itens surgem como candidatos MTS no ciclo atual.`,
            impact: "A decisao de politica pode alterar estoque, nivel de servico e investimento.",
            action: "Revisar mix MTS/MTO com foco em itens A e lideres de consumo.",
            to: "/mts",
            tone: "medium" as const,
            priority: 88,
          },
        ]
      : []),
    ...(rmSummary && rmSummary.belowSLA > 0
      ? [
          {
            id: "rm-sla",
            title: "Materia-prima abaixo do SLA",
            description: `${rmSummary.belowSLA} materiais estao abaixo do alvo de cobertura no corte de 95%.`,
            impact: "Risco direto para continuidade operacional e custo de reposicao emergencial.",
            action: "Priorizar fornecedores e investimento de recomposicao.",
            to: "/rm-sla",
            tone: "high" as const,
            priority: 96,
          },
        ]
      : []),
    ...(state.monthCols.length < 6
      ? [
          {
            id: "data-window",
            title: "Janela historica curta",
            description: `A analise esta operando com ${state.monthCols.length} meses de historico.`,
            impact: "Forecast e leitura de tendencia ficam menos robustos.",
            action: "Expandir a serie historica na proxima importacao.",
            to: "/forecast",
            tone: "low" as const,
            priority: 70,
          },
        ]
      : []),
  ].sort((left, right) => (preferences.prioritizeAlerts ? right.priority - left.priority : 0));

  const topAlerts = alerts.slice(0, 3);

  const recommendedActions = [
    {
      title: "Refinar politica de atendimento",
      description: "Cruzar criticidade ABC, estabilidade e estrategia final para reduzir excesso e ruptura.",
      to: "/mts",
      impact: `${countMTS} itens pedem decisao de politica.`,
      icon: Target,
    },
    {
      title: "Atualizar leitura financeira",
      description: "Traduzir a estrategia operacional em investimento de estoque e compromissos de caixa.",
      to: "/financeiro",
      impact: "Alinha Supply com CFO e caixa.",
      icon: BriefcaseBusiness,
    },
    {
      title: "Emitir pack executivo",
      description: "Consolidar resumo, historico, riscos e recomendacoes para a reuniao de decisao.",
      to: "/relatorios",
      impact: "Acelera alinhamento entre CEO, COO e CFO.",
      icon: FileText,
    },
    {
      title: "Interpretar com IA",
      description: "Gerar leitura assistida por persona com contexto estruturado do ciclo atual.",
      to: "/ia",
      impact: `Provider ${integrationSettings.providerActive === "openai" ? "OpenAI" : "fallback local"} pronto para governanca.`,
      icon: Sparkles,
    },
  ];

  const personaShortcuts = [
    {
      title: "Supply",
      description: "Volume, criticidade e politica de atendimento.",
      to: "/mts",
      icon: Factory,
    },
    {
      title: "CFO",
      description: "Capital empregado, buffers e exposicao financeira.",
      to: "/financeiro",
      icon: BriefcaseBusiness,
    },
    {
      title: "CEO",
      description: "Sintese executiva e alinhamento cross-functional.",
      to: "/relatorios",
      icon: FileText,
    },
    {
      title: "COO",
      description: "Planejamento, capacidade e risco de execucao.",
      to: "/forecast",
      icon: TrendingUp,
    },
  ];

  return (
    <PageTransition className="p-6 space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-border/70 bg-card/90 px-6 py-8 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14,165,233,0.2), transparent 30%), radial-gradient(circle at 85% 20%, rgba(16,185,129,0.14), transparent 24%), linear-gradient(140deg, rgba(15,23,42,0.24), rgba(2,6,23,0.65))",
          }}
        />
        <div className="relative space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
                Resumo executivo
              </span>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground">
                  O ciclo atual pede foco em estabilidade operacional, mix de politica e governanca de estoque
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  O Operion esta monitorando {totalProducts} SKUs em {state.monthCols.length} meses, com{" "}
                  {Math.round(classAShare * 100)}% do portfolio concentrado em itens Classe A e{" "}
                  {Math.round(mtsShare * 100)}% do mix pedindo revisao de politica MTS/MTO.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {hasUpdaterAttention(updaterStatus) && (
                <Button asChild variant="outline" className="gap-2 rounded-full border-warning/30 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning">
                  <Link to="/configuracoes?tab=atualizacoes">
                    Atualizacao do app
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button asChild className="gap-2">
                <Link to="/relatorios">
                  Abrir pack executivo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/ia">
                  Interpretar com IA
                  <Bot className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">O que esta acontecendo</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                O portfolio segue puxado pelos itens A e pela necessidade de calibrar politica de atendimento.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">O que exige atencao</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {topAlerts[0]?.title ?? "Sem alertas criticos fora da faixa esperada neste momento."}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Qual o impacto</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {topAlerts[0]?.impact ?? "A operacao esta em faixa controlada com base no contexto carregado."}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">O que fazer agora</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {topAlerts[0]?.action ?? "Emitir o pack executivo e manter a rotina de acompanhamento."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Portfolio monitorado" value={totalProducts} sub={`${state.monthCols.length} meses ativos`} accent />
        <MetricCard label="Volume anual" value={`${Math.round(volumeTotal).toLocaleString()} kg`} />
        <MetricCard label="Itens Classe A" value={countA} sub={`${Math.round(classAShare * 100)}% do portfolio`} />
        <MetricCard label="Candidatos MTS" value={countMTS} sub={`${Math.round(mtsShare * 100)}% do mix`} />
        <MetricCard
          label="Concentracao"
          value={hhiPortfolio != null ? hhiPortfolio.toFixed(3) : "n/a"}
          sub={state.hasClientes ? `Top1 ${(top1Share * 100).toFixed(1)}%` : "Sem camada de clientes"}
        />
      </div>

      <section className="rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] text-primary">
                Contexto analitico
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] ${
                  contextViewModel.status === "ready"
                    ? "border-success/35 bg-success/10 text-success"
                    : contextViewModel.status === "partial"
                      ? "border-warning/35 bg-warning/10 text-warning"
                      : "border-border/70 bg-muted/20 text-muted-foreground"
                }`}
              >
                {getContextPackStatusLabel(contextViewModel.status)}
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">{contextViewModel.friendlyName}</h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {contextViewModel.summary}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <Link to="/ia">
                  Abrir IA
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/relatorios">
                  Abrir relatorios
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cobertura</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{contextViewModel.coveragePercent}%</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Blocos prontos</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {contextViewModel.availableComponentsCount}/{contextViewModel.totalComponentsCount}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Lacunas</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {contextViewModel.inputsAvailable.filter((source) => !source.available).length || "Nenhuma"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:col-span-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Dependencias ainda ausentes</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {contextViewModel.inputsAvailable
                  .filter((source) => !source.available)
                  .map((source) => source.label)
                  .join(", ") || "Contexto com cobertura ampla para leituras executivas."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="metric-card space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Alertas priorizados</p>
              <h2 className="text-xl font-semibold text-foreground">O que exige atencao agora</h2>
            </div>
          </div>

          {topAlerts.length === 0 ? (
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
              O contexto atual nao gerou alertas executivos fora da faixa esperada.
            </div>
          ) : (
            <div className="grid gap-3">
              {topAlerts.map((alert) => (
                <Link key={alert.id} to={alert.to} className="rounded-2xl border border-border/70 bg-muted/20 p-4 transition-colors hover:border-primary/40 hover:bg-background/70">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] ${toneClassName[alert.tone]}`}>
                          {alert.tone === "high" ? "Alta prioridade" : alert.tone === "medium" ? "Atencao" : "Monitorar"}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-foreground">{alert.title}</h3>
                      <p className="text-sm leading-6 text-muted-foreground">{alert.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Impacto</p>
                      <p className="mt-2 text-sm text-foreground">{alert.impact}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Acao imediata</p>
                      <p className="mt-2 text-sm text-foreground">{alert.action}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="metric-card space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Leitura rapida</p>
              <h2 className="text-xl font-semibold text-foreground">Sinais do ciclo</h2>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Supply</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                A base aponta {countMTS} itens com oportunidade de ajuste de politica e {countA} itens criticos no corte ABC.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Financeiro</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                O valor em estoque depende da calibracao entre estabilidade de demanda, buffers e cobertura de materia-prima.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Execucao</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {rmSummary
                  ? `${rmSummary.total} materiais foram carregados, com ${rmSummary.belowSLA} abaixo do alvo de SLA 95%.`
                  : "A camada de materia-prima ainda nao foi carregada para leitura de risco de abastecimento."}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="metric-card space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Acoes recomendadas</p>
            <h2 className="text-xl font-semibold text-foreground">O que fazer agora</h2>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {recommendedActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.title} to={action.to} className="group rounded-2xl border border-border/70 bg-muted/20 p-5 transition-colors hover:border-primary/40 hover:bg-background/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{action.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.24em] text-primary">{action.impact}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="metric-card space-y-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Acesso por persona</p>
            <h2 className="text-xl font-semibold text-foreground">Experiencia executiva por papel</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {personaShortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.title} to={item.to} className="group rounded-2xl border border-border/70 bg-muted/20 p-5 transition-colors hover:border-primary/40 hover:bg-background/70">
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-2xl border border-border/70 bg-background/50 p-3">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {preferences.showAITeaser && (
        <section className="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.24)]">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">IA discreta</p>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Interpretacao assistida, sem expor a tela principal</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  A camada de IA fica separada da Home executiva. Use-a quando precisar transformar o ciclo atual em
                  leitura por persona, perguntas de validacao e recomendacoes orientadas a impacto.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="gap-2">
                  <Link to="/ia">
                    Abrir workspace de IA
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/configuracoes?tab=integracoes">
                    Configurar provider
                    <Settings2 className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Provider</p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {integrationSettings.providerActive === "openai" ? "OpenAI" : "Deterministico"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Modelo</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{integrationSettings.modelActive}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 md:col-span-2">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Uso recomendado</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  Gere uma interpretacao quando quiser consolidar a reuniao executiva em poucas mensagens acionaveis.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
