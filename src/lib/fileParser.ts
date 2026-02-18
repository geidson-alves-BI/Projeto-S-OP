import * as XLSX from "xlsx";
import type { RawRow } from "./pcpEngine";

export async function parseFile(file: File): Promise<RawRow[]> {
  const ext = file.name.toLowerCase().split(".").pop();

  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  }

  // CSV
  const text = await file.text();
  const sep = text.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
    const row: RawRow = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] ?? "";
    });
    return row;
  });
}
