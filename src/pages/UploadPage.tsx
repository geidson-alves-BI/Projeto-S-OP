import { useNavigate } from "react-router-dom";
import { Activity, Loader2, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/FileUpload";
import { useAppData } from "@/contexts/AppDataContext";
import { useEffect } from "react";

export default function UploadPage() {
  const { state, fileProd, fileCli, setFileProd, setFileCli, loading, error, handleLoad } = useAppData();
  const navigate = useNavigate();

  useEffect(() => {
    if (state) navigate("/");
  }, [state, navigate]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Activity className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold glow-text font-mono">CONTROL TOWER</h1>
          </div>
          <p className="text-muted-foreground">PCP — S&OE / S&OP Intelligence Platform</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FileUpload label="Base de Produção" file={fileProd} onFileSelect={setFileProd} />
          <FileUpload label="Base de Clientes (opcional)" file={fileCli} onFileSelect={setFileCli} />
        </div>

        {error && (
          <p className="text-sm text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            {error}
          </p>
        )}

        <Button onClick={handleLoad} disabled={!fileProd || loading} className="w-full h-12 text-base font-mono">
          {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UploadIcon className="mr-2 h-5 w-5" />}
          {loading ? "Processando..." : "Carregar Bases"}
        </Button>
      </div>
    </div>
  );
}
