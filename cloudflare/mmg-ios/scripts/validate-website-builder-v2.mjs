import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const BUILD = "kairos-website-builder-v2-validator-20260717-1";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const files = {
  entry: join(root, "src", "kairos-production-entry-immutable-v1.js"),
  projectEntry: join(root, "src", "kairos-production-entry-v1.js"),
  builder: join(root, "src", "kairos-website-builder-v2.js"),
  assets: join(root, "src", "kairos-website-builder-asset-library-v1.js"),
  studio: join(repoRoot, "web", "kairos-dashboard", "scripts", "website-builder-studio.js"),
  css: join(repoRoot, "web", "kairos-dashboard", "styles", "website-builder-studio.css"),
  index: join(repoRoot, "web", "kairos-dashboard", "index.html"),
};
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]));

const required = [
  ["entry", "handleWebsiteBuilderV2Request"],
  ["entry", "X-MMG-Website-Builder-V2"],
  ["projectEntry", "handleWebsiteBuilderAssetObjectRequest"],
  ["builder", "/api/website-builder/v2/status"],
  ["builder", "/api/website-builder/compose"],
  ["builder", "/api/website-builder/assets"],
  ["builder", "runKairosIntelligence"],
  ["builder", "doctrine-compiler-fallback"],
  ["builder", "assignAssets"],
  ["assets", "builder-asset:meta:"],
  ["assets", "MAX_LIBRARY_BYTES"],
  ["assets", "DELETE_KAIROS_WEBSITE_ASSET"],
  ["studio", "Compose complete website"],
  ["studio", "/api/website-builder/compose"],
  ["studio", "/api/website-builder/assets"],
  ["studio", "data-kws-library-upload"],
  ["studio", "data-kws-move"],
  ["studio", "Asset Library"],
  ["css", ".kws-composer"],
  ["css", ".kws-asset-library"],
  ["css", ".kws-preview__section--full-bleed"],
  ["index", "website-builder-studio.js?v=experience-20260717-2"],
];
for (const [file, marker] of required) {
  if (!source[file].includes(marker)) throw new Error(`${file} is missing ${marker}`);
}

const forbidden = [
  ["builder", "externalInferenceAPI: true"],
  ["builder", "mainThemeMutationAutomatic: true"],
  ["entry", "liveThemeChanged: true"],
];
for (const [file, marker] of forbidden) {
  if (source[file].includes(marker)) throw new Error(`${file} contains forbidden marker ${marker}`);
}

for (const file of [files.entry, files.projectEntry, files.builder, files.assets, files.studio]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${file} failed syntax validation:\n${result.stderr || result.stdout}`);
}

const builderModule = await import(pathToFileURL(files.builder));
const composeResponse = await builderModule.handleWebsiteBuilderV2Request(new Request("https://kairos.test/api/website-builder/compose", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ objective: "Build a bold cinematic publishing homepage with guided pathways and Kairos." }),
}), {});
const compose = await composeResponse.json();
if (!composeResponse.ok || compose.status !== "completed") throw new Error("The deterministic composer did not complete.");
if (compose.manifest?.version !== "kairos-website-builder-manifest-v2") throw new Error("The composer did not return a v2 manifest.");
if (!Array.isArray(compose.manifest?.sections) || compose.manifest.sections.length !== 8) throw new Error("The composer did not return the complete eight-section journey.");
for (const id of ["hero", "pathways", "kairos"]) {
  if (!compose.manifest.sections.some(section => section.id === id && section.enabled)) throw new Error(`Required section ${id} is not enabled.`);
}
if (compose.composition?.engine !== "doctrine-compiler-fallback") throw new Error("The no-inference composer did not report the doctrine fallback honestly.");

const assetModule = await import(pathToFileURL(files.assets));
const map = new Map();
const state = {
  storage: {
    async get(key) { return map.get(key); },
    async put(key, value) {
      if (key && typeof key === "object" && !Array.isArray(key)) for (const [entryKey, entryValue] of Object.entries(key)) map.set(entryKey, entryValue);
      else map.set(key, value);
    },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key); },
    async list({ prefix } = {}) { return new Map([...map].filter(([key]) => !prefix || key.startsWith(prefix))); },
  },
};
const createResponse = await assetModule.handleWebsiteBuilderAssetObjectRequest(state, new Request("https://kairos.internal/website-builder-assets", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Hero test", kind: "image", mimeType: "image/png", dataBase64: btoa("test-image"), tags: "hero, homepage" }),
}));
const created = await createResponse.json();
if (createResponse.status !== 201 || !created.asset?.id) throw new Error("The asset library did not persist an uploaded asset.");
const listResponse = await assetModule.handleWebsiteBuilderAssetObjectRequest(state, new Request("https://kairos.internal/website-builder-assets"));
const listed = await listResponse.json();
if (listed.assets?.length !== 1) throw new Error("The asset library did not list the stored asset.");
const contentResponse = await assetModule.handleWebsiteBuilderAssetObjectRequest(state, new Request(`https://kairos.internal/website-builder-assets/${created.asset.id}/content`));
if (!contentResponse.ok || (await contentResponse.arrayBuffer()).byteLength !== 10) throw new Error("The asset library did not reconstruct stored content.");

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  composer: compose.composition.engine,
  sections: compose.manifest.sections.map(section => section.id),
  assetLibrary: { stored: true, listed: true, contentReadBack: true },
  safeguards: { externalInferenceAPI: false, stagingOnly: true, persistentAssets: true },
}, null, 2));
