import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppDataProvider } from "@/contexts/AppDataContext";
import Layout from "@/components/Layout";
import HomePage from "@/pages/HomePage";
import UploadPage from "@/pages/UploadPage";
import AbcXyzPage from "@/pages/AbcXyzPage";
import ForecastPage from "@/pages/ForecastPage";
import MtsPage from "@/pages/MtsPage";
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
              <Route path="/demanda" element={<PlaceholderPage title="Demanda FG" description="Upload, validação e visão histórica de demanda de Finished Goods. Em breve." />} />
              <Route path="/abc-xyz" element={<AbcXyzPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/mts" element={<MtsPage />} />
              <Route path="/rm-upload" element={<PlaceholderPage title="Upload Matéria-Prima" description="Upload de base RM e MPs necessárias. Em breve." />} />
              <Route path="/rm-sla" element={<PlaceholderPage title="Gestão SLA" description="Painel dinâmico de SLA por seleção (90%, 95%, 98%, 99%). Em breve." />} />
              <Route path="/financeiro" element={<PlaceholderPage title="Financeiro" description="Investimento por SKU e por RM. Em breve." />} />
              <Route path="/relatorios" element={<PlaceholderPage title="Relatórios / Pack S&OP" description="Geração de pack S&OP com export CSV/Excel. Em breve." />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppDataProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
