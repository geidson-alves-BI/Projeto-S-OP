from __future__ import annotations

from typing import Any


def _normalize_label(value: str) -> str:
    return (
        str(value or "")
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )


def _to_number(value: Any) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if parsed == parsed else 0.0

    raw = str(value or "").strip()
    if not raw:
        return 0.0

    cleaned = raw.replace(" ", "")
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif cleaned.count(".") > 1:
        cleaned = cleaned.replace(".", "")

    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _sum_column(rows: list[dict[str, Any]], column: str) -> float:
    return float(sum(_to_number(row.get(column)) for row in rows))


def _pick_kpi_column(columns: list[str], keywords: list[str]) -> str | None:
    for column in columns:
        normalized = _normalize_label(column)
        if any(keyword in normalized for keyword in keywords):
            return column
    return None


def build_finance_documents_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    safe_rows = [row for row in rows if isinstance(row, dict)]
    if not safe_rows:
        return {
            "has_structured_rows": False,
            "row_count": 0,
            "column_count": 0,
            "numeric_columns": [],
            "kpis": {},
            "kpi_sources": {},
            "notes": [
                "Nenhuma linha estruturada foi encontrada em finance_documents.",
                "Anexos documentais continuam validos para governanca.",
            ],
        }

    columns = [str(column) for column in safe_rows[0].keys()]
    numeric_columns: list[str] = []
    for column in columns:
        has_numeric = any(_to_number(row.get(column)) != 0 for row in safe_rows)
        if has_numeric:
            numeric_columns.append(column)

    kpi_config = {
        "total_revenue": ["receita", "revenue", "faturamento", "sales", "venda"],
        "total_cost": ["custo", "cost", "cmv", "cogs", "cpv"],
        "total_expense": ["despesa", "expense", "gasto", "opex"],
        "ebitda": ["ebitda"],
        "net_income": ["lucro", "resultado", "net income", "profit"],
        "cash_flow": ["caixa", "cash", "fluxo de caixa", "cash flow"],
    }

    kpis: dict[str, float] = {}
    kpi_sources: dict[str, str] = {}
    for kpi_key, keywords in kpi_config.items():
        source_column = _pick_kpi_column(columns, keywords)
        if not source_column:
            continue
        kpis[kpi_key] = _sum_column(safe_rows, source_column)
        kpi_sources[kpi_key] = source_column

    notes: list[str] = []
    if not kpis and numeric_columns:
        generic_total = sum(_sum_column(safe_rows, column) for column in numeric_columns)
        kpis["total_numeric_signal"] = float(generic_total)
        kpi_sources["total_numeric_signal"] = "aggregate_numeric_columns"
        notes.append("KPIs financeiros inferidos por agregacao numerica por falta de colunas nomeadas.")
    elif not kpis:
        notes.append("Nenhuma coluna numerica foi reconhecida para calculo de KPI financeiro.")

    return {
        "has_structured_rows": True,
        "row_count": int(len(safe_rows)),
        "column_count": int(len(columns)),
        "numeric_columns": numeric_columns,
        "kpis": kpis,
        "kpi_sources": kpi_sources,
        "notes": notes,
    }
