import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Factory,
  FileText,
  Package,
  Settings2,
  TrendingUp,
  Upload as UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppData } from "@/contexts/AppDataContext";
import { loadLocalSettings } from "@/lib/local-settings";
import { hasUpdaterAttention } from "@/lib/updater";
import { useOperionDesktopStatus } from "@/hooks/use-operion-desktop";
import { cn } from "@/lib/utils";

const navSections = [
  {
    label: "Supply",
    icon: Factory,
    items: [
      { to: "/demanda", label: "Base operacional" },
      { to: "/abc-xyz", label: "ABC / XYZ" },
    ],
  },
  {
    label: "Producao / Planejamento",
    icon: TrendingUp,
    items: [
      { to: "/planejamento-producao", label: "Planejamento e Producao" },
      { to: "/forecast", label: "Forecast" },
      { to: "/mts", label: "MTS / MTO" },
      { to: "/complexidade", label: "Complexidade" },
    ],
  },
  {
    label: "Materia-Prima",
    icon: Package,
    items: [
      { to: "/rm-upload", label: "Cobertura de insumos" },
      { to: "/rm-sla", label: "Gestao SLA" },
    ],
  },
  {
    label: "Financeiro",
    icon: BriefcaseBusiness,
    items: [{ to: "/financeiro", label: "Investimento e valor" }],
  },
  {
    label: "Relatorios",
    icon: FileText,
    items: [{ to: "/relatorios", label: "Pack S&OP" }],
  },
] as const;

const directLinks = [
  { to: "/", label: "Inicio", icon: null },
  { to: "/upload", label: "Upload de Dados", icon: UploadIcon },
  { to: "/ia", label: "IA Executiva", icon: Bot },
] as const;

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, rmData, reset } = useAppData();
  const compactNavigation = loadLocalSettings().general.compactNavigation;
  const { updaterStatus } = useOperionDesktopStatus();

  const hasLoadedData = Boolean(state || rmData);

  const handleNewLoad = () => {
    reset();
    navigate("/upload");
  };

  const showUpdateBadgeOnSettings = hasUpdaterAttention(updaterStatus);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-[rgba(6,11,23,0.88)] px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-3 shrink-0 group">
          <div className="relative">
            <Activity className="h-5 w-5 text-primary transition-transform group-hover:scale-110" />
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-lg opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Operion</p>
            <p className="text-sm font-semibold tracking-tight text-foreground">Executive Control</p>
          </div>
        </Link>

        <nav className="ml-2 flex items-center gap-1 overflow-x-auto">
          {directLinks.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.to === "/"
                ? location.pathname === item.to
                : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

            return (
              <Link key={item.to} to={item.to}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-9 gap-2 rounded-xl px-3 text-xs",
                    compactNavigation ? "px-2.5" : "px-3.5",
                    !isActive && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                  <span>{item.label}</span>
                </Button>
              </Link>
            );
          })}

          {navSections.map((section) => {
            const Icon = section.icon;
            const isActive = section.items.some((item) => location.pathname === item.to);

            if (section.items.length === 1) {
              const item = section.items[0];
              return (
                <Link key={section.label} to={item.to}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-9 gap-2 rounded-xl px-3 text-xs",
                      compactNavigation ? "px-2.5" : "px-3.5",
                      !isActive && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{section.label}</span>
                  </Button>
                </Link>
              );
            }

            return (
              <DropdownMenu key={section.label}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-9 gap-2 rounded-xl px-3 text-xs",
                      compactNavigation ? "px-2.5" : "px-3.5",
                      !isActive && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">{section.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[220px] rounded-2xl border-border/80 bg-popover/95 p-2 backdrop-blur-xl">
                  <div className="px-2 pb-1 pt-1">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">{section.label}</p>
                  </div>
                  {section.items.map((item) => (
                    <DropdownMenuItem key={item.to} asChild className="rounded-xl">
                      <Link
                        to={item.to}
                        className={cn(
                          "flex items-center justify-between gap-3 px-2 py-2 text-sm",
                          location.pathname === item.to && "text-primary",
                        )}
                      >
                        <span>{item.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          {/* Configuracoes — always last */}
          <Link to={showUpdateBadgeOnSettings ? "/configuracoes?tab=atualizacoes" : "/configuracoes"}>
            <Button
              variant={location.pathname === "/configuracoes" ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-9 gap-2 rounded-xl px-3 text-xs",
                compactNavigation ? "px-2.5" : "px-3.5",
                location.pathname !== "/configuracoes" && "text-muted-foreground hover:text-foreground",
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>Configuracoes</span>
              {showUpdateBadgeOnSettings && <span className="h-2 w-2 rounded-full bg-warning" />}
            </Button>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {hasLoadedData && state ? (
            <div className="hidden rounded-full border border-border/70 bg-card/70 px-3 py-1 md:flex md:flex-col">
              <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Escopo</span>
              <span className="text-xs text-foreground">
                {state.products.length} SKUs | {state.monthCols.length} meses
                {state.hasClientes ? ` | ${state.clientes.length} clientes` : ""}
              </span>
            </div>
          ) : null}

          <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl text-xs" onClick={handleNewLoad}>
            <UploadIcon className="h-3.5 w-3.5" />
            {hasLoadedData ? "Reabrir uploads" : "Carregar dados"}
          </Button>
        </div>
      </div>
    </header>
  );
}
