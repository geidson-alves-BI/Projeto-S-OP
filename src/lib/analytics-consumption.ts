export type AnalyticsResourceState = "loading" | "ready" | "partial" | "empty" | "unavailable";

export type AnalyticsResourceAvailability = {
  state: AnalyticsResourceState;
  hasContent: boolean;
  isPartial: boolean;
  isEmpty: boolean;
  hasError: boolean;
  message: string | null;
};

export type BuildAnalyticsAvailabilityParams = {
  loading: boolean;
  error: string | null;
  hasContent: boolean;
  isPartial?: boolean;
  isEmpty?: boolean;
  messages?: {
    partial?: string;
    unavailable?: string;
    empty?: string;
  };
};

export function normalizeAnalyticsError(error: unknown, fallback = "Falha ao consultar a analise.") {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  const raw = String(error ?? "").trim();
  return raw || fallback;
}

const TECHNICAL_COPY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcamada\s+v2\b/gi, "camada principal"],
  [/\banalytics\s+v2\b/gi, "camada analitica principal"],
  [/\bv2\b/gi, "camada principal"],
  [/\bengine\b/gi, "analise"],
  [/\bregistry\b/gi, "cadastro"],
  [/\bsnapshot\b/gi, "resumo"],
  [/\bcompute\b/gi, "calculo"],
  [/\bbackend-first\b/gi, "padrao oficial"],
];

export function sanitizeProductCopy(text: string) {
  let normalized = String(text ?? "");
  for (const [pattern, replacement] of TECHNICAL_COPY_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s{2,}/g, " ").trim();
}

export function buildAnalyticsAvailability(
  params: BuildAnalyticsAvailabilityParams,
): AnalyticsResourceAvailability {
  const {
    loading,
    error,
    hasContent,
    isPartial = false,
    isEmpty = false,
    messages,
  } = params;

  if (loading) {
    return {
      state: "loading",
      hasContent,
      isPartial,
      isEmpty,
      hasError: false,
      message: null,
    };
  }

  if (error && !hasContent) {
    return {
      state: "unavailable",
      hasContent,
      isPartial,
      isEmpty,
      hasError: true,
      message: messages?.unavailable ?? error,
    };
  }

  if (isEmpty) {
    return {
      state: "empty",
      hasContent,
      isPartial,
      isEmpty,
      hasError: Boolean(error),
      message: messages?.empty ?? null,
    };
  }

  if (error || isPartial) {
    return {
      state: "partial",
      hasContent,
      isPartial: true,
      isEmpty,
      hasError: Boolean(error),
      message: messages?.partial ?? error,
    };
  }

  return {
    state: "ready",
    hasContent,
    isPartial,
    isEmpty,
    hasError: false,
    message: null,
  };
}
