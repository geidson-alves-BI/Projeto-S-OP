import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");

function fail(message) {
  console.error(`[git] ERROR: ${message}`);
  process.exit(1);
}

function runGit(args, options = {}) {
  const {
    inherit = false,
    allowFailure = false,
  } = options;

  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    windowsHide: true,
    shell: false,
  });

  if (result.error) {
    if (!allowFailure) {
      fail(`falha ao executar 'git ${args.join(" ")}': ${result.error.message}`);
    }
    return result;
  }

  if (result.status !== 0 && !allowFailure) {
    const stderr = (result.stderr || "").trim();
    fail(`comando falhou (${result.status}): git ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`);
  }

  return result;
}

function readVersion() {
  if (!fs.existsSync(packageJsonPath)) {
    fail(`package.json nao encontrado em ${packageJsonPath}`);
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const version = String(pkg?.version || "").trim();
    if (!version) {
      fail("campo version ausente no package.json");
    }
    return version;
  } catch (error) {
    fail(
      error instanceof Error
        ? `falha ao ler package.json: ${error.message}`
        : `falha ao ler package.json: ${String(error)}`,
    );
  }
}

function getStatusLines() {
  const result = runGit(["status", "--porcelain"]);
  return (result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function parseChangedFiles(statusLines) {
  return statusLines.map((line) => {
    const normalized = line.replace(/^..\s+/, "");
    const parts = normalized.split(" -> ");
    return parts[parts.length - 1];
  });
}

function branchExists(ref) {
  const result = runGit(["show-ref", "--verify", "--quiet", ref], { allowFailure: true });
  return result.status === 0;
}

function remoteBranchExists(branchName) {
  const result = runGit(["ls-remote", "--heads", "origin", branchName], { allowFailure: true });
  return result.status === 0 && Boolean((result.stdout || "").trim());
}

function resolvePushBranch() {
  const currentBranch = (runGit(["branch", "--show-current"]).stdout || "").trim();
  if (currentBranch === "main" || currentBranch === "principal") {
    return currentBranch;
  }

  const hasMain = branchExists("refs/heads/main") || remoteBranchExists("main");
  const hasPrincipal = branchExists("refs/heads/principal") || remoteBranchExists("principal");

  if (hasMain || hasPrincipal) {
    fail(
      `release deve ser executada a partir da branch principal. Branch atual: ${currentBranch || "(desconhecida)"}. ` +
      `Use ${hasMain ? "'main'" : "'principal'"} antes de publicar.`,
    );
  }

  if (currentBranch) {
    console.warn(`[git] Aviso: branch principal/main nao encontrada. Usando branch atual: ${currentBranch}`);
    return currentBranch;
  }

  fail("nao foi possivel detectar a branch de push.");
}

function main() {
  const statusLines = getStatusLines();
  if (statusLines.length === 0) {
    console.log("[git] nenhum arquivo alterado");
    return;
  }

  const changedFiles = parseChangedFiles(statusLines);
  const version = readVersion();

  runGit(["add", "."], { inherit: true });
  runGit(["commit", "-m", `release: Operion v${version}`], { inherit: true });

  console.log("[git] arquivos commitados");
  for (const file of changedFiles) {
    console.log(`- ${file}`);
  }

  const pushBranch = resolvePushBranch();
  runGit(["push", "origin", pushBranch], { inherit: true });
  console.log("[git] push concluido");
}

main();
