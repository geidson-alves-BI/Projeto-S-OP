import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppDataProvider } from "@/contexts/AppDataContext";
import Layout from "@/components/Layout";
import HomePage from "@/pages/HomePage";
import UploadPage from "@/pages/UploadPage";
import DemandaFGPage from "@/pages/DemandaFGPage";
import AbcXyzPage from "@/pages/AbcXyzPage";
import ForecastPage from "@/pages/ForecastPage";
import MtsPage from "@/pages/MtsPage";
import RMUploadPage from "@/pages/RMUploadPage";
import RMSlaPage from "@/pages/RMSlaPage";
import FinanceiroPage from "@/pages/FinanceiroPage";
import RelatoriosPage from "@/pages/RelatoriosPage";
import ComplexidadePage from "@/pages/ComplexidadePage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppDataProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/demanda" element={<DemandaFGPage />} />
              <Route path="/abc-xyz" element={<AbcXyzPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/mts" element={<MtsPage />} />
              <Route path="/rm-upload" element={<RMUploadPage />} />
              <Route path="/rm-sla" element={<RMSlaPage />} />
              <Route path="/financeiro" element={<FinanceiroPage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/complexidade" element={<ComplexidadePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppDataProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
