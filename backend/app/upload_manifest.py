from __future__ import annotations

from copy import deepcopy
from typing import Any

DATASET_DEFINITIONS: dict[str, dict[str, Any]] = {
    "production": {
        "id": "production",
        "name": "Producao",
        "category": "operacoes",
        "storage_kind": "structured",
        "objective": "Historico operacional para leitura de mix, segmentacao e cobertura analitica.",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": [
            "Mes",
            "Ano referencia",
            "Codigo Produto",
            "Denominacao",
            "Quantidade Produzida",
        ],
        "optional_columns": ["Cliente", "codigo_cliente", "fantasia"],
        "readiness_impact": ["forecast", "mts_mto", "executive_ai"],
    },
    "sales_orders": {
        "id": "sales_orders",
        "name": "Vendas / Pedidos",
        "category": "comercial",
        "storage_kind": "structured",
        "objective": "Carteira comercial para pedidos confirmados, demanda futura e leitura de receita.",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": ["Codigo Produto", "Data Pedido", "Quantidade Pedido"],
        "optional_columns": ["Codigo Cliente", "Cliente", "Preco", "Canal"],
        "readiness_impact": ["forecast", "finance", "executive_ai"],
    },
    "clients": {
        "id": "clients",
        "name": "Clientes",
        "category": "comercial",
        "storage_kind": "structured",
        "objective": "Camada comercial para concentracao de carteira e dependencia por cliente.",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": ["codigo_produto", "codigo_cliente", "cliente"],
        "optional_columns": ["fantasia", "preco_custo_reais", "dataUltimaCompra", "denominacao"],
        "readiness_impact": ["mts_mto", "finance", "executive_ai"],
    },
    "forecast_input": {
        "id": "forecast_input",
        "name": "Base para previsao de demanda",
        "category": "planejamento",
        "storage_kind": "structured",
        "objective": "Entradas para consolidar forecast analitico no backend.",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": ["product_code"],
        "optional_columns": [
            "last_30_days",
            "last_90_days",
            "last_180_days",
            "last_365_days",
            "monthly_history",
        ],
        "readiness_impact": ["forecast", "mts_mto", "raw_material", "executive_ai"],
    },
    "bom": {
        "id": "bom",
        "name": "Estrutura de produto / consumo de materia-prima",
        "category": "supply",
        "storage_kind": "structured",
        "objective": "Relaciona produto final, insumo, consumo por unidade e custo.",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": [
            "product_code",
            "raw_material_code",
            "raw_material_name",
            "qty_per_unit",
        ],
        "optional_columns": ["unit_cost"],
        "readiness_impact": ["mts_mto", "raw_material", "finance", "executive_ai"],
    },
    "raw_material_inventory": {
        "id": "raw_material_inventory",
        "name": "Estoque de materia-prima",
        "category": "supply",
        "storage_kind": "structured",
        "objective": "Base de cobertura, reposicao e criticidade de insumos.",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": ["Cod. Produto", "Denominacao", "Desc. Grupo", "Unid. Medida"],
        "optional_columns": [
            "Estoque Disponivel",
            "Estoque Seguranca",
            "Estoque Pedido",
            "Consumo Total 30 Dias",
            "CM - Consumo Medio 90 Dias",
            "TR - Tempo Reposicao",
            "Custo Liquido U$",
        ],
        "readiness_impact": ["raw_material", "finance", "executive_ai"],
    },
    "finance_spreadsheets": {
        "id": "finance_spreadsheets",
        "name": "Financeiro (planilhas)",
        "category": "financeiro",
        "storage_kind": "structured",
        "objective": "Planilhas financeiras para margem, caixa e traducao economica das decisoes.",
        "accepted_formats": [".csv", ".xlsx", ".xls"],
        "required_columns": ["competencia", "conta", "valor"],
        "optional_columns": ["centro_custo", "cenario", "observacao"],
        "readiness_impact": ["finance", "executive_ai"],
    },
    "finance_documents": {
        "id": "finance_documents",
        "name": "Documentos financeiros",
        "category": "financeiro",
        "storage_kind": "document",
        "objective": "DRE, anexos executivos e documentos preparados para leitura inteligente futura.",
        "accepted_formats": [
            ".pdf",
            ".xlsx",
            ".xls",
            ".csv",
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".txt",
            ".docx",
        ],
        "required_columns": [],
        "optional_columns": ["arquivo", "periodo", "categoria"],
        "readiness_impact": ["finance", "executive_ai"],
    },
}

VALIDATION_AVAILABLE_STATUSES = {"valid", "partial"}


def build_manifest_state() -> dict[str, dict[str, Any]]:
    manifest: dict[str, dict[str, Any]] = {}
    for dataset_id, definition in DATASET_DEFINITIONS.items():
        manifest[dataset_id] = {
            **deepcopy(definition),
            "expected_columns": list(definition["required_columns"]) + list(definition["optional_columns"]),
            "uploaded": False,
            "available": False,
            "validation_status": "missing",
            "uploaded_at": None,
            "filename": None,
            "format": None,
            "row_count": 0,
            "column_count": 0,
            "columns_detected": [],
            "latest_message": "Sem upload registrado.",
            "history_count": 0,
            "document_count": 0,
            "storage_path": None,
        }
    return manifest


def get_dataset_definition(dataset_id: str) -> dict[str, Any]:
    if dataset_id not in DATASET_DEFINITIONS:
        raise KeyError(dataset_id)
    definition = deepcopy(DATASET_DEFINITIONS[dataset_id])
    definition["expected_columns"] = list(definition["required_columns"]) + list(definition["optional_columns"])
    return definition


def _is_available(dataset_state: dict[str, Any]) -> bool:
    return bool(dataset_state.get("uploaded")) and dataset_state.get("validation_status") in VALIDATION_AVAILABLE_STATUSES


def _status_label(status: str) -> str:
    mapping = {
        "valid": "Validado",
        "partial": "Parcial",
        "invalid": "Invalido",
        "pending": "Pendente",
        "missing": "Sem upload",
    }
    return mapping.get(status, status)


def _build_readiness_node(
    key: str,
    label: str,
    status: str,
    datasets: list[str],
    manifest: dict[str, dict[str, Any]],
    summary: str,
) -> dict[str, Any]:
    missing = [manifest[dataset_id]["name"] for dataset_id in datasets if not _is_available(manifest[dataset_id])]
    return {
        "key": key,
        "label": label,
        "status": status,
        "summary": summary,
        "datasets": datasets,
        "missing_datasets": missing,
    }


def build_upload_center_payload(
    dataset_manifest: dict[str, dict[str, Any]],
    history: list[dict[str, Any]],
    session_snapshot: dict[str, Any],
) -> dict[str, Any]:
    manifest = deepcopy(dataset_manifest)
    forecast_loaded = _is_available(manifest["forecast_input"]) or bool(
        (((session_snapshot.get("last_forecast") or {}).get("meta") or {}).get("row_count", 0))
    )
    bom_loaded = _is_available(manifest["bom"]) or bool((session_snapshot.get("bom_status") or {}).get("loaded"))
    production_loaded = _is_available(manifest["production"])
    sales_loaded = _is_available(manifest["sales_orders"])
    clients_loaded = _is_available(manifest["clients"])
    raw_material_loaded = _is_available(manifest["raw_material_inventory"])
    finance_sheet_loaded = _is_available(manifest["finance_spreadsheets"])
    finance_doc_loaded = _is_available(manifest["finance_documents"])
    mts_sim_loaded = bool((((session_snapshot.get("last_mts_simulation") or {}).get("meta") or {}).get("row_count", 0)))

    forecast_status = "ready" if forecast_loaded else "partial" if production_loaded or sales_loaded else "unavailable"
    mts_status = (
        "ready"
        if production_loaded and forecast_loaded and bom_loaded
        else "partial"
        if production_loaded and (forecast_loaded or bom_loaded or clients_loaded)
        else "unavailable"
    )
    raw_material_status = (
        "ready"
        if raw_material_loaded and bom_loaded and forecast_loaded
        else "partial"
        if raw_material_loaded or bom_loaded or forecast_loaded
        else "unavailable"
    )
    finance_status = (
        "ready"
        if (finance_sheet_loaded or finance_doc_loaded) and (raw_material_loaded or bom_loaded or mts_sim_loaded)
        else "partial"
        if finance_sheet_loaded or finance_doc_loaded or raw_material_loaded or mts_sim_loaded
        else "unavailable"
    )
    executive_status = (
        "ready"
        if all(status != "unavailable" for status in [forecast_status, mts_status, raw_material_status, finance_status])
        else "partial"
        if any(status != "unavailable" for status in [forecast_status, mts_status, raw_material_status, finance_status])
        else "unavailable"
    )

    readiness_items = [
        _build_readiness_node(
            key="forecast",
            label="Prontidao para Forecast",
            status=forecast_status,
            datasets=["production", "sales_orders", "forecast_input"],
            manifest=manifest,
            summary=(
                "Forecast consolidado com base de previsao pronta."
                if forecast_status == "ready"
                else "Forecast com cobertura parcial; faltam entradas para consolidacao."
                if forecast_status == "partial"
                else "Forecast indisponivel sem base operacional ou previsao."
            ),
        ),
        _build_readiness_node(
            key="mts_mto",
            label="Prontidao para MTS/MTO",
            status=mts_status,
            datasets=["production", "clients", "forecast_input", "bom"],
            manifest=manifest,
            summary=(
                "Politica MTS/MTO pronta para leitura executiva."
                if mts_status == "ready"
                else "Politica MTS/MTO com cobertura parcial; faltam bases para priorizacao completa."
                if mts_status == "partial"
                else "Politica MTS/MTO indisponivel sem historico operacional."
            ),
        ),
        _build_readiness_node(
            key="raw_material",
            label="Prontidao para Materia-Prima",
            status=raw_material_status,
            datasets=["forecast_input", "bom", "raw_material_inventory"],
            manifest=manifest,
            summary=(
                "Cobertura de materia-prima pronta para simulacao e risco."
                if raw_material_status == "ready"
                else "Cobertura de materia-prima parcial; faltam vinculos ou estoque."
                if raw_material_status == "partial"
                else "Cobertura de materia-prima indisponivel."
            ),
        ),
        _build_readiness_node(
            key="finance",
            label="Prontidao para Financeiro",
            status=finance_status,
            datasets=["finance_spreadsheets", "finance_documents", "raw_material_inventory", "bom"],
            manifest=manifest,
            summary=(
                "Camada financeira pronta para traducao executiva."
                if finance_status == "ready"
                else "Camada financeira parcial; ha arquivos, mas a cobertura ainda nao e total."
                if finance_status == "partial"
                else "Camada financeira indisponivel."
            ),
        ),
        _build_readiness_node(
            key="executive_ai",
            label="Prontidao para IA executiva",
            status=executive_status,
            datasets=[
                "production",
                "clients",
                "forecast_input",
                "bom",
                "raw_material_inventory",
                "finance_spreadsheets",
                "finance_documents",
            ],
            manifest=manifest,
            summary=(
                "IA executiva com base ampla para leitura de negocio."
                if executive_status == "ready"
                else "IA executiva com cobertura parcial; recomendacoes podem sair limitadas."
                if executive_status == "partial"
                else "IA executiva sem base suficiente para leitura robusta."
            ),
        ),
    ]

    ready_count = sum(1 for item in readiness_items if item["status"] == "ready")
    partial_count = sum(1 for item in readiness_items if item["status"] == "partial")
    overall_status = "ready" if ready_count >= 4 else "partial" if ready_count + partial_count >= 2 else "unavailable"
    readiness = {
        "overall": _build_readiness_node(
            key="overall",
            label="Prontidao geral",
            status=overall_status,
            datasets=list(manifest.keys()),
            manifest=manifest,
            summary=(
                "Cobertura analitica pronta para operacao executiva."
                if overall_status == "ready"
                else "Cobertura analitica parcial; ha lacunas abertas antes da leitura completa."
                if overall_status == "partial"
                else "Cobertura analitica indisponivel."
            ),
        )
    }
    for item in readiness_items:
        readiness[item["key"]] = item

    available_dataset_count = sum(1 for dataset in manifest.values() if _is_available(dataset))
    coverage_percent = int(round((available_dataset_count / max(len(manifest), 1)) * 100))

    datasets = []
    for dataset in manifest.values():
        dataset["available"] = _is_available(dataset)
        dataset["last_upload_status"] = _status_label(str(dataset.get("validation_status", "missing")))
        datasets.append(dataset)

    ordered_history = sorted(
        history,
        key=lambda item: str(item.get("uploaded_at") or ""),
        reverse=True,
    )

    return {
        "coverage_percent": coverage_percent,
        "available_dataset_count": available_dataset_count,
        "total_dataset_count": len(manifest),
        "datasets": datasets,
        "readiness": readiness,
        "history": ordered_history,
    }
