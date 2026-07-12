import kernel from "./kairos-kernel-worker-v19.js";
import {
  applyCompactPatch,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  safeJSON,
  semanticHash,
  writeThemeFile,
} from "./kairos-compact-homepage-utils-v1.js";
import { buildDeterministicHomepagePackage } from "./kairos-deterministic-homepage-v1.js";

const BUILD = "kairos-kernel-20260712-25";
const JOB_TTL_SECONDS = 3600;
const MAX_OBJECTIVE_CHARS = 12_000;
const HOMEPAGE_FILE = "templates/index.json";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/plan/jobs" && request.method === "POST") {
      return createDeterministicPlan(request, env);
    }
    const planMatch = url.pathname.match(/^\/api\/shopify\/staging\/plan\/jobs\/([a-f0-9-]+)$/i);
    if (planMatch && request.method === "GET") return readPlanJob(request, planMatch[1]);

    if (url.pathname === "/api/shopify/staging/execute/jobs" && request.method === "POST") {
      return executeDeterministicPlan(request, env);
    }
    const executionMatch = url.pathname.match(/^\/api\/shopify\/staging\/execute\/jobs\/([a-f0-9-]+)$/i);
    if (executionMatch && request.method === "GET") return readExecutionJob(request, executionMatch[1]);

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v25";
      body.experience = {
        ...(body.experience || {}),
        websitePlanningTransport: "deterministic-source-grounded",
        websiteExecutionTransport: "deterministic-staging-write",
        openaiRequiredForHomepageRetool: false,
      };
      body.capabilities = {
        ...(body.capabilities || {}),
        deterministicHomepagePlanning: "operational",
        deterministicHomepageExecution: "operational",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function createDeterministicPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 8) throw httpError(400, "objective_required", "Enter a specific website objective before starting the job.");
    if (objective.length > MAX_OBJECTIVE_CHARS) throw httpError(413, "objective_too_long", `Website objective exceeds ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.`);

    const sourceBody = await inspectStagingSource(kernel, request, env, BUILD);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const sourceFile = (Array.isArray(evidence?.files) ? evidence.files : [])
      .find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");

    validateThemeBoundary(stagingTheme, mainTheme);
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");

    const document = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    const packageResult = buildDeterministicHomepagePackage(document, objective);
    const now = new Date().toISOString();
    const actionID = crypto.randomUUID();
    const planID = crypto.randomUUID();
    const sourceHashes = { [HOMEPAGE_FILE]: sourceFile.sha256 };
    const result = {
      actionID,
      planID,
      actionType: "shopify.staging.plan",
      status: "ready-for-approval",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v25",
      startedAt: now,
      completedAt: now,
      objective,
      summary: packageResult.summary,
      plan: {
        summary: packageResult.summary,
        strategy: packageResult.strategy,
        changes: packageResult.changes,
        risks: packageResult.risks,
        acceptanceCriteria: packageResult.acceptanceCriteria,
        rollbackPlan: packageResult.rollbackPlan,
        deterministicPatch: packageResult.patch,
        targetTheme: stagingTheme,
        publishedTheme: mainTheme,
        sourceHashes,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        sourceInspectionActionID: sourceBody.actionID || "",
        stagingTheme,
        mainTheme,
        suppliedFiles: [{ filename: HOMEPAGE_FILE, sha256: sourceFile.sha256, bytes: sourceFile.bytes }],
        planningEngine: "chatgpt-authored-deterministic-homepage-v1",
        openaiAPIUsed: false,
        evidenceNotes: packageResult.evidenceNotes,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary: result.summary, result };
    await writeJob(request, "plan", jobID, completed);
    return json({ jobID, status: "completed", build: BUILD, pollURL: `/api/shopify/staging/plan/jobs/${jobID}`, summary: result.summary }, 202);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({ status: "needs-attention", build: BUILD, summary: "Kairos could not prepare the deterministic homepage plan.", error: normalized }, normalized.status);
  }
}

async function readPlanJob(request, jobID) {
  const job = await readJob(request, "plan", jobID);
  return job ? json(job, job.status === "needs-attention" ? Number(job.httpStatus || 500) : 200) : json({ jobID, status: "not-found", error: { message: "The website planning job was not found or expired." } }, 404);
}

async function executeDeterministicPlan(request, env) {
  const startedAt = new Date().toISOString();
  try {
    const payload = await request.json();
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(planEnvelope, approval);

    const patch = planEnvelope?.plan?.deterministicPatch;
    if (!patch || !Array.isArray(patch.operations)) throw httpError(409, "deterministic_patch_missing", "The approved deterministic homepage patch is missing.");

    const sourceBody = await inspectStagingSource(kernel, request, env, BUILD);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const sourceFile = (Array.isArray(evidence?.files) ? evidence.files : [])
      .find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");

    validateThemeBoundary(stagingTheme, mainTheme);
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");
    if (approval?.targetThemeID !== stagingTheme.gid || planEnvelope?.plan?.targetTheme?.gid !== stagingTheme.gid) throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");
    if (approval?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256 || planEnvelope?.plan?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256) throw httpError(409, "source_hash_mismatch", "templates/index.json changed after approval. Generate and approve a new plan.");

    const original = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    const candidate = applyCompactPatch(original, patch);
    const beforeSemanticHash = await semanticHash(original);
    const candidateSemanticHash = await semanticHash(candidate);
    if (candidateSemanticHash === beforeSemanticHash) throw httpError(409, "generated_content_unchanged", "The deterministic patch produced no semantic homepage change.");

    const replacement = JSON.stringify(candidate, null, 2) + "\n";
    const write = await writeThemeFile(env, stagingTheme.gid, HOMEPAGE_FILE, replacement);
    const verifyBody = await inspectStagingSource(kernel, request, env, BUILD);
    const readBack = (Array.isArray(verifyBody?.evidence?.files) ? verifyBody.evidence.files : [])
      .find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!readBack?.content) throw httpError(502, "staging_readback_missing", "Shopify returned no homepage source after the staging write.");

    const verified = parseShopifyJson(readBack.content, "Shopify staging read-back");
    const actualSemanticHash = await semanticHash(verified);
    if (actualSemanticHash !== candidateSemanticHash) throw httpError(502, "staging_readback_semantic_mismatch", "The Shopify read-back did not match the approved deterministic homepage result.");

    const afterMain = verifyBody?.evidence?.mainTheme;
    const afterStaging = verifyBody?.evidence?.stagingTheme;
    validateThemeBoundary(afterStaging, afterMain);
    if (afterMain.gid !== mainTheme.gid) throw httpError(502, "main_theme_changed_during_staging_write", "The live Rise theme did not remain unchanged.");

    const completedAt = new Date().toISOString();
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: BUILD,
      kernel: "standalone-v25",
      completedAt,
      summary: "Kairos applied and semantically verified the approved homepage retool on the non-live Kairos Staging theme without using the OpenAI API.",
      objective: planEnvelope.objective,
      execution: {
        operation: "themeFilesUpsert",
        engine: "chatgpt-authored-deterministic-homepage-v1",
        targetTheme: afterStaging,
        publishedTheme: afterMain,
        publishedThemeChanged: false,
        productionPublishAuthorized: false,
        openaiAPIUsed: false,
        filesWritten: [{ filename: HOMEPAGE_FILE, beforeSha256: sourceFile.sha256, afterSha256: readBack.sha256, beforeSemanticSha256: beforeSemanticHash, afterSemanticSha256: actualSemanticHash }],
      },
      verification: [{ filename: HOMEPAGE_FILE, expectedSemanticSha256: candidateSemanticHash, actualSemanticSha256: actualSemanticHash, matched: true, jsonValid: true, structurePreserved: true }],
      evidence: { credentialPath: write.credentialPath, mutationResult: write.mutationResult, patchOperationCount: patch.operations.length, sourceInspectionActionID: sourceBody.actionID, readBackInspectionActionID: verifyBody.actionID },
      rollback: { required: false, authorized: false, targetThemeID: stagingTheme.gid, files: [{ filename: HOMEPAGE_FILE, sha256: sourceFile.sha256, semanticSha256: beforeSemanticHash, content: sourceFile.content }], instruction: "Rollback requires separate approval and restores only the original templates/index.json on Kairos Staging." },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: BUILD, submittedAt: startedAt, updatedAt: completedAt, completedAt, summary: result.summary, result };
    await writeJob(request, "execution", jobID, completed);
    return json({ jobID, status: "completed", build: BUILD, pollURL: `/api/shopify/staging/execute/jobs/${jobID}`, summary: result.summary, result }, 202);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({ status: "needs-attention", build: BUILD, summary: "Kairos could not complete the deterministic homepage execution.", error: normalized }, normalized.status);
  }
}

async function readExecutionJob(request, jobID) {
  const job = await readJob(request, "execution", jobID);
  return job ? json(job, job.status === "needs-attention" ? Number(job.httpStatus || 500) : 200) : json({ jobID, status: "not-found", error: { message: "The website execution job was not found or expired." } }, 404);
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || stagingTheme.role === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || mainTheme.role !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live Rise theme could not be verified.");
}

function validateApproval(planEnvelope, approval) {
  if (!planEnvelope?.plan) throw httpError(400, "staging_plan_required", "The approved staging plan is missing.");
  if (!approval || approval.status !== "approved") throw httpError(403, "staging_plan_approval_required", "Explicit staging plan approval is required.");
  if (approval.planID !== planEnvelope.planID || approval.actionID !== planEnvelope.actionID) throw httpError(409, "approval_plan_mismatch", "The approval does not match the current staging plan.");
}

async function readJob(request, type, jobID) {
  const response = await caches.default.match(jobRequest(request, type, jobID));
  return response ? safeJSON(response) : null;
}

async function writeJob(request, type, jobID, body) {
  await caches.default.put(jobRequest(request, type, jobID), new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`, "X-MMG-Runtime": BUILD } }));
}

function jobRequest(request, type, jobID) {
  return new Request(new URL(`/_kairos/deterministic-${type}-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function normalizeError(error) {
  return { status: Number.isInteger(error?.status) ? error.status : 500, code: typeof error?.code === "string" ? error.code : "deterministic_homepage_failed", message: error instanceof Error ? error.message : "Deterministic homepage operation failed." };
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v25");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-v25", "X-Content-Type-Options": "nosniff" } });
}
