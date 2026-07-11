import app from "./entry.js";

const TOKEN_TIMEOUT_MS = 12000;
const GRAPHQL_TIMEOUT_MS = 12000;
const FALLBACK_API_VERSIONS = ["2026-07", "2026-04", "2026-01", "2025-10"];

export default {
  async fetch(request, env, ctx) {
    const normalized = await normalizeShopifyEnvironment(env);
    const response = await app.fetch(request, normalized, ctx);
    return annotateShopifyError(response, normalized);
  },
};

async function normalizeShopifyEnvironment(env) {
  const configuredDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (!configuredDomain || !clientId || !clientSecret) return env;

  const candidates = [...new Set([configuredDomain, "07ka8e-qw.myshopify.com"])];
  const failures = [];

  for (const requestedDomain of candidates) {
    try {
      const token = await requestClientCredentialsToken(requestedDomain, clientId, clientSecret);
      const storeDomain = token.resolvedDomain || requestedDomain;
      const apiVersion = await resolveGraphQLVersion(storeDomain, token.accessToken, env.SHOPIFY_API_VERSION);
      if (!apiVersion) {
        failures.push(`${storeDomain}: GraphQL Admin API returned 404 for every supported version attempted`);
        continue;
      }
      return {
        ...env,
        SHOPIFY_STORE_DOMAIN: storeDomain,
        SHOPIFY_ADMIN_ACCESS_TOKEN: token.accessToken,
        SHOPIFY_API_VERSION: apiVersion,
        SHOPIFY_CLIENT_ID: "",
        SHOPIFY_CLIENT_SECRET: "",
        SHOPIFY_CONNECTION_ENDPOINT: `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
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
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.access_token !== "string" || !body.access_token.trim()) {
    const detail = body?.error_description || body?.error || `token endpoint returned HTTP ${response.status}`;
    throw new Error(String(detail));
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
      const detail = body?.errors?.[0]?.message || `GraphQL authorization failed with HTTP ${response.status}`;
      throw new Error(String(detail));
    }
    if (response.ok) return version;
    const detail = body?.errors?.[0]?.message || text || `GraphQL probe failed with HTTP ${response.status}`;
    throw new Error(String(detail).slice(0, 500));
  }
  throw new Error(`GraphQL probe failed at https://${storeDomain}/admin/api/{version}/graphql.json — ${failures.join(" | ").slice(0, 1100)}`);
}

async function annotateShopifyError(response, env) {
  if (response.ok || !String(response.headers.get("content-type") || "").includes("application/json")) return response;
  let body;
  try { body = await response.clone().json(); } catch { return response; }
  const code = body?.error?.code;
  if (!code || !String(code).startsWith("shopify_")) return response;
  const endpoint = env.SHOPIFY_CONNECTION_ENDPOINT || (env.SHOPIFY_CONNECTION_ERROR ? `Connection failed: ${env.SHOPIFY_CONNECTION_ERROR}` : "Shopify endpoint unavailable");
  body.error.message = `${body.error.message} Endpoint: ${endpoint}`.slice(0, 1800);
  return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
}
