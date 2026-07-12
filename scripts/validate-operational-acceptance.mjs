#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { parseRuntimeBaseURL } from "./runtime-base-url.mjs";

const EXPECTED_HEADER_IMAGE = "https://cdn.shopify.com/s/files/1/0754/4337/2186/files/kairos-app-header.png?v=1783815598";
const REPORT_PATH = process.env.KAIROS_ACCEPTANCE_REPORT || "kairos-operational-acceptance.json";
const token = process.env.KAIROS_RUNTIME_TOKEN;
const executeMutation = /^(1|true|yes)$/i.test(process.env.KAIROS_ACCEPTANCE_EXECUTE_MUTATION || "");
const approvalPhrase = process.env.KAIROS_ACCEPTANCE_APPROVAL_PHRASE || "";
const objective = (process.env.KAIROS_ACCEPTANCE_OBJECTIVE || "Prepare one bounded, source-grounded homepage improvement that preserves the current MMG design system and changes the fewest files necessary.").trim();

let endpoint;
try {
  endpoint = parseRuntimeBaseURL(process.env.KAIROS_RUNTIME_BASE_URL);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (!token) {
  console.error("KAIROS_RUNTIME_TOKEN is required.");
  process.exit(2);
}
if (executeMutation && approvalPhrase !== "EXECUTE GOVERNED SHOPIFY ACCEPTANCE") {
  console.error("Production mutation refused. Set KAIROS_ACCEPTANCE_APPROVAL_PHRASE exactly to EXECUTE GOVERNED SHOPIFY ACCEPTANCE.");
  process.exit(2);
}

const report = {
  order: "MMG-KAIROS-OPERATIONAL-ACCEPTANCE",
  endpoint,
  objective,
  executeMutation,
  startedAt: new Date().toISOString(),
  steps: [],
  status: "running",
};

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function record(name, status, evidence = {}) {
  report.steps.push({ name, status, checkedAt: new Date().toISOString(), evidence });
  console.log(`${status === "passed" ? "PASS" : status === "skipped" ? "SKIP" : "FAIL"}: ${name}`);
}

function assert(condition, message, evidence = {}) {
  if (!condition) {
    const error = new Error(message);
    error.evidence = evidence;
    throw error;
  }
}

function authorizedHeaders() {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function main() {
  const healthResponse = await fetch(`${endpoint}/api/health`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const health = await readJSON(healthResponse);
  assert(healthResponse.ok && health.status === "ready", "Cloudflare runtime is not ready.", { status: healthResponse.status, health });
  assert(health.runtime === "cloudflare-workers", "Runtime is not Cloudflare Workers.", { runtime: health.runtime });
  assert(health.capabilities?.cloudflareNative === true && health.capabilities?.vercelDependency === false, "Cloudflare-native capability boundary is not satisfied.", health.capabilities);
  assert(health.capabilities?.shopify === true && health.capabilities?.themePlan === true && health.capabilities?.themeMutation === true, "Shopify planning or mutation capability is unavailable.", health.capabilities);
  record("Confirm Cloudflare production runtime", "passed", { build: health.build, capabilities: health.capabilities });

  const rootResponse = await fetch(`${endpoint}/`, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
  const html = await rootResponse.text();
  const headers = Object.fromEntries(["x-mmg-host", "x-mmg-runtime", "x-mmg-build"].map(key => [key, rootResponse.headers.get(key)]));
  assert(rootResponse.ok, "Command Center root did not load.", { status: rootResponse.status });
  assert(headers["x-mmg-host"] === "cloudflare-assets" && headers["x-mmg-runtime"] === "cloudflare-native", "Command Center is not being served by the canonical Cloudflare asset path.", headers);
  assert(headers["x-mmg-build"] === health.build, "Command Center and API build fingerprints do not match.", { headers, healthBuild: health.build });
  assert(html.includes("Kairos") && html.includes(EXPECTED_HEADER_IMAGE), "Command Center HTML is missing Kairos or the approved header image.");
  assert(html.includes("proposal-store-guard.js") && html.includes("proposal-review-lite.js") && html.includes("interaction-watchdog.js"), "Mobile resilience guards are missing from the production shell.");
  record("Verify mobile-safe Command Center shell", "passed", { headers, approvedHeaderImage: EXPECTED_HEADER_IMAGE });

  const kairosResponse = await fetch(`${endpoint}/api/kairos`, {
    method: "POST",
    headers: authorizedHeaders(),
    body: JSON.stringify({
      objective: "Confirm that the MMG/Kairos operational acceptance request path is authorized and governed. Do not claim any external mutation occurred.",
      department: "Executive Operations",
      routingConfidence: 1,
      executionPlan: ["Validate authorization.", "Return request and audit evidence."],
      governanceNote: "Automated operational acceptance smoke test; external actions are prohibited in this step.",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const kairos = await readJSON(kairosResponse);
  assert(kairosResponse.ok && typeof kairos.message === "string" && kairos.requestId && kairos.auditId, "Authorized Kairos request failed.", { status: kairosResponse.status, kairos });
  record("Verify authorized Kairos execution path", "passed", { department: kairos.department, requestId: kairos.requestId, auditId: kairos.auditId });

  const planResponse = await fetch(`${endpoint}/api/theme-plan`, {
    method: "POST",
    headers: authorizedHeaders(),
    body: JSON.stringify({ objective }),
    signal: AbortSignal.timeout(90_000),
  });
  const proposal = await readJSON(planResponse);
  const files = proposal?.mutationPlan?.files;
  assert(planResponse.ok && proposal?.mutationPlan?.themeId && Array.isArray(files) && files.length > 0, "Kairos did not produce an executable source-grounded Shopify proposal.", { status: planResponse.status, proposal });
  assert(proposal?.sourceEvidence?.adapter === "graphql-admin" && Array.isArray(proposal?.sourceEvidence?.files), "Proposal lacks Shopify source evidence.", proposal?.sourceEvidence);
  assert(files.every(file => typeof file?.key === "string" && typeof file?.value === "string" && typeof file?.expectedSha256 === "string"), "Proposal file records are incomplete.", { files: files.map(file => ({ key: file?.key, hasValue: typeof file?.value === "string", expectedSha256: file?.expectedSha256 })) });
  record("Prepare and review fresh Shopify proposal", "passed", {
    themeId: proposal.mutationPlan.themeId,
    files: files.map(file => ({ key: file.key, expectedSha256: file.expectedSha256, bytes: Buffer.byteLength(file.value || "", "utf8") })),
    requestId: proposal.requestId,
    auditId: proposal.auditId,
    summary: proposal.summary,
    risks: proposal.risks,
    rollbackPlan: proposal.rollbackPlan,
  });

  if (!executeMutation) {
    record("Execute bounded governed Shopify mutation", "skipped", { reason: "Production switch not supplied; proposal generation and review evidence completed." });
  } else {
    const actionResponse = await fetch(`${endpoint}/api/actions`, {
      method: "POST",
      headers: authorizedHeaders(),
      body: JSON.stringify({
        actionType: "shopify.theme.files.upsert",
        objective,
        proposal,
        approval: { approved: true, actor: "Executive", approvedAt: new Date().toISOString(), acceptanceOrder: report.order },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const action = await readJSON(actionResponse);
    assert(actionResponse.ok && action.status === "completed", "Governed Shopify mutation did not complete.", { status: actionResponse.status, action });
    assert(action.evidence?.publishedThemeVerified === true && action.evidence?.rollbackAvailable === true && Array.isArray(action.evidence?.files) && action.evidence.files.every(file => file.verified === true), "Mutation completion evidence is incomplete.", action.evidence);
    assert(Array.isArray(action.evidence?.backup) && action.evidence.backup.length === action.evidence.files.length, "Backup evidence does not cover every mutated file.", action.evidence);
    record("Execute bounded governed Shopify mutation", "passed", { actionID: action.actionID, evidence: action.evidence });
  }

  report.status = executeMutation ? "accepted" : "proposal-validated";
  report.completedAt = new Date().toISOString();
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Operational acceptance report written to ${REPORT_PATH}.`);
}

main().catch(async error => {
  record("Operational acceptance gate", "failed", { message: error?.message, evidence: error?.evidence });
  report.status = "failed";
  report.completedAt = new Date().toISOString();
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8").catch(() => {});
  console.error(error);
  process.exit(1);
});
