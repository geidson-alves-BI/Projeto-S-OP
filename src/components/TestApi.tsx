import { useState } from "react";
import { health } from "../lib/api";

export default function TestApi() {
  const [msg, setMsg] = useState<string>("");

  async function handleTest() {
    setMsg("Testando...");
    try {
      const res = await health();
      setMsg(`✅ Backend OK: status=${res.status}`);
    } catch (e: any) {
      setMsg(`❌ Erro: ${e.message}`);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Teste de Conexão com Backend</h2>
      <button onClick={handleTest}>Testar /health</button>
      <p>{msg}</p>
    </div>
  );
}