from __future__ import annotations

from io import BytesIO, StringIO
from typing import Dict, Any

import pandas as pd


REPORT_COLUMNS = [
    "product_code",
    "product_name",
    "total_sales",
    "sales_frequency",
    "coefficient_variation",
    "abc_class",
    "xyz_class",
    "recommended_strategy",
    "recommended_stock",
]


MTS_DAYS = {
    "AX": 60,
    "AY": 45,
    "AZ": 0,
    "BX": 45,
    "BY": 30,
    "BZ": 0,
    "CX": 30,
    "CY": 15,
    "CZ": 0,
}


def _classify_abc(cum_share: float) -> str:
    if cum_share <= 0.80:
        return "A"
    if cum_share <= 0.95:
        return "B"
    return "C"


def _classify_xyz(cv: float) -> str:
    if cv <= 0.50:
        return "X"
    if cv <= 1.00:
        return "Y"
    return "Z"


def _strategy_for(abc_class: str, xyz_class: str) -> str:
    combo = f"{abc_class}{xyz_class}"
    return "MTS" if MTS_DAYS.get(combo, 0) > 0 else "MTO"


def _recommended_stock(abc_class: str, xyz_class: str, mean_sales: float) -> float:
    days = MTS_DAYS.get(f"{abc_class}{xyz_class}", 0)
    if days <= 0:
        return 0.0
    return round(float(mean_sales) * days, 4)


def build_strategy_report(
    rows: list[Dict[str, Any]],
    product_code_col: str,
    product_name_col: str,
    sales_col: str,
) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=REPORT_COLUMNS)

    df = pd.DataFrame(rows)
    missing = [c for c in [product_code_col, product_name_col, sales_col] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required input columns: {missing}")

    base = df[[product_code_col, product_name_col, sales_col]].copy()
    base = base.rename(
        columns={
            product_code_col: "product_code",
            product_name_col: "product_name",
            sales_col: "sales",
        }
    )
    base["sales"] = pd.to_numeric(base["sales"], errors="coerce").fillna(0.0)

    agg = base.groupby(["product_code", "product_name"], as_index=False).agg(
        total_sales=("sales", "sum"),
        sales_frequency=("sales", lambda s: int((s > 0).sum())),
        mean_sales=("sales", "mean"),
        std_sales=("sales", "std"),
    )
    agg["std_sales"] = agg["std_sales"].fillna(0.0)
    agg["coefficient_variation"] = agg.apply(
        lambda row: (row["std_sales"] / row["mean_sales"]) if row["mean_sales"] else 0.0,
        axis=1,
    )

    total_sales_sum = float(agg["total_sales"].sum()) or 1.0
    agg = agg.sort_values("total_sales", ascending=False).reset_index(drop=True)
    agg["share"] = agg["total_sales"] / total_sales_sum
    agg["cum_share"] = agg["share"].cumsum()

    agg["abc_class"] = agg["cum_share"].apply(_classify_abc)
    agg["xyz_class"] = agg["coefficient_variation"].apply(_classify_xyz)
    agg["recommended_strategy"] = agg.apply(
        lambda row: _strategy_for(row["abc_class"], row["xyz_class"]),
        axis=1,
    )
    agg["recommended_stock"] = agg.apply(
        lambda row: _recommended_stock(row["abc_class"], row["xyz_class"], row["mean_sales"]),
        axis=1,
    )

    report = agg[REPORT_COLUMNS].copy()
    report["total_sales"] = report["total_sales"].astype(float)
    report["coefficient_variation"] = report["coefficient_variation"].astype(float)
    report["recommended_stock"] = report["recommended_stock"].astype(float)

    return report


def export_strategy_report_csv(report: pd.DataFrame) -> bytes:
    buffer = StringIO()
    report.to_csv(buffer, index=False)
    return buffer.getvalue().encode("utf-8")


def export_strategy_report_excel(report: pd.DataFrame) -> bytes:
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        report.to_excel(writer, index=False, sheet_name="strategy_report")
    output.seek(0)
    return output.read()


def _escape_pdf_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _build_simple_pdf(lines: list[str]) -> bytes:
    safe_lines = lines[:55] if lines else ["Relatorio estrategico vazio."]
    content_lines = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
    first = True
    for line in safe_lines:
        escaped = _escape_pdf_text(line[:150])
        if first:
            content_lines.append(f"({escaped}) Tj")
            first = False
        else:
            content_lines.append("T*")
            content_lines.append(f"({escaped}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects: list[bytes] = []
    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(b"2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n")
    objects.append(
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
    )
    objects.append(
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )
    objects.append(
        b"5 0 obj\n<< /Length "
        + str(len(stream)).encode("ascii")
        + b" >>\nstream\n"
        + stream
        + b"\nendstream\nendobj\n"
    )

    pdf = bytearray()
    pdf.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        (
            "trailer\n"
            f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            "startxref\n"
            f"{xref_offset}\n"
            "%%EOF\n"
        ).encode("ascii")
    )
    return bytes(pdf)


def export_strategy_report_pdf(report: pd.DataFrame) -> bytes:
    lines = [
        "Operion - Relatorio estrategico S&OP",
        f"Registros: {int(len(report))}",
        "",
        "Top produtos (max 40):",
    ]
    for row in report.head(40).to_dict(orient="records"):
        lines.append(
            f"{row.get('product_code', '-')}: {row.get('product_name', '-')}"
            f" | classe {row.get('abc_class', '-')}{row.get('xyz_class', '-')}"
            f" | estrategia {row.get('recommended_strategy', '-')}"
            f" | vendas {float(row.get('total_sales', 0.0)):.2f}"
        )
    return _build_simple_pdf(lines)
