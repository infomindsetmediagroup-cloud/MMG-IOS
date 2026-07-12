import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const RAW_REPOSITORY_ORIGIN = "https://raw.githubusercontent.com/infomindsetmediagroup-cloud/MMG-IOS/main/web/kairos-dashboard";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SESSION_COOKIE_NAME = "mmg_kairos_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SHOPIFY_TIMEOUT_MS = 20_000;
const SHOPIFY_TOKEN_TTL_MS = 55 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 45_000;
const MAX_SOURCE_BYTES = 180_000;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 1_500_000;
const ALLOWED_THEME_KEY = /^(assets|config|layout|locales|sections|snippets|templates)\/[A-Za-z0-9_./-]+\.(css|js|json|liquid|svg|txt)$/;
const THEME_SOURCE_PATTERNS = ["templates/index.json", "layout/theme.liquid", "config/settings_data.json", "assets/base.css", "assets/theme.css", "assets/styles.css", "assets/application.css", "assets/*.css"];
const GUIDED_HOMEPAGE_CSS_MARKER = "/* MMG KAIROS GUIDED HOMEPAGE BASELINE */";
const shopifyTokenCache = new Map();
const shopifyTokenRequests = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await routeAPI(request, env, url);
      return await serveCommandCenterAsset(request, env, url);
    } catch (error) {
      console.error("MMG Cloudflare runtime failure", error);
      return errorResponse(error);
    }
  },
};

async function routeAPI(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: apiHeaders() });
  switch (url.pathname) {
    case "/api/health": return healthResponse(env);
    case "/api/session": return handleSession(request, env);
    case "/api/kairos": return handleKairos(request, env);
    case "/api/theme-plan": return handleThemePlan(request, env);
    case "/api/actions": return handleActions(request, env);
    default: return json({ error: { code: "not_found", message: "API route not found.", requestID: randomUUID() } }, 404);
  }
}

function healthResponse(env) {
  const shopifyAuth = Boolean(env.SHOPIFY_STORE_DOMAIN && (env.SHOPIFY_ADMIN_ACCESS_TOKEN || (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET)));
  const capabilities = {
    cloudflareNative: true,
    openai: Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL),
    session: Boolean(env.KAIROS_RUNTIME_TOKEN && (env.KAIROS_OPERATOR_PASSWORD || env.KAIROS_OPERATOR_PASSWORD_HASH)),
    shopify: shopifyAuth,
    themePlan: Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL && shopifyAuth),
    themeMutation: shopifyAuth,
    shopifyGraphQL: true,
    vercelDependency: false,
  };
  const ready = capabilities.openai && capabilities.session;
  return json({ status: ready ? "ready" : "degraded", runtime: "cloudflare-workers", build: "command-center-mobile-stability-20260711-34", capabilities, checkedAt: new Date().toISOString() }, ready ? 200 : 503);
}

async function handleSession(request, env) {
  requireSessionConfiguration(env);
  if (request.method === "GET") {
    const session = verifySession(readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME), env.KAIROS_RUNTIME_TOKEN);
    if (!session) return json({ status: "unauthenticated", code: "session_required" }, 401);
    return json({ status: "authenticated", session });
  }
  if (request.method === "POST") {
    const body = await readBody(request);
    const operator = typeof body.operator === "string" ? body.operator : "";
    const accessKey = typeof body.accessKey === "string" ? body.accessKey : "";
    if (!verifyOperatorPassword(accessKey, env.KAIROS_OPERATOR_PASSWORD_HASH, env.KAIROS_OPERATOR_PASSWORD)) return json({ status: "unauthenticated", code: "invalid_credentials", message: "Operator access was denied." }, 401);
    const issued = issueSession(operator, env.KAIROS_RUNTIME_TOKEN);
    const headers = apiHeaders();
    headers.set("Set-Cookie", sessionCookie(issued.token, issued.session.expiresAt));
    return new Response(JSON.stringify({ status: "authenticated", session: issued.session }), { status: 201, headers });
  }
  if (request.method === "DELETE") {
    const headers = apiHeaders();
    headers.set("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return new Response(null, { status: 204, headers });
  }
  return methodNotAllowed("GET, POST, DELETE");
}

async function handleKairos(request, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const session = requireAuthorizedSession(request, env);
  requireOpenAI(env);
  const body = await readBody(request);
  const objective = boundedText(body.objective, "objective", 8000);
  const department = typeof body.department === "string" && body.department.trim() ? body.department.trim().slice(0, 160) : "Executive Office";
  const inspection = isStorefrontAuditObjective(objective) ? await inspectStorefront(env) : undefined;
  const governanceNote = [typeof body.governanceNote === "string" ? body.governanceNote : "", inspection ? `VERIFIED LIVE STOREFRONT EVIDENCE:\n${JSON.stringify(inspection)}` : ""].filter(Boolean).join("\n\n").slice(0, 12000);
  const requestId = randomUUID();
  const providerBody = await callOpenAI(env, {
    model: env.OPENAI_MODEL,
    instructions: "You are Kairos, the governed MMG operating system. Return concise, evidence-grounded operational work. Never claim an external action unless direct adapter evidence is supplied.",
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ objective, department, executionPlan: body.executionPlan || [], governanceNote }) }] }],
  }, requestId);
  return json({ message: extractResponseText(providerBody), department, requestId, auditId: randomUUID(), inspection: inspection ? { ...inspection, source: "live-storefront" } : undefined, executionContext: executionContext(session) });
}

async function handleThemePlan(request, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const session = requireAuthorizedSession(request, env);
  requireOpenAI(env);
  const shopify = await requireShopify(env);
  const body = await readBody(request);
  const objective = boundedText(body.objective, "objective", 8000);
  const theme = await readMainTheme(shopify);
  const sources = await readThemeSources(shopify, theme.id);
  if (!sources.length) throw httpError(502, "theme_sources_unavailable", "Kairos could not read the published theme sources required to prepare a safe mutation plan.");
  const requestId = randomUUID();
  const providerBody = await callOpenAI(env, {
    model: env.OPENAI_MODEL,
    instructions: ["You are Kairos Website Operations compiling an exact Shopify production mutation proposal.", "Use only supplied current published-theme source files. Return complete replacement content, never partial patches, placeholders, or ellipses.", "Change the fewest files necessary. Preserve valid Liquid and JSON. Do not invent assets, snippets, settings, routes, products, or app blocks.", "If the objective cannot be safely represented in supplied files, return an empty files array and explain the blocker."].join(" "),
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ objective, theme, sources }) }] }],
    text: { format: { type: "json_schema", name: "shopify_theme_mutation_plan", strict: true, schema: mutationPlanSchema() } },
  }, requestId);
  let plan = parseJSONText(extractResponseText(providerBody), "invalid_plan_response", "Kairos returned an invalid structured mutation plan.");
  if (!Array.isArray(plan?.mutationPlan?.files) || !plan.mutationPlan.files.length) plan = buildDeterministicHomepagePlan(plan, theme, sources);
  validateMutationPlan(plan, theme.id, sources);
  return json({ ...plan, actionID: randomUUID(), completedAt: new Date().toISOString(), requestId, auditId: randomUUID(), sourceEvidence: { themeId: theme.id, themeName: theme.name, role: theme.role, adapter: "graphql-admin", files: sources.map(({ key, sha256, value }) => ({ key, sha256, bytes: Buffer.byteLength(value, "utf8") })) }, executionContext: executionContext(session) });
}

async function handleActions(request, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const session = requireAuthorizedSession(request, env);
  const body = await readBody(request);
  const actionType = typeof body.actionType === "string" ? body.actionType : "";
  if (actionType === "shopify.homepage.audit") return executeHomepageAudit(body, env, session);
  if (actionType === "shopify.theme.files.upsert") return executeThemeMutation(body, env, session);
  throw httpError(400, "unsupported_action", "This Cloudflare execution adapter does not support the requested action.");
}

async function executeHomepageAudit(body, env, session) {
  requireApproval(body.approval);
  const shopify = await requireShopify(env);
  const theme = await readMainTheme(shopify);
  const sources = await readThemeSources(shopify, theme.id);
  return json({ actionID: randomUUID(), actionType: "shopify.homepage.audit", status: "completed", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), evidence: { themeID: theme.id, name: theme.name, role: theme.role, adapter: "graphql-admin", homepageFiles: sources.map(source => source.key) }, executionContext: executionContext(session) });
}

async function executeThemeMutation(body, env, session) {
  const approval = requireApproval(body.approval);
  const shopify = await requireShopify(env);
  const objective = boundedText(body.objective, "objective", 8000);
  const mutation = parseMutation(body.mutation || body.proposal?.mutationPlan);
  const startedAt = new Date();
  const mainTheme = await readMainTheme(shopify);
  if (mainTheme.id !== mutation.themeId) throw httpError(409, "main_theme_mismatch", "The approved theme ID is not the current published Shopify theme. Regenerate the proposal before mutating production.");
  const backups = [];
  const completed = [];
  try {
    for (const file of mutation.files) {
      const before = await readThemeAsset(shopify, mutation.themeId, file.key);
      backups.push(before);
      if (file.expectedSha256 && before.sha256 !== file.expectedSha256) throw httpError(409, "theme_file_changed", `${file.key} changed after the proposal was prepared. Regenerate and reapprove the mutation plan.`);
      await writeThemeAsset(shopify, mutation.themeId, file.key, file.value);
      const verified = await readThemeAsset(shopify, mutation.themeId, file.key);
      const afterSha256 = sha256(file.value);
      if (!verified.existed || verified.sha256 !== afterSha256) throw httpError(502, "theme_verification_failed", `Shopify did not verify the expected content for ${file.key}.`);
      completed.push({ key: file.key, beforeSha256: before.sha256, afterSha256, verified: true });
    }
  } catch (error) {
    const rollbackErrors = await rollbackTheme(shopify, mutation.themeId, backups);
    if (rollbackErrors.length) throw httpError(500, "mutation_failed_rollback_incomplete", `Theme mutation failed and rollback was incomplete: ${rollbackErrors.join("; ")}`);
    throw error;
  }
  return json({ actionID: randomUUID(), actionType: "shopify.theme.files.upsert", status: "completed", startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), objective, evidence: { themeId: mutation.themeId, files: completed, backup: backups.map(({ key, existed, sha256 }) => ({ key, existed, sha256 })), rollbackAvailable: true, rollbackPerformed: false, approval, publishedThemeVerified: true, adapter: "graphql-admin", runtime: "cloudflare-workers" }, executionContext: executionContext(session) });
}

async function inspectStorefront(env) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/$/, "");
  const startedAt = new Date().toISOString();
  const pages = [];
  const errors = [];
  for (const path of ["/", "/sitemap.xml"]) {
    try {
      const response = await fetch(`${origin}${path}`, { headers: { Accept: path.endsWith(".xml") ? "application/xml,text/xml" : "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      pages.push({ url: `${origin}${path}`, finalUrl: response.url, status: response.status, contentType: response.headers.get("content-type"), title: path === "/" ? extractTag(text, "title") : undefined, h1: path === "/" ? extractTag(text, "h1") : undefined, bytes: text.length });
    } catch (error) { errors.push({ url: `${origin}${path}`, message: error instanceof Error ? error.message : "Inspection failed" }); }
  }
  return { auditId: randomUUID(), source: "live-storefront", storefront: origin, startedAt, completedAt: new Date().toISOString(), inspectedCount: pages.length, discoveredCount: pages.length, pages, errors };
}

function requireAuthorizedSession(request, env) {
  if (!env.KAIROS_RUNTIME_TOKEN) throw httpError(503, "runtime_not_configured", "KAIROS_RUNTIME_TOKEN is not configured in Cloudflare.");
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const session = verifySession(token, env.KAIROS_RUNTIME_TOKEN);
  if (session) return session;
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (supplied && safeEqual(supplied, env.KAIROS_RUNTIME_TOKEN)) return null;
  throw httpError(401, "unauthorized", "Kairos runtime authorization failed.");
}

function requireOpenAI(env) { if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) throw httpError(503, "runtime_not_configured", "OpenAI is not configured in Cloudflare Worker secrets."); }
function requireSessionConfiguration(env) { if (!env.KAIROS_RUNTIME_TOKEN || (!env.KAIROS_OPERATOR_PASSWORD && !env.KAIROS_OPERATOR_PASSWORD_HASH)) throw httpError(503, "session_unavailable", "Kairos operator authentication is not configured in Cloudflare."); }

async function requireShopify(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw httpError(503, "shopify_invalid_version", "The Shopify API version is invalid.");
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  let accessToken = "";
  let authSource = "static-admin-token";
  if (clientId && clientSecret) {
    accessToken = await getShopifyClientCredentialsToken(storeDomain, clientId, clientSecret);
    authSource = "client-credentials";
  } else {
    accessToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  }
  if (!accessToken) throw httpError(503, "shopify_not_configured", "Shopify client credentials or an Admin access token must be configured in Cloudflare.");
  return { storeDomain, accessToken, apiVersion, authSource };
}

async function getShopifyClientCredentialsToken(storeDomain, clientId, clientSecret) {
  const cacheKey = `${storeDomain}:${clientId}`;
  const cached = shopifyTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const pending = shopifyTokenRequests.get(cacheKey);
  if (pending) return pending;
  const request = requestShopifyClientCredentialsToken(storeDomain, clientId, clientSecret)
    .then(accessToken => {
      shopifyTokenCache.set(cacheKey, { accessToken, expiresAt: Date.now() + SHOPIFY_TOKEN_TTL_MS });
      return accessToken;
    })
    .finally(() => shopifyTokenRequests.delete(cacheKey));
  shopifyTokenRequests.set(cacheKey, request);
  return request;
}

async function requestShopifyClientCredentialsToken(storeDomain, clientId, clientSecret) {
  let response;
  try {
    response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw httpError(timedOut ? 504 : 502, timedOut ? "shopify_token_timeout" : "shopify_token_connection_failed", timedOut ? "Shopify did not issue a token before the timeout." : "Cloudflare could not reach Shopify's token endpoint.");
  }
  const body = await safeJSON(response);
  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !accessToken) {
    const detail = body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`;
    const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 401;
    throw httpError(status, response.status === 429 ? "shopify_token_rate_limited" : "shopify_client_credentials_invalid", String(detail).slice(0, 500));
  }
  return accessToken;
}

function themeGid(themeId) {
  const value = String(themeId || "").trim();
  if (/^gid:\/\/shopify\/OnlineStoreTheme\/\d+$/.test(value)) return value;
  if (/^\d+$/.test(value)) return `gid://shopify/OnlineStoreTheme/${value}`;
  throw httpError(400, "invalid_theme_id", "Shopify theme ID is invalid.");
}

function numericThemeId(gid) {
  const match = String(gid || "").match(/^gid:\/\/shopify\/OnlineStoreTheme\/(\d+)$/);
  if (!match) throw httpError(502, "invalid_shopify_theme_id", "Shopify returned an invalid published theme ID.");
  return match[1];
}

async function readMainTheme(shopify) {
  const data = await shopifyGraphQL(shopify, `query KairosMainTheme { themes(first: 1, roles: [MAIN]) { nodes { id name role processing processingFailed } } }`);
  const theme = data?.themes?.nodes?.[0];
  if (!theme || theme.role !== "MAIN") throw httpError(502, "main_theme_unavailable", "Shopify did not return the published theme through the GraphQL Admin API.");
  if (theme.processing || theme.processingFailed) throw httpError(409, "main_theme_processing", "The published Shopify theme is still processing or failed processing.");
  return { id: numericThemeId(theme.id), gid: theme.id, name: typeof theme.name === "string" ? theme.name : "Published theme", role: "main" };
}

async function readThemeSources(shopify, themeId) {
  const files = await queryThemeFiles(shopify, themeId, THEME_SOURCE_PATTERNS, 50);
  const css = files.find(file => /^assets\/(base|theme|styles?|application).*\.css$/i.test(file.filename));
  const selectedKeys = [...new Set([css?.filename, "templates/index.json", "layout/theme.liquid", "config/settings_data.json"].filter(Boolean))];
  const byKey = new Map(files.map(file => [file.filename, file]));
  const sources = [];
  let total = 0;
  for (const key of selectedKeys) {
    const file = byKey.get(key);
    if (!file || typeof file.value !== "string") continue;
    const bytes = Buffer.byteLength(file.value, "utf8");
    if (total + bytes > MAX_SOURCE_BYTES) continue;
    total += bytes;
    sources.push({ key, value: file.value, sha256: sha256(file.value) });
  }
  return sources;
}

async function readThemeAsset(shopify, themeId, key) {
  const files = await queryThemeFiles(shopify, themeId, [key], 1);
  const file = files.find(entry => entry.filename === key);
  if (!file) return { key, existed: false };
  if (typeof file.value !== "string") throw httpError(409, "binary_asset_unsupported", `Only text theme assets can be mutated safely: ${key}`);
  return { key, existed: true, value: file.value, sha256: sha256(file.value) };
}

async function queryThemeFiles(shopify, themeId, filenames, first) {
  const data = await shopifyGraphQL(shopify, `query KairosThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } ... on OnlineStoreThemeFileBodyUrl { url } } } userErrors { code filename } } } }`, { themeId: themeGid(themeId), filenames, first });
  if (!data?.theme) throw httpError(404, "theme_not_found", "Shopify could not find the requested theme.");
  const connection = data.theme.files;
  const readErrors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (readErrors.length) throw httpError(502, "theme_file_read_failed", `Shopify could not read theme files: ${readErrors.map(error => `${error.filename || "file"} (${error.code})`).join(", ")}.`);
  const output = [];
  for (const node of Array.isArray(connection?.nodes) ? connection.nodes : []) output.push({ filename: node?.filename, value: await themeFileBodyToText(node?.body), contentType: node?.contentType });
  return output.filter(file => typeof file.filename === "string");
}

async function themeFileBodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") return Buffer.from(body.contentBase64, "base64").toString("utf8");
  if (typeof body?.url === "string") {
    const response = await fetch(body.url, { signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
    if (!response.ok) throw httpError(502, "theme_file_url_failed", "Shopify returned a theme file URL that could not be downloaded.");
    return response.text();
  }
  return undefined;
}

async function writeThemeAsset(shopify, themeId, key, value) {
  const data = await shopifyGraphQL(shopify, `mutation KairosThemeFileUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message } } }`, { themeId: themeGid(themeId), files: [{ filename: key, body: { type: "TEXT", value } }] });
  const payload = data?.themeFilesUpsert;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors : [];
  if (errors.length) throw httpError(502, "theme_asset_write_failed", `Shopify could not update ${key}: ${errors.map(error => error.message).join("; ")}`);
  if (!payload?.upsertedThemeFiles?.some(file => file?.filename === key)) throw httpError(502, "theme_asset_write_failed", `Shopify did not confirm the update for ${key}.`);
}

async function deleteThemeAsset(shopify, themeId, key) {
  const data = await shopifyGraphQL(shopify, `mutation KairosThemeFileDelete($themeId: ID!, $files: [String!]!) { themeFilesDelete(themeId: $themeId, files: $files) { deletedThemeFiles { filename } userErrors { code field filename message } } }`, { themeId: themeGid(themeId), files: [key] });
  const payload = data?.themeFilesDelete;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(error => error?.code !== "NOT_FOUND") : [];
  if (errors.length) throw httpError(502, "theme_asset_delete_failed", `Shopify could not remove ${key}: ${errors.map(error => error.message).join("; ")}`);
}

async function rollbackTheme(shopify, themeId, backups) {
  const errors = [];
  for (const backup of [...backups].reverse()) {
    try { if (backup.existed && typeof backup.value === "string") await writeThemeAsset(shopify, themeId, backup.key, backup.value); else await deleteThemeAsset(shopify, themeId, backup.key); }
    catch (error) { errors.push(`${backup.key}: ${error instanceof Error ? error.message : "rollback failed"}`); }
  }
  return errors;
}

async function shopifyGraphQL(shopify, query, variables = {}) {
  let response;
  try {
    response = await fetch(`https://${shopify.storeDomain}/admin/api/${shopify.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": shopify.accessToken, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw httpError(timedOut ? 504 : 502, timedOut ? "shopify_timeout" : "shopify_connection_failed", timedOut ? "Shopify did not answer before the timeout." : "Cloudflare could not connect to Shopify's GraphQL Admin API.");
  }
  const body = await safeJSON(response);
  if (!response.ok) {
    const status = response.status;
    const code = status === 401 ? "shopify_token_invalid" : status === 403 ? "shopify_theme_scope_missing" : status === 429 ? "shopify_rate_limited" : "shopify_graphql_http_error";
    const message = status === 401 ? "Shopify rejected the Kairos access token." : status === 403 ? "The installed Kairos app lacks the required theme access." : status === 429 ? "Shopify rate-limited the request. Retry shortly." : `Shopify GraphQL returned HTTP ${status}.`;
    throw httpError(status === 429 ? 429 : status === 401 || status === 403 ? status : 502, code, message);
  }
  if (Array.isArray(body?.errors) && body.errors.length) {
    const message = body.errors.map(error => error?.message).filter(Boolean).join("; ") || "Shopify GraphQL returned an error.";
    const forbidden = /access denied|permission|scope|not authorized/i.test(message);
    throw httpError(forbidden ? 403 : 502, forbidden ? "shopify_theme_scope_missing" : "shopify_graphql_error", message);
  }
  if (!body?.data) throw httpError(502, "shopify_graphql_invalid_response", "Shopify GraphQL returned no data.");
  return body.data;
}

async function callOpenAI(env, payload, requestId) {
  const response = await fetch(OPENAI_RESPONSES_URL, { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json", Accept: "application/json", "X-Client-Request-Id": requestId }, body: JSON.stringify(payload), signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status === 429 ? 429 : 502, response.status === 429 ? "rate_limited" : "provider_error", response.status === 429 ? "Kairos is handling too many requests. Try again shortly." : "Kairos could not complete the OpenAI request.");
  return body;
}

function extractResponseText(body) {
  if (typeof body?.output_text === "string" && body.output_text.trim()) return body.output_text.trim();
  const parts = [];
  for (const item of Array.isArray(body?.output) ? body.output : []) for (const content of Array.isArray(item?.content) ? item.content : []) if (typeof content?.text === "string") parts.push(content.text);
  if (!parts.length) throw httpError(502, "empty_provider_response", "Kairos returned no usable response text.");
  return parts.join("\n").trim();
}

function mutationPlanSchema() {
  return { type: "object", additionalProperties: false, required: ["summary", "recommendedChanges", "affectedAssets", "expectedBenefits", "risks", "rollbackPlan", "acceptanceCriteria", "mutationPlan"], properties: { summary: { type: "string" }, recommendedChanges: { type: "array", items: { type: "string" } }, affectedAssets: { type: "array", items: { type: "string" } }, expectedBenefits: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }, rollbackPlan: { type: "array", items: { type: "string" } }, acceptanceCriteria: { type: "array", items: { type: "string" } }, mutationPlan: { type: "object", additionalProperties: false, required: ["themeId", "files"], properties: { themeId: { type: "string" }, files: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, required: ["key", "value", "expectedSha256"], properties: { key: { type: "string" }, value: { type: "string" }, expectedSha256: { type: "string" } } } } } } } };
}

function buildDeterministicHomepagePlan(providerPlan, theme, sources) {
  const stylesheet = sources.find(source => /^assets\/.*\.css$/i.test(source.key));
  if (!stylesheet) throw httpError(409, "mutation_plan_blocked", "Kairos could not produce a safe source-grounded mutation because no editable published stylesheet was available.");
  const alreadyApplied = stylesheet.value.includes(GUIDED_HOMEPAGE_CSS_MARKER);
  const enhancement = `${GUIDED_HOMEPAGE_CSS_MARKER}
.template-index main { --mmg-guided-section-gap: clamp(1.5rem, 4vw, 3.5rem); }
.template-index main .shopify-section + .shopify-section { margin-top: var(--mmg-guided-section-gap); }
.template-index main :is(h1, h2, h3) { text-wrap: balance; }
.template-index main :is(p, li) { text-wrap: pretty; }
@media (max-width: 749px) {
  .template-index main .page-width { padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right)); }
  .template-index main :is(button, .button, a.button) { min-height: 44px; }
}`;
  if (alreadyApplied) throw httpError(409, "guided_baseline_already_applied", "The bounded guided-homepage baseline is already present. Define the next specific homepage objective before preparing another mutation.");
  const value = `${stylesheet.value.replace(/\s+$/, "")}\n\n${enhancement}\n`;
  return {
    summary: providerPlan?.summary || "Apply a bounded, mobile-first guided-homepage presentation baseline to the current published stylesheet.",
    recommendedChanges: ["Add consistent section progression spacing.", "Improve heading and paragraph wrapping.", "Preserve mobile safe areas and accessible button height."],
    affectedAssets: [stylesheet.key],
    expectedBenefits: ["Clearer homepage progression across sections.", "Improved mobile readability and tap comfort.", "A minimal reversible change that preserves Shopify structure and dynamic data."],
    risks: ["Theme styles may already define spacing for individual sections; executive visual review remains required before approval."],
    rollbackPlan: [`Restore the verified pre-change version of ${stylesheet.key}.`],
    acceptanceCriteria: ["The homepage renders without Liquid or JSON changes.", "Section spacing remains consistent on mobile and desktop.", "Buttons remain usable at a minimum 44-pixel height on mobile."],
    mutationPlan: { themeId: theme.id, files: [{ key: stylesheet.key, value, expectedSha256: stylesheet.sha256 }] },
  };
}

function validateMutationPlan(plan, themeId, sources) {
  if (!plan?.mutationPlan || String(plan.mutationPlan.themeId) !== themeId || !Array.isArray(plan.mutationPlan.files)) throw httpError(502, "invalid_mutation_plan", "Kairos returned a mutation plan for the wrong theme or an invalid file set.");
  if (!plan.mutationPlan.files.length) throw httpError(409, "mutation_plan_blocked", "Kairos could not produce a safe source-grounded mutation from the available theme files.");
  const byKey = new Map(sources.map(source => [source.key, source]));
  for (const file of plan.mutationPlan.files) {
    const source = byKey.get(file.key);
    if (!source || file.expectedSha256 !== source.sha256) throw httpError(502, "ungrounded_mutation_plan", `The proposed mutation for ${file.key} is not grounded in the current published source.`);
    if (typeof file.value !== "string" || file.value.includes("...") || file.value.includes("[existing content]")) throw httpError(502, "incomplete_mutation_content", `The proposed replacement for ${file.key} is incomplete.`);
  }
  parseMutation(plan.mutationPlan);
}

function parseMutation(value) {
  if (!value || typeof value !== "object") throw httpError(400, "mutation_plan_required", "The approved proposal must include an exact Shopify mutation plan.");
  const themeId = boundedText(value.themeId, "mutation.themeId", 64);
  if (!/^\d+$/.test(themeId)) throw httpError(400, "invalid_theme_id", "mutation.themeId must be a numeric Shopify theme ID.");
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > MAX_FILES) throw httpError(400, "invalid_mutation_files", `mutation.files must contain between 1 and ${MAX_FILES} files.`);
  let total = 0;
  const files = value.files.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw httpError(400, "invalid_mutation_file", `mutation.files[${index}] must be an object.`);
    const key = boundedText(entry.key, `mutation.files[${index}].key`, 240);
    if (!ALLOWED_THEME_KEY.test(key) || key.includes("..")) throw httpError(400, "unsafe_theme_path", `Theme file path is not allowed: ${key}`);
    if (typeof entry.value !== "string") throw httpError(400, "invalid_mutation_file", `${key} must include complete text content.`);
    const bytes = Buffer.byteLength(entry.value, "utf8");
    if (bytes > MAX_FILE_BYTES) throw httpError(413, "theme_file_too_large", `${key} exceeds the mutation size limit.`);
    total += bytes;
    const expectedSha256 = typeof entry.expectedSha256 === "string" && /^[a-f0-9]{64}$/i.test(entry.expectedSha256) ? entry.expectedSha256.toLowerCase() : undefined;
    return { key, value: entry.value, expectedSha256 };
  });
  if (new Set(files.map(file => file.key)).size !== files.length) throw httpError(400, "duplicate_theme_path", "Each theme file may appear only once in a mutation.");
  if (total > MAX_TOTAL_BYTES) throw httpError(413, "mutation_too_large", "The approved theme mutation exceeds the total size limit.");
  return { themeId, files };
}

function requireApproval(value) {
  if (!value || value.approved !== true) throw httpError(409, "approval_required", "Approve this action before execution.");
  const actor = boundedText(value.actor, "approval.actor", 160);
  const approvedAt = boundedText(value.approvedAt, "approval.approvedAt", 80);
  if (Number.isNaN(Date.parse(approvedAt))) throw httpError(400, "invalid_approval", "approval.approvedAt must be an ISO-8601 timestamp.");
  return { approved: true, actor, approvedAt };
}

function issueSession(operatorInput, runtimeToken) {
  const operator = String(operatorInput || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!operator) throw httpError(400, "invalid_operator", "Operator name is required.");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = { sub: `operator:${operator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, tenantId: "mmg-internal", role: "executive", operator, iat: issuedAt, exp: issuedAt + SESSION_TTL_SECONDS, jti: randomUUID() };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${encoded}.${signSession(encoded, runtimeToken)}`, session: toSession(payload) };
}

function verifySession(token, runtimeToken) {
  if (!token) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra || !safeEqual(signaturePart, signSession(payloadPart, runtimeToken))) return null;
  try { const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")); if (payload.tenantId !== "mmg-internal" || payload.role !== "executive" || payload.exp <= Math.floor(Date.now() / 1000)) return null; return toSession(payload); } catch { return null; }
}

function verifyOperatorPassword(supplied, encodedHash, password) {
  if (encodedHash) {
    const [prefix, saltHex, expectedHex, extra] = String(encodedHash).trim().split("$");
    if (prefix !== "scrypt-v1" || !saltHex || !expectedHex || extra) return false;
    try { const salt = Buffer.from(saltHex, "hex"); const expected = Buffer.from(expectedHex, "hex"); return salt.length >= 16 && expected.length === 64 && timingSafeEqual(scryptSync(supplied, salt, 64), expected); } catch { return false; }
  }
  return typeof password === "string" && safeEqual(String(supplied), password);
}

function signSession(payload, runtimeToken) { const key = createHash("sha256").update(`mmg-kairos-session-v1:${runtimeToken}`).digest(); return createHmac("sha256", key).update(payload).digest("base64url"); }
function toSession(payload) { return { sub: payload.sub, tenantId: payload.tenantId, role: payload.role, operator: payload.operator, issuedAt: payload.iat, expiresAt: payload.exp, sessionId: payload.jti }; }
function sessionCookie(token, expiresAt) { return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, expiresAt - Math.floor(Date.now() / 1000))}`; }
function readCookie(header, name) { if (!header) return undefined; for (const part of header.split(";")) { const [rawName, ...rawValue] = part.trim().split("="); if (rawName === name) return decodeURIComponent(rawValue.join("=")); } return undefined; }
function executionContext(session) { return { authorizationMode: session ? "session" : "gateway-recovery", operator: session?.operator, sessionId: session?.sessionId || "gateway-recovery", runtime: "cloudflare-workers" }; }
function isStorefrontAuditObjective(objective) { return /(audit|inspect|review|analy[sz]e).*(storefront|shopify|homepage|website)|(storefront|shopify|homepage|website).*(audit|inspect|review|analy[sz]e)/i.test(objective); }
function extractTag(html, tag) { const match = String(html).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : undefined; }
function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function safeEqual(left, right) { const a = Buffer.from(String(left), "utf8"); const b = Buffer.from(String(right), "utf8"); return a.length === b.length && timingSafeEqual(a, b); }
function boundedText(value, field, maximum) { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw httpError(400, "invalid_request", `${field} is empty or exceeds its limit.`); return value.trim(); }
function parseJSONText(text, code, message) { try { return JSON.parse(text); } catch { throw httpError(502, code, message); } }
async function readBody(request) { try { const body = await request.json(); return body && typeof body === "object" && !Array.isArray(body) ? body : {}; } catch { throw httpError(400, "invalid_json", "Request body must be valid JSON."); } }
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return {}; } }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; error.requestID = randomUUID(); return error; }
function errorResponse(error) { const status = Number(error?.status) || (error?.name === "TimeoutError" ? 504 : 500); return json({ error: { code: error?.code || (status === 504 ? "timeout" : "internal_error"), message: error instanceof Error ? error.message : "Kairos encountered an internal error.", requestID: error?.requestID || randomUUID() } }, status); }
function methodNotAllowed(allow) { const headers = apiHeaders(); headers.set("Allow", allow); return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "Method not allowed.", requestID: randomUUID() } }), { status: 405, headers }); }
function apiHeaders() { return new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-MMG-Runtime": "cloudflare-native" }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: apiHeaders() }); }

async function serveCommandCenterAsset(request, env, incomingURL) {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  let pathname = incomingURL.pathname;
  if (pathname === "/" || pathname === "/web/kairos-dashboard" || pathname === "/web/kairos-dashboard/") pathname = "/index.html";
  else if (pathname.startsWith("/web/kairos-dashboard/")) pathname = pathname.slice("/web/kairos-dashboard".length);
  if (pathname.includes("..")) return new Response("Invalid path", { status: 400 });
  if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
    const assetPath = pathname === "/index.html" ? "/" : pathname;
    const assetURL = new URL(assetPath + incomingURL.search, incomingURL.origin);
    const assetRequest = new Request(assetURL, request);
    const asset = await env.ASSETS.fetch(assetRequest);
    if (asset.ok) return commandCenterResponse(asset, pathname, "cloudflare-assets");
  }
  const upstream = await fetch(`${RAW_REPOSITORY_ORIGIN}${pathname}${incomingURL.search}`, { method: request.method, headers: { Accept: request.headers.get("Accept") || "*/*" }, cf: { cacheEverything: true, cacheTtl: pathname.endsWith(".html") ? 0 : 300 } });
  if (!upstream.ok) { if (pathname !== "/index.html" && !hasFileExtension(pathname)) return serveCommandCenterAsset(new Request(`${incomingURL.origin}/index.html`, request), env, new URL(`${incomingURL.origin}/index.html`)); return new Response("Command Center asset not found", { status: upstream.status }); }
  return commandCenterResponse(upstream, pathname, "repository-fallback");
}

function commandCenterResponse(response, pathname, host) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", contentTypeFor(pathname));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-MMG-Host", host);
  headers.set("X-MMG-Runtime", "cloudflare-native");
  headers.set("X-MMG-Build", "command-center-mobile-stability-20260711-34");
  headers.set("Cache-Control", pathname.endsWith(".html") ? "no-cache, no-store, must-revalidate" : "public, max-age=300");
  headers.delete("content-security-policy");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function hasFileExtension(pathname) { return /\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(pathname); }
function contentTypeFor(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}
