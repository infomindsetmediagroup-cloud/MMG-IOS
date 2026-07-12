const BUILD = "kairos-kernel-20260712-2";
const STOREFRONT_TIMEOUT_MS = 15_000;
const SHOPIFY_TIMEOUT_MS = 20_000;
const tokenCache = new Map();

const CAPABILITIES = Object.freeze({
  commandCenterShell: "available",
  runtimeHealth: "operational",
  capabilityRegistry: "operational",
  storefrontInspection: "validation-required",
  shopifyConnectionValidation: "available-read-only",
  shopifyThemePlanning: "locked-pending-connection-validation",
  shopifyThemeMutation: "locked-pending-staging-adapter",
  productPublishing: "not-implemented",
  collectionPublishing: "not-implemented",
  navigationPublishing: "not-implemented",
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        status: "ok",
        runtime: "cloudflare-workers",
        kernel: "standalone",
        build: BUILD,
        operationalMode: "controlled-rebuild",
        capabilities: CAPABILITIES,
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/capabilities") {
      return json({
        build: BUILD,
        kernel: "standalone",
        operationalMode: "controlled-rebuild",
        capabilities: CAPABILITIES,
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/storefront/inspect") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return inspectStorefront(env);
    }

    if (url.pathname === "/api/shopify/connection/validate") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return validateShopifyConnection(env);
    }

    if (url.pathname === "/api/shopify/theme/plan") {
      return json({
        error: {
          code: "shopify_connection_validation_required",
          message: "Theme planning remains locked until a successful standalone Shopify connection validation is persisted and bound to this build.",
        },
        build: BUILD,
      }, 503);
    }

    if (
      url.pathname === "/api/theme-plan" ||
      url.pathname === "/api/actions" ||
      url.pathname === "/api/shopify/theme/execute"
    ) {
      return json({
        error: {
          code: "external_mutation_locked",
          message: "External Shopify mutation is locked in the standalone Kairos kernel.",
        },
        build: BUILD,
      }, 503);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: {
          code: "api_route_not_found",
          message: "The requested Kairos API route is not available in this kernel build.",
        },
        build: BUILD,
      }, 404);
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return json({
        error: {
          code: "asset_binding_unavailable",
          message: "The Kairos shell asset binding is unavailable.",
        },
        build: BUILD,
      }, 503);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};

async function validateShopifyConnection(env) {
  const startedAt = new Date().toISOString();
  const validationID = crypto.randomUUID();

  try {
    const config = readShopifyConfig(env);
    const auth = await resolveShopifyAccessToken(config, env);
    const data = await shopifyGraphQL(config, auth.accessToken, `
      query KairosConnectionValidation {
        shop {
          name
          myshopifyDomain
          primaryDomain { host url }
        }
        currentAppInstallation {
          accessScopes { handle description }
        }
        themes(first: 20) {
          nodes {
            id
            name
            role
            processing
            processingFailed
          }
        }
      }
    `);

    const themes = Array.isArray(data?.themes?.nodes) ? data.themes.nodes.map(normalizeTheme) : [];
    const mainTheme = themes.find(theme => theme.role === "MAIN") || null;
    const nonLiveThemes = themes.filter(theme => theme.role !== "MAIN");
    const scopes = Array.isArray(data?.currentAppInstallation?.accessScopes)
      ? data.currentAppInstallation.accessScopes.map(scope => scope?.handle).filter(Boolean)
      : [];

    const checks = {
      storeDomainConfigured: Boolean(config.storeDomain),
      credentialPathResolved: Boolean(auth.accessToken),
      adminGraphQLReachable: true,
      shopIdentityReadable: Boolean(data?.shop?.myshopifyDomain),
      themeListReadable: themes.length > 0,
      mainThemeDiscovered: Boolean(mainTheme),
      nonLiveThemeDiscovered: nonLiveThemes.length > 0,
    };

    const passed = Object.values(checks).every(Boolean);

    return json({
      validationID,
      actionType: "shopify.connection.validate",
      status: passed ? "completed" : "needs-attention",
      readOnly: true,
      build: BUILD,
      kernel: "standalone",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: passed
        ? "Shopify authentication, Admin GraphQL access, main-theme discovery, and non-live theme discovery passed."
        : "Shopify connection validation completed, but one or more required checks did not pass.",
      checks,
      evidence: {
        credentialPath: auth.source,
        apiVersion: config.apiVersion,
        configuredStoreDomain: config.storeDomain,
        shop: data?.shop || null,
        scopes,
        scopeCount: scopes.length,
        mainTheme,
        nonLiveThemes,
        themes,
      },
    }, passed ? 200 : 409);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      validationID,
      actionType: "shopify.connection.validate",
      status: "needs-attention",
      readOnly: true,
      build: BUILD,
      kernel: "standalone",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Shopify connection validation failed.",
      error: normalized,
      checks: {
        storeDomainConfigured: normalized.code !== "shopify_invalid_domain" && normalized.code !== "shopify_not_configured",
        credentialPathResolved: false,
        adminGraphQLReachable: false,
        shopIdentityReadable: false,
        themeListReadable: false,
        mainThemeDiscovered: false,
        nonLiveThemeDiscovered: false,
      },
    }, normalized.status);
  }
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    throw httpError(503, "shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN is missing or invalid. It must be the store's myshopify.com domain.");
  }
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) {
    throw httpError(503, "shopify_invalid_version", "SHOPIFY_API_VERSION is invalid.");
  }

  return { storeDomain, apiVersion };
}

async function resolveShopifyAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();

  if (clientId && clientSecret) {
    return {
      accessToken: await getClientCredentialsToken(config.storeDomain, clientId, clientSecret),
      source: "client-credentials",
    };
  }
  if (staticToken) return { accessToken: staticToken, source: "admin-access-token" };

  throw httpError(503, "shopify_not_configured", "Shopify client credentials or an Admin access token must be configured in Cloudflare.");
}

async function getClientCredentialsToken(storeDomain, clientId, clientSecret) {
  const cacheKey = `${storeDomain}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.accessToken;

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
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });

  const body = await safeJSON(response);
  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !accessToken) {
    throw httpError(
      response.status === 429 ? 429 : 401,
      "shopify_client_credentials_invalid",
      String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500),
    );
  }

  tokenCache.set(cacheKey, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 });
  return accessToken;
}

async function shopifyGraphQL(config, accessToken, query, variables = {}) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });

  const body = await safeJSON(response);
  if (!response.ok) {
    throw httpError(response.status, "shopify_graphql_http_error", `Shopify Admin GraphQL returned HTTP ${response.status}.`);
  }
  if (Array.isArray(body?.errors) && body.errors.length) {
    throw httpError(502, "shopify_graphql_error", body.errors.map(error => error?.message).filter(Boolean).join(" | ").slice(0, 1000));
  }
  if (!body?.data) {
    throw httpError(502, "shopify_graphql_empty_data", "Shopify Admin GraphQL returned no data.");
  }
  return body.data;
}

function normalizeTheme(theme) {
  const rawId = String(theme?.id || "");
  const numericId = rawId.match(/OnlineStoreTheme\/(\d+)$/)?.[1] || "";
  return {
    id: numericId,
    gid: rawId,
    name: String(theme?.name || "Unnamed theme"),
    role: String(theme?.role || "UNKNOWN").toUpperCase(),
    processing: Boolean(theme?.processing),
    processingFailed: Boolean(theme?.processingFailed),
  };
}

async function inspectStorefront(env) {
  const origin = normalizeOrigin(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com");
  const startedAt = new Date().toISOString();
  const pages = [];
  const errors = [];

  for (const path of ["/", "/sitemap.xml"]) {
    try {
      const response = await fetch(`${origin}${path}`, {
        headers: {
          Accept: path.endsWith(".xml") ? "application/xml,text/xml;q=0.9,*/*;q=0.8" : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": "MMG-Kairos-Storefront-Inspector/1.0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(STOREFRONT_TIMEOUT_MS),
      });

      const text = await response.text();
      pages.push({
        path,
        requestedUrl: `${origin}${path}`,
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type") || "",
        title: path === "/" ? extractTag(text, "title") : "",
        h1: path === "/" ? extractTag(text, "h1") : "",
        bytes: new TextEncoder().encode(text).length,
      });
    } catch (error) {
      errors.push({
        path,
        requestedUrl: `${origin}${path}`,
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : "Inspection failed.",
      });
    }
  }

  const homepage = pages.find(page => page.path === "/") || null;
  const sitemap = pages.find(page => page.path === "/sitemap.xml") || null;
  const operational = Boolean(homepage?.ok && sitemap?.ok && errors.length === 0);

  return json({
    actionID: crypto.randomUUID(),
    actionType: "storefront.inspect",
    build: BUILD,
    kernel: "standalone",
    status: operational ? "completed" : "needs-attention",
    readOnly: true,
    startedAt,
    completedAt: new Date().toISOString(),
    storefront: origin,
    summary: operational
      ? "The public storefront and sitemap responded successfully."
      : "The storefront inspection completed with one or more failed checks.",
    evidence: { homepage, sitemap, pages, errors },
  }, operational ? 200 : 502);
}

function normalizeOrigin(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:") throw new Error("MMG_STOREFRONT_ORIGIN must use HTTPS.");
  return url.origin;
}

function extractTag(html, tag) {
  const match = String(html || "").match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) : "";
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
    code: typeof error?.code === "string" ? error.code : "shopify_connection_validation_failed",
    message: error instanceof Error ? error.message : "Shopify connection validation failed.",
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
      "X-Kairos-Kernel": "standalone",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
