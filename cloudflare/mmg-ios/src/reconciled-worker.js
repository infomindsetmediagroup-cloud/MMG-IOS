import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import baseWorker from "./worker.js";

const SESSION_COOKIE_NAME = "mmg_kairos_session";
const SHOPIFY_TIMEOUT_MS = 20_000;
const PROVIDER_TIMEOUT_MS = 60_000;
const MAX_SOURCE_BYTES = 320_000;
const MAX_SOURCE_FILES = 28;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const tokenCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/theme-plan") return baseWorker.fetch(request, env, ctx);
    try {
      return await handleThemePlan(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  },
};

async function handleThemePlan(request, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const session = requireAuthorizedSession(request, env);
  requireOpenAI(env);
  const shopify = await requireShopify(env);
  const body = await readBody(request);
  const objective = boundedText(body.objective, "objective", 8000);
  const theme = await readMainTheme(shopify);
  const graph = await readHomepageSourceGraph(shopify, theme.id);

  if (!graph.sources.some(source => /^templates\/index\.(json|liquid)$/i.test(source.key))) {
    throw httpError(502, "homepage_template_unavailable", "Shopify did not return the published homepage template required for a source-grounded proposal.");
  }
  if (!graph.sources.some(source => /^sections\/.*\.liquid$/i.test(source.key))) {
    throw httpError(409, "homepage_sections_unavailable", "The homepage template was read, but its referenced section sources were not available. Verify Shopify theme-file read access and regenerate.");
  }

  const requestId = randomUUID();
  const providerBody = await callOpenAI(env, {
    model: env.OPENAI_MODEL,
    instructions: [
      "You are Kairos Website Operations compiling an exact Shopify production mutation proposal.",
      "Use only the supplied current published-theme dependency graph.",
      "Prefer homepage section files, homepage template settings, and section-local CSS over global stylesheet changes.",
      "Return complete replacement content for every changed file, never patches, placeholders, summaries, or ellipses.",
      "Change the fewest files necessary and preserve valid Liquid, JSON, schema blocks, app blocks, dynamic settings, accessibility, and mobile behavior.",
      "Do not modify global layout or CSS unless the supplied source proves an explicit homepage-only selector.",
      "If no safe homepage-only mutation is possible, return an empty files array and explain the exact source-specific blocker."
    ].join(" "),
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({
          objective,
          theme,
          dependencyGraph: graph.metadata,
          sources: graph.sources,
        }),
      }],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "shopify_homepage_mutation_plan",
        strict: true,
        schema: mutationPlanSchema(),
      },
    },
  }, requestId);

  const plan = parseJSONText(extractResponseText(providerBody), "invalid_plan_response", "Kairos returned an invalid structured mutation plan.");
  validateMutationPlan(plan, theme.id, graph.sources);

  return json({
    ...plan,
    actionID: randomUUID(),
    completedAt: new Date().toISOString(),
    requestId,
    auditId: randomUUID(),
    sourceEvidence: {
      adapter: "graphql-admin-homepage-graph",
      themeId: theme.id,
      themeName: theme.name,
      role: theme.role,
      homepageTemplate: graph.metadata.homepageTemplate,
      sectionTypes: graph.metadata.sectionTypes,
      snippetNames: graph.metadata.snippetNames,
      stylesheetKeys: graph.metadata.stylesheetKeys,
      files: graph.sources.map(source => ({
        key: source.key,
        sha256: source.sha256,
        bytes: Buffer.byteLength(source.value, "utf8"),
      })),
    },
    executionContext: executionContext(session),
  });
}

async function readHomepageSourceGraph(shopify, themeId) {
  const baseKeys = [
    "templates/index.json",
    "templates/index.liquid",
    "layout/theme.liquid",
    "config/settings_data.json",
    "config/settings_schema.json",
  ];
  const baseFiles = await queryThemeFiles(shopify, themeId, baseKeys, baseKeys.length);
  const byKey = new Map(baseFiles.map(file => [file.filename, file]));
  const homepageTemplate = byKey.has("templates/index.json") ? "templates/index.json" : byKey.has("templates/index.liquid") ? "templates/index.liquid" : "";
  const templateValue = homepageTemplate ? byKey.get(homepageTemplate)?.value || "" : "";
  const sectionTypes = extractSectionTypes(templateValue, homepageTemplate);
  const sectionKeys = sectionTypes.map(type => `sections/${type}.liquid`);
  const sectionFiles = sectionKeys.length ? await queryThemeFiles(shopify, themeId, sectionKeys, Math.min(sectionKeys.length, 50)) : [];
  for (const file of sectionFiles) byKey.set(file.filename, file);

  const liquidCorpus = [byKey.get("layout/theme.liquid")?.value, ...sectionFiles.map(file => file.value)].filter(value => typeof value === "string").join("\n");
  const snippetNames = extractSnippetNames(liquidCorpus);
  const snippetKeys = snippetNames.map(name => `snippets/${name}.liquid`);
  const snippetFiles = snippetKeys.length ? await queryThemeFiles(shopify, themeId, snippetKeys, Math.min(snippetKeys.length, 50)) : [];
  for (const file of snippetFiles) byKey.set(file.filename, file);

  const secondLevelSnippetNames = extractSnippetNames(snippetFiles.map(file => file.value || "").join("\n")).filter(name => !snippetNames.includes(name));
  const secondLevelKeys = secondLevelSnippetNames.slice(0, 12).map(name => `snippets/${name}.liquid`);
  const secondLevelFiles = secondLevelKeys.length ? await queryThemeFiles(shopify, themeId, secondLevelKeys, secondLevelKeys.length) : [];
  for (const file of secondLevelFiles) byKey.set(file.filename, file);

  const assetNames = extractStylesheetNames([byKey.get("layout/theme.liquid")?.value, ...sectionFiles.map(file => file.value), ...snippetFiles.map(file => file.value)].filter(Boolean).join("\n"));
  const stylesheetKeys = [...new Set(["assets/base.css", "assets/theme.css", "assets/styles.css", "assets/application.css", ...assetNames.map(name => `assets/${name}`)])];
  const stylesheetFiles = await queryThemeFiles(shopify, themeId, stylesheetKeys, Math.min(stylesheetKeys.length, 50));
  for (const file of stylesheetFiles) byKey.set(file.filename, file);

  const priority = [
    homepageTemplate,
    ...sectionKeys,
    ...snippetKeys,
    ...secondLevelKeys,
    "layout/theme.liquid",
    "config/settings_data.json",
    "config/settings_schema.json",
    ...stylesheetKeys,
  ].filter(Boolean);

  const sources = [];
  let total = 0;
  for (const key of [...new Set(priority)]) {
    if (sources.length >= MAX_SOURCE_FILES) break;
    const file = byKey.get(key);
    if (!file || typeof file.value !== "string") continue;
    const bytes = Buffer.byteLength(file.value, "utf8");
    if (!bytes || total + bytes > MAX_SOURCE_BYTES) continue;
    total += bytes;
    sources.push({ key, value: file.value, sha256: sha256(file.value) });
  }

  return {
    sources,
    metadata: {
      homepageTemplate,
      sectionTypes,
      snippetNames: [...new Set([...snippetNames, ...secondLevelSnippetNames])],
      stylesheetKeys: stylesheetFiles.map(file => file.filename),
      sourceCount: sources.length,
      sourceBytes: total,
    },
  };
}

function extractSectionTypes(value, key) {
  if (!value) return [];
  if (key.endsWith(".json")) {
    try {
      const parsed = JSON.parse(value);
      return [...new Set(Object.values(parsed?.sections || {}).map(section => section?.type).filter(type => typeof type === "string" && /^[A-Za-z0-9_-]+$/.test(type)))];
    } catch {
      throw httpError(502, "invalid_homepage_template", "The published templates/index.json file is not valid JSON.");
    }
  }
  const output = [];
  for (const match of value.matchAll(/{%\s*section\s+['\"]([^'\"]+)['\"]\s*%}/g)) if (/^[A-Za-z0-9_-]+$/.test(match[1])) output.push(match[1]);
  return [...new Set(output)];
}

function extractSnippetNames(liquid) {
  const output = [];
  for (const match of String(liquid || "").matchAll(/{%\s*(?:render|include)\s+['\"]([^'\"]+)['\"]/g)) if (/^[A-Za-z0-9_-]+$/.test(match[1])) output.push(match[1]);
  return [...new Set(output)].slice(0, 24);
}

function extractStylesheetNames(liquid) {
  const output = [];
  for (const match of String(liquid || "").matchAll(/['\"]([^'\"]+\.css)['\"]\s*\|\s*asset_url/g)) if (/^[A-Za-z0-9_.-]+\.css$/.test(match[1])) output.push(match[1]);
  return [...new Set(output)].slice(0, 12);
}

async function requireShopify(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw httpError(503, "shopify_invalid_version", "The Shopify API version is invalid.");
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  let accessToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (clientId && clientSecret) accessToken = await getClientCredentialsToken(storeDomain, clientId, clientSecret);
  if (!accessToken) throw httpError(503, "shopify_not_configured", "Shopify client credentials or an Admin access token must be configured in Cloudflare.");
  return { storeDomain, apiVersion, accessToken };
}

async function getClientCredentialsToken(storeDomain, clientId, clientSecret) {
  const key = `${storeDomain}:${clientId}`;
  const cached = tokenCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.accessToken;
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500));
  tokenCache.set(key, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 });
  return accessToken;
}

async function readMainTheme(shopify) {
  const data = await shopifyGraphQL(shopify, `query KairosMainTheme { themes(first: 1, roles: [MAIN]) { nodes { id name role processing processingFailed } } }`);
  const theme = data?.themes?.nodes?.[0];
  if (!theme || theme.role !== "MAIN") throw httpError(502, "main_theme_unavailable", "Shopify did not return the published main theme.");
  if (theme.processing || theme.processingFailed) throw httpError(409, "main_theme_processing", "The published Shopify theme is still processing or failed processing.");
  const match = String(theme.id || "").match(/^gid:\/\/shopify\/OnlineStoreTheme\/(\d+)$/);
  if (!match) throw httpError(502, "invalid_shopify_theme_id", "Shopify returned an invalid published theme ID.");
  return { id: match[1], gid: theme.id, name: typeof theme.name === "string" ? theme.name : "Published theme", role: "main" };
}

async function queryThemeFiles(shopify, themeId, filenames, first) {
  if (!filenames.length) return [];
  const data = await shopifyGraphQL(shopify, `query KairosThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } ... on OnlineStoreThemeFileBodyUrl { url } } } userErrors { code filename } } } }`, {
    themeId: `gid://shopify/OnlineStoreTheme/${themeId}`,
    filenames,
    first,
  });
  if (!data?.theme) throw httpError(404, "theme_not_found", "Shopify could not find the requested theme.");
  const connection = data.theme.files;
  const errors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (errors.length) throw httpError(502, "theme_file_read_failed", `Shopify could not read theme files: ${errors.map(error => `${error.filename || "file"} (${error.code})`).join(", ")}.`);
  const output = [];
  for (const node of Array.isArray(connection?.nodes) ? connection.nodes : []) {
    output.push({ filename: node?.filename, value: await bodyToText(node?.body), contentType: node?.contentType });
  }
  return output.filter(file => typeof file.filename === "string" && typeof file.value === "string");
}

async function bodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") return Buffer.from(body.contentBase64, "base64").toString("utf8");
  if (typeof body?.url === "string") {
    const response = await fetch(body.url, { signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
    if (!response.ok) throw httpError(502, "theme_file_url_failed", "Shopify returned a theme file URL that could not be downloaded.");
    return response.text();
  }
  return undefined;
}

async function shopifyGraphQL(shopify, query, variables = {}) {
  const response = await fetch(`https://${shopify.storeDomain}/admin/api/${shopify.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": shopify.accessToken, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) {
    const code = response.status === 401 ? "shopify_token_invalid" : response.status === 403 ? "shopify_theme_scope_missing" : response.status === 429 ? "shopify_rate_limited" : "shopify_graphql_http_error";
    throw httpError(response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? response.status : 502, code, `Shopify GraphQL returned HTTP ${response.status}.`);
  }
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(/access denied|permission|scope|not authorized/i.test(body.errors.map(error => error?.message).join("; ")) ? 403 : 502, "shopify_graphql_error", body.errors.map(error => error?.message).filter(Boolean).join("; "));
  if (!body?.data) throw httpError(502, "shopify_graphql_invalid_response", "Shopify GraphQL returned no data.");
  return body.data;
}

async function callOpenAI(env, payload, requestId) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json", Accept: "application/json", "X-Client-Request-Id": requestId },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status === 429 ? 429 : 502, response.status === 429 ? "rate_limited" : "provider_error", response.status === 429 ? "Kairos is handling too many requests. Try again shortly." : "Kairos could not complete the OpenAI request.");
  return body;
}

function mutationPlanSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "recommendedChanges", "affectedAssets", "expectedBenefits", "risks", "rollbackPlan", "acceptanceCriteria", "mutationPlan"],
    properties: {
      summary: { type: "string" },
      recommendedChanges: { type: "array", items: { type: "string" } },
      affectedAssets: { type: "array", items: { type: "string" } },
      expectedBenefits: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      rollbackPlan: { type: "array", items: { type: "string" } },
      acceptanceCriteria: { type: "array", items: { type: "string" } },
      mutationPlan: {
        type: "object",
        additionalProperties: false,
        required: ["themeId", "files"],
        properties: {
          themeId: { type: "string" },
          files: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "value", "expectedSha256"],
              properties: {
                key: { type: "string" },
                value: { type: "string" },
                expectedSha256: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

function validateMutationPlan(plan, themeId, sources) {
  if (!plan?.mutationPlan || String(plan.mutationPlan.themeId) !== themeId || !Array.isArray(plan.mutationPlan.files)) throw httpError(502, "invalid_mutation_plan", "Kairos returned a mutation plan for the wrong theme or an invalid file set.");
  if (!plan.mutationPlan.files.length) throw httpError(409, "mutation_plan_blocked", plan?.summary || "Kairos could not produce a safe homepage-only mutation from the verified dependency graph.");
  const byKey = new Map(sources.map(source => [source.key, source]));
  for (const file of plan.mutationPlan.files) {
    const source = byKey.get(file?.key);
    if (!source) throw httpError(502, "ungrounded_mutation_plan", `The proposed file ${file?.key || "unknown"} was not present in the verified homepage dependency graph.`);
    if (file.expectedSha256 !== source.sha256) throw httpError(502, "ungrounded_mutation_plan", `The proposed mutation for ${file.key} does not match the current source hash.`);
    if (typeof file.value !== "string" || !file.value.trim() || file.value.includes("...") || file.value.includes("[existing content]")) throw httpError(502, "incomplete_mutation_content", `The proposed replacement for ${file.key} is incomplete.`);
    if (/^(layout|assets)\//.test(file.key) && !/template-index|request\.page_type\s*==\s*['\"]index['\"]|template\.name\s*==\s*['\"]index['\"]/i.test(file.value)) throw httpError(409, "homepage_scope_unverified", `${file.key} does not contain a verified homepage-only scoping mechanism.`);
  }
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

function verifySession(token, runtimeToken) {
  if (!token) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra || !safeEqual(signaturePart, signSession(payloadPart, runtimeToken))) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    if (payload.tenantId !== "mmg-internal" || payload.role !== "executive" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { operator: payload.operator, sessionId: payload.jti };
  } catch {
    return null;
  }
}

function signSession(payload, runtimeToken) {
  const key = createHash("sha256").update(`mmg-kairos-session-v1:${runtimeToken}`).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function executionContext(session) {
  return { authorizationMode: session ? "session" : "gateway-recovery", operator: session?.operator, sessionId: session?.sessionId || "gateway-recovery", runtime: "cloudflare-workers" };
}

function requireOpenAI(env) {
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) throw httpError(503, "runtime_not_configured", "OpenAI is not configured in Cloudflare Worker secrets.");
}

function extractResponseText(body) {
  if (typeof body?.output_text === "string" && body.output_text.trim()) return body.output_text.trim();
  const parts = [];
  for (const item of Array.isArray(body?.output) ? body.output : []) for (const content of Array.isArray(item?.content) ? item.content : []) if (typeof content?.text === "string") parts.push(content.text);
  if (!parts.length) throw httpError(502, "empty_provider_response", "Kairos returned no usable response text.");
  return parts.join("\n").trim();
}

function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function safeEqual(left, right) { const a = Buffer.from(String(left), "utf8"); const b = Buffer.from(String(right), "utf8"); return a.length === b.length && timingSafeEqual(a, b); }
function readCookie(header, name) { if (!header) return undefined; for (const part of header.split(";")) { const [rawName, ...rawValue] = part.trim().split("="); if (rawName === name) return decodeURIComponent(rawValue.join("=")); } return undefined; }
function boundedText(value, field, maximum) { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw httpError(400, "invalid_request", `${field} is empty or exceeds its limit.`); return value.trim(); }
function parseJSONText(text, code, message) { try { return JSON.parse(text); } catch { throw httpError(502, code, message); } }
async function readBody(request) { try { const body = await request.json(); return body && typeof body === "object" && !Array.isArray(body) ? body : {}; } catch { throw httpError(400, "invalid_json", "Request body must be valid JSON."); } }
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return {}; } }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; error.requestID = randomUUID(); return error; }
function errorResponse(error) { const status = Number(error?.status) || (error?.name === "TimeoutError" ? 504 : 500); return json({ error: { code: error?.code || (status === 504 ? "timeout" : "internal_error"), message: error instanceof Error ? error.message : "Kairos encountered an internal error.", requestID: error?.requestID || randomUUID() } }, status); }
function methodNotAllowed(allow) { const headers = apiHeaders(); headers.set("Allow", allow); return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "Method not allowed.", requestID: randomUUID() } }), { status: 405, headers }); }
function apiHeaders() { return new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-MMG-Runtime": "cloudflare-native" }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: apiHeaders() }); }
