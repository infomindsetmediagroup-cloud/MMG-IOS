import app from "./entry.js";

const TOKEN_TIMEOUT_MS = 12000;
const GRAPHQL_TIMEOUT_MS = 12000;
const FALLBACK_API_VERSIONS = ["2026-07", "2026-04", "2026-01", "2025-10"];
const SHOPIFY_RUNTIME_ROUTES = new Set(["/api/theme-plan", "/api/actions"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const config = readShopifyConfig(env);

    if (url.pathname === "/api/shopify-diagnostics") {
      return diagnosticsResponse(config);
    }

    if (SHOPIFY_RUNTIME_ROUTES.has(url.pathname) && !config.ready) {
      return configurationErrorResponse(config);
    }

    const normalized = await normalizeShopifyEnvironment(env, config);
    const response = await app.fetch(request, normalized, ctx);
    return annotateShopifyError(response, normalized, config);
  },
};

function readShopifyConfig(env) {
  const configuredDomain = firstValue(env.SHOPIFY_STORE_DOMAIN, env.SHOPIFY_SHOP_DOMAIN, env.SHOPIFY_DOMAIN).toLowerCase();
  const clientId = firstValue(env.SHOPIFY_CLIENT_ID, env.SHOPIFY_API_KEY, env.SHOPIFY_APP_CLIENT_ID);
  const clientSecret = firstValue(env.SHOPIFY_CLIENT_SECRET, env.SHOPIFY_API_SECRET, env.SHOPIFY_APP_CLIENT_SECRET, env.SHOPIFY_CLIENT_SECRET_KEY);
  const sources = {
    domain: env.SHOPIFY_STORE_DOMAIN ? "SHOPIFY_STORE_DOMAIN" : env.SHOPIFY_SHOP_DOMAIN ? "SHOPIFY_SHOP_DOMAIN" : env.SHOPIFY_DOMAIN ? "SHOPIFY_DOMAIN" : "missing",
    clientId: env.SHOPIFY_CLIENT_ID ? "SHOPIFY_CLIENT_ID" : env.SHOPIFY_API_KEY ? "SHOPIFY_API_KEY" : env.SHOPIFY_APP_CLIENT_ID ? "SHOPIFY_APP_CLIENT_ID" : "missing",
    clientSecret: env.SHOPIFY_CLIENT_SECRET ? "SHOPIFY_CLIENT_SECRET" : env.SHOPIFY_API_SECRET ? "SHOPIFY_API_SECRET" : env.SHOPIFY_APP_CLIENT_SECRET ? "SHOPIFY_APP_CLIENT_SECRET" : env.SHOPIFY_CLIENT_SECRET_KEY ? "SHOPIFY_CLIENT_SECRET_KEY" : "missing",
  };
  return {
    configuredDomain,
    clientId,
    clientSecret,
    sources,
    ready: Boolean(configuredDomain && clientId && clientSecret),
    hasStaticToken: Boolean(String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim()),
  };
}

function firstValue(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

async function normalizeShopifyEnvironment(env, config) {
  const candidates = [...new Set([config.configuredDomain, "themindsetmediagroup.myshopify.com", "07ka8e-qw.myshopify.com"].filter(Boolean))];
  const failures = [];

  for (const requestedDomain of candidates) {
    try {
      const token = await requestClientCredentialsToken(requestedDomain, config.clientId, config.clientSecret);
      const storeDomain = token.resolvedDomain || requestedDomain;
      const apiVersion = await resolveGraphQLVersion(storeDomain, token.accessToken, env.SHOPIFY_API_VERSION);
      return {
        ...env,
        SHOPIFY_STORE_DOMAIN: storeDomain,
        SHOPIFY_ADMIN_ACCESS_TOKEN: token.accessToken,
        SHOPIFY_API_VERSION: apiVersion,
        SHOPIFY_CLIENT_ID: "",
        SHOPIFY_CLIENT_SECRET: "",
        SHOPIFY_CONNECTION_ENDPOINT: `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
        SHOPIFY_AUTH_SOURCE: `${config.sources.clientId}+${config.sources.clientSecret}`,
      };
    } catch (error) {
      failures.push(`${requestedDomain}: ${error instanceof Error ? error.message : "authentication failed"}`);
    }
  }

  return {
    ...env,
    SHOPIFY_ADMIN_ACCESS_TOKEN: "",
    SHOPIFY_CLIENT_ID: "",
    SHOPIFY_CLIENT_SECRET: "",
    SHOPIFY_CONNECTION_ERROR: failures.join(" | ").slice(0, 1800),
    SHOPIFY_AUTH_SOURCE: `${config.sources.clientId}+${config.sources.clientSecret}`,
  };
}

async function requestClientCredentialsToken(storeDomain, clientId, clientSecret) {
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    redirect: "follow",
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || typeof body?.access_token !== "string" || !body.access_token.trim()) {
    const detail = body?.error_description || body?.error || text || `token endpoint returned HTTP ${response.status}`;
    throw new Error(`HTTP ${response.status}: ${String(detail).slice(0, 350)}`);
  }
  let resolvedDomain = storeDomain;
  try {
    const hostname = new URL(response.url).hostname.toLowerCase();
    if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hostname)) resolvedDomain = hostname;
  } catch {}
  return { accessToken: body.access_token.trim(), scope: String(body?.scope || ""), resolvedDomain };
}

async function resolveGraphQLVersion(storeDomain, accessToken, configuredVersion) {
  const versions = [...new Set([String(configuredVersion || "").trim(), ...FALLBACK_API_VERSIONS].filter(Boolean))];
  const failures = [];
  for (const version of versions) {
    const endpoint = `https://${storeDomain}/admin/api/${version}/graphql.json`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: "query KairosConnectionProbe { shop { id name myshopifyDomain } }" }),
      signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    if (response.status === 404) {
      failures.push(`${version}: HTTP 404${text ? ` ${text.slice(0, 180).replace(/\s+/g, " ")}` : ""}`);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      const detail = body?.errors?.[0]?.message || text || `GraphQL authorization failed with HTTP ${response.status}`;
      throw new Error(String(detail).slice(0, 500));
    }
    if (response.ok) return version;
    const detail = body?.errors?.[0]?.message || text || `GraphQL probe failed with HTTP ${response.status}`;
    throw new Error(String(detail).slice(0, 500));
  }
  throw new Error(`GraphQL probe failed at https://${storeDomain}/admin/api/{version}/graphql.json — ${failures.join(" | ").slice(0, 1100)}`);
}

function diagnosticsResponse(config) {
  return jsonResponse({
    status: config.ready ? "configured" : "missing_configuration",
    domainConfigured: Boolean(config.configuredDomain),
    clientIdConfigured: Boolean(config.clientId),
    clientSecretConfigured: Boolean(config.clientSecret),
    staticTokenConfigured: config.hasStaticToken,
    variableSources: config.sources,
    configuredDomain: config.configuredDomain || null,
    requiredCanonicalNames: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
    checkedAt: new Date().toISOString(),
  }, config.ready ? 200 : 503);
}

function configurationErrorResponse(config) {
  const missing = [];
  if (!config.configuredDomain) missing.push("SHOPIFY_STORE_DOMAIN");
  if (!config.clientId) missing.push("SHOPIFY_CLIENT_ID");
  if (!config.clientSecret) missing.push("SHOPIFY_CLIENT_SECRET");
  return jsonResponse({
    error: {
      code: "shopify_client_credentials_missing",
      message: `Kairos cannot use the Shopify Dev Dashboard app because ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not available to the deployed Worker. A static Admin token is not accepted for this connection.`,
      configuredSources: config.sources,
      requestID: crypto.randomUUID(),
    },
  }, 503);
}

async function annotateShopifyError(response, env, config) {
  if (response.ok || !String(response.headers.get("content-type") || "").includes("application/json")) return response;
  let body;
  try { body = await response.clone().json(); } catch { return response; }
  const code = body?.error?.code;
  if (!code || !String(code).startsWith("shopify_")) return response;
  const endpoint = env.SHOPIFY_CONNECTION_ENDPOINT || (env.SHOPIFY_CONNECTION_ERROR ? `Connection failed: ${env.SHOPIFY_CONNECTION_ERROR}` : `Configuration sources: ${JSON.stringify(config.sources)}`);
  body.error.message = `${body.error.message} Endpoint: ${endpoint}`.slice(0, 1800);
  return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
