import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");

function fail(message) {
  console.error(`[bump-version] ERROR: ${message}`);
  process.exit(1);
}

export function bumpPatch(version) {
  if (typeof version !== "string" || !version.trim()) {
    throw new Error("versao ausente no package.json");
  }

  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`formato de versao invalido: '${version}'. Esperado: X.Y.Z`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;
  return `${major}.${minor}.${patch}`;
}

export function bumpVersionFile(targetPath = packageJsonPath) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`package.json nao encontrado em ${targetPath}`);
  }

  const raw = fs.readFileSync(targetPath, "utf8");
  const pkg = JSON.parse(raw);
  const oldVersion = String(pkg.version || "").trim();
  const newVersion = bumpPatch(oldVersion);

  pkg.version = newVersion;
  fs.writeFileSync(targetPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  return { oldVersion, newVersion, targetPath };
}

function main() {
  try {
    const result = bumpVersionFile();
    console.log(`[bump-version] Versao antiga: ${result.oldVersion}`);
    console.log(`[bump-version] Versao nova:   ${result.newVersion}`);
    console.log(`[bump-version] Arquivo: ${result.targetPath}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
