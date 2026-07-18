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
const STAGING_CONFIRMATION = "BUILD_CANONICAL_MMG_HOMEPAGE_STAGING";
const PUBLISH_CONFIRMATION = "PUBLISH_CANONICAL_MMG_HOMEPAGE_LIVE";

await mkdir(outputRoot, { recursive: true });
const entrySource = await readFile(productionEntryPath, "utf8");
const expectedEntry = entrySource.match(/const BUILD = "([^"]+)"/)?.[1];
if (!expectedEntry) throw new Error("Could not resolve the expected production-entry build marker.");

await waitForRelease(expectedEntry);

const build = await requestBuild("build");
await writeJSON(resolve(outputRoot, "build-result.json"), build);
if (build.status !== "completed" || !build.preview?.url) {
  throw new Error(`Canonical homepage staging build failed: ${JSON.stringify(build)}`);
}
if (build.production?.publishedThemeChanged !== false || build.verification?.exactReadBack !== true) {
  throw new Error("The staging build did not preserve the published theme boundary or pass exact Shopify read-back.");
}

const previewURL = build.preview.url;
const firstPass = runVerifier("pass-1", "1", previewURL);
let repair = null;
if (!firstPass.passed) {
  repair = await requestBuild(
    "repair",
    "The first Playwright pass failed. Restore the exact canonical staging bundle and verify Shopify read-back again.",
  );
  await writeJSON(resolve(outputRoot, "repair-result.json"), repair);
  if (
    repair.status !== "completed" ||
    repair.mode !== "repair" ||
    repair.verification?.exactReadBack !== true ||
    repair.production?.publishedThemeChanged !== false
  ) {
    throw new Error(`Canonical homepage repair failed: ${JSON.stringify(repair)}`);
  }
}

const finalPass = runVerifier("final", "2", previewURL);
if (!finalPass.passed) {
  const failedReceipt = createReceipt({
    build,
    firstPass,
    repair,
    finalPass,
    publish: null,
    livePass: null,
  });
  await persistReceipt(failedReceipt);
  throw new Error(`Canonical homepage staging verification failed: ${JSON.stringify(finalPass.report?.failures || [])}`);
}

const publish = await requestBuild("publish");
await writeJSON(resolve(outputRoot, "publish-result.json"), publish);
if (
  publish.status !== "completed" ||
  publish.mode !== "publish" ||
  publish.production?.publishedThemeChanged !== true ||
  publish.verification?.publishedThemeReadBackVerified !== true ||
  !publish.production?.url
) {
  throw new Error(`Canonical homepage live publish failed: ${JSON.stringify(publish)}`);
}

const liveURL = `${String(publish.production.url).replace(/\/+$/, "")}/?homepage_release=${encodeURIComponent(commit)}`;
const livePass = runVerifier("live", "3", liveURL);
const receipt = createReceipt({ build, firstPass, repair, finalPass, publish, livePass });
await persistReceipt(receipt);

console.log(JSON.stringify({
  status: livePass.passed ? "published-and-verified" : "published-live-verification-failed",
  previewURL,
  liveURL: publish.production.url,
  firstPass: firstPass.passed,
  repairPerformed: Boolean(repair),
  finalStagingPass: finalPass.passed,
  publishedThemeChanged: publish.production?.publishedThemeChanged,
  publishedThemeReadBackVerified: publish.verification?.publishedThemeReadBackVerified,
  livePass: livePass.passed,
}, null, 2));

if (!livePass.passed) process.exit(1);

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
  const confirmation = mode === "publish" ? PUBLISH_CONFIRMATION : STAGING_CONFIRMATION;
  const response = await fetch(`${workerURL}/api/shopify/staging/canonical-homepage/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation, mode, sourceCommit: commit, reason }),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { status: "failed", error: { code: "invalid_json", message: text.slice(0, 2_000) } };
  }
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
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch (error) {
      report = { passed: false, failures: [`Could not parse verification report: ${error.message}`] };
    }
  }
  return { passed: result.status === 0 && report.passed === true, status: result.status, report };
}

function createReceipt({ build, firstPass, repair, finalPass, publish, livePass }) {
  return {
    sourceCommit: commit,
    expectedProductionEntry: expectedEntry,
    buildStatus: build.status,
    preview: build.preview,
    stagedFiles: build.files,
    stagingProductionBoundary: build.production,
    firstPass: firstPass.report,
    repairPerformed: Boolean(repair),
    repair,
    stagingVerification: finalPass.report,
    publishStatus: publish?.status || "not-attempted",
    production: publish?.production || null,
    publishedFiles: publish?.files || [],
    publishVerification: publish?.verification || null,
    liveVerification: livePass?.report || null,
    generatedAt: new Date().toISOString(),
  };
}

async function persistReceipt(receipt) {
  await writeJSON(resolve(outputRoot, "release-receipt.json"), receipt);
  await writeFile(resolve(outputRoot, "release-receipt.md"), markdown(receipt));
}

async function writeJSON(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function markdown(receipt) {
  const files = Array.isArray(receipt.publishedFiles) && receipt.publishedFiles.length
    ? receipt.publishedFiles
    : Array.isArray(receipt.stagedFiles)
      ? receipt.stagedFiles
      : [];
  return [
    "# Canonical MMG Homepage Production Release",
    "",
    `- Source commit: ${receipt.sourceCommit}`,
    `- Production entry: ${receipt.expectedProductionEntry}`,
    `- Staging preview: ${receipt.preview?.url || "unavailable"}`,
    `- First Playwright pass: ${receipt.firstPass?.passed ? "PASS" : "FAIL"}`,
    `- Repair performed: ${receipt.repairPerformed ? "YES" : "NO"}`,
    `- Final staging verification: ${receipt.stagingVerification?.passed ? "PASS" : "FAIL"}`,
    `- Live URL: ${receipt.production?.url || "unavailable"}`,
    `- Published MAIN changed: ${receipt.production?.publishedThemeChanged === true ? "YES" : "NO"}`,
    `- Published source read-back: ${receipt.publishVerification?.publishedThemeReadBackVerified === true ? "PASS" : "FAIL"}`,
    `- Live browser verification: ${receipt.liveVerification?.passed ? "PASS" : "FAIL"}`,
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
