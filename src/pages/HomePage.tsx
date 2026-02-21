import { useNavigate } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { useEffect } from "react";
import MetricCard from "@/components/MetricCard";
import { Link } from "react-router-dom";
import { BarChart3, TrendingUp, Package, FileSpreadsheet, Users } from "lucide-react";

export default function HomePage() {
  const { state } = useAppData();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state) navigate("/upload");
  }, [state, navigate]);

  if (!state) return null;

  const countA = state.products.filter(p => p.classeABC === "A").length;
  const countB = state.products.filter(p => p.classeABC === "B").length;
  const countC = state.products.filter(p => p.classeABC === "C").length;
  const countMTS = state.products.filter(p => (p.estrategiaFinal ?? p.estrategiaBase).includes("MTS")).length;
  const volumeTotal = state.products.reduce((sum, p) => sum + p.volumeAnual, 0);

  const modules = [
    { to: "/abc-xyz", icon: BarChart3, label: "ABC / XYZ", desc: "Classificação e matriz" },
    { to: "/forecast", icon: TrendingUp, label: "Forecast", desc: "Projeção de demanda" },
    { to: "/mts", icon: Package, label: "MTS / MTO", desc: "Recomendações e export" },
    { to: "/relatorios", icon: FileSpreadsheet, label: "Relatórios", desc: "Pack S&OP" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono text-foreground">Home Executiva — S&OE / S&OP</h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {state.products.length} SKUs · {state.monthCols.length} meses
          {state.hasClientes && ` · ${state.clientes.length} clientes`}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Total SKUs" value={state.products.length} />
        <MetricCard label="Vol. Total Produzido" value={`${Math.round(volumeTotal).toLocaleString()} kg`} />
        <MetricCard label="Classe A" value={countA} sub={`${Math.round(countA / state.products.length * 100)}% dos SKUs`} />
        <MetricCard label="Classe B" value={countB} />
        <MetricCard label="Classe C" value={countC} />
        <MetricCard label="Candidatos MTS" value={countMTS} />
        {state.portfolioConc && (
          <MetricCard label="HHI Portfólio" value={state.portfolioConc.hhiPortfolio.toFixed(3)} sub={`Top1: ${(state.portfolioConc.top1SharePortfolio * 100).toFixed(1)}%`} />
        )}
      </div>

      {/* Module shortcuts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {modules.map(m => (
          <Link key={m.to} to={m.to} className="metric-card hover:border-primary/50 transition-colors group cursor-pointer">
            <m.icon className="h-5 w-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-sm font-bold font-mono text-foreground">{m.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
