interface Props {
  classe: string;
}

export function ABCBadge({ classe }: Props) {
  const cls = classe === "A" ? "badge-a" : classe === "B" ? "badge-b" : "badge-c";
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-semibold ${cls}`}>{classe}</span>;
}

export function StratBadge({ strat }: { strat: string }) {
  const cls = strat.includes("MTS") ? "badge-mts" : "badge-mto";
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-semibold ${cls}`}>{strat}</span>;
}
