const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SESSION_COOKIE = "mmg_kairos_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SHOPIFY_TIMEOUT_MS = 20_000;
const OPENAI_TIMEOUT_MS = 45_000;
const MAX_OBJECTIVE = 8_000;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 1_500_000;
const ALLOWED_THEME_KEY = /^(assets|config|layout|locales|sections|snippets|templates)\/[A-Za-z0-9_./-]+\.(css|js|json|liquid|svg|txt)$/;

export async function handleNativeAPI(request, env) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/health") return health(env);
    if (url.pathname === "/api/session") return sessionHandler(request, env);
    if (url.pathname === "/api/kairos") return kairosHandler(request, env);
    if (url.pathname === "/api/theme-plan") return themePlanHandler(request, env);
    if (url.pathname === "/api/actions") return actionsHandler(request, env);
    return json({ error: { code: "not_found", message: "API route not found." } }, 404);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({ error: { code: normalized.code, message: normalized.message, requestID: normalized.requestID } }, normalized.status);
  }
}

function health(env) {
  const services = {
    openai: Boolean(text(env.OPENAI_API_KEY) && text(env.OPENAI_MODEL)),
    session: Boolean(text(env.KAIROS_RUNTIME_TOKEN) && (text(env.KAIROS_OPERATOR_PASSWORD) || text(env.KAIROS_OPERATOR_PASSWORD_HASH))),
    shopify: Boolean(text(env.SHOPIFY_STORE_DOMAIN) && text(env.SHOPIFY_ADMIN_ACCESS_TOKEN) && text(env.SHOPIFY_API_VERSION)),
  };
  const ready = services.openai && services.session && services.shopify;
  return json({ status: ready ? "ready" : "degraded", runtime: "cloudflare-native", build: "command-center-cloudflare-native-20260711-9", services }, ready ? 200 : 503);
}

async function sessionHandler(request, env) {
  requireSessionConfig(env);
  if (request.method === "GET") {
    const session = await authenticatedSession(request, env, false);
    if (!session) return json({ status: "unauthenticated", code: "session_required" }, 401);
    return json({ status: "authenticated", session });
  }
  if (request.method === "POST") {
    const body = await readBody(request);
    const operator = bounded(body.operator, "operator", 80);
    const accessKey = bounded(body.accessKey, "accessKey", 512);
    if (!(await verifyPassword(accessKey, env))) return json({ status: "unauthenticated", code: "invalid_credentials", message: "Operator access was denied." }, 401);
    const issued = await issueSession(operator, text(env.KAIROS_RUNTIME_TOKEN));
    return json({ status: "authenticated", session: issued.session }, 201, { "Set-Cookie": sessionCookie(issued.token, issued.session.expiresAt) });
  }
  if (request.method === "DELETE") return new Response(null, { status: 204, headers: commonHeaders({ "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` }) });
  return json({ error: { code: "method_not_allowed", message: "Use GET, POST, or DELETE." } }, 405, { Allow: "GET, POST, DELETE" });
}

async function kairosHandler(request, env) {
  requireMethod(request, "POST");
  requireOpenAI(env);
  const session = await authenticatedSession(request, env, true);
  const body = await readBody(request);
  const objective = bounded(body.objective, "objective", MAX_OBJECTIVE);
  const department = optionalText(body.department, 160) || "Executive Office";
  const executionPlan = Array.isArray(body.executionPlan) ? body.executionPlan.slice(0, 12).map(value => String(value).slice(0, 800)) : [];
  const governanceNote = optionalText(body.governanceNote, 4_000);
  let inspection;
  if (/\b(storefront|shopify homepage|live homepage|website audit|homepage audit)\b/i.test(objective)) inspection = await inspectStorefront();
  const evidenceNote = inspection ? `\n\nVERIFIED LIVE STOREFRONT EVIDENCE:\n${JSON.stringify(inspection).slice(0, 12_000)}` : "";
  const requestId = crypto.randomUUID();
  const provider = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${text(env.OPENAI_API_KEY)}`, "Content-Type": "application/json", Accept: "application/json", "X-Client-Request-Id": requestId },
    body: JSON.stringify({
      model: text(env.OPENAI_MODEL),
      instructions: "You are Kairos, MMG's governed operating intelligence. Give the executive a concise decision-oriented response. Keep the visible summary short: one compact paragraph and no more than five concise bullets. Do not dump production steps, raw prompts, full file contents, or exhaustive evidence into the summary. Preserve technical detail for the evidence layer. Never claim external execution without direct adapter evidence.",
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ objective, department, executionPlan, governanceNote: `${governanceNote || ""}${evidenceNote}` }) }] }],
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  const providerBody = await readJSON(provider);
  if (!provider.ok) throw http(provider.status === 429 ? 429 : 502, provider.status === 429 ? "rate_limited" : "provider_error", "Kairos could not complete the provider request.", requestId);
  return json({
    message: extractOutputText(providerBody),
    department,
    requestId,
    auditId: crypto.randomUUID(),
    inspection: inspection ? { auditId: inspection.auditId, source: "live-storefront", inspectedCount: inspection.pages.length, discoveredCount: inspection.pages.length, pages: inspection.pages, storefront: inspection.storefront } : undefined,
    executionContext: context(session),
  });
}

async function themePlanHandler(request, env) {
  requireMethod(request, "POST");
  requireOpenAI(env);
  requireShopify(env);
  const session = await authenticatedSession(request, env, true);
  const body = await readBody(request);
  const objective = bounded(body.objective, "objective", MAX_OBJECTIVE);
  const theme = await readMainTheme(env);
  const sources = await readThemeSources(env, theme.id);
  if (!sources.length) throw http(502, "theme_sources_unavailable", "Kairos could not read the published theme sources required to prepare a safe mutation plan.");
  const requestId = crypto.randomUUID();
  const provider = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${text(env.OPENAI_API_KEY)}`, "Content-Type": "application/json", Accept: "application/json", "X-Client-Request-Id": requestId },
    body: JSON.stringify({
      model: text(env.OPENAI_MODEL),
      instructions: "Compile an exact Shopify theme mutation proposal using only supplied current source files. Return complete replacement content, never partial patches or ellipses. Change the fewest files necessary. Preserve valid Liquid and JSON. Do not invent assets, settings, routes, products, snippets, or app blocks. Keep summary and list fields concise for executive review; full replacement content belongs only in mutationPlan.files.",
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ objective, theme, sources }) }] }],
      text: { format: { type: "json_schema", name: "shopify_theme_mutation_plan", strict: true, schema: mutationPlanSchema() } },
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  const providerBody = await readJSON(provider);
  if (!provider.ok) throw http(provider.status === 429 ? 429 : 502, provider.status === 429 ? "rate_limited" : "provider_error", "Kairos could not compile the Shopify mutation plan.", requestId);
  const plan = parseJSONText(extractOutputText(providerBody), "invalid_plan_response", "Kairos returned an invalid structured mutation plan.");
  validatePlan(plan, theme.id, sources);
  return json({ ...plan, actionID: crypto.randomUUID(), completedAt: new Date().toISOString(), requestId, auditId: crypto.randomUUID(), sourceEvidence: { themeId: theme.id, themeName: theme.name, role: theme.role, files: sources.map(source => ({ key: source.key, sha256: source.sha256, bytes: byteLength(source.value) })) }, executionContext: context(session) });
}

async function actionsHandler(request, env) {
  requireMethod(request, "POST");
  requireShopify(env);
  const session = await authenticatedSession(request, env, true);
  const body = await readBody(request);
  const actionType = bounded(body.actionType, "actionType", 160);
  if (["shopify.homepage.audit", "storefront.audit"].includes(actionType)) {
    const evidence = await inspectStorefront();
    return json({ actionID: crypto.randomUUID(), actionType, status: "completed", completedAt: new Date().toISOString(), evidence, executionContext: context(session) });
  }
  if (actionType !== "shopify.theme.files.upsert") throw http(400, "unsupported_action", "This execution adapter does not support the requested action.");
  const objective = bounded(body.objective, "objective", MAX_OBJECTIVE);
  const approval = body.approval;
  if (!isRecord(approval) || approval.approved !== true) throw http(409, "approval_required", "Approve this mutation before execution.");
  const actor = bounded(approval.actor, "approval.actor", 160);
  const approvedAt = bounded(approval.approvedAt, "approval.approvedAt", 80);
  if (Number.isNaN(Date.parse(approvedAt))) throw http(400, "invalid_approval", "approval.approvedAt must be an ISO-8601 timestamp.");
  const mutation = normalizeMutation(body.mutation);
  const evidence = await executeThemeMutation(env, mutation);
  return json({ ...evidence, objective, approval: { actor, approvedAt }, executionContext: context(session) });
}

async function executeThemeMutation(env, mutation) {
  const startedAt = new Date();
  const main = await readMainTheme(env);
  if (main.id !== mutation.themeId) throw http(409, "main_theme_mismatch", "The approved theme ID is not the current published Shopify theme. Regenerate the proposal before mutating production.");
  const backups = [];
  const completed = [];
  try {
    for (const file of mutation.files) {
      const before = await readAsset(env, mutation.themeId, file.key);
      backups.push(before);
      if (file.expectedSha256 && before.sha256 !== file.expectedSha256) throw http(409, "theme_file_changed", `${file.key} changed after the proposal was prepared. Regenerate and reapprove the mutation plan.`);
      await writeAsset(env, mutation.themeId, file.key, file.value);
      const verified = await readAsset(env, mutation.themeId, file.key);
      const afterSha256 = await sha256(file.value);
      if (!verified.existed || verified.sha256 !== afterSha256) throw http(502, "theme_verification_failed", `Shopify did not verify the expected content for ${file.key}.`);
      completed.push({ key: file.key, beforeSha256: before.sha256, afterSha256, verified: true });
    }
  } catch (error) {
    const rollbackErrors = await rollback(env, mutation.themeId, backups);
    if (rollbackErrors.length) throw http(500, "mutation_failed_rollback_incomplete", `Theme mutation failed and rollback was incomplete: ${rollbackErrors.join("; ")}`);
    throw error;
  }
  return { actionID: crypto.randomUUID(), actionType: "shopify.theme.files.upsert", status: "completed", startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), evidence: { themeId: mutation.themeId, files: completed, backup: backups.map(({ key, existed, sha256 }) => ({ key, existed, sha256 })), rollbackAvailable: true, rollbackPerformed: false, externalMutation: true, verified: true } };
}

function normalizeMutation(value) {
  if (!isRecord(value)) throw http(400, "mutation_plan_required", "The approved proposal must include an exact Shopify mutation plan.");
  const themeId = bounded(value.themeId, "mutation.themeId", 64);
  if (!/^\d+$/.test(themeId)) throw http(400, "invalid_theme_id", "mutation.themeId must be a numeric Shopify theme ID.");
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > MAX_FILES) throw http(400, "invalid_mutation_files", `mutation.files must contain between 1 and ${MAX_FILES} files.`);
  let total = 0;
  const files = value.files.map((entry, index) => {
    if (!isRecord(entry)) throw http(400, "invalid_mutation_file", `mutation.files[${index}] must be an object.`);
    const key = bounded(entry.key, `mutation.files[${index}].key`, 240);
    if (!ALLOWED_THEME_KEY.test(key) || key.includes("..")) throw http(400, "unsafe_theme_path", `Theme file path is not allowed: ${key}`);
    const fileValue = typeof entry.value === "string" ? entry.value : (() => { throw http(400, "invalid_action", `mutation.files[${index}].value must be text.`); })();
    const bytes = byteLength(fileValue);
    if (bytes > MAX_FILE_BYTES) throw http(413, "theme_file_too_large", `${key} exceeds the mutation size limit.`);
    total += bytes;
    const expectedSha256 = typeof entry.expectedSha256 === "string" && /^[a-f0-9]{64}$/i.test(entry.expectedSha256) ? entry.expectedSha256.toLowerCase() : undefined;
    return { key, value: fileValue, expectedSha256 };
  });
  if (new Set(files.map(file => file.key)).size !== files.length) throw http(400, "duplicate_theme_path", "Each theme file may appear only once in a mutation.");
  if (total > MAX_TOTAL_BYTES) throw http(413, "mutation_too_large", "The approved theme mutation exceeds the total size limit.");
  return { themeId, files };
}

async function inspectStorefront() {
  const storefront = "https://themindsetmediagroup.com";
  const pages = [];
  for (const path of ["/", "/collections/all", "/pages/free-creator-toolkit"]) {
    try {
      const response = await fetch(`${storefront}${path}`, { redirect: "follow", headers: { "User-Agent": "MMG-Kairos-Cloudflare/1.0" }, signal: AbortSignal.timeout(15_000) });
      const html = await response.text();
      pages.push({ url: `${storefront}${path}`, finalUrl: response.url, status: response.status, title: match(html, /<title[^>]*>([^<]*)<\/title>/i), h1: match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
    } catch (error) {
      pages.push({ url: `${storefront}${path}`, status: 0, error: error instanceof Error ? error.message : "Inspection failed" });
    }
  }
  return { auditId: crypto.randomUUID(), source: "live-storefront", storefront, completedAt: new Date().toISOString(), pages };
}

async function readMainTheme(env) {
  const body = await shopifyJSON(env, "/themes.json?role=main", { method: "GET" });
  const themes = Array.isArray(body.themes) ? body.themes : [];
  const theme = themes.find(entry => entry && entry.role === "main");
  if (!theme) throw http(502, "main_theme_unavailable", "Shopify did not return the published theme.");
  return { id: String(theme.id), name: typeof theme.name === "string" ? theme.name : "Published theme", role: "main" };
}

async function readThemeSources(env, themeId) {
  const listing = await shopifyJSON(env, `/themes/${themeId}/assets.json?fields=key`, { method: "GET" });
  const keys = (Array.isArray(listing.assets) ? listing.assets : []).map(asset => asset?.key).filter(Boolean);
  const cssKey = keys.find(key => /^assets\/(base|theme|styles?|application).*\.css$/i.test(key));
  const selected = ["templates/index.json", "layout/theme.liquid", "config/settings_data.json", ...(cssKey ? [cssKey] : [])].filter(key => keys.includes(key));
  const sources = [];
  let total = 0;
  for (const key of selected) {
    const snapshot = await readAsset(env, themeId, key);
    if (!snapshot.existed || typeof snapshot.value !== "string") continue;
    const bytes = byteLength(snapshot.value);
    if (total + bytes > 180_000) continue;
    total += bytes;
    sources.push({ key, value: snapshot.value, sha256: snapshot.sha256 });
  }
  return sources;
}

async function readAsset(env, themeId, key) {
  const response = await shopifyFetch(env, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: "GET" });
  if (response.status === 404) return { key, existed: false };
  const body = await readJSON(response);
  if (!response.ok) throw http(502, "theme_asset_read_failed", `Shopify could not read ${key}.`);
  const value = body?.asset?.value;
  if (typeof value !== "string") throw http(409, "binary_asset_unsupported", `Only text theme assets can be mutated safely: ${key}`);
  return { key, existed: true, value, sha256: await sha256(value) };
}

async function writeAsset(env, themeId, key, value) {
  const response = await shopifyFetch(env, `/themes/${themeId}/assets.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: { key, value } }) });
  if (!response.ok) throw http(502, "theme_asset_write_failed", `Shopify could not update ${key}.`);
}

async function deleteAsset(env, themeId, key) {
  const response = await shopifyFetch(env, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw http(502, "theme_asset_delete_failed", `Shopify could not remove ${key} during rollback.`);
}

async function rollback(env, themeId, backups) {
  const errors = [];
  for (const backup of [...backups].reverse()) {
    try { if (backup.existed) await writeAsset(env, themeId, backup.key, backup.value); else await deleteAsset(env, themeId, backup.key); }
    catch (error) { errors.push(`${backup.key}: ${error instanceof Error ? error.message : "rollback failed"}`); }
  }
  return errors;
}

async function shopifyJSON(env, path, init) {
  const response = await shopifyFetch(env, path, init);
  const body = await readJSON(response);
  if (!response.ok) throw http(response.status === 429 ? 429 : 502, "shopify_request_failed", "Shopify could not complete the request.");
  return body;
}

function shopifyFetch(env, path, init) {
  requireShopify(env);
  return fetch(`https://${text(env.SHOPIFY_STORE_DOMAIN)}/admin/api/${text(env.SHOPIFY_API_VERSION)}${path}`, { ...init, headers: { "X-Shopify-Access-Token": text(env.SHOPIFY_ADMIN_ACCESS_TOKEN), Accept: "application/json", ...(init.headers || {}) }, signal: init.signal || AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
}

function validatePlan(plan, themeId, sources) {
  if (!isRecord(plan) || !isRecord(plan.mutationPlan) || plan.mutationPlan.themeId !== themeId || !Array.isArray(plan.mutationPlan.files)) throw http(502, "invalid_mutation_plan", "Kairos returned a mutation plan for the wrong theme or an invalid file set.");
  if (plan.mutationPlan.files.length < 1) throw http(409, "mutation_plan_blocked", "Kairos could not produce a safe source-grounded mutation from the available theme files.");
  const byKey = new Map(sources.map(source => [source.key, source]));
  for (const file of plan.mutationPlan.files) {
    const source = byKey.get(file.key);
    if (!source || file.expectedSha256 !== source.sha256) throw http(502, "ungrounded_mutation_plan", `The proposed mutation for ${file.key} is not grounded in the current published source.`);
    if (!file.value || file.value.includes("...") || file.value.includes("[existing content]")) throw http(502, "incomplete_mutation_content", `The proposed replacement for ${file.key} is incomplete.`);
  }
  normalizeMutation(plan.mutationPlan);
}

function mutationPlanSchema() {
  return { type: "object", additionalProperties: false, required: ["summary", "recommendedChanges", "affectedAssets", "expectedBenefits", "risks", "rollbackPlan", "acceptanceCriteria", "mutationPlan"], properties: {
    summary: { type: "string", maxLength: 600 },
    recommendedChanges: { type: "array", maxItems: 5, items: { type: "string", maxLength: 240 } },
    affectedAssets: { type: "array", maxItems: 5, items: { type: "string", maxLength: 240 } },
    expectedBenefits: { type: "array", maxItems: 4, items: { type: "string", maxLength: 240 } },
    risks: { type: "array", maxItems: 4, items: { type: "string", maxLength: 240 } },
    rollbackPlan: { type: "array", maxItems: 3, items: { type: "string", maxLength: 240 } },
    acceptanceCriteria: { type: "array", maxItems: 5, items: { type: "string", maxLength: 240 } },
    mutationPlan: { type: "object", additionalProperties: false, required: ["themeId", "files"], properties: { themeId: { type: "string" }, files: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, required: ["key", "value", "expectedSha256"], properties: { key: { type: "string" }, value: { type: "string" }, expectedSha256: { type: "string" } } } } } },
  } };
}

async function authenticatedSession(request, env, required) {
  const token = readCookie(request.headers.get("Cookie"), SESSION_COOKIE);
  const session = token ? await verifySession(token, text(env.KAIROS_RUNTIME_TOKEN)) : null;
  if (!session && required) throw http(401, "unauthorized", "Kairos runtime authorization failed.");
  return session;
}

async function issueSession(operatorInput, secret) {
  const operator = operatorInput.trim().replace(/\s+/g, " ").slice(0, 80);
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: `operator:${operator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, tenantId: "mmg-internal", role: "executive", operator, iat: now, exp: now + SESSION_TTL_SECONDS, jti: crypto.randomUUID() };
  const encoded = base64url(JSON.stringify(payload));
  return { token: `${encoded}.${await hmac(encoded, secret)}`, session: toSession(payload) };
}

async function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [payloadPart, signature, extra] = token.split(".");
  if (!payloadPart || !signature || extra || !(await safeEqual(signature, await hmac(payloadPart, secret)))) return null;
  try { const payload = JSON.parse(fromBase64url(payloadPart)); return payload.exp > Math.floor(Date.now() / 1000) && payload.tenantId === "mmg-internal" && payload.role === "executive" ? toSession(payload) : null; } catch { return null; }
}

async function verifyPassword(supplied, env) {
  const plain = text(env.KAIROS_OPERATOR_PASSWORD);
  if (plain) return safeEqual(supplied, plain);
  const hash = text(env.KAIROS_OPERATOR_PASSWORD_HASH);
  if (hash?.startsWith("sha256-v1$")) return safeEqual(hash.slice("sha256-v1$".length), await sha256(supplied));
  return false;
}

function requireSessionConfig(env) { if (!text(env.KAIROS_RUNTIME_TOKEN) || (!text(env.KAIROS_OPERATOR_PASSWORD) && !text(env.KAIROS_OPERATOR_PASSWORD_HASH))) throw http(503, "session_unavailable", "Kairos operator authentication is not configured."); }
function requireOpenAI(env) { if (!text(env.OPENAI_API_KEY) || !text(env.OPENAI_MODEL)) throw http(503, "runtime_not_configured", "Kairos OpenAI runtime is not configured."); }
function requireShopify(env) { if (!text(env.SHOPIFY_STORE_DOMAIN) || !text(env.SHOPIFY_ADMIN_ACCESS_TOKEN) || !text(env.SHOPIFY_API_VERSION)) throw http(503, "shopify_not_configured", "Shopify Admin access is not configured."); }
function requireMethod(request, method) { if (request.method !== method) throw http(405, "method_not_allowed", `Use ${method} for this endpoint.`); }

async function readBody(request) { try { const value = await request.json(); if (!isRecord(value)) throw new Error(); return value; } catch { throw http(400, "invalid_request", "Request body must be a JSON object."); } }
async function readJSON(response) { const value = await response.text(); if (!value) return {}; try { return JSON.parse(value); } catch { return {}; } }
function extractOutputText(body) { if (typeof body?.output_text === "string" && body.output_text.trim()) return body.output_text.trim(); for (const item of body?.output || []) for (const content of item?.content || []) if (typeof content?.text === "string" && content.text.trim()) return content.text.trim(); throw http(502, "empty_provider_response", "Kairos returned an empty response."); }
function parseJSONText(value, code, message) { try { return JSON.parse(value); } catch { throw http(502, code, message); } }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: commonHeaders(headers) }); }
function commonHeaders(extra = {}) { return { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-MMG-Runtime": "cloudflare-native", ...extra }; }
function context(session) { return { authorizationMode: "session", operator: session?.operator, sessionId: session?.sessionId, subject: session?.sub, tenantId: "mmg-internal", role: "executive" }; }
function toSession(payload) { return { sub: payload.sub, tenantId: payload.tenantId, role: payload.role, operator: payload.operator, issuedAt: payload.iat, expiresAt: payload.exp, sessionId: payload.jti }; }
function sessionCookie(token, exp) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, exp - Math.floor(Date.now() / 1000))}`; }
function readCookie(header, name) { if (!header) return undefined; for (const part of header.split(";")) { const [key, ...value] = part.trim().split("="); if (key === name) return decodeURIComponent(value.join("=")); } }
function bounded(value, field, max) { if (typeof value !== "string" || !value.trim() || value.length > max) throw http(400, "invalid_action", `${field} is empty or exceeds its limit.`); return value.trim(); }
function optionalText(value, max) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : ""; }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function byteLength(value) { return new TextEncoder().encode(value).length; }
function match(value, pattern) { return pattern.exec(value)?.[1]?.trim() || ""; }
function http(status, code, message, requestID = crypto.randomUUID()) { const error = new Error(message); error.status = status; error.code = code; error.requestID = requestID; return error; }
function normalizeError(error) { return { status: Number(error?.status) || (error?.name === "TimeoutError" ? 504 : 500), code: error?.code || (error?.name === "TimeoutError" ? "timeout" : "internal_error"), message: error instanceof Error ? error.message : "Kairos encountered an internal error.", requestID: error?.requestID || crypto.randomUUID() }; }
async function sha256(value) { const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
async function hmac(value, secret) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`mmg-kairos-session-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)); return bytesToBase64url(new Uint8Array(result)); }
async function safeEqual(left, right) { if (typeof left !== "string" || typeof right !== "string") return false; const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right); if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
function base64url(value) { return bytesToBase64url(new TextEncoder().encode(value)); }
function fromBase64url(value) { const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); return new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0))); }
function bytesToBase64url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
