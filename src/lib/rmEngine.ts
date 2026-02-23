// RM (Raw Material) Engine — Data Processing for Matéria-Prima module

export interface RawRMRow {
  [key: string]: string | number | undefined;
}

export interface RMData {
  codigoRM: string;
  descricao: string;
  unidade: string;
  leadTimeDias: number;
  consumoMensal: number;
  custoUnitario: number;
  estoqueAtual: number;
  // Calculated
  consumoDiario: number;
  coberturaDias: number;
  slaTargets: Record<number, number>; // SLA% -> qty needed
}

// Required columns for RM upload
const RM_REQUIRED_COLS = [
  "Código RM",
  "Descrição",
  "Unidade",
  "Consumo Mensal",
];

const RM_ALIAS: Record<string, string> = {
  "codigo rm": "Código RM",
  "código rm": "Código RM",
  "codigo_rm": "Código RM",
  "cod rm": "Código RM",
  "descricao": "Descrição",
  "descrição": "Descrição",
  "desc": "Descrição",
  "unidade": "Unidade",
  "un": "Unidade",
  "consumo mensal": "Consumo Mensal",
  "consumo_mensal": "Consumo Mensal",
  "consumo mes": "Consumo Mensal",
  "lead time": "Lead Time",
  "lead_time": "Lead Time",
  "leadtime": "Lead Time",
  "lead time dias": "Lead Time",
  "custo unitario": "Custo Unitário",
  "custo unitário": "Custo Unitário",
  "custo_unitario": "Custo Unitário",
  "preco": "Custo Unitário",
  "preço": "Custo Unitário",
  "estoque atual": "Estoque Atual",
  "estoque_atual": "Estoque Atual",
  "estoque": "Estoque Atual",
  "saldo": "Estoque Atual",
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\n\t]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
}

function coerceNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/,/g, ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export function validateRMColumns(rawCols: string[]): { valid: boolean; missing: string[]; rename: Record<string, string> } {
  const rename: Record<string, string> = {};

  for (const col of rawCols) {
    const key = normalize(col);
    if (RM_ALIAS[key]) {
      rename[col] = RM_ALIAS[key];
    }
    // Also try exact match
    for (const [alias, target] of Object.entries(RM_ALIAS)) {
      if (key === alias) {
        rename[col] = target;
      }
    }
  }

  // Check which required cols are present (directly or via alias)
  const resolvedCols = new Set([
    ...rawCols.map(c => c.trim()),
    ...Object.values(rename),
  ]);

  const missing = RM_REQUIRED_COLS.filter(req => !resolvedCols.has(req));

  return { valid: missing.length === 0, missing, rename };
}

// SLA Z-scores for normal distribution approximation
const SLA_Z: Record<number, number> = {
  90: 1.28,
  95: 1.65,
  98: 2.05,
  99: 2.33,
};

export function processRM(rawRows: RawRMRow[], rename: Record<string, string>): RMData[] {
  return rawRows.map(raw => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      r[rename[k] ?? k] = v;
    }

    const consumoMensal = coerceNum(r["Consumo Mensal"]);
    const consumoDiario = consumoMensal / 30;
    const leadTime = coerceNum(r["Lead Time"]);
    const estoqueAtual = coerceNum(r["Estoque Atual"]);
    const cobertura = consumoDiario > 0 ? estoqueAtual / consumoDiario : 0;

    // Calculate SLA targets: safety stock = Z * σ * √LT + (consumoDiario * LT)
    // Simplified: assume CV=0.3 for demand variability
    const cv = 0.3;
    const sigma = consumoDiario * cv;
    const slaTargets: Record<number, number> = {};
    for (const [sla, z] of Object.entries(SLA_Z)) {
      const safetyStock = z * sigma * Math.sqrt(leadTime || 1);
      const reorderPoint = consumoDiario * (leadTime || 1) + safetyStock;
      slaTargets[Number(sla)] = Math.round(reorderPoint);
    }

    return {
      codigoRM: String(r["Código RM"] ?? "").trim(),
      descricao: String(r["Descrição"] ?? "").trim(),
      unidade: String(r["Unidade"] ?? "").trim(),
      leadTimeDias: leadTime,
      consumoMensal,
      custoUnitario: coerceNum(r["Custo Unitário"]),
      estoqueAtual,
      consumoDiario,
      coberturaDias: Math.round(cobertura),
      slaTargets,
    };
  }).filter(rm => rm.codigoRM !== "");
}

export function getRMSummary(rmData: RMData[], slaLevel: number) {
  const total = rmData.length;
  const belowSLA = rmData.filter(rm => rm.estoqueAtual < (rm.slaTargets[slaLevel] ?? 0));
  const aboveSLA = rmData.filter(rm => rm.estoqueAtual >= (rm.slaTargets[slaLevel] ?? 0));
  const investimentoTotal = belowSLA.reduce((s, rm) => {
    const gap = (rm.slaTargets[slaLevel] ?? 0) - rm.estoqueAtual;
    return s + Math.max(0, gap) * rm.custoUnitario;
  }, 0);

  return {
    total,
    belowSLA: belowSLA.length,
    aboveSLA: aboveSLA.length,
    investimentoTotal,
    coberturMedia: total > 0
      ? Math.round(rmData.reduce((s, rm) => s + rm.coberturaDias, 0) / total)
      : 0,
  };
}
