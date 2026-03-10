import { ArrowRight, Boxes, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/MetricCard";
import PageTransition from "@/components/PageTransition";
import AnalysisStatusPanel from "@/components/AnalysisStatusPanel";
import { useAppData } from "@/contexts/AppDataContext";
import { useUploadCenter } from "@/hooks/use-upload-center";
import { getRMSummary } from "@/lib/rmEngine";

export default function RMUploadPage() {
  const { rmData } = useAppData();
  const { uploadCenter } = useUploadCenter(true);
  const summary = rmData ? getRMSummary(rmData, 84) : null;

  return (
    <PageTransition className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="page-header">
        <h2>
          <Boxes className="h-5 w-5 text-primary" /> Estrutura de produto e cobertura de insumos
        </h2>
        <p>O upload primario saiu desta aba. Aqui ficam a leitura executiva e o acesso a cobertura de materia-prima.</p>
      </div>

      <AnalysisStatusPanel
        uploadCenter={uploadCenter}
        moduleKey="raw_material"
        title="Prontidao de materia-prima"
        description="A central de upload agora recebe estrutura de produto, forecast e estoque de insumos. Esta aba ficou orientada a leitura e decisao."
        datasetIds={["forecast_input", "bom", "raw_material_inventory"]}
      />

      {summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Total de insumos" value={summary.total} accent />
            <MetricCard label="Abaixo do SLA" value={summary.belowSLA} />
            <MetricCard label="Dentro do SLA" value={summary.aboveSLA} />
            <MetricCard label="Cobertura media" value={`${summary.coberturMedia} dias`} />
            <MetricCard
              label="Investimento p/ SLA"
              value={`U$ ${Math.round(summary.investimentoTotal).toLocaleString()}`}
            />
          </div>

          <section className="metric-card flex flex-wrap items-center gap-3">
            <Shield className="h-4 w-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              A leitura detalhada continua disponivel no painel de SLA, agora sem duplicar a ingestao de dados.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/rm-sla">
                Abrir painel de SLA
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </section>
        </>
      ) : (
        <section className="metric-card text-center py-10">
          <p className="text-sm text-muted-foreground">
            Nenhuma base de materia-prima esta carregada em memoria. Use a central de upload para liberar a cobertura de insumos.
          </p>
        </section>
      )}
    </PageTransition>
  );
}
