import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const repositoryRoot = resolve(workspace, "repository");
const outputRoot = resolve(workspace, "artifacts/canonical-homepage");
const verifierPath = resolve(repositoryRoot, ".github/scripts/verify-canonical-homepage.mjs");
const productionEntryPath = resolve(repositoryRoot, "cloudflare/mmg-ios/src/kairos-production-entry-immutable-v1.js");
const workerURL = String(process.env.KAIROS_PRODUCTION_URL || "https://mmg-ios.info-mindsetmediagroup.workers.dev").replace(/\/+$/, "");
const commit = process.env.GITHUB_SHA || "unknown";
const confirmation = "BUILD_CANONICAL_MMG_HOMEPAGE_STAGING";

await mkdir(outputRoot, { recursive: true });
const entrySource = await readFile(productionEntryPath, "utf8");
const expectedEntry = entrySource.match(/const BUILD = "([^"]+)"/)?.[1];
if (!expectedEntry) throw new Error("Could not resolve the expected production-entry build marker.");

await waitForRelease(expectedEntry);
const build = await requestBuild("build");
await writeJSON(resolve(outputRoot, "build-result.json"), build);

if (build.status !== "completed" || !build.preview?.url) {
  throw new Error(`Canonical homepage build failed: ${JSON.stringify(build)}`);
}
if (build.production?.publishedThemeChanged !== false) {
  throw new Error("The canonical homepage builder did not preserve the published MAIN theme boundary.");
}

const previewURL = build.preview.url;
const firstPass = runVerifier("pass-1", "1", previewURL);
let repair = null;
if (!firstPass.passed) {
  repair = await requestBuild("repair", "The first Playwright pass failed. Restore the exact canonical staging bundle and verify Shopify read-back again.");
  await writeJSON(resolve(outputRoot, "repair-result.json"), repair);
  if (repair.status !== "completed" || repair.mode !== "repair" || repair.verification?.exactReadBack !== true || repair.production?.publishedThemeChanged !== false) {
    throw new Error(`Canonical homepage repair failed: ${JSON.stringify(repair)}`);
  }
}

const finalPass = runVerifier("final", "2", previewURL);
const receipt = {
  sourceCommit: commit,
  expectedProductionEntry: expectedEntry,
  buildStatus: build.status,
  preview: build.preview,
  files: build.files,
  production: build.production,
  firstPass: firstPass.report,
  repairPerformed: Boolean(repair),
  repair,
  verification: finalPass.report,
  generatedAt: new Date().toISOString(),
};
await writeJSON(resolve(outputRoot, "review-receipt.json"), receipt);
await writeFile(resolve(outputRoot, "review-receipt.md"), markdown(receipt));

console.log(JSON.stringify({
  status: finalPass.passed ? "verified" : "failed",
  previewURL,
  firstPass: firstPass.passed,
  repairPerformed: Boolean(repair),
  finalPass: finalPass.passed,
  publishedThemeChanged: build.production?.publishedThemeChanged,
}, null, 2));

if (!finalPass.passed) process.exit(1);

async function waitForRelease(expected) {
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    try {
      const response = await fetch(`${workerURL}/api/health?canonical_release=${encodeURIComponent(commit)}&attempt=${attempt}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      const observed = response.headers.get("x-mmg-production-entry") || "";
      if (response.ok && observed === expected) {
        console.log(`Matching Kairos production entry verified: ${observed}`);
        return;
      }
      console.log(`Release gate ${attempt}/36: expected ${expected}; observed ${observed || "none"}.`);
    } catch (error) {
      console.log(`Release gate ${attempt}/36: ${error instanceof Error ? error.message : String(error)}`);
    }
    await delay(5_000);
  }
  throw new Error(`The matching Cloudflare release ${expected} did not become available.`);
}

async function requestBuild(mode, reason = "") {
  const response = await fetch(`${workerURL}/api/shopify/staging/canonical-homepage/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation, mode, sourceCommit: commit, reason }),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { body = { status: "failed", error: { code: "invalid_json", message: text.slice(0, 2_000) } }; }
  if (!response.ok) {
    throw new Error(`Canonical homepage ${mode} request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function runVerifier(folder, attempt, previewURL) {
  const output = resolve(outputRoot, folder);
  const result = spawnSync(process.execPath, [verifierPath], {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      MMG_PREVIEW_URL: previewURL,
      MMG_VERIFICATION_OUTPUT: output,
      MMG_VERIFICATION_ATTEMPT: attempt,
    },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  const reportPath = resolve(output, "verification-report.json");
  let report = { passed: false, failures: [`Verifier exited ${result.status ?? "without status"} and produced no report.`] };
  if (existsSync(reportPath)) {
    try { report = JSON.parse(readFileSync(reportPath, "utf8")); }
    catch (error) { report = { passed: false, failures: [`Could not parse verification report: ${error.message}`] }; }
  }
  return { passed: result.status === 0 && report.passed === true, status: result.status, report };
}

async function writeJSON(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function markdown(receipt) {
  const files = Array.isArray(receipt.files) ? receipt.files : [];
  return [
    "# Canonical MMG Homepage Review Receipt",
    "",
    `- Source commit: ${receipt.sourceCommit}`,
    `- Production entry: ${receipt.expectedProductionEntry}`,
    `- Preview: ${receipt.preview?.url || "unavailable"}`,
    `- First Playwright pass: ${receipt.firstPass?.passed ? "PASS" : "FAIL"}`,
    `- Repair performed: ${receipt.repairPerformed ? "YES" : "NO"}`,
    `- Final Playwright verification: ${receipt.verification?.passed ? "PASS" : "FAIL"}`,
    `- Published MAIN changed: ${receipt.production?.publishedThemeChanged === true ? "YES" : "NO"}`,
    "",
    "## Shopify source changes",
    "",
    ...files.map((file) => `- ${file.filename}: ${file.beforeSha256 || "new"} → ${file.afterSha256} (${file.afterBytes} bytes)`),
    "",
  ].join("\n");
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
