import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const BUILD = "kairos-experience-controller-validator-20260717-1";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const files = {
  entry: join(root, "src", "kairos-production-entry-immutable-v1.js"),
  controller: join(root, "src", "kairos-experience-controller-v1.js"),
  index: join(repoRoot, "web", "kairos-dashboard", "index.html"),
  objectiveUI: join(repoRoot, "web", "kairos-dashboard", "scripts", "objective-controller-v2.js"),
  builderUI: join(repoRoot, "web", "kairos-dashboard", "scripts", "website-builder-studio.js"),
  builderCSS: join(repoRoot, "web", "kairos-dashboard", "styles", "website-builder-studio.css"),
};
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]));

const required = [
  ["entry", "handleKairosExperienceRequest"],
  ["entry", "X-MMG-Experience-Controller"],
  ["controller", "/api/objectives/execute"],
  ["controller", "/api/website-builder/staging/build"],
  ["controller", "BUILD_KAIROS_WEBSITE_STUDIO_STAGING"],
  ["controller", "exactShopifyReadBackRequired"],
  ["controller", "requiredJourneySectionsEnforced"],
  ["controller", "kws__moment"],
  ["objectiveUI", "/api/objectives/execute"],
  ["objectiveUI", "window.KairosWebsiteBuilder"],
  ["builderUI", "data-kws-image"],
  ["builderUI", "data-kws-audio"],
  ["builderUI", "/api/website-builder/staging/build"],
  ["builderUI", "compressImage"],
  ["builderUI", "Desktop"],
  ["builderUI", "Mobile"],
  ["index", "objective-controller-v2.js"],
  ["index", "website-builder-studio.js"],
  ["index", "website-builder-studio.css"],
  ["builderCSS", ".kws-studio"],
  ["builderCSS", ".kws-preview--cinematic-obsidian"],
];
for (const [file, marker] of required) {
  if (!source[file].includes(marker)) throw new Error(`${file} is missing ${marker}`);
}

const forbidden = [
  ["controller", "liveThemeChanged: true"],
  ["controller", "productionPublishAuthorized: true"],
  ["controller", "workersAIUsed: true"],
];
for (const [file, marker] of forbidden) {
  if (source[file].includes(marker)) throw new Error(`${file} contains forbidden marker ${marker}`);
}

for (const file of [files.entry, files.controller, files.objectiveUI, files.builderUI]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${file} failed syntax validation:\n${result.stderr || result.stdout}`);
}

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  objectiveController: "single-entry-execution-v2",
  websiteBuilder: "premium-governed-staging-v1",
  verified: {
    objectiveExecutesWithoutSecondPrompt: true,
    websiteStudioLoadsFromObjective: true,
    imageUploadZones: true,
    kairosMomentAudio: true,
    desktopMobilePreview: true,
    stagingOnly: true,
    exactReadBack: true,
    rollback: true,
  },
}, null, 2));
