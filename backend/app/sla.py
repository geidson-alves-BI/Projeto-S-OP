from .utils import z_from_sla

def compute_sla(mean: float, std: float, sla: float, stock_on_hand: float = 0.0):
    z = z_from_sla(sla)
    protected_level = mean + z * std
    suggested_buy = max(0.0, protected_level - (stock_on_hand or 0.0))
    return z, protected_level, suggested_buy