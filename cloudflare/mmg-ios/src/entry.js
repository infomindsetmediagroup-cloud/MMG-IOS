import runtime from "./worker.js";

const ASSET_ROOTS = [
  "https://raw.githubusercontent.com/infomindsetmediagroup-cloud/MMG-IOS/main/web/kairos-dashboard",
  "https://cdn.jsdelivr.net/gh/infomindsetmediagroup-cloud/MMG-IOS@main/web/kairos-dashboard",
];

const UPSTREAM_HEADER_TIMEOUT_MS = 2500;
const UPSTREAM_BODY_TIMEOUT_MS = 4000;
const SHOPIFY_DIAGNOSTIC_TIMEOUT_MS = 12000;
const SHOPIFY_TOKEN_REFRESH_BUFFER_MS = 60_000;
const shopifyTokenCache = new Map();
const shopifyTokenRequests = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleRuntimeAPI(request, env, ctx, url);
    }
    return serveResilientAsset(request, url);
  },
};

async function handleRuntimeAPI(request, env, ctx, url) {
  let runtimeEnv = env;
  try {
    runtimeEnv = await withShopifyAccessToken(env);
  } catch (error) {
    if (["/api/theme-plan", "/api/actions"].includes(url.pathname)) {
      return shopifyAuthErrorResponse(error);
    }
  }

  const response = await runtime.fetch(request, runtimeEnv, ctx);
  if (!["/api/theme-plan", "/api/actions"].includes(url.pathname) || response.ok) return response;

  let body;
  try { body = await response.clone().json(); } catch { return response; }
  if (body?.error?.code !== "main_theme_unavailable") return response;

  const diagnostic = await diagnoseShopifyThemes(runtimeEnv);
  if (!diagnostic) return response;

  return jsonResponse({
    error: {
      ...body.error,
      code: diagnostic.code,
      message: diagnostic.message,
      shopifyStatus: diagnostic.status,
      requestID: body.error.requestID,
    },
  }, diagnostic.httpStatus || response.status);
}

async function withShopifyAccessToken(env) {
  const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();

  if (!storeDomain || !clientId || !clientSecret) return env;

  const accessToken = await getShopifyClientCredentialsToken({ storeDomain, clientId, clientSecret });
  return { ...env, SHOPIFY_ADMIN_ACCESS_TOKEN: accessToken || staticToken };
}

async function getShopifyClientCredentialsToken({ storeDomain, clientId, clientSecret }) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    throw shopifyAuthError("shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN must be the store's permanent .myshopify.com domain.", 503);
  }

  const cacheKey = `${storeDomain}:${clientId}`;
  const cached = shopifyTokenCache.get(cacheKey);
  if (cached?.accessToken && Date.now() < cached.expiresAt - SHOPIFY_TOKEN_REFRESH_BUFFER_MS) {
    return cached.accessToken;
  }

  const pending = shopifyTokenRequests.get(cacheKey);
  if (pending) return pending;

  const request = requestShopifyClientCredentialsToken({ storeDomain, clientId, clientSecret })
    .then(token => {
      shopifyTokenCache.set(cacheKey, token);
      return token.accessToken;
    })
    .finally(() => shopifyTokenRequests.delete(cacheKey));

  shopifyTokenRequests.set(cacheKey, request);
  return request;
}

async function requestShopifyClientCredentialsToken({ storeDomain, clientId, clientSecret }) {
  let response;
  try {
    response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(SHOPIFY_DIAGNOSTIC_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw shopifyAuthError(
      timedOut ? "shopify_token_timeout" : "shopify_token_connection_failed",
      timedOut ? "Shopify did not answer the client-credentials token request before the timeout." : "Cloudflare could not connect to Shopify's token endpoint.",
      timedOut ? 504 : 502,
    );
  }

  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }

  if (!response.ok) {
    const oauthError = typeof body?.error === "string" ? body.error : "token_request_failed";
    const oauthDescription = typeof body?.error_description === "string" ? body.error_description : "Shopify rejected the client-credentials request.";
    const code = oauthError === "shop_not_permitted" ? "shopify_shop_not_permitted" : response.status === 401 ? "shopify_client_credentials_invalid" : "shopify_token_request_failed";
    const message = oauthError === "shop_not_permitted"
      ? "Shopify rejected client-credentials access because the app and store are not in the same Dev Dashboard organization."
      : `${oauthDescription} Verify SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and the installed Kairos app.`;
    throw shopifyAuthError(code, message, response.status === 429 ? 429 : response.status >= 500 ? 502 : 401);
  }

  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  const expiresIn = Number(body?.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw shopifyAuthError("shopify_token_response_invalid", "Shopify returned an invalid client-credentials token response.", 502);
  }

  return {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof body?.scope === "string" ? body.scope : "",
  };
}

function shopifyAuthError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function shopifyAuthErrorResponse(error) {
  return jsonResponse({
    error: {
      code: typeof error?.code === "string" ? error.code : "shopify_authentication_failed",
      message: error instanceof Error ? error.message : "Kairos could not authenticate with Shopify.",
      shopifyStatus: "authentication_failed",
      requestID: crypto.randomUUID(),
    },
  }, Number.isInteger(error?.status) ? error.status : 502);
}

async function diagnoseShopifyThemes(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const accessToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!storeDomain || !accessToken) {
    return { code: "shopify_not_configured", message: "Shopify credentials are missing from Cloudflare.", status: "not_configured", httpStatus: 503 };
  }

  try {
    const response = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/themes.json`, {
      method: "GET",
      headers: { "X-Shopify-Access-Token": accessToken, Accept: "application/json" },
      signal: AbortSignal.timeout(SHOPIFY_DIAGNOSTIC_TIMEOUT_MS),
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }

    if (response.status === 401) {
      return { code: "shopify_token_invalid", message: "Shopify rejected the Admin API access token generated from the Kairos client credentials. Verify the Client ID and Client secret in Cloudflare.", status: "unauthorized", httpStatus: 401 };
    }
    if (response.status === 403) {
      return { code: "shopify_theme_scope_missing", message: "The installed Kairos app cannot read themes. Release a version with theme access, approve the updated scopes in Shopify Admin, then retry WEB-002.", status: "forbidden", httpStatus: 403 };
    }
    if (response.status === 404) {
      return { code: "shopify_api_version_unavailable", message: `Shopify did not recognize the configured Admin API route for version ${apiVersion}. Verify SHOPIFY_API_VERSION and the store domain.`, status: "not_found", httpStatus: 502 };
    }
    if (response.status === 429) {
      return { code: "shopify_rate_limited", message: "Shopify temporarily rate-limited the theme request. Wait briefly, then retry WEB-002.", status: "rate_limited", httpStatus: 429 };
    }
    if (!response.ok) {
      const shopifyMessage = typeof body?.errors === "string" ? body.errors : "Shopify returned an unexpected Admin API response.";
      return { code: "shopify_theme_request_failed", message: `${shopifyMessage} Status ${response.status}.`, status: `http_${response.status}`, httpStatus: 502 };
    }

    const themes = Array.isArray(body?.themes) ? body.themes : [];
    if (!themes.length) {
      return { code: "shopify_no_themes", message: "Shopify accepted the token but returned no themes for this store. Verify SHOPIFY_STORE_DOMAIN points to the correct shop.", status: "empty", httpStatus: 502 };
    }

    const published = themes.find(theme => theme?.role === "main");
    if (!published) {
      return { code: "shopify_published_theme_missing", message: `Shopify returned ${themes.length} theme${themes.length === 1 ? "" : "s"}, but none is marked as the published main theme. Publish a theme in Shopify, then retry WEB-002.`, status: "no_main_theme", httpStatus: 409 };
    }

    return { code: "shopify_filtered_theme_lookup_failed", message: "Shopify returned a published theme during diagnostics, but the primary filtered lookup failed. Retry WEB-002 once; if it repeats, the runtime theme lookup requires another adapter correction.", status: "main_theme_confirmed", httpStatus: 502 };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      code: timedOut ? "shopify_timeout" : "shopify_connection_failed",
      message: timedOut ? "Shopify did not answer the theme request before the timeout. Retry shortly." : "Cloudflare could not connect to the Shopify Admin API.",
      status: timedOut ? "timeout" : "connection_failed",
      httpStatus: timedOut ? 504 : 502,
    };
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-MMG-Runtime": "cloudflare-native",
      "X-MMG-Shopify-Diagnostic": "true",
    },
  });
}

async function serveResilientAsset(request, incomingURL) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  let pathname = incomingURL.pathname;
  if (pathname === "/" || pathname === "/web/kairos-dashboard" || pathname === "/web/kairos-dashboard/") {
    pathname = "/index.html";
  } else if (pathname.startsWith("/web/kairos-dashboard/")) {
    pathname = pathname.slice("/web/kairos-dashboard".length);
  }

  if (pathname.includes("..")) return new Response("Invalid path", { status: 400 });

  const isHTML = pathname.endsWith(".html");
  const targets = ASSET_ROOTS.map(root => `${root}${pathname}${incomingURL.search}`);
  const attempts = [];

  try {
    const asset = await firstSuccessfulAsset(targets, request, pathname, isHTML, attempts);
    const headers = new Headers(asset.headers);
    headers.set("Content-Type", contentTypeFor(pathname));
    headers.set("Content-Length", String(asset.body.byteLength));
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-MMG-Host", "cloudflare-buffered-resilient");
    headers.set("X-MMG-Asset-Bytes", String(asset.body.byteLength));
    headers.set("Cache-Control", isHTML ? "no-cache, no-store, must-revalidate" : "public, max-age=900, stale-while-revalidate=86400");
    headers.delete("content-security-policy");
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    return new Response(request.method === "HEAD" ? null : asset.body, { status: 200, headers });
  } catch {
    if (pathname !== "/index.html" && !hasFileExtension(pathname)) {
      return serveResilientAsset(new Request(`${incomingURL.origin}/index.html`, request), new URL(`${incomingURL.origin}/index.html`));
    }
    if (pathname === "/index.html") return recoveryPage(attempts);
    return new Response("Command Center asset temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
  }
}

async function firstSuccessfulAsset(targets, request, pathname, isHTML, attempts) {
  const tasks = targets.map(target => fetchBufferedAsset(target, request, pathname, isHTML, attempts));
  try { return await Promise.any(tasks); } catch { throw new Error("All Command Center asset origins failed."); }
}

async function fetchBufferedAsset(target, request, pathname, isHTML, attempts) {
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: { Accept: request.headers.get("Accept") || "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_HEADER_TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtl: isHTML ? 30 : 900 },
    });
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);

    if (request.method === "HEAD") {
      attempts.push({ target, status: upstream.status, bytes: 0 });
      return { body: new ArrayBuffer(0), headers: upstream.headers };
    }

    const body = await withTimeout(upstream.arrayBuffer(), UPSTREAM_BODY_TIMEOUT_MS, "Upstream body timed out");
    if (!body.byteLength) throw new Error("Upstream returned an empty asset body");

    if (isTextAsset(pathname)) {
      const sample = new TextDecoder().decode(body.slice(0, Math.min(body.byteLength, 512))).trim();
      if (!sample) throw new Error("Upstream returned blank text content");
      if (isHTML && !/<!doctype html|<html/i.test(sample)) throw new Error("Upstream did not return valid HTML");
    }

    attempts.push({ target, status: upstream.status, bytes: body.byteLength });
    return { body, headers: upstream.headers };
  } catch (error) {
    attempts.push({ target, error: error instanceof Error ? error.message : "fetch failed" });
    throw error;
  }
}

function withTimeout(promise, milliseconds, message) {
  let timeout;
  const guard = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), milliseconds); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timeout));
}

function recoveryPage(attempts) {
  const safe = JSON.stringify(attempts).replace(/[<>&]/g, "");
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kairos Recovery</title><style>body{margin:0;background:#05080d;color:#eef2f7;font-family:system-ui;padding:32px}main{max-width:720px;margin:12vh auto;background:#101722;border:1px solid #21465a;border-radius:24px;padding:28px}h1{font-size:2rem}p{color:#b8c1cc;line-height:1.5}button{width:100%;padding:16px;border:0;border-radius:999px;background:#24b7f2;font-weight:800;font-size:1rem}small{display:block;margin-top:18px;color:#71808f;word-break:break-all}</style></head><body><main><p>KAIROS RECOVERY MODE</p><h1>The Command Center asset service is temporarily unavailable.</h1><p>The Cloudflare runtime is still active. This page will retry automatically instead of remaining blank.</p><button onclick="location.reload()">Retry now</button><small>${safe}</small></main><script>setTimeout(()=>location.reload(),5000)</script></body></html>`, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" },
  });
}

function hasFileExtension(pathname) { return /\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(pathname); }
function isTextAsset(pathname) { return /\.(?:html|css|js|json|svg)$/i.test(pathname); }
function contentTypeFor(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}
