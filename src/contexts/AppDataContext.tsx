import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { parseFile } from "@/lib/fileParser";
import {
  prepProducao, prepClientes, mergeWithClientes,
  toWide, pipeline, concentrationMetrics, applyConcentrationAdjustment,
  getUniqueClientes,
  type ProductData, type LongRow, type ProductConcentration, type PortfolioConcentration, type RawRow,
} from "@/lib/pcpEngine";
import {
  processRM,
  validateRMColumns,
  type RMColumnValidation,
  type RMData,
} from "@/lib/rmEngine";

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
  loadProductionFile: (file: File) => Promise<{
    rowCount: number;
    columns: string[];
    productsCount: number;
    monthCount: number;
    clientsCount: number;
    hasClientes: boolean;
  }>;
  loadClientsFile: (file: File) => Promise<{
    rowCount: number;
    columns: string[];
    linkedProducts: number;
    hasProductionLoaded: boolean;
  }>;
  loadRawMaterialFile: (file: File) => Promise<{
    validation: RMColumnValidation;
    rowCount: number;
    columns: string[];
  }>;
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
  const [productionSourceRows, setProductionSourceRows] = useState<RawRow[] | null>(null);
  const [clientSourceRows, setClientSourceRows] = useState<RawRow[] | null>(null);
  const [lastFGImportAt, setLastFGImportAt] = useState<string | null>(null);
  const [lastClientesImportAt, setLastClientesImportAt] = useState<string | null>(null);
  const [lastRMImportAt, setLastRMImportAt] = useState<string | null>(null);

  const rebuildState = useCallback((rawProd: RawRow[] | null, rawCli: RawRow[] | null) => {
    if (!rawProd || rawProd.length === 0) {
      setState(null);
      return {
        productsCount: 0,
        monthCount: 0,
        clientsCount: 0,
        hasClientes: false,
      };
    }

    let prodLong = prepProducao(rawProd);
    let hasClientes = false;

    if (rawCli && rawCli.length > 0) {
      const clientes = prepClientes(rawCli);
      prodLong = mergeWithClientes(prodLong, clientes);
      hasClientes = true;
    }

    const { wide, monthCols } = toWide(prodLong);
    let products = pipeline(wide, monthCols);

    let prodConc: ProductConcentration[] = [];
    let portfolioConc: PortfolioConcentration | null = null;

    if (hasClientes) {
      const concentration = concentrationMetrics(prodLong);
      prodConc = concentration.prodConc;
      portfolioConc = concentration.portfolioConc;
      products = applyConcentrationAdjustment(products, prodConc);
    } else {
      products = products.map((product) => ({
        ...product,
        diasAlvoAjustado: product.diasAlvoBase,
        estrategiaFinal: product.estrategiaBase,
        targetKgAjustado: product.consumoDiario * product.diasAlvoBase,
      }));
    }

    const clientesList = getUniqueClientes(prodLong);

    setState({
      products,
      monthCols,
      prodLong,
      prodConc,
      portfolioConc,
      clientes: clientesList,
      hasClientes,
    });

    return {
      productsCount: products.length,
      monthCount: monthCols.length,
      clientsCount: clientesList.length,
      hasClientes,
    };
  }, []);

  const loadProductionFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const rawProd = await parseFile(file);
      setProductionSourceRows(rawProd);
      const summary = rebuildState(rawProd, clientSourceRows);
      setLastFGImportAt(new Date().toISOString());
      return {
        rowCount: rawProd.length,
        columns: Object.keys(rawProd[0] ?? {}),
        ...summary,
      };
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [clientSourceRows, rebuildState]);

  const loadClientsFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const rawCli = await parseFile(file);
      setClientSourceRows(rawCli);
      let linkedProducts = 0;
      if (productionSourceRows && productionSourceRows.length > 0) {
        const summary = rebuildState(productionSourceRows, rawCli);
        linkedProducts = summary.productsCount;
      }
      setLastClientesImportAt(new Date().toISOString());
      return {
        rowCount: rawCli.length,
        columns: Object.keys(rawCli[0] ?? {}),
        linkedProducts,
        hasProductionLoaded: Boolean(productionSourceRows?.length),
      };
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [productionSourceRows, rebuildState]);

  const loadRawMaterialFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const raw = await parseFile(file);
      if (raw.length === 0) {
        throw new Error("Arquivo vazio ou sem dados validos.");
      }

      const columns = Object.keys(raw[0]);
      const validation = validateRMColumns(columns);
      let parsedRows = 0;

      if (validation.valid) {
        const parsed = processRM(raw, validation.rename);
        setRMData(parsed);
        setLastRMImportAt(new Date().toISOString());
        parsedRows = parsed.length;
      }

      return {
        validation,
        rowCount: parsedRows || raw.length,
        columns,
      };
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLoad = useCallback(async () => {
    if (!fileProd) {
      setError("Envie a base de Producao primeiro.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rawProd = await parseFile(fileProd);
      const rawCli = fileCli ? await parseFile(fileCli) : null;

      setProductionSourceRows(rawProd);
      setClientSourceRows(rawCli);
      rebuildState(rawProd, rawCli);

      setLastFGImportAt(new Date().toISOString());
      setLastClientesImportAt(rawCli && rawCli.length > 0 ? new Date().toISOString() : null);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fileProd, fileCli, rebuildState]);

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
    setProductionSourceRows(null);
    setClientSourceRows(null);
    setError(null);
    setLastFGImportAt(null);
    setLastClientesImportAt(null);
    setLastRMImportAt(null);
  }, []);

  return (
    <AppDataContext.Provider value={{
      state, loading, error, fileProd, fileCli,
      setFileProd, setFileCli, handleLoad, reset,
      loadProductionFile, loadClientsFile, loadRawMaterialFile,
      rmData, setRMData: handleSetRMData,
      lastFGImportAt, lastClientesImportAt, lastRMImportAt,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}
