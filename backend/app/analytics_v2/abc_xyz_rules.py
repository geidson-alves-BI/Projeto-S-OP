from __future__ import annotations

ABC_CLASS_A_THRESHOLD = 0.80
ABC_CLASS_B_THRESHOLD = 0.95

XYZ_CLASS_X_THRESHOLD = 0.50
XYZ_CLASS_Y_THRESHOLD = 1.00

ABC_CRITERIA_TEXT = (
    "Classe por participacao acumulada no volume total "
    "(A ate 80%, B ate 95%, C acima de 95%)."
)
XYZ_CRITERIA_TEXT = (
    "Classe por variabilidade (CV): X ate 0.50, Y ate 1.00, Z acima de 1.00."
)
COMBINED_CRITERIA_TEXT = "Combinacao direta entre classe ABC e classe XYZ por SKU."

TARGET_DAYS_BY_CLASS: dict[str, int] = {
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


def classify_abc(cumulative_share: float) -> str:
    if cumulative_share <= ABC_CLASS_A_THRESHOLD:
        return "A"
    if cumulative_share <= ABC_CLASS_B_THRESHOLD:
        return "B"
    return "C"


def classify_xyz(cv: float) -> str:
    if cv <= XYZ_CLASS_X_THRESHOLD:
        return "X"
    if cv <= XYZ_CLASS_Y_THRESHOLD:
        return "Y"
    return "Z"
