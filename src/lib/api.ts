const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export async function health() {
  return apiFetch<{ status: string }>("/health");
}

export async function computeSlaMP(payload: {
  sla: number;
  mean: number;
  std: number;
  stock_on_hand?: number;
}) {
  return apiFetch<{ z: number; protected_level: number; suggested_buy: number }>("/sla/mp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function computeABCXYZ(payload: {
  rows: any[];
  sku_col?: string;
  qty_col?: string;
  cost_col?: string;
  date_col?: string;
}) {
  return apiFetch<{ items: any[] }>("/compute/abcxyz", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function computeForecast(payload: {
  rows: any[];
  sku_col?: string;
  qty_col?: string;
  date_col?: string;
  horizon_months: number;
  growth?: number;
}) {
  return apiFetch<{ items: any[] }>("/compute/forecast", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}