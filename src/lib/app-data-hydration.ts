import {
  applyConcentrationAdjustment,
  concentrationMetrics,
  getUniqueClientes,
  mergeWithClientes,
  pipeline,
  prepClientes,
  prepProducao,
  toWide,
  type LongRow,
  type PortfolioConcentration,
  type ProductConcentration,
  type ProductData,
  type RawRow,
} from "@/lib/pcpEngine";
import {
  processRM,
  validateRMColumns,
  type RawRMRow,
  type RMData,
} from "@/lib/rmEngine";
import type { AppDataSnapshot } from "@/types/analytics";

type GenericRow = Record<string, unknown>;

export type HydratedAppState = {
  products: ProductData[];
  monthCols: string[];
  prodLong: LongRow[];
  prodConc: ProductConcentration[];
  portfolioConc: PortfolioConcentration | null;
  clientes: string[];
  hasClientes: boolean;
};

export type HydratedAppData = {
  state: HydratedAppState | null;
  rmData: RMData[] | null;
  lastFGImportAt: string | null;
  lastClientesImportAt: string | null;
  lastRMImportAt: string | null;
};

const RAW_MATERIAL_CANONICAL_TO_LEGACY: Record<string, string> = {
  product_code: "Cod. Produto",
  product_description: "Denominacao",
  group_description: "Desc Grupo",
  unit_of_measure: "Unid Medida",
  general_stock: "SEG - Saldo Estoque Geral Da Empresa",
  available_stock: "Estoque Disponivel (SE)",
  quarantine_stock: "SEQ - Saldo Estoque Quarentena Para Unidade Negocio Selecionada",
  safety_stock: "Estoque Seguranca (ES)",
  purchase_needed: "Necessario Pedido?",
  pending_purchase_requisitions: "RC Pendentes",
  on_order_stock: "PC - Quantidade Produtos Com PC Aberto",
  reorder_point: "Ponto Pedido",
  consumption_30_days: "Consumo Total 30 Dias",
  consumption_90_days: "Consumo Total 90 Dias",
  consumption_180_days: "Consumo Total 180 Dias",
  consumption_365_days: "Consumo Total 365 Dias",
  open_pv_usage_qty: "PV - Quantidade Usado Em PV em Abertos",
  requested_quantity: "Quantidade Solicitada",
  purchase_cycle_days: "CC - Ciclo Compras (Dias)",
  average_consumption_90_days: "CM - Consumo Medio 90 Dias",
  average_consumption_180_days: "CM - Consumo Medio 180 Dias",
  average_consumption_270_days: "CM - Consumo Medio 270 Dias",
  average_consumption_365_days: "CM - Consumo Medio 365 Dias",
  calculation_base: "Base Calculo",
  replenishment_time_days: "Tempo Reposicao (TR)",
  emergency_factor: "Fator Emergencial",
  importer_replenishment_time_days: "TRI - Tempo Reposicao Importadora - Dias",
  imported_safety_stock: "ESI - Estoque De Seguranca Importado",
  imported_reorder_point: "PPI - Ponto De Pedido Importado",
  coverage_time_days: "Cobertura (dias)",
  suggested_purchase_quantity: "QSC - Quantidade Sugerida Compra",
  unit_net_cost_usd: "Custo Liquido U$",
  last_entry_unit_net_cost_usd: "Custo Liquido Ultima Entrada U$",
  purchase_qty_last_year: "QTD Compra Ultimo Ano",
  stock_value_usd_180_days: "Valor Estoque U$ 180 Dias",
  stock_value_usd_90_days: "Valor Estoque U$ 90 Dias",
  last_entry_supplier: "Fornecedor Ultima Entrada",
  last_entry_origin: "Origem Ultima Entrada",
  last_delivery_date: "Data Ultima Entrega",
  last_entry_quantity: "Quantidade Ultima Entrada",
  cycle_replenishment_required: "RPN - Resposicao Necessaria No Ciclo?",
  enters_reorder_next_cycle: "PPC - Entra Em PP No Proximo Ciclo ?",
  next_purchase_delivery_date: "PDEC - Proxima Data Entrega PC#",
  cycle_stock_coverage_quantity: "QCEA - Quantidades Cicles Estoque Atende",
  consumption_until_next_cycle: "QPC - Quantidade Consumo Ate Proximo Ciclo",
  receiving_quantity_covers_next_cycle:
    "QRAD - Quantidade Receber Atende Demanda Ate Proximo Ciclo De Compra",
  has_aromach_stock: "EA - Tem Estoque Aromach ?",
  purchase_arrives_before_safety: "PCA - Pedido Chega Antes Do SEG entrar em ES ?",
  needs_purchase_next_cycle: "NPC - Necessario Pedido Compra Proximo Ciclo ?",
  days_until_next_delivery: "DAPE - Dias Ate Proxima Entrega PC#",
  forecast_consumption_until_arrival_kg: "CPPC - Consumo Previsto Ate Previsao de Chegada (KG)",
  serves_need_until_next_cycle: "ANPC - Atende Necessidade Ate Proximo Ciclo ?",
  base_consumption_average: "CMB - Consumo Medio Base Calculo",
  financial_investment_12m_brl: "Historico Investimento Financeiro 12 Meses BRL",
  financial_investment_12m_usd: "Historico Investimento Financeiro USD 12 Meses",
  reprocess_stock: "SER - Saldo Estoque Reprocesso",
  reserved_stock: "SER - Saldo Estoque Reservado",
  stock_waiting_cost_confirmation: "SEACC - Saldo Estoque Aguardando Confirmacao Custo",
};

function asRows(rows: unknown): GenericRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.filter((row): row is GenericRow => Boolean(row) && typeof row === "object");
}

function mapProductionRowsForEngine(rows: GenericRow[]): RawRow[] {
  return rows.map((row) => ({
    mes: row.month,
    "ano referencia": row.reference_year,
    "codigo produto": row.product_code,
    denominacao: row.product_description,
    "quantidade produzida": row.produced_quantity,
    cliente: row.customer_name,
    codigo_cliente: row.customer_code,
    fantasia: row.trade_name,
  }));
}

function mapCustomersRowsForEngine(rows: GenericRow[]): RawRow[] {
  return rows.map((row) => ({
    codigo_produto: row.product_code,
    codigo_cliente: row.customer_code,
    cliente: row.customer_name,
    fantasia: row.customer_name,
    denominacao: row.product_description ?? row.product_code,
    preco_custo_reais: row.price ?? 0,
    dataultimacompra: row.last_purchase_date ?? "",
  }));
}

function mapRawMaterialRowsForEngine(rows: GenericRow[]): RawRMRow[] {
  return rows.map((row) => {
    const mapped: RawRMRow = {};
    for (const [canonical, legacy] of Object.entries(RAW_MATERIAL_CANONICAL_TO_LEGACY)) {
      const value = row[canonical];
      if (value === undefined || value === null || value === "") {
        continue;
      }
      mapped[legacy] = value as string | number | undefined;
    }
    return mapped;
  });
}

function buildOperationalState(
  productionRows: RawRow[],
  customerRows: RawRow[],
): HydratedAppState | null {
  if (!productionRows.length) {
    return null;
  }

  let prodLong = prepProducao(productionRows);
  let hasClientes = false;

  if (customerRows.length > 0) {
    const clientes = prepClientes(customerRows);
    prodLong = mergeWithClientes(prodLong, clientes);
    hasClientes = true;
  }

  const { wide, monthCols } = toWide(prodLong);
  let products = pipeline(wide, monthCols);

  let prodConc: ProductConcentration[] = [];
  let portfolioConc: PortfolioConcentration | null = null;

  if (hasClientes) {
    const concentration = concentrationMetrics(prodLong);
    prodConc = concentration.prodConc;
    portfolioConc = concentration.portfolioConc;
    products = applyConcentrationAdjustment(products, prodConc);
  } else {
    products = products.map((product) => ({
      ...product,
      diasAlvoAjustado: product.diasAlvoBase,
      estrategiaFinal: product.estrategiaBase,
      targetKgAjustado: product.consumoDiario * product.diasAlvoBase,
    }));
  }

  return {
    products,
    monthCols,
    prodLong,
    prodConc,
    portfolioConc,
    clientes: getUniqueClientes(prodLong),
    hasClientes,
  };
}

function buildRawMaterialState(rows: GenericRow[]): RMData[] | null {
  if (rows.length === 0) {
    return null;
  }

  const sourceRows = mapRawMaterialRowsForEngine(rows);
  if (sourceRows.length === 0) {
    return null;
  }

  const firstRow = sourceRows[0] ?? {};
  const validation = validateRMColumns(Object.keys(firstRow));
  const parsed = processRM(sourceRows, validation.rename);
  return parsed.length > 0 ? parsed : null;
}

export function hydrateAppDataFromSnapshot(snapshot: AppDataSnapshot): HydratedAppData {
  const datasets = snapshot?.datasets ?? {};
  const productionDataset = datasets.production;
  const customersDataset = datasets.customers;
  const rawMaterialDataset = datasets.raw_material_inventory;

  const productionRows = mapProductionRowsForEngine(asRows(productionDataset?.rows));
  const customerRows = mapCustomersRowsForEngine(asRows(customersDataset?.rows));
  const operationalState = buildOperationalState(productionRows, customerRows);
  const rmData = buildRawMaterialState(asRows(rawMaterialDataset?.rows));

  return {
    state: operationalState,
    rmData,
    lastFGImportAt: productionDataset?.uploaded_at ?? null,
    lastClientesImportAt: customersDataset?.uploaded_at ?? null,
    lastRMImportAt: rawMaterialDataset?.uploaded_at ?? null,
  };
}
