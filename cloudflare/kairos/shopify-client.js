const tokenCache = new Map();
const installationCache = new Map();

const INSTALLATION_QUERY = `query KairosShopifyInstallationVerification {
  shop {
    id
    name
    myshopifyDomain
  }
  currentAppInstallation {
    id
    accessScopes {
      handle
    }
  }
}`;

export class ShopifyAdminClient {
  constructor(env, fetchImpl = fetch) {
    this.env = env || {};
    this.fetchImpl = fetchImpl;
    this.storeDomain = normalizeStoreDomain(this.env.SHOPIFY_STORE_DOMAIN);
    this.apiVersion = String(this.env.SHOPIFY_ADMIN_API_VERSION || "2026-07").trim();
  }

  async verifyInstallation({ fresh = false } = {}) {
    const cacheKey = `${this.storeDomain}:${this.apiVersion}`;
    const cached = installationCache.get(cacheKey);
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;

    const data = await this.requestRaw(INSTALLATION_QUERY, {});
    const shop = data?.shop;
    const installation = data?.currentAppInstallation;
    if (!shop?.id || !installation?.id) {
      throw new ShopifyRuntimeError(
        "SHOPIFY_INSTALLATION_NOT_VERIFIED",
        "Shopify did not return the current app installation.",
        502,
      );
    }

    const value = Object.freeze({
      shop: Object.freeze({
        id: shop.id,
        name: shop.name,
        myshopifyDomain: shop.myshopifyDomain,
      }),
      installationId: installation.id,
      scopes: Object.freeze((installation.accessScopes || []).map((scope) => scope.handle).sort()),
      verifiedAt: new Date().toISOString(),
    });
    installationCache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
    return value;
  }

  async assertScopeGroups(scopeGroups) {
    if (!Array.isArray(scopeGroups) || scopeGroups.length === 0) return this.verifyInstallation();
    const installation = await this.verifyInstallation();
    const granted = new Set(installation.scopes);
    const missing = scopeGroups.filter((group) => !group.some((scope) => granted.has(scope)));
    if (missing.length) {
      throw new ShopifyRuntimeError(
        "SHOPIFY_SCOPE_MISSING",
        `The Kairos app lacks required Shopify scope group(s): ${missing.map((g) => g.join(" or ")).join("; ")}`,
        403,
        { grantedScopes: installation.scopes },
      );
    }
    return installation;
  }

  async request(query, variables = {}) {
    return this.requestRaw(query, variables);
  }

  async requestRaw(query, variables) {
    const accessToken = await this.getAccessToken();
    const endpoint = `https://${this.storeDomain}/admin/api/${this.apiVersion}/graphql.json`;
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
        "User-Agent": "MMG-Kairos-Cloudflare/1.0",
      },
      body: JSON.stringify({ query, variables }),
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ShopifyRuntimeError(
        "SHOPIFY_INVALID_RESPONSE",
        `Shopify returned a non-JSON response (${response.status}).`,
        502,
      );
    }

    if (!response.ok) {
      throw new ShopifyRuntimeError(
        "SHOPIFY_HTTP_ERROR",
        `Shopify Admin API request failed with status ${response.status}.`,
        response.status,
        sanitizeErrors(payload?.errors),
      );
    }
    if (Array.isArray(payload?.errors) && payload.errors.length) {
      throw new ShopifyRuntimeError(
        "SHOPIFY_GRAPHQL_ERROR",
        "Shopify rejected the GraphQL operation.",
        400,
        sanitizeErrors(payload.errors),
      );
    }
    return payload?.data || {};
  }

  async getAccessToken() {
    const staticToken = optionalSecret(this.env.SHOPIFY_ADMIN_ACCESS_TOKEN);
    if (staticToken) return staticToken;

    const clientId = optionalSecret(this.env.SHOPIFY_CLIENT_ID);
    const clientSecret = optionalSecret(this.env.SHOPIFY_CLIENT_SECRET);
    if (!clientId || !clientSecret) {
      throw new ShopifyRuntimeError(
        "SHOPIFY_CREDENTIALS_MISSING",
        "Configure SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Cloudflare secrets.",
        503,
      );
    }

    const cacheKey = `${this.storeDomain}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

    const response = await this.fetchImpl(`https://${this.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) {
      throw new ShopifyRuntimeError(
        "SHOPIFY_TOKEN_EXCHANGE_FAILED",
        `Shopify client-credentials exchange failed with status ${response.status}.`,
        502,
        sanitizeErrors(payload?.errors || payload?.error_description || payload?.error),
      );
    }

    const expiresIn = Number(payload.expires_in || 86_400);
    tokenCache.set(cacheKey, {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Math.max(300, expiresIn) * 1000,
    });
    return payload.access_token;
  }
}

export function normalizeStoreDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    throw new ShopifyRuntimeError(
      "SHOPIFY_STORE_DOMAIN_MISSING",
      "SHOPIFY_STORE_DOMAIN is not configured.",
      503,
    );
  }
  const withoutProtocol = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(withoutProtocol)) {
    throw new ShopifyRuntimeError(
      "SHOPIFY_STORE_DOMAIN_INVALID",
      "SHOPIFY_STORE_DOMAIN must be the store's exact *.myshopify.com domain.",
      400,
    );
  }
  return withoutProtocol;
}

function optionalSecret(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function sanitizeErrors(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) => ({
      message: String(entry?.message || entry).slice(0, 500),
      path: Array.isArray(entry?.path) ? entry.path : undefined,
    }));
  }
  return String(value).slice(0, 500);
}

export class ShopifyRuntimeError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = "ShopifyRuntimeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
