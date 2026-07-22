const BUILD = "kairos-shopify-auth-20260722-1";
const DEFAULT_TOKEN_LIFETIME_SECONDS = 86399;
const REFRESH_MARGIN_SECONDS = 300;
const tokenCache = new Map();
const inflight = new Map();

export async function getShopifyAdminAccessToken(env = {}) {
  const staticToken = clean(env.SHOPIFY_ADMIN_ACCESS_TOKEN);
  if (staticToken) {
    return {
      accessToken: staticToken,
      source: "STATIC_ADMIN_TOKEN",
      expiresAt: null,
      scope: null,
      build: BUILD,
    };
  }

  const shop = normalizeShop(env.SHOPIFY_STORE_DOMAIN);
  const clientId = clean(env.SHOPIFY_CLIENT_ID);
  const clientSecret = clean(env.SHOPIFY_CLIENT_SECRET);
  if (!shop || !clientId || !clientSecret) {
    throw authError(
      "shopify_credentials_unavailable",
      "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required when SHOPIFY_ADMIN_ACCESS_TOKEN is not configured.",
      503,
    );
  }

  const cacheKey = `${shop}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.refreshAfter > Date.now()) return cached;

  if (!inflight.has(cacheKey)) {
    inflight.set(cacheKey, exchangeClientCredentials(shop, clientId, clientSecret)
      .then((token) => {
        tokenCache.set(cacheKey, token);
        return token;
      })
      .finally(() => inflight.delete(cacheKey)));
  }
  return inflight.get(cacheKey);
}

export function inspectShopifyAuthConfiguration(env = {}) {
  const staticTokenConfigured = Boolean(clean(env.SHOPIFY_ADMIN_ACCESS_TOKEN));
  const clientIdConfigured = Boolean(clean(env.SHOPIFY_CLIENT_ID));
  const clientSecretConfigured = Boolean(clean(env.SHOPIFY_CLIENT_SECRET));
  return {
    staticTokenConfigured,
    clientIdConfigured,
    clientSecretConfigured,
    clientCredentialsConfigured: clientIdConfigured && clientSecretConfigured,
    authenticationConfigured: staticTokenConfigured || (clientIdConfigured && clientSecretConfigured),
    preferredMode: clientIdConfigured && clientSecretConfigured ? "CLIENT_CREDENTIALS" : staticTokenConfigured ? "STATIC_ADMIN_TOKEN" : "UNCONFIGURED",
    build: BUILD,
  };
}

async function exchangeClientCredentials(shop, clientId, clientSecret) {
  const endpoint = `https://${shop}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body,
    });
  } catch (caught) {
    throw authError(
      "shopify_token_exchange_unreachable",
      caught instanceof Error ? caught.message : "Shopify token endpoint could not be reached.",
      502,
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const detail = payload?.error_description || payload?.error || payload?.message || `HTTP ${response.status}`;
    throw authError("shopify_token_exchange_failed", `Shopify client-credentials exchange failed: ${detail}.`, 502);
  }

  const expiresIn = normalizeExpiresIn(payload.expires_in);
  const obtainedAt = Date.now();
  const expiresAtMs = obtainedAt + expiresIn * 1000;
  const refreshAfterMs = Math.max(obtainedAt, expiresAtMs - REFRESH_MARGIN_SECONDS * 1000);
  return {
    accessToken: String(payload.access_token),
    scope: String(payload.scope || ""),
    source: "CLIENT_CREDENTIALS",
    obtainedAt: new Date(obtainedAt).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    refreshAfter: refreshAfterMs,
    build: BUILD,
  };
}

function normalizeShop(value) {
  return clean(value).replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
}

function normalizeExpiresIn(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > REFRESH_MARGIN_SECONDS
    ? Math.floor(parsed)
    : DEFAULT_TOKEN_LIFETIME_SECONDS;
}

function clean(value) {
  return String(value || "").trim();
}

function authError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
