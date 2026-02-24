import pandas as pd

def to_dataframe(rows):
    return pd.DataFrame(rows)

def ensure_datetime(df, col):
    df[col] = pd.to_datetime(df[col])
    return df

def z_from_sla(sla: float) -> float:
    from scipy.stats import norm
    return float(norm.ppf(sla))

def safe_div(a, b):
    return a / b if b not in (0, None) else 0.0
    