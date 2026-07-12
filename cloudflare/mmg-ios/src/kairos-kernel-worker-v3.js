import kernel from "./kairos-kernel-worker.js";

const BUILD = "kairos-kernel-20260712-3";
const SHOPIFY_TIMEOUT_MS = 20_000;
const tokenCache = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/readiness") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return inspectStagingReadiness(env);
    }

    const response = await kernel.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-v3");

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v3";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyConnectionValidation: "validated-read-only",
        shopifyStagingReadiness: "available-read-only",
        shopifyThemePlanning: "locked-pending-staging-theme",
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

async function inspectStagingReadiness(env) {
  const startedAt = new Date().toISOString();
  const actionID = crypto.randomUUID();

  try {
    const config = readShopifyConfig(env);
    const auth = await resolveAccessToken(config, env);
    const data = await shopifyGraphQL(config, auth.accessToken, `
      query KairosStagingReadiness {
        mutationType: __type(name: "Mutation") {
          fields(includeDeprecated: true) {
            name
            description
            isDeprecated
            deprecationReason
            args {
              name
              description
              defaultValue
              type { ...TypeRef }
            }
            type { ...TypeRef }
          }
        }
        themes(first: 20) {
          nodes { id name role processing processingFailed }
        }
      }
      fragment TypeRef on __Type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType { kind name }
          }
        }
      }
    `);

    const fields = Array.isArray(data?.mutationType?.fields) ? data.mutationType.fields : [];
    const themeMutations = fields
      .filter(field => /theme/i.test(String(field?.name || "")))
      .map(field => ({
        name: field.name,
        description: field.description || "",
        deprecated: Boolean(field.isDeprecated),
        deprecationReason: field.deprecationReason || "",
        arguments: Array.isArray(field.args) ? field.args.map(arg => ({
          name: arg.name,
          description: arg.description || "",
          defaultValue: arg.defaultValue,
          type: formatType(arg.type),
        })) : [],
        returnType: formatType(field.type),
      }));

    const themes = Array.isArray(data?.themes?.nodes) ? data.themes.nodes.map(normalizeTheme) : [];
    const mainTheme = themes.find(theme => theme.role === "MAIN") || null;
    const nonLiveThemes = themes.filter(theme => theme.role !== "MAIN");
    const candidates = themeMutations.filter(field => /(create|duplicate|copy|clone)/i.test(field.name));

    return json({
      actionID,
      actionType: "shopify.staging.readiness.inspect",
      status: candidates.length ? "completed" : "needs-attention",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v3",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: candidates.length
        ? "Shopify schema inspection found one or more candidate staging-theme creation operations."
        : "Shopify schema inspection completed, but no theme creation or duplication mutation was exposed.",
      evidence: {
        credentialPath: auth.source,
        storeDomain: config.storeDomain,
        apiVersion: config.apiVersion,
        mainTheme,
        nonLiveThemes,
        candidateMutations: candidates,
        allThemeMutations: themeMutations,
      },
    }, candidates.length ? 200 : 409);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      actionID,
      actionType: "shopify.staging.readiness.inspect",
      status: "needs-attention",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v3",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Shopify staging-theme readiness inspection failed.",
      error: normalized,
    }, normalized.status);
  }
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    throw httpError(503, "shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN is missing or invalid.");
  }
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) {
    throw httpError(503, "shopify_invalid_version", "SHOPIFY_API_VERSION is invalid.");
  }
  return { storeDomain, apiVersion };
}

async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (clientId && clientSecret) {
    return { accessToken: await getClientCredentialsToken(config.storeDomain, clientId, clientSecret), source: "client-credentials" };
  }
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
  if (!response.ok || !accessToken) {
    throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Token request returned HTTP ${response.status}.`).slice(0, 500));
  }
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
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", `Shopify Admin GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) {
    throw httpError(502, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  }
  if (!body?.data) throw httpError(502, "shopify_graphql_empty_data", "Shopify Admin GraphQL returned no data.");
  return body.data;
}

function formatType(type) {
  if (!type) return "unknown";
  if (type.kind === "NON_NULL") return `${formatType(type.ofType)}!`;
  if (type.kind === "LIST") return `[${formatType(type.ofType)}]`;
  return type.name || type.kind || "unknown";
}

function normalizeTheme(theme) {
  const gid = String(theme?.id || "");
  return {
    id: gid.match(/OnlineStoreTheme\/(\d+)$/)?.[1] || "",
    gid,
    name: String(theme?.name || "Unnamed theme"),
    role: String(theme?.role || "UNKNOWN").toUpperCase(),
    processing: Boolean(theme?.processing),
    processingFailed: Boolean(theme?.processingFailed),
  };
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeError(error) {
  return {
    status: Number.isInteger(error?.status) ? error.status : 500,
    code: typeof error?.code === "string" ? error.code : "staging_readiness_failed",
    message: error instanceof Error ? error.message : "Staging readiness inspection failed.",
  };
}

async function safeJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; }
}

function methodNotAllowed(allow) {
  const response = json({ error: { code: "method_not_allowed", message: "Method not allowed." }, build: BUILD }, 405);
  response.headers.set("Allow", allow);
  return response;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-v3",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
