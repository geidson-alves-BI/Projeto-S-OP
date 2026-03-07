import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  className?: string;
}

export default function MetricCard({ label, value, sub, accent, className }: MetricCardProps) {
  return (
    <div className={cn(
      "metric-card relative overflow-hidden group",
      accent && "border-primary/30",
      className
    )}>
      {accent && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] to-transparent pointer-events-none" />
      )}
      <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">{label}</p>
      <p className="mt-1.5 text-2xl font-bold font-mono glow-text leading-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
