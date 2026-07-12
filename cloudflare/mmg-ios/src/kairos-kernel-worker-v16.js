import kernel from "./kairos-kernel-worker-v14.js";

const BUILD = "kairos-kernel-20260712-16";
const SHOPIFY_TIMEOUT_MS = 25_000;
const HOMEPAGE_FILE = "templates/index.json";
const tokenCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/plan" && request.method === "POST") {
      return prepareNormalizedPlan(request, env, ctx);
    }

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v16";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyJsonCommentNormalization: "available-staging-only",
        shopifyStructuredJsonPatch: "available-homepage-existing-structure-only",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function prepareNormalizedPlan(request, env, ctx) {
  try {
    const normalization = await normalizeStagingHomepage(env);
    const delegated = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: await request.text(),
    });
    const response = await kernel.fetch(delegated, env, ctx);
    const body = await safeJSON(response.clone());
    if (!response.ok) return retag(response);

    body.build = BUILD;
    body.kernel = "standalone-v16";
    body.evidence = {
      ...(body.evidence || {}),
      stagingJsonNormalization: normalization,
    };
    if (normalization.normalized) {
      body.summary = `${body.summary || "Website plan prepared."} Kairos normalized Shopify's commented homepage template into strict JSON on the non-live staging theme before planning.`;
    }
    return json(body, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      status: "needs-attention",
      build: BUILD,
      kernel: "standalone-v16",
      summary: "Kairos could not normalize the staging homepage source before planning.",
      error: normalized,
    }, normalized.status);
  }
}

async function normalizeStagingHomepage(env) {
  const checkedAt = new Date().toISOString();
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const themes = await readThemes(config, auth.accessToken);
  const mainTheme = themes.find(theme => theme.role === "MAIN") || null;
  const stagingTheme = themes.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === "kairos staging") || null;

  if (!mainTheme) throw httpError(409, "main_theme_not_found", "The live Rise theme could not be verified.");
  if (!stagingTheme) throw httpError(409, "staging_theme_not_found", "Kairos Staging could not be verified.");
  if (stagingTheme.processing || stagingTheme.processingFailed) throw httpError(409, "staging_theme_not_ready", "Kairos Staging is not ready for normalization.");

  const contract = await inspectThemeFileContract(config, auth.accessToken);
  const [mainSource, stagingSource] = await Promise.all([
    readThemeFile(config, auth.accessToken, mainTheme.gid, contract, HOMEPAGE_FILE),
    readThemeFile(config, auth.accessToken, stagingTheme.gid, contract, HOMEPAGE_FILE),
  ]);

  if (typeof mainSource !== "string" || !mainSource.length) throw httpError(409, "main_homepage_source_unavailable", "The live Rise homepage source could not be read.");
  if (typeof stagingSource !== "string" || !stagingSource.length) throw httpError(409, "staging_homepage_source_unavailable", "The Kairos Staging homepage source could not be read.");

  const mainParsed = parseShopifyJson(mainSource, "Rise");
  let stagingParsed;
  let sourceUsed = "staging";
  try {
    stagingParsed = parseShopifyJson(stagingSource, "Kairos Staging");
  } catch {
    stagingParsed = mainParsed;
    sourceUsed = "rise-authoritative-repair";
  }

  validateBasicHomepage(mainParsed.document, "Rise");
  validateBasicHomepage(stagingParsed.document, sourceUsed === "staging" ? "Kairos Staging" : "Rise repair source");

  const normalizedContent = JSON.stringify(stagingParsed.document, null, 2) + "\n";
  const beforeSha256 = await sha256(stagingSource);
  const normalizedSha256 = await sha256(normalizedContent);
  const alreadyStrict = stagingSource === normalizedContent;

  if (alreadyStrict) {
    return {
      checkedAt,
      normalized: false,
      reason: "staging-already-strict-json",
      sourceUsed,
      targetTheme: summarizeTheme(stagingTheme),
      authoritativeTheme: summarizeTheme(mainTheme),
      filename: HOMEPAGE_FILE,
      sha256: beforeSha256,
      strippedLeadingComment: Boolean(stagingParsed.leadingComment),
      liveThemeChanged: false,
    };
  }

  const mutationResult = await writeThemeFile(config, auth.accessToken, stagingTheme.gid, HOMEPAGE_FILE, normalizedContent);
  const readBack = await readThemeFile(config, auth.accessToken, stagingTheme.gid, contract, HOMEPAGE_FILE);
  if (typeof readBack !== "string" || !readBack.length) throw httpError(502, "staging_normalization_readback_missing", "Shopify returned no staging homepage source after normalization.");

  const readBackParsed = parseShopifyJson(readBack, "Normalized Kairos Staging");
  validateBasicHomepage(readBackParsed.document, "Normalized Kairos Staging");
  const readBackSha256 = await sha256(readBack);
  if (readBackSha256 !== normalizedSha256) throw httpError(502, "staging_normalization_hash_mismatch", "The normalized staging homepage hash did not match the expected strict JSON hash.");

  return {
    checkedAt,
    normalized: true,
    reason: sourceUsed === "staging" ? "shopify-leading-comment-normalized" : "invalid-staging-restored-from-rise-and-normalized",
    sourceUsed,
    operation: "themeFilesUpsert",
    targetTheme: summarizeTheme(stagingTheme),
    authoritativeTheme: summarizeTheme(mainTheme),
    filename: HOMEPAGE_FILE,
    beforeSha256,
    afterSha256: readBackSha256,
    strippedLeadingComment: Boolean(stagingParsed.leadingComment || mainParsed.leadingComment),
    jsonValid: true,
    liveThemeChanged: false,
    productionPublishAuthorized: false,
    mutationResult,
  };
}

function parseShopifyJson(source, label) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  let jsonText = text;
  let leadingComment = "";
  const trimmed = text.trimStart();
  if (trimmed.startsWith("/*")) {
    const startOffset = text.length - trimmed.length;
    const end = text.indexOf("*/", startOffset + 2);
    if (end === -1) throw httpError(409, "shopify_json_comment_unclosed", `${label} contains an unclosed leading Shopify comment.`);
    leadingComment = text.slice(startOffset, end + 2);
    jsonText = text.slice(end + 2).trimStart();
  }
  let document;
  try { document = JSON.parse(jsonText); }
  catch (error) {
    throw httpError(409, "shopify_json_invalid", `${label} does not contain valid JSON after Shopify comment normalization: ${error instanceof Error ? error.message : "parse failed"}`);
  }
  return { document, leadingComment };
}

function validateBasicHomepage(document, label) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw httpError(409, "homepage_document_invalid", `${label} homepage must be an object.`);
  if (!document.sections || typeof document.sections !== "object" || Array.isArray(document.sections)) throw httpError(409, "homepage_sections_invalid", `${label} homepage sections must be an object.`);
  if (!Array.isArray(document.order)) throw httpError(409, "homepage_order_invalid", `${label} homepage order must be an array.`);
  if (new Set(document.order).size !== document.order.length) throw httpError(409, "homepage_order_duplicates", `${label} homepage order contains duplicate section IDs.`);
  if (document.order.some(id => !document.sections[id])) throw httpError(409, "homepage_order_unknown_section", `${label} homepage order references an unknown section ID.`);
}

async function inspectThemeFileContract(config, accessToken) {
  const root = await shopifyGraphQL(config, accessToken, `
    query KairosThemeFileRootContractV16 {
      themeType: __type(name: "OnlineStoreTheme") { fields(includeDeprecated: true) { name args { name type { ...TypeRef } } type { ...TypeRef } } }
    }
    fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
  `);
  const filesField = (root?.themeType?.fields || []).find(field => field?.name === "files");
  if (!filesField) throw httpError(409, "theme_files_unavailable", "Shopify did not expose OnlineStoreTheme.files.");
  const connection = await introspectType(config, accessToken, namedType(filesField.type));
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
  return { filesArguments: (filesField.args || []).map(arg => ({ name: arg.name, type: formatType(arg.type) })), readableVariants };
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
    query KairosReadHomepageFileV16(${variableDefs.join(", ")}) {
      theme(id: $id) { files(${argumentsList.join(", ")}) { nodes { filename body { __typename ${fragments} } } } }
    }
  `, variables);
  const item = (data?.theme?.files?.nodes || []).find(node => node?.filename === filename);
  return extractTextBody(item?.body);
}

async function writeThemeFile(config, accessToken, themeID, filename, content) {
  const data = await shopifyGraphQL(config, accessToken, `
    mutation KairosNormalizeStagingHomepageV16($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message } }
    }
  `, { themeId: themeID, files: [{ filename, body: { type: "TEXT", value: content } }] });
  const result = data?.themeFilesUpsert || {};
  const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
  if (userErrors.length) throw httpError(409, "staging_normalization_user_error", userErrors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return { upsertedThemeFiles: Array.isArray(result.upsertedThemeFiles) ? result.upsertedThemeFiles : [] };
}

async function introspectType(config, accessToken, name) {
  const data = await shopifyGraphQL(config, accessToken, `
    query KairosIntrospectTypeV16($name: String!) {
      type: __type(name: $name) { kind name possibleTypes { name kind } fields(includeDeprecated: true) { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
    }
  `, { name });
  return data?.type || null;
}

async function readThemes(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `query KairosThemeSnapshotV16 { themes(first: 20) { nodes { id name role processing processingFailed } } }`);
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
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
  const body = await safeJSON(response);
  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Token request returned HTTP ${response.status}.`).slice(0, 500));
  tokenCache.set(key, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 });
  return accessToken;
}
async function shopifyGraphQL(config, accessToken, query, variables = {}) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", String(body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`).slice(0, 1000));
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(409, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return body?.data || {};
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v16");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { raw: text.slice(0, 2000) }; } }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function normalizeError(error) { return { status: Number(error?.status) || 500, code: String(error?.code || "internal_error"), message: String(error?.message || "Unexpected failure.").slice(0, 1500) }; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-v16", "X-Content-Type-Options": "nosniff" } }); }
