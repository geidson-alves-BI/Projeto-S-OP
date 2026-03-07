import type { AppState } from "@/contexts/AppDataContext";
import type { RMData } from "@/lib/rmEngine";
import type { ContextPack } from "@/types/analytics";
import type {
  ContextPackComponentStatus,
  ContextPackPersonaStatus,
  ContextPackSourceStatus,
  ContextPackViewModel,
} from "@/types/context-pack";

const FRIENDLY_NAME = "Contexto Executivo Consolidado";
const FRIENDLY_SUBTITLE = "Resumo estruturado para IA e decisao";
const FRIENDLY_DESCRIPTION =
  "Pacote de contexto analitico que consolida dados carregados, cobertura executiva e blocos prontos para IA, relatorios e recomendacoes por persona.";

const QUESTION_SUGGESTIONS = [
  "Quais sao os principais riscos desta operacao?",
  "O que um CFO deveria priorizar nesta base?",
  "Existem candidatos relevantes para MTS?",
  "Onde esta a maior concentracao de volume?",
  "Quais lacunas impedem uma analise executiva mais robusta?",
];

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

function buildSources(raw: ContextPack | null, state: AppState | null, rmData: RMData[] | null) {
  const hasStrategy = Boolean(raw?.inputs_available?.strategy_report) || Boolean(state?.products.length);
  const hasForecast = Boolean(raw?.inputs_available?.forecast);
  const hasBom = Boolean(raw?.inputs_available?.bom);
  const hasSimulation = Boolean(raw?.inputs_available?.mts_simulation);
  const hasRawMaterial = Boolean(raw?.inputs_available?.raw_material_forecast) || Boolean(rmData?.length);
  const hasFinancial = hasContent(raw?.financial_impact) || hasSimulation;
  const hasClientes = Boolean(state?.hasClientes);

  const sources: ContextPackSourceStatus[] = [
    {
      key: "fg",
      label: "FG / producao",
      available: Boolean(state?.products.length),
      detail: state?.products.length
        ? `${state.products.length} SKUs e ${state.monthCols.length} meses carregados.`
        : "Sem base FG: resumo executivo e priorizacao indisponiveis.",
    },
    {
      key: "clientes",
      label: "Clientes",
      available: hasClientes,
      detail: hasClientes
        ? `${state?.clientes.length ?? 0} clientes integrados na leitura atual.`
        : "Sem base de clientes: concentracao comercial limitada.",
    },
    {
      key: "abc_xyz",
      label: "Classificacao ABC/XYZ",
      available: hasStrategy,
      detail: hasStrategy
        ? "Segmentacao disponivel para priorizacao de portfolio."
        : "Sem ABC/XYZ consolidado: a leitura de criticidade fica parcial.",
    },
    {
      key: "forecast",
      label: "Forecast consolidado",
      available: hasForecast,
      detail: hasForecast
        ? "Leitura de tendencia disponivel para antecipar demanda."
        : "Sem forecast consolidado: leitura de tendencia limitada.",
    },
    {
      key: "mts_mto",
      label: "Simulacao MTS/MTO",
      available: hasSimulation || hasStrategy,
      detail: hasSimulation || hasStrategy
        ? "Politica de atendimento com sinais suficientes para decisao inicial."
        : "Sem simulacao MTS/MTO: recomendacao de politica parcial.",
    },
    {
      key: "materia_prima",
      label: "Materia-prima",
      available: hasRawMaterial,
      detail: hasRawMaterial
        ? "Cobertura de insumo disponivel para leitura de abastecimento."
        : "Sem base de materia-prima: cobertura de insumo indisponivel.",
    },
    {
      key: "bom",
      label: "BOM",
      available: hasBom,
      detail: hasBom
        ? "Estrutura de insumo carregada para cruzamentos de dependencia."
        : "Sem BOM carregada: dependencias de insumo ficam incompletas.",
    },
    {
      key: "financeiro",
      label: "Impacto financeiro",
      available: hasFinancial,
      detail: hasFinancial
        ? "Custo e investimento ja podem ser refletidos no contexto."
        : "Sem camada financeira consolidada: leitura de caixa fica parcial.",
    },
  ];

  return {
    sources,
    flags: {
      hasStrategy,
      hasForecast,
      hasBom,
      hasSimulation,
      hasRawMaterial,
      hasFinancial,
      hasClientes,
    },
  };
}

function buildComponents(
  raw: ContextPack | null,
  state: AppState | null,
  rmData: RMData[] | null,
  sourceFlags: ReturnType<typeof buildSources>["flags"],
) {
  const monthlyHistoryAvailable = Boolean(state?.monthCols.length);
  const topProductsAvailable = hasContent(raw?.top_products) || Boolean(state?.products.length);
  const rawMaterialImpactAvailable = hasContent(raw?.raw_material_impact) || Boolean(rmData?.length);
  const financialImpactAvailable = hasContent(raw?.financial_impact) || sourceFlags.hasFinancial;
  const dataQualityFlags = raw?.data_quality?.flags ?? [];

  const components: ContextPackComponentStatus[] = [
    {
      key: "executive_summary",
      label: "Resumo executivo",
      available: Boolean(state?.products.length),
      detail: state?.products.length
        ? "Sintese executiva montada a partir do portfolio carregado."
        : "Depende da base FG para sintetizar o ciclo.",
    },
    {
      key: "abc_xyz",
      label: "Segmentacao ABC/XYZ",
      available: sourceFlags.hasStrategy,
      detail: sourceFlags.hasStrategy
        ? "Priorizacao por criticidade e estabilidade disponivel."
        : "Sem classificacao consolidada para segmentacao executiva.",
    },
    {
      key: "priority_products",
      label: "Produtos prioritarios",
      available: topProductsAvailable,
      detail: topProductsAvailable
        ? "Top produtos e itens de maior impacto prontos para leitura."
        : "Sem recorte de produtos prioritarios consolidado.",
    },
    {
      key: "monthly_history",
      label: "Historico mensal",
      available: monthlyHistoryAvailable,
      detail: monthlyHistoryAvailable
        ? `${state?.monthCols.length ?? 0} meses disponiveis para leitura temporal.`
        : "Sem historico mensal suficiente para leitura de tendencia.",
    },
    {
      key: "mts_mto_strategy",
      label: "Estrategia MTS/MTO",
      available: sourceFlags.hasStrategy,
      detail: sourceFlags.hasStrategy
        ? "Politica de atendimento pronta para desdobramento por SKU."
        : "Sem recomendacao consolidada de politica de atendimento.",
    },
    {
      key: "raw_material_impact",
      label: "Impacto de materia-prima",
      available: rawMaterialImpactAvailable,
      detail: rawMaterialImpactAvailable
        ? "Riscos de insumo e cobertura podem entrar na decisao."
        : "Sem impacto de materia-prima consolidado no contexto.",
    },
    {
      key: "financial_impact",
      label: "Impacto financeiro",
      available: financialImpactAvailable,
      detail: financialImpactAvailable
        ? "Custos e investimento ja podem apoiar CFO e CEO."
        : "Sem impacto financeiro consolidado para leitura executiva.",
    },
    {
      key: "data_quality",
      label: "Qualidade dos dados",
      available: true,
      detail:
        dataQualityFlags.length > 0
          ? `${dataQualityFlags.length} alerta(s) de qualidade monitorados no contexto.`
          : "Sem flags criticas de qualidade registradas no contexto.",
    },
    {
      key: "persona_recommendations",
      label: "Recomendacao por persona",
      available: Boolean(state?.products.length),
      detail: state?.products.length
        ? "A camada executiva ja consegue sustentar leituras por persona."
        : "Sem base suficiente para leituras executivas personalizadas.",
    },
  ];

  return {
    components,
    componentsAvailable: components.filter((component) => component.available),
    componentsMissing: components.filter((component) => !component.available),
  };
}

function buildPersonas(
  sourceFlags: ReturnType<typeof buildSources>["flags"],
  monthlyHistoryAvailable: boolean,
) {
  const personas: ContextPackPersonaStatus[] = [
    {
      key: "SUPPLY",
      label: "Supply",
      ready: sourceFlags.hasStrategy && monthlyHistoryAvailable,
      detail:
        sourceFlags.hasStrategy && monthlyHistoryAvailable
          ? "Leitura de criticidade, mix e politica pronta para Supply."
          : "Supply ainda precisa de classificacao e historico consolidados.",
    },
    {
      key: "CFO",
      label: "CFO",
      ready: sourceFlags.hasStrategy && sourceFlags.hasFinancial,
      detail:
        sourceFlags.hasStrategy && sourceFlags.hasFinancial
          ? "Leitura de custo, investimento e impacto pronta para CFO."
          : "CFO ainda depende de camada financeira consolidada.",
    },
    {
      key: "CEO",
      label: "CEO",
      ready: sourceFlags.hasStrategy && (sourceFlags.hasForecast || sourceFlags.hasClientes),
      detail:
        sourceFlags.hasStrategy && (sourceFlags.hasForecast || sourceFlags.hasClientes)
          ? "Resumo executivo com contexto comercial e tendencia suficiente para CEO."
          : "CEO ainda depende de forecast ou concentracao comercial mais robusta.",
    },
    {
      key: "COO",
      label: "COO",
      ready: sourceFlags.hasStrategy && (sourceFlags.hasForecast || sourceFlags.hasRawMaterial),
      detail:
        sourceFlags.hasStrategy && (sourceFlags.hasForecast || sourceFlags.hasRawMaterial)
          ? "Execucao operacional com capacidade, tendencia e insumo pronta para COO."
          : "COO ainda depende de forecast ou cobertura de insumo.",
    },
  ];

  return personas;
}

export function getContextPackStatusLabel(status: ContextPackViewModel["status"]) {
  if (status === "ready") return "Pronto";
  if (status === "partial") return "Parcial";
  return "Nao gerado";
}

export function buildContextPackViewModel(
  raw: ContextPack | null,
  state: AppState | null,
  rmData: RMData[] | null,
): ContextPackViewModel {
  const { sources, flags } = buildSources(raw, state, rmData);
  const { components, componentsAvailable, componentsMissing } = buildComponents(raw, state, rmData, flags);
  const monthlyHistoryAvailable = Boolean(state?.monthCols.length);
  const personasReady = buildPersonas(flags, monthlyHistoryAvailable);

  const availableComponentsCount = componentsAvailable.length;
  const totalComponentsCount = components.length;
  const coveragePercent =
    totalComponentsCount > 0 ? Math.round((availableComponentsCount / totalComponentsCount) * 100) : 0;

  const generatedAt = raw?.generated_at ?? null;
  const status =
    !generatedAt && !state?.products.length && !rmData?.length
      ? "not-generated"
      : generatedAt && coveragePercent >= 75
        ? "ready"
        : "partial";

  const limitations = sources.filter((source) => !source.available).map((source) => source.detail);

  const summary =
    status === "ready"
      ? "O contexto executivo consolidado esta pronto para alimentar IA, relatorios e recomendacoes por persona."
      : status === "partial"
        ? "O contexto ja suporta leituras iniciais, mas ainda existem lacunas que limitam a profundidade da recomendacao executiva."
        : "O contexto analitico ainda nao foi consolidado. Carregue dados e gere o pacote para liberar IA e relatorios.";

  return {
    friendlyName: FRIENDLY_NAME,
    subtitle: FRIENDLY_SUBTITLE,
    description: FRIENDLY_DESCRIPTION,
    status,
    generatedAt,
    inputsAvailable: sources,
    componentsAvailable,
    componentsMissing,
    coveragePercent,
    availableComponentsCount,
    totalComponentsCount,
    summary,
    dataQuality: {
      status: raw?.data_quality?.status ?? (limitations.length === 0 ? "ok" : "partial"),
      flags: raw?.data_quality?.flags ?? [],
    },
    personasReady,
    limitations,
    questionSuggestions: QUESTION_SUGGESTIONS,
    raw,
  };
}
