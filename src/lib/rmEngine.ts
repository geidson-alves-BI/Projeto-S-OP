// RM (Raw Material) Engine - Data Processing for Materia-Prima module

export interface RawRMRow {
  [key: string]: string | number | undefined;
}

type RMColumnType = "Texto" | "Numerico" | "Booleano" | "Data";

export interface RMDataDictionaryItem {
  group: string;
  col: string;
  field: string;
  tipo: RMColumnType;
  obrigatorio: boolean;
  desc: string;
  aliases?: string[];
}

export const RM_DATA_DICTIONARY: RMDataDictionaryItem[] = [
  { group: "Identificacao", col: "Cód. Produto", field: "cod_produto", tipo: "Texto", obrigatorio: true, desc: "Chave principal do material", aliases: ["Cod. Produto", "Cod Produto", "Codigo Produto", "Cód Produto", "Código Produto", "Código RM", "Cod RM", "cod_rm", "rm_code"] },
  { group: "Identificacao", col: "Denominacão", field: "denominacao", tipo: "Texto", obrigatorio: true, desc: "Descricao do item", aliases: ["Denominação", "Denominacao", "Descrição", "Descricao"] },
  { group: "Identificacao", col: "Desc. Grupo", field: "desc_grupo", tipo: "Texto", obrigatorio: true, desc: "Grupo/categoria do material", aliases: ["Desc Grupo", "Grupo", "Origem"] },
  { group: "Identificacao", col: "Unid. Medida", field: "unid_medida", tipo: "Texto", obrigatorio: true, desc: "Unidade de medida", aliases: ["Unid Medida", "Unidade Medida", "Unidade"] },

  { group: "Estoque e Pedido", col: "SEG - Saldo Estoque Geral Da Empresa", field: "seg_saldo_estoque_geral", tipo: "Numerico", obrigatorio: false, desc: "Saldo total na empresa" },
  { group: "Estoque e Pedido", col: "SE - Saldo Estoque Disponível Na Unidade Negócio Selecionada", field: "se_saldo_disponivel_un", tipo: "Numerico", obrigatorio: false, desc: "Saldo disponivel na unidade", aliases: ["Estoque Disponível (SE)", "Estoque Disponivel (SE)", "Estoque Disponível", "Estoque Disponivel", "SE"] },
  { group: "Estoque e Pedido", col: "SEQ - Salto Estoque Quarentena Para Unidade Negócio Selecionada", field: "seq_saldo_quarentena_un", tipo: "Numerico", obrigatorio: false, desc: "Saldo em quarentena", aliases: ["SEQ - Saldo Estoque Quarentena Para Unidade Negócio Selecionada"] },
  { group: "Estoque e Pedido", col: "ES - Estoque Segurança", field: "es_estoque_seguranca", tipo: "Numerico", obrigatorio: false, desc: "Estoque de seguranca", aliases: ["Estoque Segurança (ES)", "Estoque Seguranca (ES)", "ES"] },
  { group: "Estoque e Pedido", col: "PP - Ponto Pedido", field: "pp_ponto_pedido", tipo: "Numerico", obrigatorio: false, desc: "Ponto de reposicao", aliases: ["Ponto Pedido"] },
  { group: "Estoque e Pedido", col: "Necessario Pedido?", field: "necessario_pedido", tipo: "Booleano", obrigatorio: false, desc: "Indica necessidade de compra", aliases: ["Necessário Pedido?"] },
  { group: "Estoque e Pedido", col: "RC Pendentes", field: "rc_pendentes", tipo: "Numerico", obrigatorio: false, desc: "Requisicoes de compra pendentes" },
  { group: "Estoque e Pedido", col: "PC - Quantidade Produtos Com PC Aberto", field: "pc_abertos", tipo: "Numerico", obrigatorio: false, desc: "Quantidade em PCs abertos", aliases: ["Estoque em Pedido (PC aberto)", "PC aberto", "Estoque Pedido"] },

  { group: "Consumo e Planejamento", col: "Consumo Total 30 Dias", field: "consumo_total_30d", tipo: "Numerico", obrigatorio: false, desc: "Consumo acumulado 30 dias" },
  { group: "Consumo e Planejamento", col: "Consumo Total 90 Dias", field: "consumo_total_90d", tipo: "Numerico", obrigatorio: false, desc: "Consumo acumulado 90 dias" },
  { group: "Consumo e Planejamento", col: "Consumo Total 180 Dias", field: "consumo_total_180d", tipo: "Numerico", obrigatorio: false, desc: "Consumo acumulado 180 dias" },
  { group: "Consumo e Planejamento", col: "PV - Quantidade Usado Em PV em Abertos", field: "pv_usado_abertos", tipo: "Numerico", obrigatorio: false, desc: "Quantidade usada em PVs em aberto" },
  { group: "Consumo e Planejamento", col: "Quantidade Solicitada", field: "quantidade_solicitada", tipo: "Numerico", obrigatorio: false, desc: "Quantidade solicitada" },
  { group: "Consumo e Planejamento", col: "Consumo Total 365 Dias", field: "consumo_total_365d", tipo: "Numerico", obrigatorio: false, desc: "Consumo acumulado 365 dias" },
  { group: "Consumo e Planejamento", col: "CC - Ciclo Compras (Dias)", field: "cc_ciclo_compras_dias", tipo: "Numerico", obrigatorio: false, desc: "Ciclo de compras (dias)" },
  { group: "Consumo e Planejamento", col: "CM - Consumo Médio 90 Dias", field: "cm_90d", tipo: "Numerico", obrigatorio: false, desc: "Consumo medio 90 dias", aliases: ["CM - Consumo Medio 90 Dias"] },
  { group: "Consumo e Planejamento", col: "CM - Consumo Médio 180 Dias", field: "cm_180d", tipo: "Numerico", obrigatorio: false, desc: "Consumo medio 180 dias", aliases: ["CM - Consumo Medio 180 Dias"] },
  { group: "Consumo e Planejamento", col: "CM - Consumo Médio 270 Dias", field: "cm_270d", tipo: "Numerico", obrigatorio: false, desc: "Consumo medio 270 dias", aliases: ["CM - Consumo Medio 270 Dias"] },
  { group: "Consumo e Planejamento", col: "CM - Consumo Médio 365 Dias", field: "cm_365d", tipo: "Numerico", obrigatorio: false, desc: "Consumo medio 365 dias", aliases: ["CM - Consumo Medio 365 Dias"] },
  { group: "Consumo e Planejamento", col: "TR - Tempo Reposição", field: "tr_tempo_reposicao", tipo: "Numerico", obrigatorio: false, desc: "Lead time de reposicao (dias)", aliases: ["Tempo Reposição (TR)", "Tempo Reposicao (TR)", "Tempo Reposição", "Tempo Reposicao", "TR", "Lead Time"] },
  { group: "Consumo e Planejamento", col: "Fator Emergencial", field: "fator_emergencial", tipo: "Numerico", obrigatorio: false, desc: "Fator multiplicador emergencial" },
  { group: "Consumo e Planejamento", col: "TC - Tempo Cobertura - Dias", field: "tc_tempo_cobertura_dias", tipo: "Numerico", obrigatorio: false, desc: "Cobertura de estoque em dias", aliases: ["Cobertura (dias)"] },

  { group: "Financeiro e Fornecedor", col: "Custo Líquido U$", field: "custo_liquido_usd", tipo: "Numerico", obrigatorio: false, desc: "Custo liquido unitario (USD)", aliases: ["Custo Liquido U$", "Custo Liquido US$"] },
  { group: "Financeiro e Fornecedor", col: "Custo Líquido Última Entrada U$", field: "custo_liquido_ultima_entrada_usd", tipo: "Numerico", obrigatorio: false, desc: "Custo da ultima entrada (USD)", aliases: ["Custo Liquido Última Entrada U$", "Custo Liquido Ultima Entrada U$", "Custo Líquido Ultima Entrada U$"] },
  { group: "Financeiro e Fornecedor", col: "QTD Compra Último Ano", field: "qtd_compra_ultimo_ano", tipo: "Numerico", obrigatorio: false, desc: "Quantidade comprada no ultimo ano", aliases: ["QTD Compra Ultimo Ano"] },
  { group: "Financeiro e Fornecedor", col: "Valor Estoque U$ 180 Dias", field: "valor_estoque_usd_180d", tipo: "Numerico", obrigatorio: false, desc: "Valor de estoque para 180 dias" },
  { group: "Financeiro e Fornecedor", col: "Fornecedor Última Entrada", field: "fornecedor_ultima_entrada", tipo: "Texto", obrigatorio: false, desc: "Fornecedor da ultima entrada", aliases: ["Fornecedor Ultima Entrada", "Fornecedor"] },
  { group: "Financeiro e Fornecedor", col: "Valor Estoque U$ 90 Dias", field: "valor_estoque_usd_90d", tipo: "Numerico", obrigatorio: false, desc: "Valor de estoque para 90 dias" },
  { group: "Financeiro e Fornecedor", col: "Data Última Entrega", field: "data_ultima_entrega", tipo: "Data", obrigatorio: false, desc: "Data da ultima entrega", aliases: ["Data Ultima Entrega"] },
  { group: "Financeiro e Fornecedor", col: "Quantidade Última Entrada", field: "quantidade_ultima_entrada", tipo: "Numerico", obrigatorio: false, desc: "Quantidade da ultima entrada", aliases: ["Quantidade Ultima Entrada"] },
  { group: "Financeiro e Fornecedor", col: "Histórico Investimento Financeiro 12 Meses BRL", field: "hist_invest_fin_12m_brl", tipo: "Numerico", obrigatorio: false, desc: "Historico financeiro 12 meses em BRL", aliases: ["Historico Investimento Financeiro 12 Meses BRL"] },
  { group: "Financeiro e Fornecedor", col: "Histórico Investimento Financeiro USD 12 Meses", field: "hist_invest_fin_12m_usd", tipo: "Numerico", obrigatorio: false, desc: "Historico financeiro 12 meses em USD", aliases: ["Historico Investimento Financeiro USD 12 Meses"] },
];

const FIELD_TO_COL = RM_DATA_DICTIONARY.reduce<Record<string, string>>((acc, item) => {
  acc[item.field] = item.col;
  return acc;
}, {});

const COL_TO_FIELD = RM_DATA_DICTIONARY.reduce<Record<string, string>>((acc, item) => {
  acc[item.col] = item.field;
  return acc;
}, {});

const REQUIRED_FIELDS = new Set(
  RM_DATA_DICTIONARY.filter(item => item.obrigatorio).map(item => item.field),
);

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-z0-9 .\-/$?()]/g, "")
    .replace(/\s+/g, " ");
}

function toLookupKey(value: string): string {
  return normalizeHeader(value)
    .replace(/[.\-/$?()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHeaderLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  const register = (alias: string, canonical: string) => {
    const key = toLookupKey(alias);
    if (!key || lookup.has(key)) return;
    lookup.set(key, canonical);
  };

  for (const item of RM_DATA_DICTIONARY) {
    register(item.col, item.col);
    for (const alias of item.aliases ?? []) {
      register(alias, item.col);
    }
  }
  return lookup;
}

const HEADER_LOOKUP = buildHeaderLookup();

export interface RMData {
  // Campos de compatibilidade (usados pelas telas existentes)
  codProduto: string;
  denominacao: string;
  fornecedor: string;
  origem: string;
  estoqueDisponivel: number;
  estoqueSeguranca: number;
  estoquePedido: number;
  consumo30d: number;
  consumo90d: number;
  consumo180d: number;
  consumo365d: number;
  cm90d: number;
  cm180d: number;
  cm365d: number;
  tempoReposicao: number;
  custoLiquidoUS: number;
  qtdCompraUltimoAno: number;
  valorEstoqueUS90d: number;
  valorEstoqueUS180d: number;
  consumoDiario: number;
  coberturaDias: number;
  slaTargets: Record<number, number>;

  // Dicionario novo (snake_case)
  cod_produto: string;
  desc_grupo: string;
  unid_medida: string;
  seg_saldo_estoque_geral: number;
  se_saldo_disponivel_un: number;
  seq_saldo_quarentena_un: number;
  es_estoque_seguranca: number;
  pp_ponto_pedido: number;
  necessario_pedido: boolean | null;
  rc_pendentes: number;
  pc_abertos: number;
  consumo_total_30d: number;
  consumo_total_90d: number;
  consumo_total_180d: number;
  pv_usado_abertos: number;
  quantidade_solicitada: number;
  consumo_total_365d: number;
  cc_ciclo_compras_dias: number;
  cm_90d: number;
  cm_180d: number;
  cm_270d: number;
  cm_365d: number;
  tr_tempo_reposicao: number;
  fator_emergencial: number;
  tc_tempo_cobertura_dias: number;
  custo_liquido_usd: number;
  custo_liquido_ultima_entrada_usd: number;
  qtd_compra_ultimo_ano: number;
  valor_estoque_usd_180d: number;
  fornecedor_ultima_entrada: string;
  valor_estoque_usd_90d: number;
  data_ultima_entrega: Date | null;
  quantidade_ultima_entrada: number;
  hist_invest_fin_12m_brl: number;
  hist_invest_fin_12m_usd: number;
}

function coerceText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function coerceNum(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let text = String(value).trim();
  if (!text) return 0;

  const negativeByParens = /^\(.*\)$/.test(text);
  text = text.replace(/[()]/g, "");
  text = text.replace(/\s+/g, "");
  text = text.replace(/[^0-9,.-]/g, "");
  if (!text) return 0;

  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(/,/g, ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    const commaCount = (text.match(/,/g) ?? []).length;
    const decimalPart = text.slice(text.lastIndexOf(",") + 1);
    if (commaCount > 1 || decimalPart.length === 3) {
      text = text.replace(/,/g, "");
    } else {
      text = text.replace(/,/g, ".");
    }
  } else if ((text.match(/\./g) ?? []).length > 1) {
    text = text.replace(/\./g, "");
  }

  const num = Number(text);
  if (!Number.isFinite(num)) return 0;
  return negativeByParens ? -Math.abs(num) : num;
}

function coerceBool(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  const key = toLookupKey(String(value));
  if (["sim", "s", "1", "true", "t", "yes", "y"].includes(key)) return true;
  if (["nao", "n", "0", "false", "f", "no"].includes(key)) return false;
  return null;
}

function dateFromExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial * 24 * 60 * 60 * 1000));
  return Number.isNaN(date.getTime()) ? null : date;
}

function coerceDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return dateFromExcelSerial(value);

  const text = String(value).trim();
  if (!text) return null;

  const br = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serialDate = dateFromExcelSerial(Number(text));
    if (serialDate) return serialDate;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface RMColumnValidation {
  valid: boolean;
  missing: string[];
  rename: Record<string, string>;
  unmapped: string[];
}

export function validateRMColumns(rawCols: string[]): RMColumnValidation {
  const rename: Record<string, string> = {};
  const foundFields = new Set<string>();
  const unmapped: string[] = [];

  for (const col of rawCols) {
    const canonical = HEADER_LOOKUP.get(toLookupKey(col));
    if (!canonical) {
      unmapped.push(col);
      continue;
    }
    rename[col] = canonical;
    const field = COL_TO_FIELD[canonical];
    if (field) foundFields.add(field);
  }

  const missingFields = Array.from(REQUIRED_FIELDS).filter(field => !foundFields.has(field));
  const missing = missingFields.map(field => FIELD_TO_COL[field]);

  return {
    valid: missing.length === 0,
    missing,
    rename,
    unmapped,
  };
}

function applyRename(raw: RawRMRow, rename: Record<string, string>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    row[rename[key] ?? key] = value;
  }
  return row;
}

function pick(row: Record<string, unknown>, field: string): unknown {
  return row[FIELD_TO_COL[field]];
}

// SLA Z-scores for normal distribution approximation
const SLA_Z: Record<number, number> = {
  50: 0,
  84: 1,
  98: 2,
  99.9: 3,
};

export function processRM(rawRows: RawRMRow[], rename: Record<string, string> = {}): RMData[] {
  return rawRows
    .map(raw => {
      const row = applyRename(raw, rename);

      const cod_produto = coerceText(pick(row, "cod_produto"));
      const denominacao = coerceText(pick(row, "denominacao"));
      const desc_grupo = coerceText(pick(row, "desc_grupo"));
      const unid_medida = coerceText(pick(row, "unid_medida"));

      const seg_saldo_estoque_geral = coerceNum(pick(row, "seg_saldo_estoque_geral"));
      const se_saldo_disponivel_un = coerceNum(pick(row, "se_saldo_disponivel_un"));
      const seq_saldo_quarentena_un = coerceNum(pick(row, "seq_saldo_quarentena_un"));
      const es_estoque_seguranca = coerceNum(pick(row, "es_estoque_seguranca"));
      const pp_ponto_pedido = coerceNum(pick(row, "pp_ponto_pedido"));
      const necessario_pedido = coerceBool(pick(row, "necessario_pedido"));
      const rc_pendentes = coerceNum(pick(row, "rc_pendentes"));
      const pc_abertos = coerceNum(pick(row, "pc_abertos"));

      const consumo_total_30d = coerceNum(pick(row, "consumo_total_30d"));
      const consumo_total_90d = coerceNum(pick(row, "consumo_total_90d"));
      const consumo_total_180d = coerceNum(pick(row, "consumo_total_180d"));
      const pv_usado_abertos = coerceNum(pick(row, "pv_usado_abertos"));
      const quantidade_solicitada = coerceNum(pick(row, "quantidade_solicitada"));
      const consumo_total_365d = coerceNum(pick(row, "consumo_total_365d"));
      const cc_ciclo_compras_dias = coerceNum(pick(row, "cc_ciclo_compras_dias"));
      const cm_90d = coerceNum(pick(row, "cm_90d"));
      const cm_180d = coerceNum(pick(row, "cm_180d"));
      const cm_270d = coerceNum(pick(row, "cm_270d"));
      const cm_365d = coerceNum(pick(row, "cm_365d"));
      const tr_tempo_reposicao = coerceNum(pick(row, "tr_tempo_reposicao"));
      const fator_emergencial = coerceNum(pick(row, "fator_emergencial"));
      const tc_tempo_cobertura_dias = coerceNum(pick(row, "tc_tempo_cobertura_dias"));

      const custo_liquido_usd = coerceNum(pick(row, "custo_liquido_usd"));
      const custo_liquido_ultima_entrada_usd = coerceNum(pick(row, "custo_liquido_ultima_entrada_usd"));
      const qtd_compra_ultimo_ano = coerceNum(pick(row, "qtd_compra_ultimo_ano"));
      const valor_estoque_usd_180d = coerceNum(pick(row, "valor_estoque_usd_180d"));
      const fornecedor_ultima_entrada = coerceText(pick(row, "fornecedor_ultima_entrada"));
      const valor_estoque_usd_90d = coerceNum(pick(row, "valor_estoque_usd_90d"));
      const data_ultima_entrega = coerceDate(pick(row, "data_ultima_entrega"));
      const quantidade_ultima_entrada = coerceNum(pick(row, "quantidade_ultima_entrada"));
      const hist_invest_fin_12m_brl = coerceNum(pick(row, "hist_invest_fin_12m_brl"));
      const hist_invest_fin_12m_usd = coerceNum(pick(row, "hist_invest_fin_12m_usd"));

      const consumoDiario = consumo_total_30d > 0
        ? consumo_total_30d / 30
        : (cm_90d > 0 ? cm_90d / 30 : 0);
      const coberturaCalculada = consumoDiario > 0 ? se_saldo_disponivel_un / consumoDiario : 0;
      const coberturaDias = tc_tempo_cobertura_dias > 0
        ? Math.round(tc_tempo_cobertura_dias)
        : Math.round(coberturaCalculada);

      const cv = cm_90d > 0 && cm_180d > 0
        ? Math.abs(cm_90d - cm_180d) / ((cm_90d + cm_180d) / 2)
        : 0.3;
      const sigma = consumoDiario * Math.max(cv, 0.1);
      const lt = tr_tempo_reposicao || 1;
      const slaTargets: Record<number, number> = {};

      for (const [sla, z] of Object.entries(SLA_Z)) {
        const safetyStock = z * sigma * Math.sqrt(lt);
        const reorderPoint = consumoDiario * lt + safetyStock;
        slaTargets[Number(sla)] = Math.round(reorderPoint);
      }

      const custoLiquidoUS = custo_liquido_usd || custo_liquido_ultima_entrada_usd;

      return {
        // compatibilidade
        codProduto: cod_produto,
        denominacao,
        fornecedor: fornecedor_ultima_entrada,
        origem: desc_grupo,
        estoqueDisponivel: se_saldo_disponivel_un,
        estoqueSeguranca: es_estoque_seguranca,
        estoquePedido: pc_abertos,
        consumo30d: consumo_total_30d,
        consumo90d: consumo_total_90d,
        consumo180d: consumo_total_180d,
        consumo365d: consumo_total_365d,
        cm90d: cm_90d,
        cm180d: cm_180d,
        cm365d: cm_365d,
        tempoReposicao: tr_tempo_reposicao,
        custoLiquidoUS,
        qtdCompraUltimoAno: qtd_compra_ultimo_ano,
        valorEstoqueUS90d: valor_estoque_usd_90d,
        valorEstoqueUS180d: valor_estoque_usd_180d,
        consumoDiario,
        coberturaDias,
        slaTargets,

        // dicionario novo
        cod_produto,
        desc_grupo,
        unid_medida,
        seg_saldo_estoque_geral,
        se_saldo_disponivel_un,
        seq_saldo_quarentena_un,
        es_estoque_seguranca,
        pp_ponto_pedido,
        necessario_pedido,
        rc_pendentes,
        pc_abertos,
        consumo_total_30d,
        consumo_total_90d,
        consumo_total_180d,
        pv_usado_abertos,
        quantidade_solicitada,
        consumo_total_365d,
        cc_ciclo_compras_dias,
        cm_90d,
        cm_180d,
        cm_270d,
        cm_365d,
        tr_tempo_reposicao,
        fator_emergencial,
        tc_tempo_cobertura_dias,
        custo_liquido_usd,
        custo_liquido_ultima_entrada_usd,
        qtd_compra_ultimo_ano,
        valor_estoque_usd_180d,
        fornecedor_ultima_entrada,
        valor_estoque_usd_90d,
        data_ultima_entrega,
        quantidade_ultima_entrada,
        hist_invest_fin_12m_brl,
        hist_invest_fin_12m_usd,
      };
    })
    .filter(rm => rm.cod_produto !== "");
}

export function getRMSummary(rmData: RMData[], slaLevel: number) {
  const total = rmData.length;
  const belowSLA = rmData.filter(rm => rm.estoqueDisponivel < (rm.slaTargets[slaLevel] ?? 0));
  const aboveSLA = rmData.filter(rm => rm.estoqueDisponivel >= (rm.slaTargets[slaLevel] ?? 0));
  const investimentoTotal = belowSLA.reduce((sum, rm) => {
    const gap = (rm.slaTargets[slaLevel] ?? 0) - rm.estoqueDisponivel;
    return sum + Math.max(0, gap) * rm.custoLiquidoUS;
  }, 0);

  return {
    total,
    belowSLA: belowSLA.length,
    aboveSLA: aboveSLA.length,
    investimentoTotal,
    coberturMedia: total > 0
      ? Math.round(rmData.reduce((sum, rm) => sum + rm.coberturaDias, 0) / total)
      : 0,
  };
}

