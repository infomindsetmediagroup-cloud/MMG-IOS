import kernel from "./kairos-kernel-worker-v21.js";

const BUILD = "kairos-kernel-20260712-22";
const JOB_TTL_SECONDS = 3600;
const SHOPIFY_TIMEOUT_MS = 25_000;
const HOMEPAGE_FILE = "templates/index.json";
const tokenCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/execute/jobs" && request.method === "POST") {
      return submitExecutionJob(request, env);
    }

    const match = url.pathname.match(/^\/api\/shopify\/staging\/execute\/jobs\/([a-f0-9-]+)$/i);
    if (match && request.method === "GET") {
      return pollExecutionJob(request, env, match[1]);
    }

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v22";
      body.experience = {
        ...(body.experience || {}),
        websiteExecutionTransport: "openai-background-plus-short-shopify-commit",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function submitExecutionJob(request, env) {
  const startedAt = new Date().toISOString();
  try {
    const payload = await readRequestJSON(request);
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(planEnvelope, approval);

    const changes = Array.isArray(planEnvelope?.plan?.changes)
      ? planEnvelope.plan.changes.filter(change => change?.changeType === "modify")
      : [];
    if (changes.length !== 1 || changes[0]?.filename !== HOMEPAGE_FILE) {
      throw httpError(409, "execution_scope_not_supported", "This governed execution build supports one approved templates/index.json change per website job.");
    }

    const sourceBody = await inspectStagingSource(request, env);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const sourceFile = (Array.isArray(evidence?.files) ? evidence.files : [])
      .find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");

    if (!stagingTheme?.gid || stagingTheme.role === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
    if (!mainTheme?.gid || mainTheme.role !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live Rise theme could not be verified.");
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");
    if (approval?.targetThemeID !== stagingTheme.gid || planEnvelope?.plan?.targetTheme?.gid !== stagingTheme.gid) throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");
    if (approval?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256 || planEnvelope?.plan?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256) throw httpError(409, "source_hash_mismatch", "templates/index.json changed after approval. Generate and approve a new plan.");

    const originalParsed = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    validateHomepageDocument(originalParsed.document, originalParsed.document);

    const openaiKey = String(env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) throw httpError(503, "openai_not_configured", "OPENAI_API_KEY is not configured.");
    const model = String(env.OPENAI_MODEL || "gpt-5.6").trim();
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["document"],
      properties: { document: { type: "string" } },
    };
    const change = changes[0];
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model,
        background: true,
        store: true,
        input: [
          { role: "system", content: [{ type: "input_text", text: "You are Kairos, a governed Shopify JSON implementation engine. Return the complete templates/index.json document as a JSON string in the document field. Preserve all existing top-level keys, section IDs, section types, block IDs, and block types. You may update settings values on existing sections or blocks and reorder the existing section IDs in order. Do not add or remove sections or blocks. Do not change any type field. The document string must parse as strict JSON with no comments, markdown, or trailing text." }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({ objective: planEnvelope.objective, strategy: planEnvelope?.plan?.strategy, instructions: change?.instructions || [], expectedOutcome: change?.expectedOutcome || "", currentDocument: originalParsed.document }) }] },
        ],
        text: { format: { type: "json_schema", name: "kairos_structured_homepage_json", strict: true, schema } },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const openaiBody = await safeJSON(openaiResponse);
    if (!openaiResponse.ok || !openaiBody?.id) throw httpError(openaiResponse.status || 502, "openai_background_submit_failed", String(openaiBody?.error?.message || "OpenAI did not accept the background execution generation.").slice(0, 1000));

    const jobID = crypto.randomUUID();
    const job = {
      jobID,
      status: "generating",
      build: BUILD,
      submittedAt: startedAt,
      updatedAt: startedAt,
      openaiResponseID: openaiBody.id,
      planEnvelope,
      approval,
      source: {
        filename: HOMEPAGE_FILE,
        rawSha256: sourceFile.sha256,
        semanticSha256: await semanticHash(originalParsed.document),
        content: sourceFile.content,
      },
      stagingTheme,
      mainTheme,
      summary: "OpenAI is generating the approved homepage document.",
    };
    await writeJob(request, jobID, job);

    return json({ jobID, status: "generating", build: BUILD, pollURL: `/api/shopify/staging/execute/jobs/${jobID}`, summary: job.summary }, 202);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({ status: "needs-attention", build: BUILD, error: normalized, summary: "Kairos could not start the approved website execution." }, normalized.status);
  }
}

async function pollExecutionJob(request, env, jobID) {
  const existing = await readJob(request, jobID);
  if (!existing) return json({ jobID, status: "not-found", error: { message: "The website execution job was not found or expired." } }, 404);
  if (["completed", "needs-attention", "committing"].includes(existing.status)) return json(existing, existing.status === "needs-attention" ? Number(existing.httpStatus || 500) : 200);

  try {
    const openaiKey = String(env.OPENAI_API_KEY || "").trim();
    const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(existing.openaiResponseID)}`, {
      headers: { Authorization: `Bearer ${openaiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const openaiBody = await safeJSON(response);
    if (!response.ok) throw httpError(response.status, "openai_background_poll_failed", String(openaiBody?.error?.message || `OpenAI polling returned HTTP ${response.status}.`).slice(0, 1000));

    if (["queued", "in_progress"].includes(openaiBody?.status)) {
      existing.status = "generating";
      existing.updatedAt = new Date().toISOString();
      existing.summary = "OpenAI is generating the approved homepage document.";
      await writeJob(request, jobID, existing);
      return json(existing, 200);
    }
    if (openaiBody?.status !== "completed") throw httpError(502, "openai_background_execution_failed", `OpenAI execution generation ended with status ${String(openaiBody?.status || "unknown")}.`);

    existing.status = "committing";
    existing.updatedAt = new Date().toISOString();
    existing.summary = "Generation completed. Kairos is writing and verifying Kairos Staging.";
    await writeJob(request, jobID, existing);

    const outputText = extractOutputText(openaiBody);
    if (!outputText) throw httpError(502, "openai_empty_structured_json", "OpenAI returned no structured homepage document.");
    let envelope;
    try { envelope = JSON.parse(outputText); } catch { throw httpError(502, "openai_invalid_structured_envelope", "OpenAI returned an invalid structured response envelope."); }
    let candidate;
    try { candidate = JSON.parse(envelope?.document); } catch (error) { throw httpError(502, "openai_invalid_homepage_document", `Generated homepage document is invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`); }

    const currentBody = await inspectStagingSource(request, env);
    const currentFile = (Array.isArray(currentBody?.evidence?.files) ? currentBody.evidence.files : [])
      .find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!currentFile?.content || currentFile.sha256 !== existing.source.rawSha256) throw httpError(409, "source_hash_mismatch", "templates/index.json changed while execution was generating. Generate and approve a new plan.");
    const original = parseShopifyJson(currentFile.content, "Current Kairos Staging homepage").document;
    validateHomepageDocument(candidate, original);
    const candidateSemanticHash = await semanticHash(candidate);
    if (candidateSemanticHash === await semanticHash(original)) throw httpError(409, "generated_content_unchanged", "The generated homepage is semantically identical to the current staging source.");

    const replacement = JSON.stringify(candidate, null, 2) + "\n";
    const config = readShopifyConfig(env);
    const auth = await resolveAccessToken(config, env);
    const mutationResult = await writeThemeFile(config, auth.accessToken, existing.stagingTheme.gid, HOMEPAGE_FILE, replacement);

    const verifyBody = await inspectStagingSource(request, env);
    const readBack = (Array.isArray(verifyBody?.evidence?.files) ? verifyBody.evidence.files : [])
      .find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!readBack?.content) throw httpError(502, "staging_readback_missing", "Shopify returned no homepage source after the staging write.");
    const verified = parseShopifyJson(readBack.content, "Shopify staging read-back").document;
    validateHomepageDocument(verified, original);
    const actualSemanticHash = await semanticHash(verified);
    if (actualSemanticHash !== candidateSemanticHash) throw httpError(502, "staging_readback_semantic_mismatch", "The Shopify read-back did not match the approved canonical homepage document.");

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
      kernel: "standalone-v22",
      completedAt,
      summary: "Kairos applied and semantically verified the approved homepage update on the non-live Kairos Staging theme.",
      objective: existing.planEnvelope.objective,
      execution: {
        operation: "themeFilesUpsert",
        engine: "resumable-structured-shopify-json-v3",
        targetTheme: afterStaging,
        publishedTheme: afterMain,
        publishedThemeChanged: false,
        productionPublishAuthorized: false,
        filesWritten: [{ filename: HOMEPAGE_FILE, beforeSha256: currentFile.sha256, afterSha256: readBack.sha256, beforeSemanticSha256: existing.source.semanticSha256, afterSemanticSha256: actualSemanticHash, beforeBytes: new TextEncoder().encode(currentFile.content).length, afterBytes: new TextEncoder().encode(readBack.content).length }],
      },
      verification: [{ filename: HOMEPAGE_FILE, expectedSemanticSha256: candidateSemanticHash, actualSemanticSha256: actualSemanticHash, matched: true, jsonValid: true, structurePreserved: true }],
      evidence: { credentialPath: auth.source, openaiResponseID: existing.openaiResponseID, mutationResult, sourceInspectionActionID: currentBody.actionID, readBackInspectionActionID: verifyBody.actionID, resultingOrder: verified.order || [] },
      rollback: { required: false, authorized: false, targetThemeID: existing.stagingTheme.gid, files: [{ filename: HOMEPAGE_FILE, sha256: currentFile.sha256, semanticSha256: existing.source.semanticSha256, content: currentFile.content }], instruction: "Rollback requires separate approval and restores only the original templates/index.json on Kairos Staging." },
    };
    const completed = { jobID, status: "completed", build: BUILD, completedAt, updatedAt: completedAt, summary: result.summary, result };
    await writeJob(request, jobID, completed);
    return json(completed, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    const failed = { jobID, status: "needs-attention", build: BUILD, updatedAt: new Date().toISOString(), httpStatus: normalized.status, summary: "Kairos could not complete the approved website execution.", error: normalized };
    await writeJob(request, jobID, failed);
    return json(failed, normalized.status);
  }
}

async function inspectStagingSource(request, env) {
  const response = await kernel.fetch(new Request(new URL("/api/shopify/staging/source/inspect", request.url), { method: "POST", headers: { Accept: "application/json", "X-MMG-Internal": BUILD } }), env);
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, body?.error?.code || "staging_source_unavailable", body?.error?.message || body?.summary || "Kairos could not read the staging source.");
  return body;
}

function parseShopifyJson(source, label) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  let jsonText = text;
  const trimmed = text.trimStart();
  if (trimmed.startsWith("/*")) {
    const startOffset = text.length - trimmed.length;
    const end = text.indexOf("*/", startOffset + 2);
    if (end === -1) throw httpError(409, "shopify_json_comment_unclosed", `${label} contains an unclosed leading Shopify comment.`);
    jsonText = text.slice(end + 2).trimStart();
  }
  try { return { document: JSON.parse(jsonText) }; }
  catch (error) { throw httpError(409, "shopify_json_invalid", `${label} does not contain valid JSON after Shopify comment normalization: ${error instanceof Error ? error.message : "parse failed"}`); }
}

function validateHomepageDocument(candidate, original) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Homepage JSON must be an object.");
  if (JSON.stringify(Object.keys(original).sort()) !== JSON.stringify(Object.keys(candidate).sort())) throw new Error("Top-level Shopify template keys changed.");
  if (!candidate.sections || typeof candidate.sections !== "object" || Array.isArray(candidate.sections)) throw new Error("sections must remain an object.");
  if (!Array.isArray(candidate.order)) throw new Error("order must remain an array.");
  const originalIDs = Object.keys(original.sections || {}).sort();
  const candidateIDs = Object.keys(candidate.sections || {}).sort();
  if (JSON.stringify(originalIDs) !== JSON.stringify(candidateIDs)) throw new Error("Section IDs were added or removed.");
  if (new Set(candidate.order).size !== candidate.order.length || candidate.order.length !== original.order.length || original.order.some(id => !candidate.order.includes(id))) throw new Error("The homepage order must contain every existing section exactly once.");
  for (const id of originalIDs) {
    const before = original.sections[id];
    const after = candidate.sections[id];
    if (before?.type !== after?.type) throw new Error(`Section type changed for ${id}.`);
    const beforeBlocks = before?.blocks && typeof before.blocks === "object" ? before.blocks : {};
    const afterBlocks = after?.blocks && typeof after.blocks === "object" ? after.blocks : {};
    const beforeBlockIDs = Object.keys(beforeBlocks).sort();
    const afterBlockIDs = Object.keys(afterBlocks).sort();
    if (JSON.stringify(beforeBlockIDs) !== JSON.stringify(afterBlockIDs)) throw new Error(`Block IDs changed for section ${id}.`);
    for (const blockID of beforeBlockIDs) if (beforeBlocks[blockID]?.type !== afterBlocks[blockID]?.type) throw new Error(`Block type changed for ${id}/${blockID}.`);
  }
}

function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])])); }
async function semanticHash(document) { return sha256(JSON.stringify(canonicalize(document))); }

async function writeThemeFile(config, accessToken, themeID, filename, content) {
  const data = await shopifyGraphQL(config, accessToken, `mutation KairosWriteResumableHomepageV22($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message } } }`, { themeId: themeID, files: [{ filename, body: { type: "TEXT", value: content } }] });
  const result = data?.themeFilesUpsert || {};
  const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
  if (userErrors.length) throw httpError(409, "theme_files_upsert_user_error", userErrors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return { upsertedThemeFiles: Array.isArray(result.upsertedThemeFiles) ? result.upsertedThemeFiles : [] };
}

function validateApproval(planEnvelope, approval) { if (!planEnvelope?.plan) throw httpError(400, "staging_plan_required", "The approved staging plan is missing."); if (!approval || approval.status !== "approved") throw httpError(403, "staging_plan_approval_required", "Explicit staging plan approval is required."); if (approval.planID !== planEnvelope.planID || approval.actionID !== planEnvelope.actionID) throw httpError(409, "approval_plan_mismatch", "The approval does not match the current staging plan."); }
function readShopifyConfig(env) { const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase(); const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim(); if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN is missing or invalid."); return { storeDomain, apiVersion }; }
async function resolveAccessToken(config, env) { const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim(); const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim(); const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(); if (clientId && clientSecret) return { accessToken: await getClientCredentialsToken(config.storeDomain, clientId, clientSecret), source: "client-credentials" }; if (staticToken) return { accessToken: staticToken, source: "admin-access-token" }; throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured."); }
async function getClientCredentialsToken(storeDomain, clientId, clientSecret) { const key = `${storeDomain}:${clientId}`; const cached = tokenCache.get(key); if (cached?.expiresAt > Date.now()) return cached.accessToken; const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const body = await safeJSON(response); const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : ""; if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Token request returned HTTP ${response.status}.`).slice(0, 500)); tokenCache.set(key, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 }); return accessToken; }
async function shopifyGraphQL(config, accessToken, query, variables = {}) { const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const body = await safeJSON(response); if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${response.status}.`); if (Array.isArray(body?.errors) && body.errors.length) throw httpError(409, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000)); return body?.data || {}; }

async function readJob(request, jobID) { const response = await caches.default.match(jobRequest(request, jobID)); return response ? safeJSON(response) : null; }
async function writeJob(request, jobID, body) { await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`, "X-MMG-Runtime": BUILD } })); }
function jobRequest(request, jobID) { return new Request(new URL(`/_kairos/execution-jobs/${jobID}`, request.url).toString(), { method: "GET" }); }
function extractOutputText(response) { if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim(); for (const item of Array.isArray(response?.output) ? response.output : []) for (const content of Array.isArray(item?.content) ? item.content : []) if (content?.type === "output_text" && typeof content?.text === "string" && content.text.trim()) return content.text.trim(); return ""; }
async function readRequestJSON(request) { try { return await request.json(); } catch { throw httpError(400, "invalid_json", "The request body must be valid JSON."); } }
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { raw: text.slice(0, 2000) }; } }
async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function normalizeError(error) { return { status: Number.isInteger(error?.status) ? error.status : 500, code: typeof error?.code === "string" ? error.code : "resumable_execution_failed", message: error instanceof Error ? error.message : "Resumable execution failed." }; }
function retag(response) { const headers = new Headers(response.headers); headers.set("X-MMG-Runtime", BUILD); headers.set("X-Kairos-Kernel", "standalone-v22"); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-v22", "X-Content-Type-Options": "nosniff" } }); }
