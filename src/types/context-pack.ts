import type { ContextPack } from "@/types/analytics";

export type ContextPackStatus = "not-generated" | "partial" | "ready";

export type ContextPackSourceKey =
  | "fg"
  | "clientes"
  | "abc_xyz"
  | "forecast"
  | "mts_mto"
  | "materia_prima"
  | "bom"
  | "financeiro";

export type ContextPackComponentKey =
  | "executive_summary"
  | "abc_xyz"
  | "priority_products"
  | "monthly_history"
  | "mts_mto_strategy"
  | "raw_material_impact"
  | "financial_impact"
  | "data_quality"
  | "persona_recommendations";

export type ContextPackPersonaKey = "SUPPLY" | "CFO" | "CEO" | "COO";

export type ContextPackSourceStatus = {
  key: ContextPackSourceKey;
  label: string;
  available: boolean;
  detail: string;
};

export type ContextPackComponentStatus = {
  key: ContextPackComponentKey;
  label: string;
  available: boolean;
  detail: string;
};

export type ContextPackPersonaStatus = {
  key: ContextPackPersonaKey;
  label: string;
  ready: boolean;
  detail: string;
};

export type ContextPackViewModel = {
  friendlyName: string;
  subtitle: string;
  description: string;
  status: ContextPackStatus;
  generatedAt: string | null;
  inputsAvailable: ContextPackSourceStatus[];
  componentsAvailable: ContextPackComponentStatus[];
  componentsMissing: ContextPackComponentStatus[];
  coveragePercent: number;
  availableComponentsCount: number;
  totalComponentsCount: number;
  summary: string;
  dataQuality: {
    status: string;
    flags: string[];
  };
  personasReady: ContextPackPersonaStatus[];
  limitations: string[];
  questionSuggestions: string[];
  raw: ContextPack | null;
};
