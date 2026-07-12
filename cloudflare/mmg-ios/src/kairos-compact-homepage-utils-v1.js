const SHOPIFY_TIMEOUT_MS = 25_000;
const tokenCache = new Map();

export function parseShopifyJson(source, label = "Shopify JSON") {
  const text = String(source || "").replace(/^\uFEFF/, "");
  let jsonText = text;
  const trimmed = text.trimStart();
  if (trimmed.startsWith("/*")) {
    const startOffset = text.length - trimmed.length;
    const end = text.indexOf("*/", startOffset + 2);
    if (end === -1) throw httpError(409, "shopify_json_comment_unclosed", `${label} contains an unclosed leading Shopify comment.`);
    jsonText = text.slice(end + 2).trimStart();
  }
  try { return JSON.parse(jsonText); }
  catch (error) { throw httpError(409, "shopify_json_invalid", `${label} is invalid after Shopify comment normalization: ${error instanceof Error ? error.message : "parse failed"}`); }
}

export function validateHomepageDocument(candidate, original) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Homepage JSON must remain an object.");
  if (JSON.stringify(Object.keys(original).sort()) !== JSON.stringify(Object.keys(candidate).sort())) throw new Error("Top-level Shopify template keys changed.");
  if (!candidate.sections || typeof candidate.sections !== "object" || Array.isArray(candidate.sections)) throw new Error("sections must remain an object.");
  if (!Array.isArray(candidate.order)) throw new Error("order must remain an array.");
  const originalIDs = Object.keys(original.sections || {}).sort();
  const candidateIDs = Object.keys(candidate.sections || {}).sort();
  if (JSON.stringify(originalIDs) !== JSON.stringify(candidateIDs)) throw new Error("Section IDs were added or removed.");
  if (new Set(candidate.order).size !== candidate.order.length || candidate.order.length !== original.order.length || original.order.some(id => !candidate.order.includes(id))) throw new Error("Homepage order must contain every existing section exactly once.");
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

export function buildEditableMap(document) {
  return {
    order: Array.isArray(document.order) ? document.order : [],
    sections: Object.entries(document.sections || {}).map(([sectionId, section]) => ({
      sectionId,
      type: section?.type || "",
      settings: section?.settings && typeof section.settings === "object" ? section.settings : {},
      blocks: Object.entries(section?.blocks || {}).map(([blockId, block]) => ({
        blockId,
        type: block?.type || "",
        settings: block?.settings && typeof block.settings === "object" ? block.settings : {},
      })),
    })),
  };
}

export function applyCompactPatch(original, patch) {
  const candidate = structuredClone(original);
  const order = Array.isArray(patch?.order) ? patch.order : [];
  if (order.length) candidate.order = [...order];
  const operations = Array.isArray(patch?.operations) ? patch.operations : [];
  if (operations.length > 250) throw new Error("The compact patch contains too many operations.");
  for (const operation of operations) {
    const scope = String(operation?.scope || "");
    const sectionId = String(operation?.sectionId || "");
    const blockId = String(operation?.blockId || "");
    const key = String(operation?.key || "");
    const section = candidate.sections?.[sectionId];
    if (!section) throw new Error(`Unknown section ID: ${sectionId}.`);
    let settings;
    if (scope === "section") {
      settings = section.settings;
      if (blockId) throw new Error(`Section operation ${sectionId}/${key} must not specify a block ID.`);
    } else if (scope === "block") {
      const block = section.blocks?.[blockId];
      if (!block) throw new Error(`Unknown block ID: ${sectionId}/${blockId}.`);
      settings = block.settings;
    } else {
      throw new Error(`Unsupported patch scope: ${scope}.`);
    }
    if (!settings || typeof settings !== "object" || !(key in settings)) throw new Error(`Unknown existing setting key: ${sectionId}/${blockId || "section"}/${key}.`);
    try { settings[key] = JSON.parse(String(operation?.valueJson ?? "null")); }
    catch { throw new Error(`Invalid valueJson for ${sectionId}/${blockId || "section"}/${key}.`); }
  }
  validateHomepageDocument(candidate, original);
  return candidate;
}

export async function semanticHash(document) {
  return sha256(JSON.stringify(canonicalize(document)));
}

export async function inspectStagingSource(kernel, request, env, build) {
  const response = await kernel.fetch(new Request(new URL("/api/shopify/staging/source/inspect", request.url), {
    method: "POST",
    headers: { Accept: "application/json", "X-MMG-Internal": build },
  }), env);
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, body?.error?.code || "staging_source_unavailable", body?.error?.message || body?.summary || "Kairos could not read the staging source.");
  return body;
}

export async function writeThemeFile(env, themeID, filename, content) {
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const data = await shopifyGraphQL(config, auth.accessToken, `mutation KairosCompactHomepageWrite($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message } } }`, {
    themeId: themeID,
    files: [{ filename, body: { type: "TEXT", value: content } }],
  });
  const result = data?.themeFilesUpsert || {};
  const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
  if (userErrors.length) throw httpError(409, "theme_files_upsert_user_error", userErrors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return { credentialPath: auth.source, mutationResult: { upsertedThemeFiles: Array.isArray(result.upsertedThemeFiles) ? result.upsertedThemeFiles : [] } };
}

export function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  for (const item of Array.isArray(response?.output) ? response.output : []) for (const content of Array.isArray(item?.content) ? item.content : []) if (content?.type === "output_text" && typeof content?.text === "string" && content.text.trim()) return content.text.trim();
  return "";
}

export function extractOpenAIError(body) {
  return [body?.error?.message, body?.last_error?.message, body?.incomplete_details?.reason, body?.status_details?.message]
    .filter(value => typeof value === "string" && value.trim()).join(" | ").slice(0, 1800);
}

export async function safeJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text.slice(0, 2000) }; }
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN is missing or invalid.");
  return { storeDomain, apiVersion };
}

async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (clientId && clientSecret) return { accessToken: await getClientCredentialsToken(config.storeDomain, clientId, clientSecret), source: "client-credentials" };
  if (staticToken) return { accessToken: staticToken, source: "admin-access-token" };
  throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured.");
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
  if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Token request returned HTTP ${response.status}.`).slice(0, 500));
  tokenCache.set(key, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 });
  return accessToken;
}

async function shopifyGraphQL(config, accessToken, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(409, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return body?.data || {};
}
