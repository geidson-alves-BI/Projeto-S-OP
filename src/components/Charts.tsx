import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell } from "recharts";
import type { ProductData } from "@/lib/pcpEngine";

const COLORS = {
  primary: "hsl(199, 89%, 48%)",
  success: "hsl(142, 76%, 36%)",
  warning: "hsl(38, 92%, 50%)",
  destructive: "hsl(0, 72%, 51%)",
  muted: "hsl(215, 15%, 55%)",
};

export function ABCParetoChart({ data, topN }: { data: ProductData[]; topN: number }) {
  const slice = data.slice(0, topN).map(d => ({
    name: d.SKU_LABEL.length > 20 ? d.codigoProduto : d.SKU_LABEL,
    volume: Math.round(d.volumeAnual),
    acumulado: Math.round(d.percAcumulado * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={slice} margin={{ bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 20%)" />
        <XAxis dataKey="name" angle={-45} textAnchor="end" fontSize={10} stroke={COLORS.muted} interval={0} height={80} />
        <YAxis yAxisId="left" stroke={COLORS.muted} fontSize={10} />
        <YAxis yAxisId="right" orientation="right" stroke={COLORS.muted} fontSize={10} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ backgroundColor: "hsl(220, 18%, 13%)", border: "1px solid hsl(220, 14%, 20%)", borderRadius: 8, fontFamily: "JetBrains Mono" }}
          labelStyle={{ color: "hsl(210, 20%, 92%)" }}
        />
        <Bar yAxisId="left" dataKey="volume" fill={COLORS.primary} radius={[2, 2, 0, 0]} name="Volume (kg)" />
        <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke={COLORS.warning} dot={false} strokeWidth={2} name="% Acumulado" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ABCCompleteChart({ data }: { data: ProductData[] }) {
  const chartData = data.map((d, i) => ({
    idx: i + 1,
    acumulado: Math.round(d.percAcumulado * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 20%)" />
        <XAxis dataKey="idx" stroke={COLORS.muted} fontSize={10} label={{ value: "Itens", position: "insideBottom", offset: -5 }} />
        <YAxis stroke={COLORS.muted} fontSize={10} domain={[0, 100]} />
        <Tooltip contentStyle={{ backgroundColor: "hsl(220, 18%, 13%)", border: "1px solid hsl(220, 14%, 20%)", borderRadius: 8 }} />
        <Line type="monotone" dataKey="acumulado" stroke={COLORS.primary} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const HEATMAP_COLORS: Record<string, string> = {
  AX: COLORS.primary,
  AY: COLORS.success,
  AZ: COLORS.warning,
  BX: COLORS.success,
  BY: COLORS.warning,
  BZ: COLORS.destructive,
  CX: COLORS.warning,
  CY: COLORS.destructive,
  CZ: COLORS.muted,
};

export function ABCXYZMatrix({ data }: { data: ProductData[] }) {
  const counts: Record<string, number> = {};
  for (const d of data) {
    counts[d.abcXyz] = (counts[d.abcXyz] || 0) + 1;
  }

  const abcRows: ("A" | "B" | "C")[] = ["A", "B", "C"];
  const xyzCols: ("X" | "Y" | "Z")[] = ["X", "Y", "Z"];

  return (
    <div className="overflow-x-auto">
      <table className="mx-auto">
        <thead>
          <tr>
            <th className="px-4 py-2 text-xs text-muted-foreground font-mono">ABC \\ XYZ</th>
            {xyzCols.map(x => (
              <th key={x} className="px-6 py-2 text-center text-sm font-mono text-foreground">{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {abcRows.map(a => (
            <tr key={a}>
              <td className="px-4 py-2 text-sm font-mono font-semibold text-foreground">{a}</td>
              {xyzCols.map(x => {
                const key = `${a}${x}`;
                const count = counts[key] || 0;
                return (
                  <td key={x} className="px-6 py-4 text-center">
                    <div
                      className="rounded-lg px-4 py-3 font-mono text-lg font-bold"
                      style={{
                        backgroundColor: `${HEATMAP_COLORS[key]}20`,
                        color: HEATMAP_COLORS[key],
                        border: `1px solid ${HEATMAP_COLORS[key]}40`,
                      }}
                    >
                      {count}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductSeriesChart({ data, monthCols }: { data: ProductData; monthCols: string[] }) {
  const chartData = monthCols.map(m => ({
    month: m,
    kg: Math.round(data.monthValues[m] || 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 20%)" />
        <XAxis dataKey="month" stroke={COLORS.muted} fontSize={10} angle={-45} textAnchor="end" height={60} />
        <YAxis stroke={COLORS.muted} fontSize={10} />
        <Tooltip contentStyle={{ backgroundColor: "hsl(220, 18%, 13%)", border: "1px solid hsl(220, 14%, 20%)", borderRadius: 8 }} />
        <Bar dataKey="kg" fill={COLORS.primary} radius={[3, 3, 0, 0]} name="Volume (kg)">
          {chartData.map((_, i) => (
            <Cell key={i} fill={i >= chartData.length - 3 ? COLORS.success : COLORS.primary} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
