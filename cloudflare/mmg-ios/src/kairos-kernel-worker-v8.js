import kernel from "./kairos-kernel-worker-v7.js";

const BUILD = "kairos-kernel-20260712-8";
const SHOPIFY_TIMEOUT_MS = 20_000;
const tokenCache = new Map();
const TARGET_FILES = [
  "layout/theme.liquid",
  "templates/index.json",
  "config/settings_data.json",
  "sections/header-group.json",
  "sections/footer-group.json",
  "assets/base.css",
  "assets/theme.css",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/source/inspect") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return inspectStagingSource(env);
    }

    const response = await kernel.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-v8");

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v8";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyStagingCreation: "verified",
        shopifyStagingSourceInspection: "available-read-only",
        shopifyThemePlanning: "locked-pending-source-inspection",
      };
      return json(body, response.status);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

async function inspectStagingSource(env) {
  const startedAt = new Date().toISOString();
  const actionID = crypto.randomUUID();

  try {
    const config = readShopifyConfig(env);
    const auth = await resolveAccessToken(config, env);
    const themes = await readThemes(config, auth.accessToken);
    const mainTheme = themes.find(theme => theme.role === "MAIN") || null;
    const stagingTheme = themes.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === "kairos staging") || null;

    if (!mainTheme) throw httpError(409, "main_theme_not_found", "The published main theme could not be verified.");
    if (!stagingTheme) throw httpError(409, "staging_theme_not_found", "The verified Kairos Staging theme was not found.");
    if (stagingTheme.processing) throw httpError(409, "staging_theme_processing", "Kairos Staging is still processing.");
    if (stagingTheme.processingFailed) throw httpError(409, "staging_theme_processing_failed", "Shopify reports that Kairos Staging failed processing.");

    const contract = await inspectThemeFileContract(config, auth.accessToken);
    const source = await readThemeFiles(config, auth.accessToken, stagingTheme.gid, contract);
    const files = [];

    for (const item of source) {
      const content = extractTextBody(item.body);
      files.push({
        filename: String(item.filename || ""),
        bodyType: String(item.body?.__typename || "unknown"),
        readable: typeof content === "string",
        bytes: typeof content === "string" ? new TextEncoder().encode(content).length : 0,
        sha256: typeof content === "string" ? await sha256(content) : "",
        content: typeof content === "string" ? content : null,
      });
    }

    const found = new Set(files.map(file => file.filename));
    const missing = TARGET_FILES.filter(filename => !found.has(filename));
    const readableFiles = files.filter(file => file.readable);

    return json({
      actionID,
      actionType: "shopify.staging.source.inspect",
      status: readableFiles.length ? "completed" : "needs-attention",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v8",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: readableFiles.length
        ? `Kairos read ${readableFiles.length} text source file${readableFiles.length === 1 ? "" : "s"} from the non-live staging theme.`
        : "Kairos reached the staging theme, but no readable text source files were returned.",
      evidence: {
        credentialPath: auth.source,
        storeDomain: config.storeDomain,
        apiVersion: config.apiVersion,
        mainTheme,
        stagingTheme,
        requestedFiles: TARGET_FILES,
        returnedFileCount: files.length,
        readableFileCount: readableFiles.length,
        missingFiles: missing,
        contract,
        files,
      },
    }, readableFiles.length ? 200 : 409);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      actionID,
      actionType: "shopify.staging.source.inspect",
      status: "needs-attention",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v8",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Kairos could not inspect the staging-theme source graph.",
      error: normalized,
    }, normalized.status);
  }
}

async function inspectThemeFileContract(config, accessToken) {
  const root = await shopifyGraphQL(config, accessToken, `
    query KairosThemeFileRootContract {
      queryRoot: __type(name: "QueryRoot") {
        fields(includeDeprecated: true) {
          name
          args { name type { ...TypeRef } }
          type { ...TypeRef }
        }
      }
      themeType: __type(name: "OnlineStoreTheme") {
        fields(includeDeprecated: true) {
          name
          args { name type { ...TypeRef } }
          type { ...TypeRef }
        }
      }
    }
    fragment TypeRef on __Type {
      kind name ofType { kind name ofType { kind name ofType { kind name } } }
    }
  `);

  const queryTheme = (root?.queryRoot?.fields || []).find(field => field?.name === "theme");
  const filesField = (root?.themeType?.fields || []).find(field => field?.name === "files");
  if (!queryTheme) throw httpError(409, "theme_query_unavailable", "Shopify did not expose QueryRoot.theme.");
  if (!filesField) throw httpError(409, "theme_files_unavailable", "Shopify did not expose OnlineStoreTheme.files.");

  const connectionType = namedType(filesField.type);
  const connection = await introspectType(config, accessToken, connectionType);
  const nodesField = (connection?.fields || []).find(field => field?.name === "nodes");
  if (!nodesField) throw httpError(409, "theme_file_nodes_unavailable", `The ${connectionType} type does not expose nodes.`);

  const nodeType = namedType(nodesField.type);
  const node = await introspectType(config, accessToken, nodeType);
  const filenameField = (node?.fields || []).find(field => field?.name === "filename");
  const bodyField = (node?.fields || []).find(field => field?.name === "body");
  if (!filenameField || !bodyField) throw httpError(409, "theme_file_shape_unavailable", `The ${nodeType} type does not expose filename and body.`);

  const bodyType = namedType(bodyField.type);
  const body = await introspectType(config, accessToken, bodyType);
  const bodyVariants = [];
  for (const possible of body?.possibleTypes || []) {
    const detail = await introspectType(config, accessToken, possible.name);
    const textField = (detail?.fields || []).find(field => {
      const typeName = namedType(field.type);
      return ["content", "value", "text"].includes(field.name) && typeName === "String";
    });
    bodyVariants.push({ typeName: possible.name, textField: textField?.name || "" });
  }

  const readableVariants = bodyVariants.filter(item => item.textField);
  if (!readableVariants.length) throw httpError(409, "theme_file_text_body_unavailable", `The ${bodyType} body type exposes no readable text variant.`);

  return {
    themeQueryArguments: (queryTheme.args || []).map(arg => ({ name: arg.name, type: formatType(arg.type) })),
    filesArguments: (filesField.args || []).map(arg => ({ name: arg.name, type: formatType(arg.type) })),
    connectionType,
    nodeType,
    bodyType,
    bodyVariants,
    readableVariants,
  };
}

async function introspectType(config, accessToken, name) {
  const data = await shopifyGraphQL(config, accessToken, `
    query KairosIntrospectType($name: String!) {
      type: __type(name: $name) {
        kind name
        possibleTypes { name kind }
        fields(includeDeprecated: true) {
          name
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        }
      }
    }
  `, { name });
  return data?.type || null;
}

async function readThemeFiles(config, accessToken, themeID, contract) {
  const fileArgs = new Set(contract.filesArguments.map(arg => arg.name));
  const variableDefs = ["$id: ID!", "$filenames: [String!]!"];
  const argumentsList = ["filenames: $filenames"];
  if (fileArgs.has("first")) {
    variableDefs.push("$first: Int!");
    argumentsList.push("first: $first");
  }

  const fragments = contract.readableVariants
    .map(item => `... on ${item.typeName} { ${item.textField} }`)
    .join("\n");

  const query = `
    query KairosReadStagingFiles(${variableDefs.join(", ")}) {
      theme(id: $id) {
        id name role
        files(${argumentsList.join(", ")}) {
          nodes {
            filename
            body {
              __typename
              ${fragments}
            }
          }
        }
      }
    }
  `;

  const variables = { id: themeID, filenames: TARGET_FILES };
  if (fileArgs.has("first")) variables.first = TARGET_FILES.length;
  const data = await shopifyGraphQL(config, accessToken, query, variables);
  return Array.isArray(data?.theme?.files?.nodes) ? data.theme.files.nodes : [];
}

function extractTextBody(body) {
  if (!body || typeof body !== "object") return null;
  for (const key of ["content", "value", "text"]) {
    if (typeof body[key] === "string") return body[key];
  }
  return null;
}

async function readThemes(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `query KairosThemeSnapshot { themes(first: 20) { nodes { id name role processing processingFailed } } }`);
  return Array.isArray(data?.themes?.nodes) ? data.themes.nodes.map(normalizeTheme) : [];
}

function normalizeTheme(theme) {
  const gid = String(theme?.id || "");
  return { id: gid.match(/OnlineStoreTheme\/(\d+)$/)?.[1] || "", gid, name: String(theme?.name || "Unnamed theme"), role: String(theme?.role || "UNKNOWN").toUpperCase(), processing: Boolean(theme?.processing), processingFailed: Boolean(theme?.processingFailed) };
}

function namedType(type) { let current = type; while (current?.ofType) current = current.ofType; return current?.name || ""; }
function formatType(type) { if (!type) return "unknown"; if (type.kind === "NON_NULL") return `${formatType(type.ofType)}!`; if (type.kind === "LIST") return `[${formatType(type.ofType)}]`; return type.name || type.kind || "unknown"; }
async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function readShopifyConfig(env) { const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase(); const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim(); if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN is missing or invalid."); return { storeDomain, apiVersion }; }
async function resolveAccessToken(config, env) { const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim(); const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim(); const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(); if (clientId && clientSecret) return { accessToken: await getClientCredentialsToken(config.storeDomain, clientId, clientSecret), source: "client-credentials" }; if (staticToken) return { accessToken: staticToken, source: "admin-access-token" }; throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured."); }
async function getClientCredentialsToken(storeDomain, clientId, clientSecret) { const key = `${storeDomain}:${clientId}`; const cached = tokenCache.get(key); if (cached?.expiresAt > Date.now()) return cached.accessToken; const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const body = await safeJSON(response); const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : ""; if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Token request returned HTTP ${response.status}.`).slice(0, 500)); tokenCache.set(key, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 }); return accessToken; }
async function shopifyGraphQL(config, accessToken, query, variables = {}) { const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const body = await safeJSON(response); if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", `Shopify Admin GraphQL returned HTTP ${response.status}.`); if (Array.isArray(body?.errors) && body.errors.length) throw httpError(502, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1500)); if (!body?.data) throw httpError(502, "shopify_graphql_empty_data", "Shopify Admin GraphQL returned no data."); return body.data; }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function normalizeError(error) { return { status: Number.isInteger(error?.status) ? error.status : 500, code: typeof error?.code === "string" ? error.code : "staging_source_inspection_failed", message: error instanceof Error ? error.message : "Staging source inspection failed." }; }
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1500) }; } }
function methodNotAllowed(allow) { const response = json({ error: { code: "method_not_allowed", message: "Method not allowed." }, build: BUILD }, 405); response.headers.set("Allow", allow); return response; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-v8", "X-Content-Type-Options": "nosniff" } }); }
