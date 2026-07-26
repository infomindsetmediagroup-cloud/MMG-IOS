import { classifyKairosToolRequest, getKairosTool, KAIROS_TOOL_REGISTRY_BUILD } from "./kairos-tool-registry-v1.js";
import { validateKairosToolArguments, KAIROS_TOOL_ARGUMENTS_BUILD } from "./kairos-tool-arguments-v1.js";
import { readShopifyProduct } from "./kairos-shopify-product-read-v1.js";
import { createShopifyProductSnapshot, verifyShopifyProductMutation, KAIROS_SHOPIFY_MUTATION_VERIFICATION_BUILD } from "./kairos-shopify-mutation-verification-v1.js";

export const KAIROS_TOOL_APPROVAL_BUILD = "kairos-tool-approval-20260725-3-production-readiness";
const REGISTRY_OBJECT = "mmg-production-project-registry";
const INTERNAL_PATH = "/registry/kairos-tools/approval";
const PUBLIC_ROUTE = /^\/api\/kairos\/tools\/(propose|continue)\/?$/i;
const DEFAULT_TTL_SECONDS = 900;

export async function handleKairosToolApprovalAPI(request, env, executeTool) {
  const url = new URL(request.url);
  const match = url.pathname.match(PUBLIC_ROUTE);
  if (!match) return null;
  if (request.method !== "POST") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated tool approval access is required." } }, 401);
  const body = await request.json().catch(() => ({}));

  if (match[1] === "propose") {
    const decision = await callObject(env, { operation: "propose", identity, toolId: body.toolId, arguments: body.arguments || {}, ttlSeconds: body.ttlSeconds });
    if (!decision.ok) return json(decision.body, decision.status);
    if (decision.body.status !== "read_only") return json(decision.body, decision.status);
    const tool = getKairosTool(decision.body.tool?.id);
    if (!tool || tool.executor !== decision.body.tool?.executor) return json({ success: false, error: { code: "EXECUTOR_MISMATCH", message: "Registered executor verification failed." } }, 409);
    if (typeof executeTool !== "function") return json({ success: false, error: { code: "EXECUTOR_UNAVAILABLE", message: "No governed executor is configured for this tool." } }, 503);
    try {
      const result = await executeTool({ tool, arguments: decision.body.arguments, identity, approvalId: null });
      return json({ success: true, status: "completed", approvalRequired: false, tool: tool.id, verified: true, result: sanitizeResult(result) });
    } catch {
      return json({ success: false, status: "failed", error: { code: "TOOL_EXECUTION_FAILED", message: "The governed read-only tool executor failed." } }, 502);
    }
  }

  const inspected = await callObject(env, { operation: "inspect", identity, approvalId: body.approvalId, confirmation: body.confirmation });
  if (!inspected.ok) return json(inspected.body, inspected.status);
  const tool = getKairosTool(inspected.body.toolId);
  if (!tool || tool.executor !== inspected.body.executor) return json({ success: false, error: { code: "EXECUTOR_MISMATCH", message: "Registered executor verification failed." } }, 409);
  if (typeof executeTool !== "function") return json({ success: false, error: { code: "EXECUTOR_UNAVAILABLE", message: "No governed executor is configured for this tool." } }, 503);

  let beforeSnapshot = null;
  if (tool.id === "shopify.product.update") {
    try {
      const beforeRead = await readShopifyProduct(env, { productId: inspected.body.arguments.productId, requestId: inspected.body.approvalId });
      beforeSnapshot = createShopifyProductSnapshot(beforeRead.product, { approvalId: inspected.body.approvalId, phase: "before" });
    } catch {
      await callObject(env, { operation: "snapshot_failed", identity, approvalId: inspected.body.approvalId, phase: "before" });
      return json({ success: false, status: "pending", approvalId: inspected.body.approvalId, error: { code: "PRE_MUTATION_SNAPSHOT_FAILED", message: "The mutation was not started because the pre-mutation Shopify snapshot could not be captured." } }, 503);
    }
  }

  const decision = await callObject(env, {
    operation: "consume",
    identity,
    approvalId: inspected.body.approvalId,
    confirmation: body.confirmation,
    preMutationSnapshot: beforeSnapshot,
  });
  if (!decision.ok) return json(decision.body, decision.status);

  try {
    const result = await executeTool({ tool, arguments: decision.body.arguments, identity, approvalId: decision.body.approvalId });
    let verification = null;
    if (tool.id === "shopify.product.update") {
      const afterRead = await readShopifyProduct(env, { productId: decision.body.arguments.productId, requestId: decision.body.approvalId });
      const afterSnapshot = createShopifyProductSnapshot(afterRead.product, { approvalId: decision.body.approvalId, phase: "after" });
      verification = verifyShopifyProductMutation({ before: beforeSnapshot, after: afterSnapshot, approvedChanges: decision.body.arguments.changes });
      await callObject(env, { operation: "result", identity, approvalId: decision.body.approvalId, outcome: verification.verified ? "completed" : "verification_failed", result: sanitizeResult(result), verification: sanitizeResult(verification), postMutationSnapshot: sanitizeResult(afterSnapshot) });
      if (!verification.verified) return json({ success: false, status: "verification_failed", approvalId: decision.body.approvalId, tool: tool.id, verified: false, result: sanitizeResult(result), verification: sanitizeResult(verification), error: { code: "POST_MUTATION_VERIFICATION_FAILED", message: "Shopify changed fields outside the approved mutation contract. Review the rollback plan before taking further action." } }, 409);
    } else {
      await callObject(env, { operation: "result", identity, approvalId: decision.body.approvalId, outcome: "completed", result: sanitizeResult(result) });
    }
    return json({ success: true, status: "completed", approvalId: decision.body.approvalId, tool: tool.id, verified: true, result: sanitizeResult(result), ...(verification ? { verification: sanitizeResult(verification) } : {}) });
  } catch {
    await callObject(env, { operation: "result", identity, approvalId: decision.body.approvalId, outcome: "failed" });
    return json({ success: false, status: "failed", approvalId: decision.body.approvalId, error: { code: "TOOL_EXECUTION_FAILED", message: "The governed tool executor failed." } }, 502);
  }
}

export async function handleKairosToolApprovalObjectRequest(state, request) {
  const url = new URL(request.url);
  if (url.pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "propose") return propose(state, body);
  if (body.operation === "inspect") return inspect(state, body);
  if (body.operation === "consume") return consume(state, body);
  if (body.operation === "result") return recordResult(state, body);
  if (body.operation === "snapshot_failed") return recordSnapshotFailure(state, body);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown approval operation." } }, 400);
}

async function propose(state, body) {
  const classification = classifyKairosToolRequest(body.toolId);
  if (!classification.allowed) return json({ success: false, error: { code: "TOOL_NOT_REGISTERED", message: classification.reason } }, 403);
  const tool = classification.tool;
  const validated = validateKairosToolArguments(tool.id, body.arguments);
  if (!validated.ok) return json({ success: false, error: validated.error }, 400);
  if (!tool.approvalRequired) return json({ success: true, status: "read_only", tool, arguments: validated.arguments, approvalRequired: false });
  const approvalId = `kap_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = Date.now();
  const expiresAt = now + clamp(body.ttlSeconds, 60, 3600, DEFAULT_TTL_SECONDS) * 1000;
  const record = { approvalId, identity: clean(body.identity, 320), toolId: tool.id, executor: tool.executor, arguments: validated.arguments, argumentDigest: await digest(validated.arguments), status: "pending", createdAt: new Date(now).toISOString(), expiresAt: new Date(expiresAt).toISOString(), usedAt: null, result: null, preMutationSnapshot: null, postMutationSnapshot: null, verification: null };
  await state.storage.put(`kairos-tool-approval:${approvalId}`, record);
  await appendAudit(state, record, "proposed");
  return json({ success: true, status: "approval_required", approvalId, tool, expiresAt: record.expiresAt, confirmationRequired: `APPROVE ${approvalId}` }, 202);
}

async function inspect(state, body) {
  const checked = await validatePendingApproval(state, body);
  if (checked.response) return checked.response;
  const record = checked.record;
  await appendAudit(state, record, "inspected");
  return json({ success: true, status: "approved_pending_snapshot", approvalId: record.approvalId, toolId: record.toolId, executor: record.executor, arguments: record.arguments, argumentDigest: record.argumentDigest });
}

async function consume(state, body) {
  const checked = await validatePendingApproval(state, body);
  if (checked.response) return checked.response;
  const record = checked.record;
  if (record.toolId === "shopify.product.update" && body.preMutationSnapshot?.phase !== "before") {
    return json({ success: false, error: { code: "PRE_MUTATION_SNAPSHOT_REQUIRED", message: "A verified pre-mutation snapshot is required before this approval can be consumed." } }, 409);
  }
  record.status = "consumed";
  record.usedAt = new Date().toISOString();
  record.preMutationSnapshot = sanitizeResult(body.preMutationSnapshot);
  await state.storage.put(`kairos-tool-approval:${record.approvalId}`, record);
  await appendAudit(state, record, "consumed");
  if (record.preMutationSnapshot) await appendAudit(state, record, "pre_snapshot_captured");
  return json({ success: true, status: "approved_for_execution", approvalId: record.approvalId, toolId: record.toolId, executor: record.executor, arguments: record.arguments, argumentDigest: record.argumentDigest });
}

async function validatePendingApproval(state, body) {
  const id = clean(body.approvalId, 160);
  const record = await state.storage.get(`kairos-tool-approval:${id}`);
  if (!record) return { response: json({ success: false, error: { code: "APPROVAL_NOT_FOUND", message: "Approval record was not found." } }, 404) };
  if (record.identity !== clean(body.identity, 320)) return { response: json({ success: false, error: { code: "APPROVAL_IDENTITY_MISMATCH", message: "Approval belongs to another identity." } }, 403) };
  if (record.status !== "pending") return { response: json({ success: false, error: { code: "APPROVAL_ALREADY_USED", message: "Approval is no longer pending." } }, 409) };
  if (Date.parse(record.expiresAt) <= Date.now()) {
    record.status = "expired";
    await state.storage.put(`kairos-tool-approval:${id}`, record);
    await appendAudit(state, record, "expired");
    return { response: json({ success: false, error: { code: "APPROVAL_EXPIRED", message: "Approval has expired." } }, 410) };
  }
  if (clean(body.confirmation, 240) !== `APPROVE ${id}`) return { response: json({ success: false, error: { code: "APPROVAL_CONFIRMATION_INVALID", message: `Use the exact confirmation phrase: APPROVE ${id}` } }, 400) };
  return { record };
}

async function recordSnapshotFailure(state, body) {
  const id = clean(body.approvalId, 160);
  const record = await state.storage.get(`kairos-tool-approval:${id}`);
  if (!record || record.identity !== clean(body.identity, 320)) return json({ success: false }, 404);
  await appendAudit(state, record, `${clean(body.phase, 20) || "unknown"}_snapshot_failed`);
  return json({ success: true, status: record.status });
}

async function recordResult(state, body) {
  const id = clean(body.approvalId, 160);
  const record = await state.storage.get(`kairos-tool-approval:${id}`);
  if (!record || record.identity !== clean(body.identity, 320)) return json({ success: false }, 404);
  record.status = body.outcome === "completed" ? "completed" : body.outcome === "verification_failed" ? "verification_failed" : "failed";
  record.result = sanitizeResult(body.result);
  record.verification = sanitizeResult(body.verification);
  record.postMutationSnapshot = sanitizeResult(body.postMutationSnapshot);
  record.completedAt = new Date().toISOString();
  await state.storage.put(`kairos-tool-approval:${id}`, record);
  if (record.postMutationSnapshot) await appendAudit(state, record, "post_snapshot_captured");
  if (record.verification) await appendAudit(state, record, record.verification.verified ? "verification_passed" : "verification_failed");
  await appendAudit(state, record, record.status);
  return json({ success: true });
}

async function callObject(env, body) {
  if (!env?.KAIROS_PROJECTS) return { ok: false, status: 503, body: { success: false, error: { code: "APPROVAL_STORAGE_UNAVAILABLE", message: "Approval storage is unavailable." } } };
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  const response = await stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
}

function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
async function digest(value) { const bytes = new TextEncoder().encode(canonical(value)); const hash = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value ?? null); }
async function appendAudit(state, record, event) { const key = "kairos-tool-approval:audit"; const audit = Array.isArray(await state.storage.get(key)) ? await state.storage.get(key) : []; audit.push({ approvalId: record.approvalId, identity: record.identity, toolId: record.toolId, event, timestamp: new Date().toISOString(), argumentDigest: record.argumentDigest }); await state.storage.put(key, audit.slice(-1000)); }
function sanitizeResult(value) { if (value == null) return null; return JSON.parse(JSON.stringify(value, (key, item) => /secret|token|authorization|password|api.?key/i.test(key) ? "[redacted]" : item).slice(0, 20000)); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Tool-Registry": KAIROS_TOOL_REGISTRY_BUILD, "X-Kairos-Tool-Arguments": KAIROS_TOOL_ARGUMENTS_BUILD, "X-Kairos-Tool-Approval": KAIROS_TOOL_APPROVAL_BUILD, "X-Kairos-Shopify-Verification": KAIROS_SHOPIFY_MUTATION_VERIFICATION_BUILD } }); }
