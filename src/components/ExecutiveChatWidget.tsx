import { useEffect, useMemo, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getExecutiveChatContext, sendExecutiveChat } from "@/lib/api";
import type { ExecutiveChatHistoryItem, ExecutiveChatResponse } from "@/types/analytics";

type ChatMode = "short" | "detailed";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: {
    confidence?: "high" | "medium" | "low";
    partial?: boolean;
    mode?: ChatMode;
    blocks?: ExecutiveChatResponse["blocks"];
    limitations?: string[];
    missingData?: string[];
  };
};

const FALLBACK_SUGGESTIONS = [
  "Quais sao os 5 maiores riscos executivos deste cenario?",
  "Qual classe ABC tera maior crescimento?",
  "Qual grupo de produto merece mais atencao?",
  "O crescimento comercial esta pressionando a operacao?",
  "Qual a previsao de demanda do cliente X?",
  "Quais produtos o cliente X comprou no ultimo ano?",
  "Ha risco de ruptura com o cenario atual?",
  "O forecast atual e confiavel?",
  "O que devo discutir na proxima reuniao de S&OP?",
  "Ha alguma limitacao importante nos dados para esta analise?",
];

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function confidenceLabel(confidence?: string) {
  if (confidence === "high") return "Confianca alta";
  if (confidence === "low") return "Confianca baixa";
  return "Confianca media";
}

function confidenceClass(confidence?: string) {
  if (confidence === "high") return "border-emerald-500/50 bg-emerald-500/15 text-emerald-100";
  if (confidence === "low") return "border-rose-500/50 bg-rose-500/15 text-rose-100";
  return "border-amber-500/50 bg-amber-500/15 text-amber-100";
}

function contextHighlights(summary: Record<string, unknown> | null): string[] {
  if (!summary) {
    return [];
  }
  const highlights: string[] = [];
  const selectedMethod = String(summary.selected_method ?? "").trim();
  const horizon = summary.horizon_months;
  const confidenceNode =
    summary.forecast_confidence && typeof summary.forecast_confidence === "object"
      ? (summary.forecast_confidence as Record<string, unknown>)
      : null;
  const confidenceLabelValue = String(confidenceNode?.label ?? "").trim();
  const totals =
    summary.forecast_totals && typeof summary.forecast_totals === "object"
      ? (summary.forecast_totals as Record<string, unknown>)
      : null;
  const growthPct = totals?.growth_impact_pct;
  const riskOverview =
    summary.risk_overview && typeof summary.risk_overview === "object"
      ? (summary.risk_overview as Record<string, unknown>)
      : null;
  const riskDriver = String(riskOverview?.predominant_driver ?? "").trim();
  const coverageOverview =
    summary.coverage_overview && typeof summary.coverage_overview === "object"
      ? (summary.coverage_overview as Record<string, unknown>)
      : null;
  const rupture = coverageOverview?.rupture_risk_count;

  if (selectedMethod) {
    highlights.push(`Metodo: ${selectedMethod}`);
  }
  if (horizon !== undefined && horizon !== null) {
    highlights.push(`Horizonte: ${String(horizon)} meses`);
  }
  if (confidenceLabelValue) {
    highlights.push(`Confianca: ${confidenceLabelValue}`);
  }
  if (growthPct !== undefined && growthPct !== null) {
    highlights.push(`Crescimento: ${Number(growthPct).toFixed(2)}%`);
  }
  if (riskDriver) {
    highlights.push(`Driver de risco: ${riskDriver}`);
  }
  if (rupture !== undefined && rupture !== null) {
    highlights.push(`Ruptura: ${String(rupture)} produtos`);
  }
  return highlights.slice(0, 4);
}

export default function ExecutiveChatWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("short");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const [contextSummary, setContextSummary] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nowId(),
      role: "assistant",
      content:
        "Copiloto executivo ativo. Uso OpenAI quando configurado e fallback contextual seguro quando indisponivel. Posso responder com base em forecast, risco, cobertura, concentracao comercial e contexto financeiro disponivel.",
    },
  ]);

  const highlights = useMemo(() => contextHighlights(contextSummary), [contextSummary]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    const loadContext = async () => {
      try {
        const response = await getExecutiveChatContext(true);
        if (!active) return;
        setContextSummary(response.context_summary);
        if (response.suggestions.length > 0) {
          setSuggestions(response.suggestions);
        }
      } catch {
        if (!active) return;
      }
    };
    void loadContext();
    return () => {
      active = false;
    };
  }, [open]);

  const buildHistory = (current: ChatMessage[]): ExecutiveChatHistoryItem[] =>
    current
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-12)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

  const sendMessage = async (rawMessage?: string) => {
    const content = (rawMessage ?? input).trim();
    if (!content || loading) {
      return;
    }

    const userMessage: ChatMessage = { id: nowId(), role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await sendExecutiveChat({
        message: content,
        history: buildHistory(nextMessages),
        include_planning_context: true,
        mode,
      });

      if (response.suggestions.length > 0) {
        setSuggestions(response.suggestions);
      }
      setContextSummary(response.context_summary);

      setMessages((current) => [
        ...current,
        {
          id: nowId(),
          role: "assistant",
          content: response.answer,
          meta: {
            confidence: response.confidence,
            partial: response.partial,
            mode: response.response_mode,
            blocks: response.blocks,
            limitations: response.limitations,
            missingData: response.missing_data,
          },
        },
      ]);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: nowId(),
          role: "assistant",
          content:
            "Nao consegui responder agora. Verifique backend ativo e execucao de Analise e Planejamento de Demanda.",
          meta: { confidence: "low", partial: true },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderAssistantMessage = (message: ChatMessage) => {
    const blocks = message.meta?.blocks;
    if (!blocks) {
      return <p className="whitespace-pre-wrap">{message.content}</p>;
    }

    const direct = String(blocks.direct_answer ?? "").trim();
    const evidence = extractStringList(blocks.evidence);
    const risks = extractStringList(blocks.risks_limitations);
    const recommendation = extractStringList(blocks.executive_recommendation);

    return (
      <div className="space-y-2">
        {direct && (
          <section className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Resposta direta</p>
            <p className="whitespace-pre-wrap">{direct}</p>
          </section>
        )}
        {evidence.length > 0 && (
          <section className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Evidencias</p>
            <ul className="list-disc pl-4 space-y-1">
              {evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        {risks.length > 0 && (
          <section className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Riscos ou limitacoes</p>
            <ul className="list-disc pl-4 space-y-1">
              {risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        {recommendation.length > 0 && (
          <section className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Recomendacao executiva
            </p>
            <ul className="list-disc pl-4 space-y-1">
              {recommendation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-[70]">
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="h-12 rounded-full px-4 shadow-[0_16px_40px_rgba(3,12,32,0.45)]"
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          Copiloto Executivo
        </Button>
      )}

      {open && (
        <section className="w-[380px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border/80 bg-card/95 shadow-[0_30px_80px_rgba(2,8,23,0.55)] backdrop-blur-xl">
          <header className="border-b border-border/70 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Copiloto Executivo Contextual</p>
                  <p className="text-[11px] text-muted-foreground">
                    OpenAI com fallback contextual seguro, sempre orientado aos dados do Operion
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex rounded-lg border border-border/70 bg-background/70 p-0.5">
                <button
                  type="button"
                  className={`px-2 py-1 text-[11px] rounded-md ${
                    mode === "short"
                      ? "bg-primary/20 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMode("short")}
                >
                  Curta
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-[11px] rounded-md ${
                    mode === "detailed"
                      ? "bg-primary/20 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMode("detailed")}
                >
                  Detalhada
                </button>
              </div>
              {highlights.length > 0 && (
                <p className="text-[10px] text-muted-foreground text-right">Base: {highlights[0]}</p>
              )}
            </div>
          </header>

          <div className="max-h-[380px] overflow-y-auto space-y-3 px-4 py-3">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={
                    message.role === "user"
                      ? "ml-8 inline-block rounded-xl border border-primary/40 bg-primary/15 px-3 py-2 text-xs text-foreground"
                      : "mr-4 inline-block rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs text-foreground"
                  }
                >
                  {message.role === "assistant" ? renderAssistantMessage(message) : message.content}
                </div>

                {message.role === "assistant" && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {message.meta?.confidence && (
                      <Badge variant="outline" className={`text-[10px] ${confidenceClass(message.meta.confidence)}`}>
                        {confidenceLabel(message.meta.confidence)}
                      </Badge>
                    )}
                    {message.meta?.partial && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/50 bg-amber-500/10 text-amber-100">
                        Resposta parcial
                      </Badge>
                    )}
                    {message.meta?.mode && (
                      <Badge variant="outline" className="text-[10px]">
                        modo: {message.meta.mode === "short" ? "curta" : "detalhada"}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}

            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Sugestoes</p>
                <div className="grid gap-2">
                  {suggestions.slice(0, 5).map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void sendMessage(suggestion)}
                      className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-left text-xs text-foreground hover:bg-primary/10"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <footer className="border-t border-border/70 px-4 py-3 space-y-2">
            {highlights.length > 1 && (
              <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Resumo de contexto</p>
                <p className="text-[11px] text-muted-foreground">{highlights.slice(1).join(" | ")}</p>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Pergunte sobre risco, forecast, cobertura, clientes ou S&OP..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
              <Button
                onClick={() => void sendMessage()}
                disabled={loading || !input.trim()}
                className="h-9 w-9 p-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {loading && <p className="text-[11px] text-muted-foreground">Consolidando contexto executivo...</p>}
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </footer>
        </section>
      )}
    </div>
  );
}

