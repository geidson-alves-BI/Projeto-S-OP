from __future__ import annotations

from copy import deepcopy
from typing import Any

from ..dataset_contracts import list_dataset_contracts, resolve_dataset_id

DATASET_REGISTRY_V1_VERSION = "2026.03-v2"

_DATASET_V2_DETAILS: dict[str, dict[str, Any]] = {
    "production": {
        "ideal_columns": [
            "month",
            "reference_year",
            "product_code",
            "product_description",
            "produced_quantity",
            "customer_code",
            "customer_name",
            "trade_name",
        ],
        "granularity": "monthly_by_product",
        "primary_business_keys": ["product_code", "reference_year", "month"],
        "date_columns": ["reference_year", "month"],
        "quality_rules": [
            {
                "id": "production_qty_non_negative",
                "description": "produced_quantity deve ser maior ou igual a zero.",
                "severity": "error",
            },
            {
                "id": "production_time_signal",
                "description": "Base ideal deve conter pelo menos 6 meses para leitura de tendencia robusta.",
                "severity": "warning",
            },
        ],
        "availability_rules": [
            {
                "status": "ready",
                "description": "Dataset validado com colunas obrigatorias e linhas estruturadas.",
            },
            {
                "status": "partial",
                "description": "Upload parcial ou com gaps de qualidade, ainda util para leitura inicial.",
            },
        ],
        "notes": "Base operacional principal para historico de volume e comportamento de producao.",
    },
    "sales_orders": {
        "ideal_columns": [
            "order_date",
            "product_code",
            "customer_code",
            "customer_name",
            "order_quantity",
            "price",
            "product_group",
            "abc_class",
        ],
        "granularity": "transactional_order_line",
        "primary_business_keys": ["product_code", "customer_code", "order_date"],
        "date_columns": ["order_date"],
        "quality_rules": [
            {
                "id": "sales_qty_non_negative",
                "description": "order_quantity deve ser maior ou igual a zero.",
                "severity": "error",
            },
            {
                "id": "sales_date_parseable",
                "description": "order_date deve estar em formato de data valido para leitura temporal.",
                "severity": "warning",
            },
        ],
        "availability_rules": [
            {
                "status": "ready",
                "description": "Pedidos validos com data e quantidade para leitura comercial completa.",
            },
            {
                "status": "partial",
                "description": "Pedidos incompletos ainda habilitam leitura parcial de volume e mix.",
            },
        ],
        "notes": "Base comercial para volume vendido, mix e concentracao de clientes.",
    },
    "customers": {
        "ideal_columns": [
            "product_code",
            "customer_code",
            "customer_name",
            "product_group",
            "abc_class",
        ],
        "granularity": "customer_product_mapping",
        "primary_business_keys": ["product_code", "customer_code"],
        "date_columns": [],
        "quality_rules": [
            {
                "id": "customer_keys_non_empty",
                "description": "customer_code e product_code nao devem estar vazios.",
                "severity": "warning",
            }
        ],
        "availability_rules": [
            {
                "status": "ready",
                "description": "Relacionamentos cliente-produto completos para mix e concentracao.",
            },
            {
                "status": "partial",
                "description": "Relacionamentos incompletos ainda habilitam leitura comercial parcial.",
            },
        ],
        "notes": "Base auxiliar para enriquecer concentracao comercial e contexto executivo.",
    },
    "forecast_input": {
        "ideal_columns": [
            "product_code",
            "last_30_days",
            "last_90_days",
            "last_180_days",
            "last_365_days",
            "monthly_history",
        ],
        "granularity": "sku_forecast_signal",
        "primary_business_keys": ["product_code"],
        "date_columns": [],
        "quality_rules": [
            {
                "id": "forecast_signal_positive",
                "description": "Ao menos um sinal de consumo/historico deve ser positivo por SKU.",
                "severity": "warning",
            }
        ],
        "availability_rules": [
            {
                "status": "ready",
                "description": "Sinais de forecast estruturados para consolidacao de demanda.",
            },
            {
                "status": "partial",
                "description": "Sinais incompletos ainda servem para leitura inicial de tendencia.",
            },
        ],
        "notes": "Base de apoio para consolidacao de previsao quando historico bruto nao e suficiente.",
    },
    "bom": {
        "ideal_columns": [
            "product_code",
            "raw_material_code",
            "raw_material_name",
            "qty_per_unit",
            "unit_cost",
        ],
        "granularity": "bom_line_by_finished_product",
        "primary_business_keys": ["product_code", "raw_material_code"],
        "date_columns": [],
        "quality_rules": [
            {
                "id": "bom_qty_positive",
                "description": "qty_per_unit deve ser maior que zero para compor consumo tecnico.",
                "severity": "error",
            },
            {
                "id": "bom_cost_signal",
                "description": "unit_cost melhora leitura de COGS e capital empatado.",
                "severity": "warning",
            },
        ],
        "availability_rules": [
            {
                "status": "ready",
                "description": "Estrutura de produto valida para leitura de insumo e custo.",
            },
            {
                "status": "partial",
                "description": "Estrutura parcial habilita leitura limitada de dependencia de insumos.",
            },
        ],
        "notes": "Camada estrutural de relacao produto-final x materia-prima.",
    },
    "raw_material_inventory": {
        "ideal_columns": [
            "product_code",
            "product_description",
            "available_stock",
            "safety_stock",
            "on_order_stock",
            "reorder_point",
            "consumption_30_days",
            "average_consumption_90_days",
            "unit_net_cost_usd",
        ],
        "granularity": "material_stock_snapshot",
        "primary_business_keys": ["product_code"],
        "date_columns": ["last_delivery_date", "next_purchase_delivery_date"],
        "quality_rules": [
            {
                "id": "inventory_stock_non_negative",
                "description": "Saldos de estoque devem ser maiores ou iguais a zero.",
                "severity": "warning",
            },
            {
                "id": "inventory_cost_signal",
                "description": "unit_net_cost_usd necessario para leitura financeira de insumos.",
                "severity": "error",
            },
        ],
        "availability_rules": [
            {
                "status": "ready",
                "description": "Cobertura, ruptura e excesso podem ser calculados com confianca.",
            },
            {
                "status": "partial",
                "description": "Leitura de risco de insumo disponivel, com limitacoes de custo/cobertura.",
            },
        ],
        "notes": "Base de cobertura de materia-prima para risco de abastecimento e capital de giro.",
    },
    "finance_documents": {
        "ideal_columns": [
            "period",
            "document_category",
            "revenue",
            "cogs",
            "expense",
            "net_income",
        ],
        "granularity": "document_or_structured_finance_records",
        "primary_business_keys": ["file_name", "period"],
        "date_columns": ["period"],
        "quality_rules": [
            {
                "id": "finance_structured_signal",
                "description": "Linhas estruturadas elevam confianca de KPIs financeiros.",
                "severity": "warning",
            }
        ],
        "availability_rules": [
            {
                "status": "ready",
                "description": "Documentos com linhas estruturadas habilitam KPIs financeiros diretos.",
            },
            {
                "status": "partial",
                "description": "Documentos sem estrutura tabular exigem heuristica e menor confianca.",
            },
        ],
        "notes": "Fonte principal documental para camada financeira executiva.",
    },
}


def _build_dataset_entry(contract: dict[str, Any]) -> dict[str, Any]:
    dataset_id = str(contract["dataset_id"])
    details = _DATASET_V2_DETAILS.get(dataset_id, {})
    aliases = [dataset_id, *list(contract.get("legacy_ids", []))]
    return {
        "dataset_id": dataset_id,
        "display_name": str(contract.get("friendly_name") or contract.get("name") or dataset_id),
        "aliases": list(dict.fromkeys(aliases)),
        "required_columns": list(contract.get("required_columns", [])),
        "optional_columns": list(contract.get("optional_columns", [])),
        "ideal_columns": list(details.get("ideal_columns", contract.get("required_columns", []))),
        "granularity": str(details.get("granularity", "unknown")),
        "primary_business_keys": list(details.get("primary_business_keys", [])),
        "date_columns": list(details.get("date_columns", [])),
        "quality_rules": deepcopy(details.get("quality_rules", [])),
        "availability_rules": deepcopy(details.get("availability_rules", [])),
        "notes": str(details.get("notes", "")),
    }


def list_dataset_registry_entries() -> list[dict[str, Any]]:
    contracts = list_dataset_contracts()
    entries = [_build_dataset_entry(contract) for contract in contracts]
    return sorted(entries, key=lambda item: str(item["dataset_id"]))


def get_dataset_registry_entry(dataset_id: str) -> dict[str, Any]:
    resolved = resolve_dataset_id(dataset_id)
    entries = {entry["dataset_id"]: entry for entry in list_dataset_registry_entries()}
    return deepcopy(entries[resolved])


def get_dataset_registry_payload() -> dict[str, Any]:
    entries = list_dataset_registry_entries()
    aliases: dict[str, str] = {}
    for entry in entries:
        dataset_id = str(entry["dataset_id"])
        for alias in entry.get("aliases", []):
            aliases[str(alias)] = dataset_id

    return {
        "version": DATASET_REGISTRY_V1_VERSION,
        "datasets": entries,
        "aliases": aliases,
    }
