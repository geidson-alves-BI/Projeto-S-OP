import { useNavigate } from "react-router-dom";
import { Activity, Loader2, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/FileUpload";
import PageTransition from "@/components/PageTransition";
import { useAppData } from "@/contexts/AppDataContext";
import { useEffect } from "react";

export default function UploadPage() {
  const { state, fileProd, fileCli, setFileProd, setFileCli, loading, error, handleLoad } = useAppData();
  const navigate = useNavigate();

  useEffect(() => {
    if (state) navigate("/");
  }, [state, navigate]);

  return (
    <PageTransition className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="relative">
              <Activity className="h-10 w-10 text-primary" />
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse-glow" />
            </div>
            <h1 className="text-4xl font-bold glow-text font-mono tracking-tight">CONTROL TOWER</h1>
          </div>
          <p className="text-muted-foreground text-lg">PCP — S&OE / S&OP Intelligence Platform</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FileUpload label="Base de Produção" file={fileProd} onFileSelect={setFileProd} />
          <FileUpload label="Base de Clientes (opcional)" file={fileCli} onFileSelect={setFileCli} />
        </div>

        {error && (
          <div className="alert-error">
            <p className="text-sm text-destructive font-mono">{error}</p>
          </div>
        )}

        <Button onClick={handleLoad} disabled={!fileProd || loading} className="w-full h-12 text-base font-mono gap-2">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadIcon className="h-5 w-5" />}
          {loading ? "Processando..." : "Carregar Bases"}
        </Button>
      </div>
    </PageTransition>
  );
}
