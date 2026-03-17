import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Construction } from "lucide-react";

interface Props {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: Props) {
  const { state, loading } = useAppData();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !state) {
      navigate("/upload");
    }
  }, [loading, state, navigate]);

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <Construction className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-lg font-bold font-mono text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </div>
    </div>
  );
}
