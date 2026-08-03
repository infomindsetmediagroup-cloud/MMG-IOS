import {
  handleKairosDashboardRequest as handleKairosDashboardV2Request,
  KAIROS_DASHBOARD_OVERVIEW_PATH,
  KAIROS_DASHBOARD_PATH,
} from "./kairos-dashboard-v2.js";
import {
  KAIROS_SHOPIFY_ADMIN_AUTH_BUILD,
  resolveShopDomain,
  resolveShopifyClientId,
  validateShopifyBootstrap,
  verifyShopifyAdminSession,
} from "./shopify/kairos-shopify-admin-auth-v1.js";

export const KAIROS_DASHBOARD_BUILD =
  "kairos-dashboard-20260802-4-existing-app-home";

export const KAIROS_DASHBOARD_APP_PATH = "/app";
export { KAIROS_DASHBOARD_OVERVIEW_PATH, KAIROS_DASHBOARD_PATH };

const DOCUMENT_PATHS = new Set([
  KAIROS_DASHBOARD_APP_PATH,
  `${KAIROS_DASHBOARD_APP_PATH}/`,
  KAIROS_DASHBOARD_PATH,
  `${KAIROS_DASHBOARD_PATH}/`,
  "/dashboard",
  "/dashboard/",
]);
const HTML_NONCE = "kairos-dashboard-v1";

export async function handleKairosDashboardRequest(
  request,
  env = {},
  ctx = {},
  options = {},
) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  const method = String(request?.method || "GET").toUpperCase();
  const existingAppHome = isExistingAppHomeRequest(url);

  if (existingAppHome || DOCUMENT_PATHS.has(url.pathname)) {
    if (method !== "GET" && method !== "HEAD") {
      return methodNotAllowed("GET, HEAD");
    }
    if (!validateShopifyBootstrap(url, env)) {
      return authError(401, "SHOPIFY_ADMIN_APP_CONTEXT_REQUIRED");
    }

    const clientId = resolveShopifyClientId(env);
    const shopDomain = resolveShopDomain(env);
    if (!clientId || !shopDomain) {
      return authError(503, "SHOPIFY_ADMIN_APP_NOT_CONFIGURED");
    }

    const delegatedRequest = existingAppHome
      ? rewriteDocumentRequest(request, url, KAIROS_DASHBOARD_APP_PATH)
      : request;
    if (!delegatedRequest) {
      return authError(502, "SHOPIFY_ADMIN_APP_SHELL_INVALID");
    }

    const delegated = await handleKairosDashboardV2Request(
      delegatedRequest,
      env,
      ctx,
      options,
    );
    if (!delegated) return null;
    return secureDocumentResponse(delegated, method, clientId, shopDomain);
  }

  if (url.pathname === KAIROS_DASHBOARD_OVERVIEW_PATH) {
    if (method !== "GET" && method !== "HEAD") {
      return methodNotAllowed("GET, HEAD");
    }

    const auth = await verifyShopifyAdminSession(request, env, options);
    if (!auth.ok) return authError(auth.status, auth.code);

    const delegated = await handleKairosDashboardV2Request(request, env, ctx, options);
    if (!delegated) return null;
    return secureApiResponse(delegated, method, auth);
  }

  return null;
}

function isExistingAppHomeRequest(url) {
  return url.pathname === "/"
    && (url.searchParams.has("shop") || url.searchParams.has("host"));
}

function rewriteDocumentRequest(request, url, pathname) {
  try {
    const rewrittenUrl = new URL(url.toString());
    rewrittenUrl.pathname = pathname;
    return new Request(rewrittenUrl.toString(), request);
  } catch {
    return null;
  }
}

async function secureDocumentResponse(response, method, clientId, shopDomain) {
  const headers = secureHeaders(response.headers, shopDomain, "document");
  if (method === "HEAD" || response.body === null) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const contentType = String(headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) {
    return authError(502, "SHOPIFY_ADMIN_APP_SHELL_INVALID");
  }

  let body;
  try {
    body = await response.text();
  } catch {
    return authError(502, "SHOPIFY_ADMIN_APP_SHELL_INVALID");
  }

  const metadataAnchor = "  <title>Kairos Command Center</title>";
  const loadAnchor = "      async function load() {";
  const fetchAnchor = `          const response = await fetch("${KAIROS_DASHBOARD_OVERVIEW_PATH}?t=" + Date.now(), {headers:{Accept:"application/json"},cache:"no-store"});`;
  if (
    !body.includes(metadataAnchor)
    || !body.includes(loadAnchor)
    || !body.includes(fetchAnchor)
  ) {
    return authError(502, "SHOPIFY_ADMIN_APP_SHELL_INVALID");
  }

  body = body
    .replace(
      metadataAnchor,
      `  <meta name="shopify-api-key" content="${clientId}">\n  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>\n${metadataAnchor}`,
    )
    .replace(
      loadAnchor,
      `      async function authenticatedDashboardFetch(url) {\n        if (!window.shopify || typeof window.shopify.idToken !== "function") {\n          throw new Error("Shopify Admin authentication is unavailable.");\n        }\n        const token = await window.shopify.idToken();\n        if (typeof token !== "string" || token.length === 0) {\n          throw new Error("Shopify Admin authentication failed.");\n        }\n        return fetch(url, {\n          headers: { Accept: "application/json", Authorization: "Bearer " + token },\n          cache: "no-store",\n          credentials: "omit"\n        });\n      }\n\n${loadAnchor}`,
    )
    .replace(
      fetchAnchor,
      `          const response = await authenticatedDashboardFetch("${KAIROS_DASHBOARD_OVERVIEW_PATH}?t=" + Date.now());`,
    )
    .replaceAll("kairos-dashboard-20260802-2-shopify-embed", KAIROS_DASHBOARD_BUILD);

  headers.set("Content-Length", String(new TextEncoder().encode(body).byteLength));
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function secureApiResponse(response, method, auth) {
  const headers = secureHeaders(response.headers, auth.shopDomain, "api");
  headers.set("X-Kairos-Shopify-Staff-Session", "verified");
  if (method === "HEAD" || response.body === null) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  let body;
  try {
    body = await response.text();
  } catch {
    return authError(502, "DASHBOARD_INVALID_RESPONSE");
  }

  const contentType = String(headers.get("Content-Type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      const value = JSON.parse(body);
      if (isPlainObject(value)) {
        value.build = KAIROS_DASHBOARD_BUILD;
        value.access = {
          mode: "shopify-admin-session",
          shopDomain: auth.shopDomain,
          staffAuthenticated: true,
        };
        body = JSON.stringify(value);
      }
    } catch {
      return authError(502, "DASHBOARD_INVALID_RESPONSE");
    }
  }

  headers.set("Content-Length", String(new TextEncoder().encode(body).byteLength));
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function secureHeaders(source, shopDomain, kind) {
  const headers = new Headers(source);
  headers.delete("X-Frame-Options");
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Vary", appendVary(headers.get("Vary"), kind === "api" ? "Authorization" : "Cookie"));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-Kairos-Dashboard-Build", KAIROS_DASHBOARD_BUILD);
  headers.set("X-Kairos-Shopify-Admin-Auth-Build", KAIROS_SHOPIFY_ADMIN_AUTH_BUILD);
  headers.set("X-Kairos-Shopify-Admin-Only", "true");
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'nonce-${HTML_NONCE}'; script-src 'nonce-${HTML_NONCE}' https://cdn.shopify.com; connect-src 'self' https://admin.shopify.com https://${shopDomain}; img-src 'self' data: https://cdn.shopify.com; font-src 'self' https://cdn.shopify.com; base-uri 'none'; form-action 'none'; frame-ancestors https://admin.shopify.com https://${shopDomain}`,
  );
  return headers;
}

function authError(status, code) {
  const messages = {
    SHOPIFY_ADMIN_APP_CONTEXT_REQUIRED: "Open Kairos from the Shopify Admin.",
    SHOPIFY_ADMIN_APP_NOT_CONFIGURED: "The Kairos Shopify Admin app is not configured.",
    SHOPIFY_ADMIN_APP_SHELL_INVALID: "The Kairos Shopify Admin interface could not be loaded.",
    SHOPIFY_ADMIN_AUTH_NOT_CONFIGURED: "The Kairos Shopify Admin authentication boundary is not configured.",
    SHOPIFY_ADMIN_AUTH_REQUIRED: "A valid Shopify Admin session is required.",
    SHOPIFY_ADMIN_SESSION_INVALID: "The Shopify Admin session is invalid or expired.",
    SHOPIFY_ADMIN_ACCESS_DENIED: "This Shopify staff account is not authorized for Kairos.",
    SHOPIFY_ADMIN_AUTH_UNAVAILABLE: "Shopify Admin authentication is temporarily unavailable.",
    DASHBOARD_INVALID_RESPONSE: "The Kairos dashboard returned an invalid response.",
  };
  const body = JSON.stringify({
    ok: false,
    build: KAIROS_DASHBOARD_BUILD,
    error: {
      code,
      message: messages[code] || "The Kairos Shopify Admin request could not be completed.",
    },
  });
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Kairos-Dashboard-Build": KAIROS_DASHBOARD_BUILD,
      "X-Kairos-Shopify-Admin-Auth-Build": KAIROS_SHOPIFY_ADMIN_AUTH_BUILD,
      "X-Kairos-Shopify-Admin-Only": "true",
    },
  });
}

function methodNotAllowed(allow) {
  const response = authError(405, "METHOD_NOT_ALLOWED");
  response.headers.set("Allow", allow);
  return response;
}

function appendVary(existing, value) {
  const values = String(existing || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) values.push(value);
  return values.join(", ");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}
