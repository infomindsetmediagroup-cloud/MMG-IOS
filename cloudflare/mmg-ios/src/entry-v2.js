import app from "./entry.js";

const TOKEN_TIMEOUT_MS = 12000;
const LEGACY_SHOP_DOMAIN = "07ka8e-qw.myshopify.com";

export default {
  async fetch(request, env, ctx) {
    try {
      const normalized = await normalizeShopifyEnvironment(env);
      return app.fetch(request, normalized, ctx);
    } catch (error) {
      const url = new URL(request.url);
      if (["/api/theme-plan", "/api/actions"].includes(url.pathname)) {
        return jsonError(error);
      }
      return app.fetch(request, env, ctx);
    }
  },
};

async function normalizeShopifyEnvironment(env) {
  const configuredDomain = normalizeShopDomain(env.SHOPIFY_STORE_DOMAIN);
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) return env;

  const candidates = [...new Set([configuredDomain, LEGACY_SHOP_DOMAIN].filter(Boolean))];
  const failures = [];

  for (const storeDomain of candidates) {
    try {
      const token = await requestClientCredentialsToken(storeDomain, clientId, clientSecret);
      return {
        ...env,
        SHOPIFY_STORE_DOMAIN: storeDomain,
        SHOPIFY_ADMIN_ACCESS_TOKEN: token.accessToken,
        SHOPIFY_CLIENT_ID: "",
        SHOPIFY_CLIENT_SECRET: "",
        SHOPIFY_AUTH_SOURCE: "client_credentials",
        SHOPIFY_GRANTED_SCOPES: token.scope,
      };
    } catch (error) {
      failures.push(`${storeDomain}: ${error instanceof Error ? error.message : "token request failed"}`);
    }
  }

  throw shopifyError(
    "shopify_installation_domain_unresolved",
    `Kairos could not obtain a Shopify access token from any known installation domain. ${failures.join(" | ")}`,
    401,
  );
}

async function requestClientCredentialsToken(storeDomain, clientId, clientSecret) {
  let response;
  try {
    response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw shopifyError(
      timedOut ? "shopify_token_timeout" : "shopify_token_connection_failed",
      timedOut ? "Shopify did not answer the token request before timeout." : "Cloudflare could not reach Shopify's token endpoint.",
      timedOut ? 504 : 502,
    );
  }

  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }

  if (!response.ok) {
    const description = typeof body?.error_description === "string"
      ? body.error_description
      : typeof body?.error === "string"
        ? body.error
        : `Shopify token endpoint returned HTTP ${response.status}.`;
    throw shopifyError("shopify_token_request_failed", description, response.status === 429 ? 429 : 401);
  }

  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  const scope = typeof body?.scope === "string" ? body.scope : "";
  if (!accessToken) throw shopifyError("shopify_token_response_invalid", "Shopify returned no access token.", 502);

  return { accessToken, scope };
}

function normalizeShopDomain(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  let hostname = value.trim().toLowerCase();
  try { hostname = new URL(hostname.includes("://") ? hostname : `https://${hostname}`).hostname; }
  catch { return ""; }
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hostname) ? hostname : "";
}

function shopifyError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function jsonError(error) {
  return new Response(JSON.stringify({
    error: {
      code: typeof error?.code === "string" ? error.code : "shopify_authentication_failed",
      message: error instanceof Error ? error.message : "Kairos could not authenticate with Shopify.",
      requestID: crypto.randomUUID(),
    },
  }), {
    status: Number.isInteger(error?.status) ? error.status : 502,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-MMG-Runtime": "cloudflare-native",
      "X-MMG-Shopify-Auth": "client-credentials-domain-resolution",
    },
  });
}
