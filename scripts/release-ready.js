import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, "release", "desktop");
const packageJsonPath = path.join(rootDir, "package.json");
const bumpScriptPath = path.join(rootDir, "scripts", "bump-version.js");
const gitAutoCommitScriptPath = path.join(rootDir, "scripts", "git-auto-commit.js");
const args = new Set(process.argv.slice(2));

function fail(message) {
  console.error(`[release-ready] ERROR: ${message}`);
  process.exit(1);
}

function runCommand(command, args, options = {}) {
  const {
    cwd = rootDir,
    inherit = true,
    allowFailure = false,
    useShell = false,
  } = options;

  const result = spawnSync(command, args, {
    cwd,
    stdio: inherit ? "inherit" : "pipe",
    encoding: "utf8",
    windowsHide: true,
    shell: useShell,
  });

  if (result.error) {
    if (!allowFailure) {
      fail(`falha ao executar '${command} ${args.join(" ")}': ${result.error.message}`);
    }
    return result;
  }

  if (result.status !== 0 && !allowFailure) {
    fail(`comando falhou (${result.status}): ${command} ${args.join(" ")}`);
  }

  return result;
}

function runGit(args, options = {}) {
  return runCommand("git", args, { useShell: false, ...options });
}

function branchExists(ref) {
  const result = runGit(["show-ref", "--verify", "--quiet", ref], { allowFailure: true, inherit: false });
  return result.status === 0;
}

function remoteBranchExists(branchName) {
  const result = runGit(["ls-remote", "--heads", "origin", branchName], {
    allowFailure: true,
    inherit: false,
  });
  return result.status === 0 && Boolean((result.stdout || "").trim());
}

function ensurePrimaryBranch() {
  const currentBranch = (runGit(["branch", "--show-current"], { inherit: false }).stdout || "").trim();
  if (currentBranch === "main" || currentBranch === "principal") {
    console.log(`[release-ready] Branch validada: ${currentBranch}`);
    return;
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
    console.warn(`[release-ready] Aviso: branch principal/main nao encontrada. Usando branch atual: ${currentBranch}`);
    return;
  }

  fail("nao foi possivel detectar a branch atual.");
}

function runDesktopDistCopy() {
  const firstAttempt = runCommand("npm run desktop:dist:copy", [], {
    inherit: true,
    useShell: true,
    allowFailure: true,
  });

  if (firstAttempt.status === 0) {
    return;
  }

  console.warn("[release-ready] desktop:dist:copy falhou na 1a tentativa. Reexecutando uma vez...");
  const secondAttempt = runCommand("npm run desktop:dist:copy", [], {
    inherit: true,
    useShell: true,
    allowFailure: true,
  });

  if (secondAttempt.status !== 0) {
    fail("desktop:dist:copy falhou apos 2 tentativas.");
  }
}

function readVersionFromPackage() {
  if (!fs.existsSync(packageJsonPath)) {
    fail(`package.json nao encontrado em ${packageJsonPath}`);
  }

  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    const version = String(pkg.version || "").trim();
    if (!version) {
      fail("campo version ausente no package.json");
    }
    return version;
  } catch (error) {
    fail(
      error instanceof Error
        ? `falha ao ler package.json: ${error.message}`
        : `falha ao ler package.json: ${String(error)}`
    );
  }
}

function readPackageJson() {
  if (!fs.existsSync(packageJsonPath)) {
    fail(`package.json nao encontrado em ${packageJsonPath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    fail(
      error instanceof Error
        ? `falha ao ler package.json: ${error.message}`
        : `falha ao ler package.json: ${String(error)}`
    );
  }
}

function getDesktopOutputDir() {
  const pkg = readPackageJson();
  const configuredOutput = pkg?.build?.directories?.output;
  const output = typeof configuredOutput === "string" && configuredOutput.trim()
    ? configuredOutput.trim()
    : path.join("dist", "desktop");
  return path.resolve(rootDir, output);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findArtifacts(version) {
  if (!fs.existsSync(releaseDir)) {
    return null;
  }

  const entries = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const latestYml = entries.includes("latest.yml")
    ? "latest.yml"
    : entries.find((name) => /^latest.*\.yml$/i.test(name));

  const exePattern = new RegExp(`setup.*${escapeRegex(version)}.*\\.exe$`, "i");
  const setupExe = entries.find((name) => exePattern.test(name));

  let blockmap = null;
  if (setupExe && entries.includes(`${setupExe}.blockmap`)) {
    blockmap = `${setupExe}.blockmap`;
  } else if (setupExe) {
    const blockmapPattern = new RegExp(`${escapeRegex(setupExe)}\\.blockmap$`, "i");
    blockmap = entries.find((name) => blockmapPattern.test(name)) || null;
  }

  if (!blockmap) {
    const fallbackPattern = new RegExp(`setup.*${escapeRegex(version)}.*\\.exe\\.blockmap$`, "i");
    blockmap = entries.find((name) => fallbackPattern.test(name)) || null;
  }

  const missing = [];
  if (!latestYml) missing.push("latest.yml (ou latest*.yml)");
  if (!setupExe) missing.push(`*Setup*${version}*.exe`);
  if (!blockmap) missing.push(`*Setup*${version}*.exe.blockmap`);

  if (missing.length > 0) return null;

  return {
    latestYml: path.join(releaseDir, latestYml),
    setupExe: path.join(releaseDir, setupExe),
    blockmap: path.join(releaseDir, blockmap),
  };
}

function verifyArtifacts(version) {
  const artifacts = findArtifacts(version);
  if (artifacts) return artifacts;

  console.error(`[release-ready] Arquivos faltando em ${releaseDir}:`);
  console.error(`- latest.yml (ou latest*.yml)`);
  console.error(`- *Setup*${version}*.exe`);
  console.error(`- *Setup*${version}*.exe.blockmap`);
  process.exit(1);
}

function ensureVersionLocked(expectedVersion, stage) {
  const currentVersion = readVersionFromPackage();
  if (currentVersion !== expectedVersion) {
    fail(
      `versao mudou ${stage}. Esperado: ${expectedVersion}; atual: ${currentVersion}. ` +
      "Interrompendo para evitar artefatos inconsistentes.",
    );
  }
}

function ensureDesktopOutputHealth(version) {
  const outputDir = getDesktopOutputDir();
  const unpackedExe = path.join(outputDir, "win-unpacked", "Operion.exe");
  if (!fs.existsSync(unpackedExe)) {
    fail(
      `saida desktop incompleta. Arquivo ausente: ${unpackedExe}. ` +
      "Isso evita falhas ENOENT em win-unpacked.",
    );
  }

  const files = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
    : [];

  const hasLatest = files.some((name) => /^latest.*\.yml$/i.test(name));
  const versionRe = escapeRegex(version);
  const hasExe = files.some((name) => new RegExp(`setup.*${versionRe}.*\\.exe$`, "i").test(name));
  const hasBlockmap = files.some((name) => new RegExp(`setup.*${versionRe}.*\\.exe\\.blockmap$`, "i").test(name));

  if (!hasLatest || !hasExe || !hasBlockmap) {
    fail(
      `artefatos incompletos em ${outputDir} para a versao ${version}.`,
    );
  }
}

function cleanDesktopOutputDir() {
  const outputDir = getDesktopOutputDir();
  try {
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(
      `[release-ready] Aviso: nao foi possivel limpar ${outputDir} antes do build: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function decideBumpAction(currentVersion) {
  if (args.has("--no-bump")) {
    return {
      shouldBump: false,
      reason: "bump desativado via --no-bump",
    };
  }

  if (args.has("--force-bump")) {
    return {
      shouldBump: true,
      reason: "bump forcado via --force-bump",
    };
  }

  const artifactsForCurrent = findArtifacts(currentVersion);
  if (!artifactsForCurrent) {
    return {
      shouldBump: false,
      reason: `versao ${currentVersion} ainda sem artefatos em release/desktop; mantendo versao para evitar bump duplicado`,
    };
  }

  return {
    shouldBump: true,
    reason: `artefatos para ${currentVersion} ja existem; gerando nova versao patch`,
  };
}

function checkGhReadiness() {
  const ghVersion = runCommand("gh", ["--version"], { inherit: false, allowFailure: true });
  if (ghVersion.error || ghVersion.status !== 0) {
    console.warn("[release-ready] gh nao encontrado no PATH.");
    console.warn("[release-ready] Instale o GitHub CLI: https://cli.github.com/");
    console.warn("[release-ready] Depois rode: gh auth login");
    return;
  }

  const ghAuth = runCommand("gh", ["auth", "status"], { inherit: false, allowFailure: true });
  if (ghAuth.status !== 0) {
    console.warn("[release-ready] gh encontrado, mas sem autenticacao valida.");
    console.warn("[release-ready] Rode: gh auth login");
    return;
  }

  console.log("[release-ready] gh OK, pronto para rodar npm run desktop:release");
}

function main() {
  console.log("[release-ready] Iniciando preparo de release...");
  ensurePrimaryBranch();

  const initialVersion = readVersionFromPackage();
  const bumpDecision = decideBumpAction(initialVersion);
  console.log(`[release-ready] Versao atual:  ${initialVersion}`);
  console.log(`[release-ready] Regra de bump: ${bumpDecision.reason}`);

  let targetVersion = initialVersion;
  if (bumpDecision.shouldBump) {
    runCommand(process.execPath, [bumpScriptPath], { inherit: true });
    targetVersion = readVersionFromPackage();
    console.log(`[release-ready] Versao alvo:   ${targetVersion}`);
  } else {
    console.log(`[release-ready] Versao alvo:   ${targetVersion} (sem novo bump)`);
  }

  ensureVersionLocked(targetVersion, "antes do build");
  runCommand(process.execPath, [gitAutoCommitScriptPath], { inherit: true });
  ensureVersionLocked(targetVersion, "apos o versionamento git");
  cleanDesktopOutputDir();

  runDesktopDistCopy();
  ensureVersionLocked(targetVersion, "durante o build");
  ensureDesktopOutputHealth(targetVersion);

  const artifacts = verifyArtifacts(targetVersion);
  console.log("[release-ready] Artefatos validados:");
  console.log(`- ${artifacts.latestYml}`);
  console.log(`- ${artifacts.setupExe}`);
  console.log(`- ${artifacts.blockmap}`);

  checkGhReadiness();
  console.log("[release-ready] Pronto.");
}

main();
