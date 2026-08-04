import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const WORKER_DIR = path.join(ROOT, "cloudflare/mmg-ios");
const WRANGLER_PATH = path.join(WORKER_DIR, "wrangler.toml");
const SOURCE_DIR = path.join(WORKER_DIR, "src");
const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const RESOLUTION_SUFFIXES = ["", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", "/index.js", "/index.mjs", "/index.ts"];

const wrangler = await readFile(WRANGLER_PATH, "utf8");
const mainMatch = wrangler.match(/^main\s*=\s*["']([^"']+)["']/m);
if (!mainMatch) fail(`No Worker main entry is configured in ${relative(WRANGLER_PATH)}.`);

const configuredEntry = path.resolve(WORKER_DIR, mainMatch[1]);
await assertFile(configuredEntry, `Configured Worker entry does not exist: ${relative(configuredEntry)}`);

const reachable = new Set();
const parent = new Map();
const unresolved = [];
await visit(configuredEntry);

if (unresolved.length) {
  for (const issue of unresolved) {
    console.error(`Unresolved local import: ${relative(issue.importer)} -> ${issue.specifier}`);
    console.error(`Import trace: ${trace(issue.importer).join(" -> ")}`);
  }
  fail(`${unresolved.length} unresolved local import${unresolved.length === 1 ? "" : "s"} found in the active Worker graph.`);
}

const entrypointFiles = (await listFiles(SOURCE_DIR))
  .filter((file) => /^kairos-production-entry-.*\.(?:js|mjs|ts)$/.test(path.basename(file)))
  .sort();
const reachableEntrypoints = entrypointFiles.filter((file) => reachable.has(file));
const unreachableEntrypoints = entrypointFiles.filter((file) => !reachable.has(file));

console.log(`Kairos configured Worker entry: ${relative(configuredEntry)}`);
console.log(`Reachable local modules: ${reachable.size}`);
console.log(`Reachable production entrypoints: ${reachableEntrypoints.length}`);
for (const file of reachableEntrypoints) console.log(`  active  ${relative(file)}`);
console.log(`Unreachable production entrypoints: ${unreachableEntrypoints.length}`);
for (const file of unreachableEntrypoints) console.log(`  review  ${relative(file)}`);
console.log("Kairos entrypoint dependency graph validation passed.");

async function visit(file) {
  const normalized = path.normalize(file);
  if (reachable.has(normalized)) return;
  reachable.add(normalized);

  const extension = path.extname(normalized);
  if (!SCRIPT_EXTENSIONS.has(extension)) return;

  const source = await readFile(normalized, "utf8");
  for (const specifier of extractRelativeImports(source)) {
    const resolved = await resolveImport(normalized, specifier);
    if (!resolved) {
      unresolved.push({ importer: normalized, specifier });
      continue;
    }
    if (!parent.has(resolved)) parent.set(resolved, normalized);
    await visit(resolved);
  }
}

function extractRelativeImports(source) {
  const imports = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.add(match[1]);
  }
  return imports;
}

async function resolveImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = path.normalize(`${base}${suffix}`);
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else if (entry.isFile()) files.push(path.normalize(fullPath));
  }
  return files;
}

function trace(file) {
  const chain = [file];
  let cursor = file;
  while (parent.has(cursor)) {
    cursor = parent.get(cursor);
    chain.unshift(cursor);
  }
  return chain.map(relative);
}

async function assertFile(file, message) {
  if (!(await isFile(file))) fail(message);
}

async function isFile(file) {
  try {
    await access(file);
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}
