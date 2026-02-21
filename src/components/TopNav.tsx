import { Link, useLocation } from "react-router-dom";
import { Activity, ChevronDown, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppData } from "@/contexts/AppDataContext";

const navGroups = [
  {
    label: "Demanda FG",
    items: [
      { to: "/demanda", label: "Upload & Validação" },
      { to: "/abc-xyz", label: "ABC / XYZ" },
    ],
  },
  {
    label: "Planejamento",
    items: [
      { to: "/forecast", label: "Forecast" },
      { to: "/mts", label: "MTS / MTO" },
    ],
  },
  {
    label: "Matéria-Prima",
    items: [
      { to: "/rm-upload", label: "Upload RM" },
      { to: "/rm-sla", label: "Gestão SLA" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { to: "/financeiro", label: "Investimento" },
      { to: "/relatorios", label: "Relatórios / Pack" },
    ],
  },
];

export default function TopNav() {
  const location = useLocation();
  const { state, reset } = useAppData();

  return (
    <header className="border-b border-border bg-card px-4 py-2">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <Activity className="h-5 w-5 text-primary" />
          <span className="text-base font-bold font-mono glow-text hidden sm:inline">CONTROL TOWER</span>
        </Link>

        {/* Nav groups */}
        {state && (
          <nav className="flex items-center gap-1 ml-2 overflow-x-auto">
            <Link to="/">
              <Button
                variant={location.pathname === "/" ? "default" : "ghost"}
                size="sm"
                className="font-mono text-xs h-8"
              >
                Home
              </Button>
            </Link>

            {navGroups.map(group => (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={group.items.some(i => location.pathname === i.to) ? "default" : "ghost"}
                    size="sm"
                    className="font-mono text-xs h-8 gap-1"
                  >
                    {group.label}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-popover border-border z-50">
                  {group.items.map(item => (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link
                        to={item.to}
                        className={`font-mono text-xs cursor-pointer ${
                          location.pathname === item.to ? "text-primary" : ""
                        }`}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </nav>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {state && (
            <span className="text-xs text-muted-foreground font-mono hidden md:inline">
              {state.products.length} SKUs · {state.monthCols.length} meses
              {state.hasClientes && ` · ${state.clientes.length} cli`}
            </span>
          )}
          {state && (
            <Button variant="outline" size="sm" className="font-mono text-xs h-7" onClick={reset}>
              <UploadIcon className="h-3 w-3 mr-1" /> Nova
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
