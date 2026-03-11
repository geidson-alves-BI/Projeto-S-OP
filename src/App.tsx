import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import { AppDataProvider } from "@/contexts/AppDataContext";
import HomePage from "@/pages/HomePage";
import UploadPage from "@/pages/UploadPage";
import DemandaFGPage from "@/pages/DemandaFGPage";
import AbcXyzPage from "@/pages/AbcXyzPage";
import ForecastPage from "@/pages/ForecastPage";
import MtsPage from "@/pages/MtsPage";
import PlanningProductionPage from "@/pages/PlanningProductionPage";
import ComplexidadePage from "@/pages/ComplexidadePage";
import RMUploadPage from "@/pages/RMUploadPage";
import RMSlaPage from "@/pages/RMSlaPage";
import FinanceiroPage from "@/pages/FinanceiroPage";
import RelatoriosPage from "@/pages/RelatoriosPage";
import AIPage from "@/pages/AIPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const RouterComponent =
  typeof window !== "undefined" && window.location.protocol === "file:"
    ? HashRouter
    : BrowserRouter;

export default function App() {
  return (
    <RouterComponent>
      <AppDataProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="demanda" element={<DemandaFGPage />} />
            <Route path="abc-xyz" element={<AbcXyzPage />} />
            <Route path="planejamento-producao" element={<PlanningProductionPage />} />
            <Route path="forecast" element={<ForecastPage />} />
            <Route path="mts" element={<MtsPage />} />
            <Route path="complexidade" element={<ComplexidadePage />} />
            <Route path="rm-upload" element={<RMUploadPage />} />
            <Route path="rm-sla" element={<RMSlaPage />} />
            <Route path="financeiro" element={<FinanceiroPage />} />
            <Route path="relatorios" element={<RelatoriosPage />} />
            <Route path="ia" element={<AIPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="index" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppDataProvider>
    </RouterComponent>
  );
}
