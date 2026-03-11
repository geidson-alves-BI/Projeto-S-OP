import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type RouteErrorBoundaryProps = {
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

class RouteErrorBoundaryInner extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Route render error", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="p-6">
        <div className="rounded-2xl border border-destructive/35 bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Falha ao renderizar esta pagina</p>
              <p className="text-sm text-muted-foreground">
                A interface principal segue ativa. Voce pode tentar novamente ou navegar para outra aba.
              </p>
              {this.state.message ? (
                <p className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                  {this.state.message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={this.handleRetry}>
              <RefreshCcw className="h-4 w-4" />
              Tentar novamente
            </Button>
            <Button asChild>
              <Link to="/">Voltar ao inicio</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }
}

export default function RouteErrorBoundary({ children }: RouteErrorBoundaryProps) {
  const location = useLocation();
  return <RouteErrorBoundaryInner key={`${location.pathname}${location.search}`}>{children}</RouteErrorBoundaryInner>;
}
