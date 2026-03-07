import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { parseFile } from "@/lib/fileParser";
import {
  prepProducao, prepClientes, mergeWithClientes,
  toWide, pipeline, concentrationMetrics, applyConcentrationAdjustment,
  getUniqueClientes,
  type ProductData, type LongRow, type ProductConcentration, type PortfolioConcentration,
} from "@/lib/pcpEngine";
import type { RMData } from "@/lib/rmEngine";

export interface AppState {
  products: ProductData[];
  monthCols: string[];
  prodLong: LongRow[];
  prodConc: ProductConcentration[];
  portfolioConc: PortfolioConcentration | null;
  clientes: string[];
  hasClientes: boolean;
}

interface AppDataContextType {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  fileProd: File | null;
  fileCli: File | null;
  setFileProd: (f: File | null) => void;
  setFileCli: (f: File | null) => void;
  handleLoad: () => Promise<void>;
  reset: () => void;
  rmData: RMData[] | null;
  setRMData: (data: RMData[] | null) => void;
  lastFGImportAt: string | null;
  lastClientesImportAt: string | null;
  lastRMImportAt: string | null;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [fileProd, setFileProd] = useState<File | null>(null);
  const [fileCli, setFileCli] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [rmData, setRMData] = useState<RMData[] | null>(null);
  const [lastFGImportAt, setLastFGImportAt] = useState<string | null>(null);
  const [lastClientesImportAt, setLastClientesImportAt] = useState<string | null>(null);
  const [lastRMImportAt, setLastRMImportAt] = useState<string | null>(null);

  const handleLoad = useCallback(async () => {
    if (!fileProd) { setError("Envie a base de Producao primeiro."); return; }
    setLoading(true);
    setError(null);
    try {
      const rawProd = await parseFile(fileProd);
      let prodLong = prepProducao(rawProd);

      let hasClientes = false;
      if (fileCli) {
        const rawCli = await parseFile(fileCli);
        const clientes = prepClientes(rawCli);
        prodLong = mergeWithClientes(prodLong, clientes);
        hasClientes = true;
      }

      const { wide, monthCols } = toWide(prodLong);
      let products = pipeline(wide, monthCols);

      let prodConc: ProductConcentration[] = [];
      let portfolioConc: PortfolioConcentration | null = null;

      if (hasClientes) {
        const conc = concentrationMetrics(prodLong);
        prodConc = conc.prodConc;
        portfolioConc = conc.portfolioConc;
        products = applyConcentrationAdjustment(products, prodConc);
      } else {
        products = products.map(p => ({
          ...p,
          diasAlvoAjustado: p.diasAlvoBase,
          estrategiaFinal: p.estrategiaBase,
          targetKgAjustado: p.consumoDiario * p.diasAlvoBase,
        }));
      }

      const clientesList = getUniqueClientes(prodLong);

      setState({
        products, monthCols, prodLong, prodConc, portfolioConc,
        clientes: clientesList, hasClientes,
      });
      setLastFGImportAt(new Date().toISOString());
      setLastClientesImportAt(hasClientes ? new Date().toISOString() : null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fileProd, fileCli]);

  const handleSetRMData = useCallback((data: RMData[] | null) => {
    setRMData(data);
    if (data && data.length > 0) {
      setLastRMImportAt(new Date().toISOString());
    }
  }, []);

  const reset = useCallback(() => {
    setState(null);
    setFileProd(null);
    setFileCli(null);
    setRMData(null);
    setError(null);
    setLastFGImportAt(null);
    setLastClientesImportAt(null);
    setLastRMImportAt(null);
  }, []);

  return (
    <AppDataContext.Provider value={{
      state, loading, error, fileProd, fileCli,
      setFileProd, setFileCli, handleLoad, reset,
      rmData, setRMData: handleSetRMData,
      lastFGImportAt, lastClientesImportAt, lastRMImportAt,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}
