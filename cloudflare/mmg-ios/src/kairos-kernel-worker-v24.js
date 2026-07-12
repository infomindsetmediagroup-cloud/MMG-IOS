import kernel from "./kairos-kernel-worker-v19.js";
import {
  applyCompactPatch,
  buildEditableMap,
  extractOpenAIError,
  extractOutputText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  safeJSON,
  semanticHash,
  writeThemeFile,
} from "./kairos-compact-homepage-utils-v1.js";

const BUILD = "kairos-kernel-20260712-24";
const JOB_TTL_SECONDS = 3600;
const HOMEPAGE_FILE = "templates/index.json";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/shopify/staging/execute/jobs" && request.method === "POST") return submitJob(request, env);
    const match = url.pathname.match(/^\/api\/shopify\/staging\/execute\/jobs\/([a-f0-9-]+)$/i);
    if (match && request.method === "GET") return pollJob(request, env, match[1]);

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v24";
      body.capabilities = { ...(body.capabilities || {}), compactHomepagePatchExecution: "available" };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function submitJob(request, env) {
  try {
    const payload = await request.json();
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(planEnvelope, approval);

    const changes = Array.isArray(planEnvelope?.plan?.changes)
      ? planEnvelope.plan.changes.filter(change => change?.changeType === "modify")
      : [];
    if (changes.length !== 1 || changes[0]?.filename !== HOMEPAGE_FILE) {
      throw httpError(409, "execution_scope_not_supported", "Compact execution currently supports one approved templates/index.json change per website job.");
    }

    const sourceBody = await inspectStagingSource(kernel, request, env, BUILD);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const sourceFile = (Array.isArray(evidence?.files) ? evidence.files : []).find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");

    if (!stagingTheme?.gid || stagingTheme.role === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
    if (!mainTheme?.gid || mainTheme.role !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live Rise theme could not be verified.");
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");
    if (approval?.targetThemeID !== stagingTheme.gid || planEnvelope?.plan?.targetTheme?.gid !== stagingTheme.gid) throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");
    if (approval?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256 || planEnvelope?.plan?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256) throw httpError(409, "source_hash_mismatch", "templates/index.json changed after approval. Generate and approve a new plan.");

    const original = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    const openaiKey = String(env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) throw httpError(503, "openai_not_configured", "OPENAI_API_KEY is not configured.");

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["order", "operations"],
      properties: {
        order: { type: "array", items: { type: "string" } },
        operations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["scope", "sectionId", "blockId", "key", "valueJson"],
            properties: {
              scope: { type: "string", enum: ["section", "block"] },
              sectionId: { type: "string" },
              blockId: { type: "string" },
              key: { type: "string" },
              valueJson: { type: "string" },
            },
          },
        },
      },
    };

    const editableMap = buildEditableMap(original);
    const change = changes[0];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: String(env.OPENAI_MODEL || "gpt-5.6").trim(),
        background: true,
        store: true,
        input: [
          { role: "system", content: [{ type: "input_text", text: "You are Kairos, a governed Shopify homepage patch engine. Return only a compact patch. Use only existing section IDs, block IDs, and setting keys from the supplied editable map. order must be either an empty array for no reorder or the complete existing section ID list exactly once in the desired order. Each operation changes one existing setting. valueJson must be a valid JSON-encoded value string. Do not add or remove sections, blocks, keys, or types." }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({ objective: planEnvelope.objective, strategy: planEnvelope?.plan?.strategy, instructions: change?.instructions || [], expectedOutcome: change?.expectedOutcome || "", editableMap }) }] },
        ],
        text: { format: { type: "json_schema", name: "kairos_compact_homepage_patch", strict: true, schema } },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const openaiBody = await safeJSON(response);
    if (!response.ok || !openaiBody?.id) throw httpError(response.status || 502, "openai_background_submit_failed", String(openaiBody?.error?.message || "OpenAI did not accept the compact patch request.").slice(0, 1000));

    const jobID = crypto.randomUUID();
    await writeJob(request, jobID, {
      jobID,
      status: "generating",
      build: BUILD,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      openaiResponseID: openaiBody.id,
      planEnvelope,
      approval,
      source: { filename: HOMEPAGE_FILE, rawSha256: sourceFile.sha256, semanticSha256: await semanticHash(original), content: sourceFile.content },
      stagingTheme,
      mainTheme,
      summary: "OpenAI is generating a compact governed homepage patch.",
    });

    return json({ jobID, status: "generating", build: BUILD, pollURL: `/api/shopify/staging/execute/jobs/${jobID}`, summary: "OpenAI is generating a compact governed homepage patch." }, 202);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({ status: "needs-attention", build: BUILD, error: normalized, summary: "Kairos could not start compact homepage execution." }, normalized.status);
  }
}

async function pollJob(request, env, jobID) {
  const existing = await readJob(request, jobID);
  if (!existing) return json({ jobID, status: "not-found", error: { message: "The website execution job was not found or expired." } }, 404);
  if (["completed", "needs-attention"].includes(existing.status)) return json(existing, existing.status === "needs-attention" ? Number(existing.httpStatus || 500) : 200);

  try {
    const apiKey = String(env.OPENAI_API_KEY || "").trim();
    const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(existing.openaiResponseID)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const openaiBody = await safeJSON(response);
    if (!response.ok) throw httpError(response.status, "openai_background_poll_failed", String(openaiBody?.error?.message || `OpenAI polling returned HTTP ${response.status}.`).slice(0, 1000));
    if (["queued", "in_progress"].includes(openaiBody?.status)) return json(existing, 200);
    if (openaiBody?.status !== "completed") throw httpError(502, "openai_background_execution_failed", extractOpenAIError(openaiBody) || `OpenAI execution generation ended with status ${String(openaiBody?.status || "unknown")}.`);

    const outputText = extractOutputText(openaiBody);
    if (!outputText) throw httpError(502, "openai_empty_compact_patch", "OpenAI returned no compact homepage patch.");
    let patch;
    try { patch = JSON.parse(outputText); }
    catch { throw httpError(502, "openai_invalid_patch_envelope", "OpenAI returned an invalid compact patch envelope."); }

    const currentBody = await inspectStagingSource(kernel, request, env, BUILD);
    const currentFile = (Array.isArray(currentBody?.evidence?.files) ? currentBody.evidence.files : []).find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!currentFile?.content || currentFile.sha256 !== existing.source.rawSha256) throw httpError(409, "source_hash_mismatch", "templates/index.json changed while execution was generating. Generate and approve a new plan.");

    const original = parseShopifyJson(currentFile.content, "Current Kairos Staging homepage");
    const candidate = applyCompactPatch(original, patch);
    const beforeSemanticHash = await semanticHash(original);
    const candidateSemanticHash = await semanticHash(candidate);
    if (candidateSemanticHash === beforeSemanticHash) throw httpError(409, "generated_content_unchanged", "The compact patch produced no semantic homepage change.");

    const replacement = JSON.stringify(candidate, null, 2) + "\n";
    const write = await writeThemeFile(env, existing.stagingTheme.gid, HOMEPAGE_FILE, replacement);
    const verifyBody = await inspectStagingSource(kernel, request, env, BUILD);
    const readBack = (Array.isArray(verifyBody?.evidence?.files) ? verifyBody.evidence.files : []).find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!readBack?.content) throw httpError(502, "staging_readback_missing", "Shopify returned no homepage source after the staging write.");
    const verified = parseShopifyJson(readBack.content, "Shopify staging read-back");
    const actualSemanticHash = await semanticHash(verified);
    if (actualSemanticHash !== candidateSemanticHash) throw httpError(502, "staging_readback_semantic_mismatch", "The Shopify read-back did not match the compact approved homepage result.");

    const afterMain = verifyBody?.evidence?.mainTheme;
    const afterStaging = verifyBody?.evidence?.stagingTheme;
    if (afterMain?.gid !== existing.mainTheme.gid || afterMain?.role !== "MAIN") throw httpError(502, "main_theme_changed_during_staging_write", "The live Rise theme did not remain unchanged.");
    if (afterStaging?.gid !== existing.stagingTheme.gid || afterStaging?.role === "MAIN") throw httpError(502, "staging_boundary_failed", "Kairos Staging could not be verified as non-live after the write.");

    const completedAt = new Date().toISOString();
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: BUILD,
      kernel: "standalone-v24",
      completedAt,
      summary: "Kairos applied and semantically verified the approved compact homepage patch on Kairos Staging.",
      objective: existing.planEnvelope.objective,
      execution: {
        operation: "themeFilesUpsert",
        engine: "compact-resumable-shopify-json-v4",
        targetTheme: afterStaging,
        publishedTheme: afterMain,
        publishedThemeChanged: false,
        productionPublishAuthorized: false,
        filesWritten: [{ filename: HOMEPAGE_FILE, beforeSha256: currentFile.sha256, afterSha256: readBack.sha256, beforeSemanticSha256: beforeSemanticHash, afterSemanticSha256: actualSemanticHash, beforeBytes: new TextEncoder().encode(currentFile.content).length, afterBytes: new TextEncoder().encode(readBack.content).length }],
      },
      verification: [{ filename: HOMEPAGE_FILE, expectedSemanticSha256: candidateSemanticHash, actualSemanticSha256: actualSemanticHash, matched: true, jsonValid: true, structurePreserved: true }],
      evidence: { credentialPath: write.credentialPath, openaiResponseID: existing.openaiResponseID, mutationResult: write.mutationResult, patchOperationCount: Array.isArray(patch.operations) ? patch.operations.length : 0, reordered: Array.isArray(patch.order) && patch.order.length > 0, sourceInspectionActionID: currentBody.actionID, readBackInspectionActionID: verifyBody.actionID },
      rollback: { required: false, authorized: false, targetThemeID: existing.stagingTheme.gid, files: [{ filename: HOMEPAGE_FILE, sha256: currentFile.sha256, semanticSha256: beforeSemanticHash, content: currentFile.content }], instruction: "Rollback requires separate approval and restores only the original templates/index.json on Kairos Staging." },
    };
    const completed = { jobID, status: "completed", build: BUILD, completedAt, updatedAt: completedAt, summary: result.summary, result };
    await writeJob(request, jobID, completed);
    return json(completed, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    const failed = { jobID, status: "needs-attention", build: BUILD, updatedAt: new Date().toISOString(), httpStatus: normalized.status, summary: "Kairos could not complete compact homepage execution.", error: normalized };
    await writeJob(request, jobID, failed);
    return json(failed, normalized.status);
  }
}

function validateApproval(planEnvelope, approval) {
  if (!planEnvelope?.plan) throw httpError(400, "staging_plan_required", "The approved staging plan is missing.");
  if (!approval || approval.status !== "approved") throw httpError(403, "staging_plan_approval_required", "Explicit staging plan approval is required.");
  if (approval.planID !== planEnvelope.planID || approval.actionID !== planEnvelope.actionID) throw httpError(409, "approval_plan_mismatch", "The approval does not match the current staging plan.");
}

async function readJob(request, jobID) {
  const response = await caches.default.match(jobRequest(request, jobID));
  return response ? safeJSON(response) : null;
}

async function writeJob(request, jobID, body) {
  await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`, "X-MMG-Runtime": BUILD } }));
}

function jobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/compact-execution-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function normalizeError(error) {
  return { status: Number.isInteger(error?.status) ? error.status : 500, code: typeof error?.code === "string" ? error.code : "compact_execution_failed", message: error instanceof Error ? error.message : "Compact execution failed." };
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v24");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-v24", "X-Content-Type-Options": "nosniff" } });
}
