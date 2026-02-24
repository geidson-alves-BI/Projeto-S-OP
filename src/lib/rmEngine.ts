// RM (Raw Material) Engine — Data Processing for Matéria-Prima module

export interface RawRMRow {
  [key: string]: string | number | undefined;
}

export interface RMData {
  // Identificação
  codProduto: string;
  denominacao: string;
  fornecedor: string;
  origem: string;
  // Estoque
  estoqueDisponivel: number;  // SE
  estoqueSeguranca: number;   // ES
  estoquePedido: number;      // PC aberto
  // Consumo
  consumo30d: number;
  consumo90d: number;
  consumo180d: number;
  consumo365d: number;
  cm90d: number;
  cm180d: number;
  cm365d: number;
  // Lead Time
  tempoReposicao: number;     // TR em dias
  // Financeiro
  custoLiquidoUS: number;
  qtdCompraUltimoAno: number;
  valorEstoqueUS90d: number;
  valorEstoqueUS180d: number;
  // Calculated
  consumoDiario: number;
  coberturaDias: number;
  slaTargets: Record<number, number>;
}

// Required columns for RM upload
const RM_REQUIRED_COLS = [
  "Cód. Produto",
  "Denominação",
  "Consumo Total 30 Dias",
  "Estoque Disponível (SE)",
];

const RM_ALIAS: Record<string, string> = {
  // Identificação
  "cod. produto": "Cód. Produto",
  "cod produto": "Cód. Produto",
  "codigo produto": "Cód. Produto",
  "código produto": "Cód. Produto",
  "cod_produto": "Cód. Produto",
  "codigo": "Cód. Produto",
  "código": "Cód. Produto",
  "denominacao": "Denominação",
  "denominação": "Denominação",
  "descricao": "Denominação",
  "descrição": "Denominação",
  "fornecedor": "Fornecedor",
  "origem": "Origem",
  // Estoque
  "estoque disponivel (se)": "Estoque Disponível (SE)",
  "estoque disponível (se)": "Estoque Disponível (SE)",
  "estoque disponivel": "Estoque Disponível (SE)",
  "estoque disponível": "Estoque Disponível (SE)",
  "estoque_disponivel": "Estoque Disponível (SE)",
  "se": "Estoque Disponível (SE)",
  "estoque seguranca (es)": "Estoque Segurança (ES)",
  "estoque segurança (es)": "Estoque Segurança (ES)",
  "estoque seguranca": "Estoque Segurança (ES)",
  "estoque segurança": "Estoque Segurança (ES)",
  "estoque_seguranca": "Estoque Segurança (ES)",
  "es": "Estoque Segurança (ES)",
  "estoque em pedido (pc aberto)": "Estoque em Pedido (PC aberto)",
  "estoque em pedido": "Estoque em Pedido (PC aberto)",
  "estoque_pedido": "Estoque em Pedido (PC aberto)",
  "pc aberto": "Estoque em Pedido (PC aberto)",
  // Consumo
  "consumo total 30 dias": "Consumo Total 30 Dias",
  "consumo 30 dias": "Consumo Total 30 Dias",
  "consumo_30d": "Consumo Total 30 Dias",
  "consumo total 90 dias": "Consumo Total 90 Dias",
  "consumo 90 dias": "Consumo Total 90 Dias",
  "consumo_90d": "Consumo Total 90 Dias",
  "consumo total 180 dias": "Consumo Total 180 Dias",
  "consumo 180 dias": "Consumo Total 180 Dias",
  "consumo_180d": "Consumo Total 180 Dias",
  "consumo total 365 dias": "Consumo Total 365 Dias",
  "consumo 365 dias": "Consumo Total 365 Dias",
  "consumo_365d": "Consumo Total 365 Dias",
  "cm - consumo medio 90 dias": "CM - Consumo Médio 90 Dias",
  "cm - consumo médio 90 dias": "CM - Consumo Médio 90 Dias",
  "cm consumo medio 90 dias": "CM - Consumo Médio 90 Dias",
  "cm_90d": "CM - Consumo Médio 90 Dias",
  "cm - consumo medio 180 dias": "CM - Consumo Médio 180 Dias",
  "cm - consumo médio 180 dias": "CM - Consumo Médio 180 Dias",
  "cm consumo medio 180 dias": "CM - Consumo Médio 180 Dias",
  "cm_180d": "CM - Consumo Médio 180 Dias",
  "cm - consumo medio 365 dias": "CM - Consumo Médio 365 Dias",
  "cm - consumo médio 365 dias": "CM - Consumo Médio 365 Dias",
  "cm consumo medio 365 dias": "CM - Consumo Médio 365 Dias",
  "cm_365d": "CM - Consumo Médio 365 Dias",
  // Lead Time
  "tempo reposicao (tr)": "Tempo Reposição (TR)",
  "tempo reposição (tr)": "Tempo Reposição (TR)",
  "tempo reposicao": "Tempo Reposição (TR)",
  "tempo reposição": "Tempo Reposição (TR)",
  "tempo_reposicao": "Tempo Reposição (TR)",
  "tr": "Tempo Reposição (TR)",
  "lead time": "Tempo Reposição (TR)",
  "lead_time": "Tempo Reposição (TR)",
  "leadtime": "Tempo Reposição (TR)",
  // Financeiro
  "custo liquido ultima entrada u$": "Custo Líquido Última Entrada U$",
  "custo líquido última entrada u$": "Custo Líquido Última Entrada U$",
  "custo liquido ultima entrada us": "Custo Líquido Última Entrada U$",
  "custo_liquido_us": "Custo Líquido Última Entrada U$",
  "qtd compra ultimo ano": "QTD Compra Último Ano",
  "qtd compra último ano": "QTD Compra Último Ano",
  "qtd_compra_ultimo_ano": "QTD Compra Último Ano",
  "valor estoque u$ 90 dias": "Valor Estoque U$ 90 Dias",
  "valor estoque us 90 dias": "Valor Estoque U$ 90 Dias",
  "valor_estoque_us_90d": "Valor Estoque U$ 90 Dias",
  "valor estoque u$ 180 dias": "Valor Estoque U$ 180 Dias",
  "valor estoque us 180 dias": "Valor Estoque U$ 180 Dias",
  "valor_estoque_us_180d": "Valor Estoque U$ 180 Dias",
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\n\t]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s$]/g, "");
}

function coerceNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/,/g, ".").replace(/[^\d.\-]/g, "");
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
    for (const [alias, target] of Object.entries(RM_ALIAS)) {
      if (key === alias) {
        rename[col] = target;
      }
    }
  }

  const resolvedCols = new Set([
    ...rawCols.map(c => c.trim()),
    ...Object.values(rename),
  ]);

  const missing = RM_REQUIRED_COLS.filter(req => !resolvedCols.has(req));

  return { valid: missing.length === 0, missing, rename };
}

// SLA Z-scores for normal distribution approximation
const SLA_Z: Record<number, number> = {
  50: 0,
  84: 1,
  98: 2,
  99.9: 3,
};

export function processRM(rawRows: RawRMRow[], rename: Record<string, string>): RMData[] {
  return rawRows.map(raw => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      r[rename[k] ?? k] = v;
    }

    const consumo30d = coerceNum(r["Consumo Total 30 Dias"]);
    const consumo90d = coerceNum(r["Consumo Total 90 Dias"]);
    const consumo180d = coerceNum(r["Consumo Total 180 Dias"]);
    const consumo365d = coerceNum(r["Consumo Total 365 Dias"]);
    const cm90d = coerceNum(r["CM - Consumo Médio 90 Dias"]);
    const cm180d = coerceNum(r["CM - Consumo Médio 180 Dias"]);
    const cm365d = coerceNum(r["CM - Consumo Médio 365 Dias"]);

    const consumoDiario = consumo30d / 30;
    const estoqueDisponivel = coerceNum(r["Estoque Disponível (SE)"]);
    const estoqueSeguranca = coerceNum(r["Estoque Segurança (ES)"]);
    const estoquePedido = coerceNum(r["Estoque em Pedido (PC aberto)"]);
    const tempoReposicao = coerceNum(r["Tempo Reposição (TR)"]);
    const custoLiquidoUS = coerceNum(r["Custo Líquido Última Entrada U$"]);

    const cobertura = consumoDiario > 0 ? estoqueDisponivel / consumoDiario : 0;

    // SLA targets: safety stock = Z * σ * √TR + (consumoDiario * TR)
    // CV derived from consumption variability across periods, fallback 0.3
    const cv = cm90d > 0 && cm180d > 0
      ? Math.abs(cm90d - cm180d) / ((cm90d + cm180d) / 2)
      : 0.3;
    const sigma = consumoDiario * Math.max(cv, 0.1);
    const lt = tempoReposicao || 1;
    const slaTargets: Record<number, number> = {};
    for (const [sla, z] of Object.entries(SLA_Z)) {
      const safetyStock = z * sigma * Math.sqrt(lt);
      const reorderPoint = consumoDiario * lt + safetyStock;
      slaTargets[Number(sla)] = Math.round(reorderPoint);
    }

    return {
      codProduto: String(r["Cód. Produto"] ?? "").trim(),
      denominacao: String(r["Denominação"] ?? "").trim(),
      fornecedor: String(r["Fornecedor"] ?? "").trim(),
      origem: String(r["Origem"] ?? "").trim(),
      estoqueDisponivel,
      estoqueSeguranca,
      estoquePedido,
      consumo30d,
      consumo90d,
      consumo180d,
      consumo365d,
      cm90d,
      cm180d,
      cm365d,
      tempoReposicao,
      custoLiquidoUS,
      qtdCompraUltimoAno: coerceNum(r["QTD Compra Último Ano"]),
      valorEstoqueUS90d: coerceNum(r["Valor Estoque U$ 90 Dias"]),
      valorEstoqueUS180d: coerceNum(r["Valor Estoque U$ 180 Dias"]),
      consumoDiario,
      coberturaDias: Math.round(cobertura),
      slaTargets,
    };
  }).filter(rm => rm.codProduto !== "");
}

export function getRMSummary(rmData: RMData[], slaLevel: number) {
  const total = rmData.length;
  const belowSLA = rmData.filter(rm => rm.estoqueDisponivel < (rm.slaTargets[slaLevel] ?? 0));
  const aboveSLA = rmData.filter(rm => rm.estoqueDisponivel >= (rm.slaTargets[slaLevel] ?? 0));
  const investimentoTotal = belowSLA.reduce((s, rm) => {
    const gap = (rm.slaTargets[slaLevel] ?? 0) - rm.estoqueDisponivel;
    return s + Math.max(0, gap) * rm.custoLiquidoUS;
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
