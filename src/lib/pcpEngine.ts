// PCP Control Tower — Data Processing Engine
// Port of the Python Colab logic to TypeScript

export interface RawRow {
  [key: string]: string | number | undefined;
}

export interface ProductData {
  SKU_LABEL: string;
  codigoProduto: string;
  denominacao: string;
  monthValues: Record<string, number>;
  volumeAnual: number;
  percAcumulado: number;
  classeABC: "A" | "B" | "C";
  mediaMensal: number;
  desvioPadrao: number;
  cv: number;
  classeXYZ: "X" | "Y" | "Z";
  abcXyz: string;
  trendPct: number | null;
  trendLabel: string;
  consumoDiario: number;
  diasAlvoBase: number;
  estrategiaBase: string;
  targetKg30: number;
  targetKg60: number;
  targetKg90: number;
  prioridadeMTS: number;
  // concentration fields (optional)
  top1Cliente?: string;
  top1ShareProduto?: number;
  hhiProduto?: number;
  diasAlvoAjustado?: number;
  estrategiaFinal?: string;
  targetKgAjustado?: number;
}

export interface ClienteData {
  codigoProduto: string;
  denominacao: string;
  codigoCliente: string;
  cliente: string;
  fantasia: string;
  precoCusto: number;
  dataUltimaCompra: string;
  clienteLabel: string;
}

export interface PortfolioConcentration {
  hhiPortfolio: number;
  top1SharePortfolio: number;
}

export interface ProductConcentration {
  codigoProduto: string;
  top1Cliente: string;
  top1ShareProduto: number;
  hhiProduto: number;
}

// ---- Month mapping ----
const MONTH_MAP: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, março: 3, marco: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9,
  out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

const DIAS_ALVO_MAP: Record<string, number> = {
  AX: 60, AY: 45, AZ: 0,
  BX: 45, BY: 30, BZ: 0,
  CX: 30, CY: 15, CZ: 0,
};

function monthToInt(m: string | number | undefined | null): number | null {
  if (m == null || m === "") return null;
  if (typeof m === "number") return m >= 1 && m <= 12 ? m : null;
  const s = String(m).trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const v = parseInt(s);
    return v >= 1 && v <= 12 ? v : null;
  }
  const s3 = s.slice(0, 3);
  return MONTH_MAP[s] ?? MONTH_MAP[s3] ?? null;
}

function toSnake(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^\w\s]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeColname(c: string): string {
  return c.trim().replace(/[\n\t]/g, " ").replace(/\s+/g, " ");
}

function coerceNumeric(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ---- Column alias mapping ----
const ALIAS_MAP: Record<string, string> = {
  "mes": "Mês", "mês": "Mês",
  "ano referencia": "Ano referência", "ano referência": "Ano referência",
  "codigo produto": "Código Produto", "código produto": "Código Produto",
  "codigo_produto": "Código Produto",
  "quantidade produzida": "Quantidade Produzida", "qtd produzida": "Quantidade Produzida",
  "denominacao": "Denominação", "denominação": "Denominação",
  "cliente": "Cliente",
  "codigo_cliente": "codigo_cliente", "código_cliente": "codigo_cliente",
  "fantasia": "fantasia",
};

function resolveColumns(rawCols: string[]): Record<string, string> {
  const rename: Record<string, string> = {};
  for (const c of rawCols) {
    const key = toSnake(normalizeColname(c)).replace(/_/g, " ");
    if (ALIAS_MAP[key]) rename[c] = ALIAS_MAP[key];
    // also try the direct snake
    const snake = toSnake(normalizeColname(c));
    if (ALIAS_MAP[snake]) rename[c] = ALIAS_MAP[snake];
  }
  return rename;
}

function applyRename(row: RawRow, rename: Record<string, string>): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[rename[k] ?? k] = v;
  }
  return out;
}

// ---- Prep Production ----
export interface LongRow {
  codigoProduto: string;
  denominacao: string;
  mesKey: string;
  quantidade: number;
  cliente?: string;
  codigoCliente?: string;
  fantasia?: string;
  SKU_LABEL: string;
}

export function prepProducao(rawRows: RawRow[]): LongRow[] {
  if (!rawRows.length) return [];
  const cols = Object.keys(rawRows[0]);
  const rename = resolveColumns(cols);

  return rawRows.map(raw => {
    const r = applyRename(raw, rename);
    const mes = monthToInt(r["Mês"] as string | number);
    const ano = coerceNumeric(r["Ano referência"]);
    const mesKey = ano && mes ? `${ano}-${String(mes).padStart(2, "0")}` : "";
    const codProd = String(r["Código Produto"] ?? "").trim();
    const denom = String(r["Denominação"] ?? "").trim();
    return {
      codigoProduto: codProd,
      denominacao: denom,
      mesKey,
      quantidade: coerceNumeric(r["Quantidade Produzida"]),
      cliente: r["Cliente"] != null ? String(r["Cliente"]) : undefined,
      codigoCliente: r["codigo_cliente"] != null ? String(r["codigo_cliente"]) : undefined,
      fantasia: r["fantasia"] != null ? String(r["fantasia"]) : undefined,
      SKU_LABEL: `${codProd} - ${denom}`,
    };
  }).filter(r => r.mesKey !== "");
}

// ---- Prep Clientes ----
export function prepClientes(rawRows: RawRow[]): ClienteData[] {
  return rawRows.map(raw => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      r[toSnake(normalizeColname(k))] = v;
    }
    const codCliente = String(r["codigo_cliente"] ?? "").trim();
    const fantasia = String(r["fantasia"] ?? "").trim();
    const cliente = String(r["cliente"] ?? "").trim();
    const nome = fantasia || cliente;
    const label = codCliente ? `${codCliente} - ${nome}` : nome;

    return {
      codigoProduto: String(r["codigo_produto"] ?? "").trim(),
      denominacao: String(r["denominacao"] ?? "").trim(),
      codigoCliente: codCliente,
      cliente,
      fantasia,
      precoCusto: coerceNumeric(r["preco_custo_reais"]),
      dataUltimaCompra: String(r["dataultimacompra"] ?? ""),
      clienteLabel: label,
    };
  });
}

// ---- Merge Production + Clients ----
export function mergeWithClientes(prodLong: LongRow[], clientes: ClienteData[]): LongRow[] {
  // Build lookup: codigoProduto -> ClienteData[]
  const lookup = new Map<string, ClienteData[]>();
  for (const c of clientes) {
    const key = c.codigoProduto;
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key)!.push(c);
  }

  return prodLong.map(row => {
    const matches = lookup.get(row.codigoProduto);
    if (matches && matches.length > 0) {
      // Try match by codigoCliente if available
      let match = matches[0];
      if (row.codigoCliente) {
        const exact = matches.find(m => m.codigoCliente === row.codigoCliente);
        if (exact) match = exact;
      }
      return { ...row, cliente: match.clienteLabel, codigoCliente: match.codigoCliente };
    }
    return { ...row, cliente: row.cliente || "Sem cliente" };
  });
}

// ---- Pivot to Wide ----
export interface WideRow {
  SKU_LABEL: string;
  codigoProduto: string;
  monthValues: Record<string, number>;
}

export function toWide(longRows: LongRow[], filterCliente?: string): { wide: WideRow[]; monthCols: string[] } {
  const filtered = filterCliente
    ? longRows.filter(r => r.cliente === filterCliente)
    : longRows;

  const skuMap = new Map<string, WideRow>();
  const allMonths = new Set<string>();

  for (const r of filtered) {
    allMonths.add(r.mesKey);
    if (!skuMap.has(r.SKU_LABEL)) {
      skuMap.set(r.SKU_LABEL, { SKU_LABEL: r.SKU_LABEL, codigoProduto: r.codigoProduto, monthValues: {} });
    }
    const w = skuMap.get(r.SKU_LABEL)!;
    w.monthValues[r.mesKey] = (w.monthValues[r.mesKey] || 0) + r.quantidade;
  }

  const monthCols = Array.from(allMonths).sort();
  const wide = Array.from(skuMap.values());

  // Fill missing months with 0
  for (const w of wide) {
    for (const m of monthCols) {
      if (!(m in w.monthValues)) w.monthValues[m] = 0;
    }
  }

  return { wide, monthCols };
}

// ---- Pipeline: ABC/XYZ/Trend/MTS ----
function stdDev(arr: number[]): number {
  const n = arr.length;
  if (n <= 1) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1));
}

export function pipeline(wide: WideRow[], monthCols: string[]): ProductData[] {
  // Calculate volumes
  const withVol = wide.map(w => {
    const vol = monthCols.reduce((sum, m) => sum + (w.monthValues[m] || 0), 0);
    return { ...w, volumeAnual: vol };
  }).sort((a, b) => b.volumeAnual - a.volumeAnual);

  const total = withVol.reduce((sum, w) => sum + w.volumeAnual, 0) || 1;

  let cumPct = 0;
  return withVol.map(w => {
    cumPct += w.volumeAnual / total;
    const classeABC: "A" | "B" | "C" = cumPct <= 0.80 ? "A" : cumPct <= 0.95 ? "B" : "C";

    const values = monthCols.map(m => w.monthValues[m] || 0);
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const sd = stdDev(values);
    const cv = mean > 0 ? sd / mean : 0;
    const classeXYZ: "X" | "Y" | "Z" = cv <= 0.5 ? "X" : cv <= 1.0 ? "Y" : "Z";
    const abcXyz = `${classeABC}${classeXYZ}`;

    const first3 = monthCols.slice(0, 3);
    const last3 = monthCols.slice(-3);
    const baseVol = first3.reduce((s, m) => s + (w.monthValues[m] || 0), 0);
    const topVol = last3.reduce((s, m) => s + (w.monthValues[m] || 0), 0);
    const trendPct = baseVol > 0 ? ((topVol - baseVol) / baseVol) * 100 : null;

    let trendLabel = "Sem base (0)";
    if (trendPct !== null) {
      if (trendPct >= 15) trendLabel = "Crescimento forte";
      else if (trendPct >= 5) trendLabel = "Crescimento";
      else if (trendPct <= -15) trendLabel = "Queda forte";
      else if (trendPct <= -5) trendLabel = "Queda";
      else trendLabel = "Estável";
    }

    const consumoDiario = mean / 30;
    const diasAlvoBase = DIAS_ALVO_MAP[abcXyz] ?? 0;
    const estrategiaBase = diasAlvoBase > 0 ? "MTS (candidato)" : "MTO";

    let score = 0;
    score += classeABC === "A" ? 4 : classeABC === "B" ? 2 : 0;
    score += classeXYZ === "X" || classeXYZ === "Y" ? 3 : -2;
    if (trendLabel === "Crescimento forte" || trendLabel === "Crescimento") score += 2;

    return {
      SKU_LABEL: w.SKU_LABEL,
      codigoProduto: w.codigoProduto,
      denominacao: w.SKU_LABEL.split(" - ").slice(1).join(" - "),
      monthValues: w.monthValues,
      volumeAnual: w.volumeAnual,
      percAcumulado: cumPct,
      classeABC,
      mediaMensal: mean,
      desvioPadrao: sd,
      cv,
      classeXYZ,
      abcXyz,
      trendPct,
      trendLabel,
      consumoDiario,
      diasAlvoBase,
      estrategiaBase,
      targetKg30: consumoDiario * 30,
      targetKg60: consumoDiario * 60,
      targetKg90: consumoDiario * 90,
      prioridadeMTS: score,
    };
  });
}

// ---- Concentration Metrics ----
export function concentrationMetrics(
  prodLong: LongRow[]
): { prodConc: ProductConcentration[]; portfolioConc: PortfolioConcentration } {
  // group by product + client
  const pcMap = new Map<string, Map<string, number>>();
  for (const r of prodLong) {
    const cli = r.cliente || "Sem cliente";
    if (!pcMap.has(r.codigoProduto)) pcMap.set(r.codigoProduto, new Map());
    const cm = pcMap.get(r.codigoProduto)!;
    cm.set(cli, (cm.get(cli) || 0) + r.quantidade);
  }

  const prodConc: ProductConcentration[] = [];
  for (const [prod, cliMap] of pcMap) {
    const total = Array.from(cliMap.values()).reduce((a, b) => a + b, 0);
    if (total === 0) {
      prodConc.push({ codigoProduto: prod, top1Cliente: "", top1ShareProduto: 0, hhiProduto: 0 });
      continue;
    }
    let maxShare = 0, topCli = "";
    let hhi = 0;
    for (const [cli, vol] of cliMap) {
      const share = vol / total;
      hhi += share * share;
      if (share > maxShare) { maxShare = share; topCli = cli; }
    }
    prodConc.push({ codigoProduto: prod, top1Cliente: topCli, top1ShareProduto: maxShare, hhiProduto: hhi });
  }

  // Portfolio level
  const cliTotals = new Map<string, number>();
  for (const r of prodLong) {
    const cli = r.cliente || "Sem cliente";
    cliTotals.set(cli, (cliTotals.get(cli) || 0) + r.quantidade);
  }
  const grandTotal = Array.from(cliTotals.values()).reduce((a, b) => a + b, 0) || 1;
  let hhiPort = 0, top1Port = 0;
  for (const vol of cliTotals.values()) {
    const share = vol / grandTotal;
    hhiPort += share * share;
    if (share > top1Port) top1Port = share;
  }

  return { prodConc, portfolioConc: { hhiPortfolio: hhiPort, top1SharePortfolio: top1Port } };
}

// ---- Apply concentration adjustment ----
export function applyConcentrationAdjustment(
  products: ProductData[],
  prodConc: ProductConcentration[],
  top1Cut = 0.70,
  hhiCut = 0.50
): ProductData[] {
  const concMap = new Map<string, ProductConcentration>();
  for (const pc of prodConc) concMap.set(pc.codigoProduto, pc);

  return products.map(p => {
    const conc = concMap.get(p.codigoProduto);
    const top1Share = conc?.top1ShareProduto ?? 0;
    const hhi = conc?.hhiProduto ?? 0;
    const top1Cli = conc?.top1Cliente ?? "";

    let diasAjust = p.diasAlvoBase;
    if (hhi >= hhiCut) diasAjust = Math.round(diasAjust * 0.5);

    const isTop1High = top1Share >= top1Cut;
    const isException = p.abcXyz === "AX" && (p.trendLabel === "Crescimento forte" || p.trendLabel === "Crescimento");
    if (isTop1High && !isException) diasAjust = 0;

    const estratFinal = diasAjust > 0 ? "MTS (candidato)" : "MTO";

    return {
      ...p,
      top1Cliente: top1Cli,
      top1ShareProduto: top1Share,
      hhiProduto: hhi,
      diasAlvoAjustado: diasAjust,
      estrategiaFinal: estratFinal,
      targetKgAjustado: p.consumoDiario * diasAjust,
    };
  });
}

// ---- Get unique clients ----
export function getUniqueClientes(prodLong: LongRow[]): string[] {
  const set = new Set<string>();
  for (const r of prodLong) {
    if (r.cliente && r.cliente !== "Sem cliente") set.add(r.cliente);
  }
  return Array.from(set).sort();
}
