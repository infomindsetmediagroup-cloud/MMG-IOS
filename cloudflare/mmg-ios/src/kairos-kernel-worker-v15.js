import kernel from "./kairos-kernel-worker-v14.js";

const BUILD = "kairos-kernel-20260712-15";
const SHOPIFY_TIMEOUT_MS = 25_000;
const HOMEPAGE_FILE = "templates/index.json";
const tokenCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/plan" && request.method === "POST") {
      return prepareHealthyPlan(request, env, ctx);
    }

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v15";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyStagingSourceRepair: "available-authoritative-main-to-staging-only",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function prepareHealthyPlan(request, env, ctx) {
  try {
    const repair = await ensureHealthyStagingHomepage(env);
    const delegated = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: await request.text(),
    });
    const response = await kernel.fetch(delegated, env, ctx);
    const body = await safeJSON(response.clone());
    if (!response.ok) return retag(response);

    body.build = BUILD;
    body.kernel = "standalone-v15";
    body.evidence = {
      ...(body.evidence || {}),
      stagingPrerequisiteRepair: repair,
    };
    if (repair.repaired) {
      body.summary = `${body.summary || "Website plan prepared."} Kairos first restored the corrupted staging homepage source from the verified live Rise theme and confirmed the repair.`;
    }
    return json(body, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      status: "needs-attention",
      build: BUILD,
      kernel: "standalone-v15",
      summary: "Kairos could not establish a valid staging homepage source before planning.",
      error: normalized,
    }, normalized.status);
  }
}

async function ensureHealthyStagingHomepage(env) {
  const checkedAt = new Date().toISOString();
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const themes = await readThemes(config, auth.accessToken);
  const mainTheme = themes.find(theme => theme.role === "MAIN") || null;
  const stagingTheme = themes.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === "kairos staging") || null;

  if (!mainTheme) throw httpError(409, "main_theme_not_found", "The live Rise theme could not be verified.");
  if (!stagingTheme) throw httpError(409, "staging_theme_not_found", "Kairos Staging could not be verified.");
  if (stagingTheme.processing || stagingTheme.processingFailed) throw httpError(409, "staging_theme_not_ready", "Kairos Staging is not ready for source repair.");

  const contract = await inspectThemeFileContract(config, auth.accessToken);
  const [mainSource, stagingSource] = await Promise.all([
    readThemeFile(config, auth.accessToken, mainTheme.gid, contract, HOMEPAGE_FILE),
    readThemeFile(config, auth.accessToken, stagingTheme.gid, contract, HOMEPAGE_FILE),
  ]);

  if (typeof mainSource !== "string" || !mainSource.length) throw httpError(409, "main_homepage_source_unavailable", "The live Rise templates/index.json could not be read.");
  if (typeof stagingSource !== "string" || !stagingSource.length) throw httpError(409, "staging_homepage_source_unavailable", "The Kairos Staging templates/index.json could not be read.");

  let mainDocument;
  try { mainDocument = JSON.parse(mainSource); }
  catch { throw httpError(409, "main_homepage_json_invalid", "The live Rise templates/index.json is invalid JSON. Kairos will not use it as a repair source."); }
  validateBasicHomepage(mainDocument, "Rise");

  const mainSha256 = await sha256(mainSource);
  const stagingSha256Before = await sha256(stagingSource);
  let stagingValid = true;
  try { validateBasicHomepage(JSON.parse(stagingSource), "Kairos Staging"); }
  catch { stagingValid = false; }

  if (stagingValid) {
    return {
      checkedAt,
      repaired: false,
      reason: "staging-source-valid",
      authoritativeTheme: summarizeTheme(mainTheme),
      targetTheme: summarizeTheme(stagingTheme),
      filename: HOMEPAGE_FILE,
      stagingSha256: stagingSha256Before,
    };
  }

  const mutationResult = await writeThemeFile(config, auth.accessToken, stagingTheme.gid, HOMEPAGE_FILE, mainSource);
  const readBack = await readThemeFile(config, auth.accessToken, stagingTheme.gid, contract, HOMEPAGE_FILE);
  if (typeof readBack !== "string" || !readBack.length) throw httpError(502, "staging_repair_readback_missing", "Shopify returned no staging homepage source after repair.");
  let readBackDocument;
  try { readBackDocument = JSON.parse(readBack); }
  catch { throw httpError(502, "staging_repair_json_invalid", "The repaired Kairos Staging templates/index.json is still invalid JSON."); }
  validateBasicHomepage(readBackDocument, "Kairos Staging repaired source");
  const stagingSha256After = await sha256(readBack);
  if (stagingSha256After !== mainSha256) throw httpError(502, "staging_repair_hash_mismatch", "The repaired staging homepage hash does not match the verified Rise source hash.");

  return {
    checkedAt,
    repaired: true,
    reason: "invalid-staging-json-restored-from-authoritative-main",
    operation: "themeFilesUpsert",
    authoritativeTheme: summarizeTheme(mainTheme),
    targetTheme: summarizeTheme(stagingTheme),
    filename: HOMEPAGE_FILE,
    beforeSha256: stagingSha256Before,
    authoritativeSha256: mainSha256,
    afterSha256: stagingSha256After,
    jsonValid: true,
    liveThemeChanged: false,
    productionPublishAuthorized: false,
    mutationResult,
  };
}

function validateBasicHomepage(document, label) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error(`${label} homepage must be a JSON object.`);
  if (!document.sections || typeof document.sections !== "object" || Array.isArray(document.sections)) throw new Error(`${label} homepage sections must be an object.`);
  if (!Array.isArray(document.order)) throw new Error(`${label} homepage order must be an array.`);
  if (new Set(document.order).size !== document.order.length) throw new Error(`${label} homepage order contains duplicate section IDs.`);
  if (document.order.some(id => !document.sections[id])) throw new Error(`${label} homepage order references an unknown section ID.`);
}

async function inspectThemeFileContract(config, accessToken) {
  const root = await shopifyGraphQL(config, accessToken, `
    query KairosThemeFileRootContractV15 {
      queryRoot: __type(name: "QueryRoot") { fields(includeDeprecated: true) { name args { name type { ...TypeRef } } type { ...TypeRef } } }
      themeType: __type(name: "OnlineStoreTheme") { fields(includeDeprecated: true) { name args { name type { ...TypeRef } } type { ...TypeRef } } }
    }
    fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
  `);
  const filesField = (root?.themeType?.fields || []).find(field => field?.name === "files");
  if (!filesField) throw httpError(409, "theme_files_unavailable", "Shopify did not expose OnlineStoreTheme.files.");
  const connectionType = namedType(filesField.type);
  const connection = await introspectType(config, accessToken, connectionType);
  const nodesField = (connection?.fields || []).find(field => field?.name === "nodes");
  if (!nodesField) throw httpError(409, "theme_file_nodes_unavailable", "Shopify did not expose theme file nodes.");
  const node = await introspectType(config, accessToken, namedType(nodesField.type));
  const bodyField = (node?.fields || []).find(field => field?.name === "body");
  if (!bodyField) throw httpError(409, "theme_file_body_unavailable", "Shopify did not expose theme file bodies.");
  const body = await introspectType(config, accessToken, namedType(bodyField.type));
  const readableVariants = [];
  for (const possible of body?.possibleTypes || []) {
    const detail = await introspectType(config, accessToken, possible.name);
    const textField = (detail?.fields || []).find(field => ["content", "value", "text"].includes(field.name) && namedType(field.type) === "String");
    if (textField) readableVariants.push({ typeName: possible.name, textField: textField.name });
  }
  if (!readableVariants.length) throw httpError(409, "theme_file_text_body_unavailable", "Shopify exposed no readable text body for theme files.");
  return {
    filesArguments: (filesField.args || []).map(arg => ({ name: arg.name, type: formatType(arg.type) })),
    readableVariants,
  };
}

async function readThemeFile(config, accessToken, themeID, contract, filename) {
  const fileArgs = new Set(contract.filesArguments.map(arg => arg.name));
  const variableDefs = ["$id: ID!", "$filenames: [String!]!"];
  const argumentsList = ["filenames: $filenames"];
  if (fileArgs.has("first")) { variableDefs.push("$first: Int!"); argumentsList.push("first: $first"); }
  const fragments = contract.readableVariants.map(item => `... on ${item.typeName} { ${item.textField} }`).join("\n");
  const variables = { id: themeID, filenames: [filename] };
  if (fileArgs.has("first")) variables.first = 1;
  const data = await shopifyGraphQL(config, accessToken, `
    query KairosReadHomepageFileV15(${variableDefs.join(", ")}) {
      theme(id: $id) {
        files(${argumentsList.join(", ")}) { nodes { filename body { __typename ${fragments} } } }
      }
    }
  `, variables);
  const item = (data?.theme?.files?.nodes || []).find(node => node?.filename === filename);
  return extractTextBody(item?.body);
}

async function writeThemeFile(config, accessToken, themeID, filename, content) {
  const data = await shopifyGraphQL(config, accessToken, `
    mutation KairosRepairStagingHomepageV15($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message } }
    }
  `, { themeId: themeID, files: [{ filename, body: { type: "TEXT", value: content } }] });
  const result = data?.themeFilesUpsert || {};
  const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
  if (userErrors.length) throw httpError(409, "staging_repair_user_error", userErrors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return { upsertedThemeFiles: Array.isArray(result.upsertedThemeFiles) ? result.upsertedThemeFiles : [] };
}

async function introspectType(config, accessToken, name) {
  const data = await shopifyGraphQL(config, accessToken, `
    query KairosIntrospectTypeV15($name: String!) {
      type: __type(name: $name) { kind name possibleTypes { name kind } fields(includeDeprecated: true) { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
    }
  `, { name });
  return data?.type || null;
}

async function readThemes(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `query KairosThemeSnapshotV15 { themes(first: 20) { nodes { id name role processing processingFailed } } }`);
  return Array.isArray(data?.themes?.nodes) ? data.themes.nodes.map(normalizeTheme) : [];
}

function normalizeTheme(theme) {
  const gid = String(theme?.id || "");
  return { id: gid.match(/OnlineStoreTheme\/(\d+)$/)?.[1] || "", gid, name: String(theme?.name || "Unnamed theme"), role: String(theme?.role || "UNKNOWN").toUpperCase(), processing: Boolean(theme?.processing), processingFailed: Boolean(theme?.processingFailed) };
}
function summarizeTheme(theme) { return { id: theme.id, gid: theme.gid, name: theme.name, role: theme.role }; }
function extractTextBody(body) { if (!body || typeof body !== "object") return null; for (const key of ["content", "value", "text"]) if (typeof body[key] === "string") return body[key]; return null; }
function namedType(type) { let current = type; while (current?.ofType) current = current.ofType; return current?.name || ""; }
function formatType(type) { if (!type) return "unknown"; if (type.kind === "NON_NULL") return `${formatType(type.ofType)}!`; if (type.kind === "LIST") return `[${formatType(type.ofType)}]`; return type.name || type.kind || "unknown"; }
async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }

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
async function shopifyGraphQL(config, accessToken, query, variables = {}) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", String(body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`).slice(0, 1000));
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(502, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return body?.data || {};
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v15");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { raw: text.slice(0, 2000) }; } }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function normalizeError(error) { return { status: Number.isInteger(error?.status) ? error.status : 500, code: typeof error?.code === "string" ? error.code : "staging_source_repair_failed", message: error instanceof Error ? error.message : "Staging source repair failed." }; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-v15", "X-Content-Type-Options": "nosniff" } }); }
