import { Link, useLocation } from "react-router-dom";
import { Activity, ChevronDown, Upload as UploadIcon, BarChart3, TrendingUp, Package, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppData } from "@/contexts/AppDataContext";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Demanda FG",
    icon: BarChart3,
    items: [
      { to: "/demanda", label: "Upload & Validação" },
      { to: "/abc-xyz", label: "ABC / XYZ" },
    ],
  },
  {
    label: "Planejamento",
    icon: TrendingUp,
    items: [
      { to: "/forecast", label: "Forecast" },
      { to: "/mts", label: "MTS / MTO" },
      { to: "/complexidade", label: "Complexidade" },
    ],
  },
  {
    label: "Matéria-Prima",
    icon: Package,
    items: [
      { to: "/rm-upload", label: "Upload RM" },
      { to: "/rm-sla", label: "Gestão SLA" },
    ],
  },
  {
    label: "Financeiro",
    icon: DollarSign,
    items: [
      { to: "/financeiro", label: "Investimento" },
      { to: "/relatorios", label: "Pack S&OP" },
    ],
  },
];

export default function TopNav() {
  const location = useLocation();
  const { state, reset } = useAppData();

  return (
    <header className="border-b border-border/80 bg-card/80 backdrop-blur-xl px-4 py-2 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="relative">
            <Activity className="h-5 w-5 text-primary transition-transform group-hover:scale-110" />
            <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-base font-bold font-mono glow-text hidden sm:inline tracking-tight">
            CONTROL TOWER
          </span>
        </Link>

        {/* Nav groups */}
        {state && (
          <nav className="flex items-center gap-0.5 ml-2 overflow-x-auto">
            <Link to="/">
              <Button
                variant={location.pathname === "/" ? "default" : "ghost"}
                size="sm"
                className="font-mono text-xs h-8"
              >
                Home
              </Button>
            </Link>

            {navGroups.map(group => {
              const isActive = group.items.some(i => location.pathname === i.to);
              const Icon = group.icon;
              return (
                <DropdownMenu key={group.label}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "font-mono text-xs h-8 gap-1.5",
                        !isActive && "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">{group.label}</span>
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-popover/95 backdrop-blur-xl border-border/80 z-50 min-w-[160px]">
                    <div className="px-2 py-1.5 mb-1">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{group.label}</p>
                    </div>
                    {group.items.map(item => (
                      <DropdownMenuItem key={item.to} asChild>
                        <Link
                          to={item.to}
                          className={cn(
                            "font-mono text-xs cursor-pointer",
                            location.pathname === item.to && "text-primary font-semibold"
                          )}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {state && (
            <span className="text-[11px] text-muted-foreground font-mono hidden md:inline tracking-wide">
              {state.products.length} SKUs · {state.monthCols.length} meses
              {state.hasClientes && ` · ${state.clientes.length} cli`}
            </span>
          )}
          {state && (
            <Button variant="outline" size="sm" className="font-mono text-xs h-7 gap-1.5" onClick={reset}>
              <UploadIcon className="h-3 w-3" /> Nova
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
