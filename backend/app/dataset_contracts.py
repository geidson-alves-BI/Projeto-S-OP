from __future__ import annotations

from copy import deepcopy
from typing import Any

CONTRACT_REGISTRY_VERSION = "2026.03"

DATASET_ALIASES: dict[str, str] = {
    "clients": "customers",
}

DATASET_CONTRACTS: dict[str, dict[str, Any]] = {
    "production": {
        "id": "production",
        "dataset_id": "production",
        "legacy_ids": [],
        "name": "Producao",
        "friendly_name": "Historico de producao",
        "objective": "Historico operacional para leitura de mix, sazonalidade e cobertura analitica.",
        "executive_description": "Base principal para consolidar volume produzido, mix e sinais operacionais por SKU.",
        "category": "operacoes",
        "storage_kind": "structured",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": [
            "month",
            "reference_year",
            "product_code",
            "product_description",
            "produced_quantity",
        ],
        "optional_columns": [
            "customer_name",
            "customer_code",
            "trade_name",
        ],
        "column_labels": {
            "month": "Mes",
            "reference_year": "Ano de referencia",
            "product_code": "Codigo do produto",
            "product_description": "Descricao do produto",
            "produced_quantity": "Quantidade produzida",
            "customer_name": "Cliente",
            "customer_code": "Codigo do cliente",
            "trade_name": "Nome fantasia",
        },
        "column_aliases": {
            "month": ["mes", "month", "mes referencia"],
            "reference_year": ["ano referencia", "ano de referencia", "reference_year", "reference year", "ano"],
            "product_code": [
                "codigo produto",
                "codigo do produto",
                "codigo produto",
                "cod produto",
                "cod. produto",
                "cod_produto",
                "product_code",
                "sku",
                "sku code",
            ],
            "product_description": [
                "denominacao",
                "descricao",
                "descricao",
                "desc produto",
                "produto",
                "product description",
                "product_description",
            ],
            "produced_quantity": [
                "quantidade produzida",
                "qtd produzida",
                "quantidade",
                "volume produzido",
                "quantity produced",
                "produced_quantity",
                "qty_produced",
            ],
            "customer_name": ["cliente", "customer", "customer_name", "nome cliente", "nome do cliente"],
            "customer_code": ["codigo cliente", "codigo_cliente", "codigo cliente", "customer_code", "customer id"],
            "trade_name": ["fantasia", "nome fantasia", "trade_name"],
        },
        "expected_types": {
            "month": "integer",
            "reference_year": "integer",
            "product_code": "string",
            "product_description": "string",
            "produced_quantity": "number",
            "customer_name": "string",
            "customer_code": "string",
            "trade_name": "string",
        },
        "validation_rules": [
            {
                "id": "minimum_rows",
                "type": "minimum_rows",
                "value": 1,
                "severity": "error",
                "description": "O arquivo precisa trazer ao menos uma linha para habilitar leitura operacional.",
            }
        ],
        "readiness_impact": ["forecast", "mts_mto", "executive_ai"],
        "criticality": "high",
        "usage_examples": [
            "Historico mensal para forecast e segmentacao de mix.",
            "Base de referencia para leitura de prioridade MTS/MTO.",
        ],
    },
    "sales_orders": {
        "id": "sales_orders",
        "dataset_id": "sales_orders",
        "legacy_ids": [],
        "name": "Vendas / Pedidos",
        "friendly_name": "Carteira comercial",
        "objective": "Pedidos confirmados para consolidar demanda futura e traducao comercial.",
        "executive_description": "Base comercial para pedidos, receita potencial e leitura de carteira.",
        "category": "comercial",
        "storage_kind": "structured",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": [
            "product_code",
            "order_date",
            "order_quantity",
            "customer_code",
            "customer_name",
            "price",
        ],
        "optional_columns": [
            "product_group",
            "abc_class",
        ],
        "column_labels": {
            "product_code": "Codigo do produto",
            "order_date": "Data do pedido",
            "order_quantity": "Quantidade do pedido",
            "customer_code": "Codigo do cliente",
            "customer_name": "Cliente",
            "price": "Preco unitario",
            "product_group": "Grupo de produto",
            "abc_class": "Classe ABC",
        },
        "column_aliases": {
            "product_code": [
                "Cód. Produto", 
                "cod_produto", 
                "codigo produto", 
                "product_code"
            ],
            "order_date": [
                "data_pedido", 
                "Data Pedido", 
                "OrderDate"
            ],
            "order_quantity": [
                "quantidade", 
                "qtde", 
                "Qty", 
                "qtd_pedido"
            ],
            "customer_code": [
                "cod_cliente", 
                "codigo cliente", 
                "CustomerCode"
            ],
            "customer_name": [
                "denominacao cliente", 
                "cliente", 
                "nome cliente", 
                "Customer"
            ],
            "product_group": [
                "grupo",
                "grupo produto",
                "product_group",
                "group_description",
                "family",
            ],
            "abc_class": [
                "abc",
                "classe abc",
                "classificacao abc",
                "abc_class",
                "product_class",
            ],
            "price": [
                "preco", 
                "valor", 
                "price", 
                "preço unitário"
            ],
        },
        "expected_types": {
            "product_code": "string",
            "order_date": "date",
            "order_quantity": "number",
            "customer_code": "string",
            "customer_name": "string",
            "price": "number",
            "product_group": "string",
            "abc_class": "string",
        },
        "validation_rules": [
            {
                "id": "minimum_rows",
                "type": "minimum_rows",
                "value": 1,
                "severity": "error",
                "description": "A carteira precisa ter ao menos uma linha para ser considerada.",
            }
        ],
        "readiness_impact": ["forecast", "finance", "executive_ai"],
        "criticality": "medium",
        "usage_examples": [
            "Comparar demanda confirmada com historico operacional.",
            "Traduzir backlog em impacto comercial e financeiro.",
        ],
    },
    "customers": {
        "id": "customers",
        "dataset_id": "customers",
        "legacy_ids": ["clients"],
        "name": "Clientes",
        "friendly_name": "Base de clientes",
        "objective": "Camada comercial para concentracao de carteira e dependencia por cliente.",
        "executive_description": "Relaciona SKU, cliente e atributos comerciais para leitura de concentracao e risco.",
        "category": "comercial",
        "storage_kind": "structured",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": [
            "product_code",
            "customer_code",
            "customer_name",
        ],
        "optional_columns": [
            "product_group",
            "abc_class",
        ],
        "column_labels": {
            "product_code": "Codigo do produto",
            "customer_code": "Codigo do cliente",
            "customer_name": "Cliente",
            "product_group": "Grupo de produto",
            "abc_class": "Classe ABC",
        },
        "column_aliases": {
            "product_code": [
                "codigo produto",
                "codigo_produto",
                "cod_produto",
                "product_code",
                "sku",
            ],
            "customer_code": [
                "codigo cliente",
                "codigo_cliente",
                "cod_cliente",
                "customer_code",
                "customer id",
            ],
            "customer_name": [
                "cliente",
                "customer_name",
                "customer",
                "nome cliente",
            ],
            "product_group": [
                "grupo",
                "grupo produto",
                "group_description",
                "product_group",
            ],
            "abc_class": [
                "abc",
                "classe abc",
                "abc_class",
                "product_class",
            ],
        },
        "expected_types": {
            "product_code": "string",
            "customer_code": "string",
            "customer_name": "string",
            "product_group": "string",
            "abc_class": "string",
        },
        "validation_rules": [
            {
                "id": "minimum_rows",
                "type": "minimum_rows",
                "value": 1,
                "severity": "error",
                "description": "A base precisa ter ao menos um relacionamento SKU-cliente.",
            }
        ],
        "readiness_impact": ["mts_mto", "finance", "executive_ai"],
        "criticality": "medium",
        "usage_examples": [
            "Medir concentracao comercial por produto e cliente.",
            "Apoiar priorizacao MTS/MTO com dependencia de carteira.",
        ],
    },
    "forecast_input": {
        "id": "forecast_input",
        "dataset_id": "forecast_input",
        "legacy_ids": [],
        "name": "Base para previsao",
        "friendly_name": "Entradas de forecast",
        "objective": "Entradas para consolidar previsao de demanda no backend.",
        "executive_description": "Sinais de demanda historica para gerar forecast analitico padronizado.",
        "category": "planejamento",
        "storage_kind": "structured",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": ["product_code"],
        "optional_columns": [
            "last_30_days",
            "last_90_days",
            "last_180_days",
            "last_365_days",
            "monthly_history",
        ],
        "column_labels": {
            "product_code": "Codigo do produto",
            "last_30_days": "Consumo ultimos 30 dias",
            "last_90_days": "Consumo ultimos 90 dias",
            "last_180_days": "Consumo ultimos 180 dias",
            "last_365_days": "Consumo ultimos 365 dias",
            "monthly_history": "Historico mensal",
        },
        "column_aliases": {
            "product_code": [
                "codigo produto",
                "cod_produto",
                "product_code",
                "sku",
            ],
            "last_30_days": ["last 30 days", "ultimos 30 dias", "consumo 30 dias", "last_30_days"],
            "last_90_days": ["last 90 days", "ultimos 90 dias", "consumo 90 dias", "last_90_days"],
            "last_180_days": ["last 180 days", "ultimos 180 dias", "consumo 180 dias", "last_180_days"],
            "last_365_days": ["last 365 days", "ultimos 365 dias", "consumo 365 dias", "last_365_days"],
            "monthly_history": ["monthly history", "historico mensal", "history", "monthly_history"],
        },
        "expected_types": {
            "product_code": "string",
            "last_30_days": "number",
            "last_90_days": "number",
            "last_180_days": "number",
            "last_365_days": "number",
            "monthly_history": "array<number>",
        },
        "validation_rules": [
            {
                "id": "minimum_rows",
                "type": "minimum_rows",
                "value": 1,
                "severity": "error",
                "description": "A base precisa conter ao menos um SKU.",
            },
            {
                "id": "demand_signal",
                "type": "at_least_one_of",
                "columns": [
                    "last_30_days",
                    "last_90_days",
                    "last_180_days",
                    "last_365_days",
                    "monthly_history",
                ],
                "severity": "error",
                "description": "Ao menos um sinal de demanda precisa estar presente para consolidar o forecast.",
            },
        ],
        "readiness_impact": ["forecast", "mts_mto", "raw_material", "executive_ai"],
        "criticality": "high",
        "usage_examples": [
            "Gerar previsao de demanda padronizada por SKU.",
            "Alimentar consumo previsto para materia-prima e IA executiva.",
        ],
    },
    "bom": {
        "id": "bom",
        "dataset_id": "bom",
        "legacy_ids": [],
        "name": "Estrutura de produto",
        "friendly_name": "BOM / estrutura de consumo",
        "objective": "Relaciona produto final, insumo, consumo por unidade e custo.",
        "executive_description": "Conecta produtos acabados aos insumos e custos para simulacao operacional e financeira.",
        "category": "supply",
        "storage_kind": "structured",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": [
            "product_code",
            "raw_material_code",
            "raw_material_name",
            "qty_per_unit",
        ],
        "optional_columns": ["unit_cost"],
        "column_labels": {
            "product_code": "Codigo do produto final",
            "raw_material_code": "Codigo da materia-prima",
            "raw_material_name": "Materia-prima",
            "qty_per_unit": "Quantidade por unidade",
            "unit_cost": "Custo unitario",
        },
        "column_aliases": {
            "product_code": [
                "codigo produto",
                "cod_produto",
                "product_code",
                "sku",
            ],
            "raw_material_code": [
                "codigo materia prima",
                "cod materia prima",
                "raw_material_code",
                "cod_mp",
                "rm_code",
            ],
            "raw_material_name": [
                "materia prima",
                "descricao materia prima",
                "raw_material_name",
                "insumo",
            ],
            "qty_per_unit": [
                "quantidade por unidade",
                "qtd por unidade",
                "consumo por unidade",
                "qty_per_unit",
            ],
            "unit_cost": ["custo unitario", "custo", "unit_cost", "cost"],
        },
        "expected_types": {
            "product_code": "string",
            "raw_material_code": "string",
            "raw_material_name": "string",
            "qty_per_unit": "number",
            "unit_cost": "number",
        },
        "validation_rules": [
            {
                "id": "minimum_rows",
                "type": "minimum_rows",
                "value": 1,
                "severity": "error",
                "description": "A BOM precisa ter ao menos um relacionamento produto-insumo.",
            }
        ],
        "readiness_impact": ["mts_mto", "raw_material", "finance", "executive_ai"],
        "criticality": "critical",
        "usage_examples": [
            "Expandir forecast de produto final para demanda de insumos.",
            "Simular custo e cobertura de materia-prima.",
        ],
    },
    "raw_material_inventory": {
        "id": "raw_material_inventory",
        "dataset_id": "raw_material_inventory",
        "legacy_ids": [],
        "name": "Estoque de materia-prima",
        "friendly_name": "Cobertura de insumos",
        "objective": "Base de cobertura, reposicao e criticidade de insumos.",
        "executive_description": "Consolida saldo, estoque de seguranca, reposicao e custo para leitura de risco de abastecimento.",
        "category": "supply",
        "storage_kind": "structured",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": [
            "product_code",
            "product_description",
            "group_description",
            "unit_of_measure",
        ],
        "optional_columns": [
            "available_stock",
            "safety_stock",
            "on_order_stock",
            "reorder_point",
            "consumption_30_days",
            "average_consumption_90_days",
            "replenishment_time_days",
            "unit_net_cost_usd",
        ],
        "column_labels": {
            "product_code": "Codigo do item",
            "product_description": "Descricao do item",
            "group_description": "Grupo",
            "unit_of_measure": "Unidade de medida",
            "available_stock": "Estoque disponivel",
            "safety_stock": "Estoque de seguranca",
            "on_order_stock": "Estoque em pedido",
            "reorder_point": "Ponto de pedido",
            "consumption_30_days": "Consumo 30 dias",
            "average_consumption_90_days": "Consumo medio 90 dias",
            "replenishment_time_days": "Tempo de reposicao",
            "unit_net_cost_usd": "Custo liquido USD",
        },
        "column_aliases": {
            "product_code": [
                "cod. produto",
                "cod. produto",
                "cod produto",
                "codigo produto",
                "codigo do produto",
                "cod_produto",
                "product_code",
                "rm_code",
            ],
            "product_description": [
                "denominacao",
                "descricao",
                "descricao",
                "product_description",
                "description",
            ],
            "group_description": ["desc. grupo", "desc grupo", "grupo", "group_description", "origem"],
            "unit_of_measure": ["unid. medida", "unid medida", "unidade", "unit_of_measure", "uom"],
            "available_stock": [
                "estoque disponivel",
                "estoque disponivel",
                "saldo",
                "saldo estoque",
                "saldo disponivel",
                "saldo disponivel",
                "se",
                "available_stock",
            ],
            "safety_stock": ["estoque seguranca", "estoque de seguranca", "es", "safety_stock"],
            "on_order_stock": ["estoque pedido", "pc aberto", "pc abertos", "on_order_stock"],
            "reorder_point": ["ponto pedido", "ponto de pedido", "pp", "reorder_point"],
            "consumption_30_days": ["consumo total 30 dias", "consumo 30 dias", "consumption_30_days"],
            "average_consumption_90_days": [
                "cm - consumo medio 90 dias",
                "consumo medio 90 dias",
                "cm 90d",
                "average_consumption_90_days",
            ],
            "replenishment_time_days": [
                "tr - tempo reposicao",
                "tempo reposicao",
                "lead time",
                "replenishment_time_days",
            ],
            "unit_net_cost_usd": ["custo liquido u$", "custo liquido us$", "unit_net_cost_usd", "net_cost_usd"],
        },
        "expected_types": {
            "product_code": "string",
            "product_description": "string",
            "group_description": "string",
            "unit_of_measure": "string",
            "available_stock": "number",
            "safety_stock": "number",
            "on_order_stock": "number",
            "reorder_point": "number",
            "consumption_30_days": "number",
            "average_consumption_90_days": "number",
            "replenishment_time_days": "number",
            "unit_net_cost_usd": "number",
        },
        "validation_rules": [
            {
                "id": "minimum_rows",
                "type": "minimum_rows",
                "value": 1,
                "severity": "error",
                "description": "A base precisa conter ao menos um item de estoque.",
            },
            {
                "id": "inventory_signal",
                "type": "at_least_one_of",
                "columns": [
                    "available_stock",
                    "safety_stock",
                    "on_order_stock",
                    "reorder_point",
                    "consumption_30_days",
                    "average_consumption_90_days",
                ],
                "severity": "warning",
                "description": "Ao menos um sinal de saldo ou consumo melhora a cobertura analitica.",
            },
        ],
        "readiness_impact": ["raw_material", "finance", "executive_ai"],
        "criticality": "high",
        "usage_examples": [
            "Priorizar risco de ruptura e cobertura de insumos.",
            "Traduzir saldo e reposicao para impacto financeiro.",
        ],
    },
    "finance_documents": {
        "id": "finance_documents",
        "dataset_id": "finance_documents",
        "legacy_ids": ["finance_spreadsheets"],
        "name": "Documentos Financeiros (DRE e anexos executivos)",
        "friendly_name": "Documentos e anexos",
        "objective": "DRE, anexos executivos e documentos preparados para leitura inteligente futura.",
        "executive_description": "Camada documental para consolidar evidencias financeiras nao estruturadas.",
        "category": "financeiro",
        "storage_kind": "document",
        "accepted_formats": [
            ".pdf",
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".xlsx",
            ".xls",
            ".txt",
            ".docx",
        ],
        "required_columns": [],
        "optional_columns": ["file_name", "period", "document_category"],
        "column_labels": {
            "file_name": "Nome do arquivo",
            "period": "Periodo",
            "document_category": "Categoria documental",
        },
        "column_aliases": {
            "file_name": ["arquivo", "nome arquivo", "file_name"],
            "period": ["periodo", "period"],
            "document_category": ["categoria", "tipo documento", "document_category"],
        },
        "expected_types": {
            "file_name": "string",
            "period": "string",
            "document_category": "string",
        },
        "validation_rules": [],
        "readiness_impact": ["finance", "executive_ai"],
        "criticality": "medium",
        "usage_examples": [
            "Anexar DRE, notas e materiais de suporte para leitura futura.",
            "Criar trilha documental para IA e auditoria executiva.",
        ],
    },
}



def resolve_dataset_id(dataset_id: str) -> str:
    normalized = str(dataset_id or "").strip()
    if not normalized:
        raise KeyError(dataset_id)
    resolved = DATASET_ALIASES.get(normalized, normalized)
    if resolved not in DATASET_CONTRACTS:
        raise KeyError(dataset_id)
    return resolved


def get_dataset_contract(dataset_id: str) -> dict[str, Any]:
    resolved = resolve_dataset_id(dataset_id)
    contract = deepcopy(DATASET_CONTRACTS[resolved])
    contract["expected_columns"] = list(contract["required_columns"]) + list(contract["optional_columns"])
    contract["contract_registry_version"] = CONTRACT_REGISTRY_VERSION
    return contract


def list_dataset_contracts() -> list[dict[str, Any]]:
    return [get_dataset_contract(dataset_id) for dataset_id in DATASET_CONTRACTS]


def get_contract_registry_payload() -> dict[str, Any]:
    return {
        "version": CONTRACT_REGISTRY_VERSION,
        "aliases": deepcopy(DATASET_ALIASES),
        "datasets": list_dataset_contracts(),
    }
