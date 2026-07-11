import app from "./entry.js";

const TOKEN_TIMEOUT_MS = 12000;

export default {
  async fetch(request, env, ctx) {
    const normalized = await normalizeShopifyEnvironment(env);
    return app.fetch(request, normalized, ctx);
  },
};

async function normalizeShopifyEnvironment(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();

  if (!storeDomain || !clientId || !clientSecret) return env;

  try {
    const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
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

    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body?.access_token !== "string" || !body.access_token.trim()) return env;

    const accessToken = body.access_token.trim();
    const canonicalDomain = canonicalShopDomainFromToken(accessToken) || storeDomain;

    return {
      ...env,
      SHOPIFY_STORE_DOMAIN: canonicalDomain,
      SHOPIFY_ADMIN_ACCESS_TOKEN: accessToken,
      SHOPIFY_CLIENT_ID: "",
      SHOPIFY_CLIENT_SECRET: "",
    };
  } catch {
    return env;
  }
}

function canonicalShopDomainFromToken(token) {
  const parts = String(token).split(".");
  if (parts.length < 2) return "";

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    for (const candidate of [payload?.dest, payload?.iss, payload?.shop, payload?.shop_domain]) {
      const domain = normalizeShopDomain(candidate);
      if (domain) return domain;
    }
  } catch {}

  return "";
}

function decodeBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function normalizeShopDomain(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  let hostname = value.trim().toLowerCase();
  try {
    hostname = new URL(hostname.includes("://") ? hostname : `https://${hostname}`).hostname;
  } catch {
    return "";
  }

  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hostname) ? hostname : "";
}
