import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const releaseDir = path.join(rootDir, "release", "desktop");
const automatedNotes = "Automated release";

function fail(message) {
  console.error(`[publish-release-gh] ERROR: ${message}`);
  process.exit(1);
}

function readPackageJson() {
  if (!fs.existsSync(packageJsonPath)) {
    fail(`package.json nao encontrado em ${packageJsonPath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    fail(`falha ao ler package.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runCommand(command, args, options = {}) {
  const {
    inherit = true,
    allowFailure = false,
    cwd = rootDir,
  } = options;

  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    windowsHide: true,
    shell: false,
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

function normalizeRepoCandidate(candidate) {
  if (!candidate || typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (directMatch) {
    return `${directMatch[1]}/${directMatch[2]}`;
  }

  const githubShortMatch = trimmed.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/i);
  if (githubShortMatch) {
    return `${githubShortMatch[1]}/${githubShortMatch[2]}`;
  }

  const httpsMatch = trimmed.match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return null;
}

function resolveRepoFromPackage(pkg) {
  const repository = pkg?.repository;
  if (!repository) {
    return null;
  }

  if (typeof repository === "string") {
    return normalizeRepoCandidate(repository);
  }

  if (typeof repository === "object" && repository !== null) {
    if (typeof repository.name === "string") {
      const fromName = normalizeRepoCandidate(repository.name);
      if (fromName) return fromName;
    }
    if (typeof repository.url === "string") {
      return normalizeRepoCandidate(repository.url);
    }
  }

  return null;
}

function discoverRepo(pkg) {
  const fromGh = runCommand(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { inherit: false, allowFailure: true },
  );

  if (fromGh.status === 0) {
    const value = (fromGh.stdout || "").trim();
    if (value) {
      return value;
    }
  }

  const fromPackage = resolveRepoFromPackage(pkg);
  if (fromPackage) {
    return fromPackage;
  }

  const fromEnv = normalizeRepoCandidate(process.env.OPERION_GH_REPO || "");
  if (fromEnv) {
    return fromEnv;
  }

  fail(
    "nao foi possivel descobrir owner/repo. Defina OPERION_GH_REPO=\"owner/repo\".",
  );
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findArtifacts(version) {
  if (!fs.existsSync(releaseDir)) {
    fail(`diretorio de release nao encontrado: ${releaseDir}`);
  }

  const entries = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const latestYml = entries.includes("latest.yml")
    ? "latest.yml"
    : entries.find((name) => /^latest.*\.yml$/i.test(name));

  const versionRe = escapeRegex(version);
  const exePattern = new RegExp(`setup.*${versionRe}.*\\.exe$`, "i");
  const exe = entries.find((name) => exePattern.test(name));

  let blockmap = null;
  if (exe && entries.includes(`${exe}.blockmap`)) {
    blockmap = `${exe}.blockmap`;
  } else if (exe) {
    const basePattern = new RegExp(`${escapeRegex(exe)}\\.blockmap$`, "i");
    blockmap = entries.find((name) => basePattern.test(name));
  }

  if (!blockmap) {
    const blockmapPattern = new RegExp(`setup.*${versionRe}.*\\.exe\\.blockmap$`, "i");
    blockmap = entries.find((name) => blockmapPattern.test(name)) || null;
  }

  const missing = [];
  if (!latestYml) missing.push("latest.yml");
  if (!exe) missing.push(`*Setup*${version}*.exe`);
  if (!blockmap) missing.push(`*Setup*${version}*.exe.blockmap`);

  if (missing.length > 0) {
    console.error(`[publish-release-gh] Arquivos faltando em ${releaseDir}:`);
    for (const file of missing) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  return {
    latestYml: path.join(releaseDir, latestYml),
    installerExe: path.join(releaseDir, exe),
    installerBlockmap: path.join(releaseDir, blockmap),
  };
}

function ensureGhPrereqs() {
  if (process.env.OPERION_SKIP_GH_PREREQS === "1") {
    console.log("[publish-release-gh] OPERION_SKIP_GH_PREREQS=1 ativo. Pulando validacao de gh/auth.");
    return;
  }

  const ghVersionResult = runCommand("gh", ["--version"], {
    inherit: false,
    allowFailure: true,
  });

  if (ghVersionResult.error || ghVersionResult.status !== 0) {
    fail(
      "GitHub CLI (gh) nao encontrado no PATH. Instale o gh e tente novamente.\n" +
        "Instalacao: https://cli.github.com/\n" +
        "Depois rode: gh auth login",
    );
  }

  const authStatus = runCommand("gh", ["auth", "status"], {
    inherit: true,
    allowFailure: true,
  });

  if (authStatus.status !== 0) {
    fail(
      "gh nao autenticado. Rode 'gh auth login' e tente novamente.",
    );
  }
}

function releaseExists(repo, tagName) {
  const result = runCommand(
    "gh",
    ["release", "view", tagName, "--repo", repo],
    { inherit: true, allowFailure: true },
  );
  return result.status === 0;
}

function getReleaseUrl(repo, tagName) {
  const result = runCommand(
    "gh",
    ["release", "view", tagName, "--repo", repo, "--json", "url", "-q", ".url"],
    { inherit: false, allowFailure: true },
  );

  if (result.status === 0) {
    return (result.stdout || "").trim() || "n/a";
  }
  return "n/a";
}

function main() {
  const pkg = readPackageJson();
  const version = String(pkg?.version || "").trim();
  if (!version) {
    fail("versao invalida no package.json");
  }

  const tagName = `v${version}`;
  const releaseTitle = `Operion ${version}`;

  ensureGhPrereqs();
  const repo = discoverRepo(pkg);
  const artifacts = findArtifacts(version);
  const files = [artifacts.latestYml, artifacts.installerExe, artifacts.installerBlockmap];

  const alreadyExists = releaseExists(repo, tagName);
  if (alreadyExists) {
    console.log(`[publish-release-gh] Release ${tagName} ja existe. Fazendo upload com overwrite...`);
    runCommand("gh", ["release", "upload", tagName, ...files, "--clobber", "--repo", repo], {
      inherit: true,
    });
  } else {
    console.log(`[publish-release-gh] Criando release ${tagName}...`);
    runCommand(
      "gh",
      [
        "release",
        "create",
        tagName,
        ...files,
        "--repo",
        repo,
        "--title",
        releaseTitle,
        "--notes",
        automatedNotes,
      ],
      { inherit: true },
    );
  }

  const releaseUrl = getReleaseUrl(repo, tagName);
  console.log("");
  console.log("[publish-release-gh] Publicacao concluida");
  console.log(`- repo: ${repo}`);
  console.log(`- tag: ${tagName}`);
  console.log(`- release: ${releaseUrl}`);
  console.log("- arquivos anexados:");
  console.log(`  - ${artifacts.latestYml}`);
  console.log(`  - ${artifacts.installerExe}`);
  console.log(`  - ${artifacts.installerBlockmap}`);
  console.log("");
  console.log("[publish-release-gh] Proximo passo: teste de auto-update");
  console.log("1) Instale uma versao anterior do Operion (ex.: v0.1.6).");
  console.log(`2) Confirme que a release ${tagName} esta publicada com os 3 assets obrigatorios.`);
  console.log("3) Abra o app com internet e clique em 'Verificar atualizacoes agora'.");
  console.log("4) Aguarde status de download concluido e execute 'Reiniciar e atualizar'.");
  console.log(`5) Confirme que o app abriu na versao ${version}.`);
}

main();
