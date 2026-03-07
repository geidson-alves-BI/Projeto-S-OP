import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");

if (!fs.existsSync(packageJsonPath)) {
  throw new Error(`package.json not found at ${packageJsonPath}`);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

const configuredOutput = pkg?.build?.directories?.output;
const outputDir = path.resolve(rootDir, configuredOutput || path.join("dist", "desktop"));
const fallbackOutputDir = path.resolve(rootDir, path.join("dist", "desktop"));
const releaseDir = path.resolve(rootDir, path.join("release", "desktop"));

const candidateDirs = Array.from(new Set([outputDir, fallbackOutputDir]));

const artifactPatterns = [
  /\.exe$/i,
  /\.msi$/i,
  /^latest.*\.yml$/i,
  /\.blockmap$/i,
];

function collectArtifacts(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) continue;
    if (artifactPatterns.some((re) => re.test(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

let artifacts = [];
let sourceDir = null;

for (const dir of candidateDirs) {
  const found = collectArtifacts(dir);
  if (found.length > 0) {
    artifacts = found;
    sourceDir = dir;
    break;
  }
}

if (artifacts.length === 0) {
  throw new Error(
    `No installer artifacts found. Checked: ${candidateDirs.join(", ")}`
  );
}

fs.mkdirSync(releaseDir, { recursive: true });

const copied = [];
for (const source of artifacts) {
  const target = path.join(releaseDir, path.basename(source));
  fs.copyFileSync(source, target);
  copied.push(target);
}

console.log("[release-desktop] source output:", sourceDir);
console.log("[release-desktop] release directory:", releaseDir);
console.log("[release-desktop] copied artifacts:");
for (const item of copied) {
  const stat = fs.statSync(item);
  console.log(`- ${item} (${stat.size} bytes)`);
}
