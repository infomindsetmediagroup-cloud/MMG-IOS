export const KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD =
  "kairos-customer-account-auth-20260807-1-confidential-session";

const START_PATH = "/api/customer/auth/start";
const CALLBACK_PATH = "/api/customer/auth/callback";
const SESSION_PATH = "/api/customer/auth/session";
const LOGOUT_PATH = "/api/customer/auth/logout";
const PORTAL_PATH = "/customer-portal";
const CUSTOMER_API_PREFIX = "/api/kairos/customer/";
const OAUTH_COOKIE = "__Host-kairos_customer_oauth";
const SESSION_COOKIE = "__Host-kairos_customer_session";
const DEFAULT_STOREFRONT_DOMAIN = "themindsetmediagroup.com";
const DEFAULT_CALLBACK_URL = "https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/callback";
const DEFAULT_PORTAL_URL = "https://mmg-ios.info-mindsetmediagroup.workers.dev/customer-portal";
const DEFAULT_PUBLIC_PORTAL_URL = "https://themindsetmediagroup.com/pages/customer-portal";
const OAUTH_SCOPE = "openid email customer-account-api:full";
const OAUTH_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_SKEW_SECONDS = 60;

export async function handleKairosCustomerAccountAuth(request, env = {}) {
  let url;
  try { url = new URL(request.url); } catch { return null; }
  const method = String(request.method || "GET").toUpperCase();
  if (url.pathname === START_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return startAuthorization(env);
  }
  if (url.pathname === CALLBACK_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return finishAuthorization(request, env);
  }
  if (url.pathname === SESSION_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return sessionStatus(request, env);
  }
  if (url.pathname === LOGOUT_PATH) {
    if (method !== "GET" && method !== "POST" && method !== "HEAD") return methodNotAllowed("GET, POST, HEAD");
    return logout(env);
  }
  if (url.pathname === PORTAL_PATH || url.pathname === `${PORTAL_PATH}/`) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return securePortal(request, env, method);
  }
  return null;
}

export async function prepareKairosCustomerApiRequest(request, env = {}) {
  let url;
  try { url = new URL(request.url); } catch { return { request, setCookie: "" }; }
  if (!url.pathname.startsWith(CUSTOMER_API_PREFIX)) return { request, setCookie: "" };
  if (request.headers.get("Authorization")) return { request, setCookie: "" };
  const session = await readSession(request, env);
  if (!session) return { request, setCookie: "" };
  const refreshed = await refreshIfNeeded(session, env);
  if (!refreshed) return { request, setCookie: clearCookie(SESSION_COOKIE) };
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${refreshed.session.accessToken}`);
  headers.delete("x-kairos-customer-id");
  headers.delete("x-customer-id");
  return {
    request: new Request(request, { headers }),
    setCookie: refreshed.changed ? await sessionCookie(refreshed.session, env) : "",
  };
}

export function stampKairosCustomerSession(response, setCookie = "") {
  if (!setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", setCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function startAuthorization(env) {
  const credentials = resolveCredentials(env);
  if (!credentials) return authError(503, "CUSTOMER_OAUTH_NOT_CONFIGURED");
  const config = await discoverOpenId(env);
  if (!config?.authorization_endpoint) return authError(503, "CUSTOMER_OAUTH_DISCOVERY_FAILED");
  const state = randomBase64Url(32);
  const oauthCookie = await encryptedCookie(OAUTH_COOKIE, { kind: "oauth", state, createdAt: Date.now() }, env, OAUTH_TTL_SECONDS, "oauth");
  if (!oauthCookie) return authError(503, "CUSTOMER_OAUTH_NOT_CONFIGURED");
  const authorizationUrl = new URL(config.authorization_endpoint);
  authorizationUrl.searchParams.set("scope", OAUTH_SCOPE);
  authorizationUrl.searchParams.set("client_id", credentials.clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl(env));
  authorizationUrl.searchParams.set("state", state);
  const headers = new Headers({ Location: authorizationUrl.toString(), "Cache-Control": "no-store", "X-Kairos-Customer-Auth": KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD });
  headers.append("Set-Cookie", oauthCookie);
  return new Response(null, { status: 302, headers });
}

async function finishAuthorization(request, env) {
  const url = new URL(request.url);
  const oauthError = clean(url.searchParams.get("error"), 200);
  if (oauthError) return redirectWithClearedOauth(publicPortalUrl(env), "oauth_denied");
  const code = clean(url.searchParams.get("code"), 8192);
  const state = clean(url.searchParams.get("state"), 256);
  if (!code || !state) return authError(400, "CUSTOMER_OAUTH_CALLBACK_INVALID");
  const oauth = await readEncryptedCookie(request, env, OAUTH_COOKIE, "oauth");
  if (!oauth || oauth.kind !== "oauth" || !constantTimeEqual(state, clean(oauth.state, 256))) return authError(400, "CUSTOMER_OAUTH_STATE_INVALID");
  if (!Number.isFinite(oauth.createdAt) || Date.now() - oauth.createdAt > OAUTH_TTL_SECONDS * 1000) return authError(400, "CUSTOMER_OAUTH_STATE_EXPIRED");
  const credentials = resolveCredentials(env);
  if (!credentials) return authError(503, "CUSTOMER_OAUTH_NOT_CONFIGURED");
  const config = await discoverOpenId(env);
  if (!config?.token_endpoint) return authError(503, "CUSTOMER_OAUTH_DISCOVERY_FAILED");
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", credentials.clientId);
  body.set("redirect_uri", callbackUrl(env));
  body.set("code", code);
  let tokenResponse;
  try {
    tokenResponse = await fetch(config.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${base64Text(`${credentials.clientId}:${credentials.clientSecret}`)}`,
        "User-Agent": "Kairos-Customer-Portal/1.0",
      },
      body,
    });
  } catch { return authError(503, "CUSTOMER_OAUTH_TOKEN_UNAVAILABLE"); }
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) return authError(401, "CUSTOMER_OAUTH_TOKEN_REJECTED");
  const session = normalizeTokenSession(tokenPayload);
  if (!session) return authError(502, "CUSTOMER_OAUTH_TOKEN_INVALID");
  const customer = await validateCustomerAccessToken(session.accessToken, env);
  if (!customer) return authError(401, "CUSTOMER_OAUTH_CUSTOMER_INVALID");
  session.shopifyCustomerId = customer.shopifyCustomerId;
  const cookie = await sessionCookie(session, env);
  if (!cookie) return authError(503, "CUSTOMER_OAUTH_NOT_CONFIGURED");
  const headers = new Headers({ Location: portalUrl(env), "Cache-Control": "no-store", "X-Kairos-Customer-Auth": KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD });
  headers.append("Set-Cookie", clearCookie(OAUTH_COOKIE));
  headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

async function sessionStatus(request, env) {
  const session = await readSession(request, env);
  if (!session) return json({ authenticated: false, build: KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD }, 401);
  const refreshed = await refreshIfNeeded(session, env);
  if (!refreshed) return json({ authenticated: false, build: KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD }, 401, clearCookie(SESSION_COOKIE));
  const customer = await validateCustomerAccessToken(refreshed.session.accessToken, env);
  if (!customer) return json({ authenticated: false, build: KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD }, 401, clearCookie(SESSION_COOKIE));
  const setCookie = refreshed.changed ? await sessionCookie(refreshed.session, env) : "";
  return json({ authenticated: true, customer: { id: customer.shopifyCustomerId }, build: KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD }, 200, setCookie);
}

async function securePortal(request, env, method) {
  const session = await readSession(request, env);
  if (!session) return redirect(startUrl(env));
  const refreshed = await refreshIfNeeded(session, env);
  if (!refreshed) return redirect(startUrl(env), clearCookie(SESSION_COOKIE));
  const customer = await validateCustomerAccessToken(refreshed.session.accessToken, env);
  if (!customer) return redirect(startUrl(env), clearCookie(SESSION_COOKIE));
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") return authError(503, "CUSTOMER_PORTAL_ASSET_UNAVAILABLE");
  const assetUrl = new URL("/customer-portal.html", request.url);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method }));
  const headers = securePortalHeaders(assetResponse.headers);
  const setCookie = refreshed.changed ? await sessionCookie(refreshed.session, env) : "";
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(method === "HEAD" ? null : assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
}

async function logout(env) { return redirect(publicPortalUrl(env), clearCookie(SESSION_COOKIE)); }

async function refreshIfNeeded(session, env) {
  const now = Math.floor(Date.now() / 1000);
  if (Number.isFinite(session.expiresAt) && session.expiresAt > now + REFRESH_SKEW_SECONDS) return { session, changed: false };
  const refreshToken = clean(session.refreshToken, 16384);
  if (!refreshToken) return null;
  const credentials = resolveCredentials(env);
  if (!credentials) return null;
  const config = await discoverOpenId(env);
  if (!config?.token_endpoint) return null;
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", credentials.clientId);
  body.set("refresh_token", refreshToken);
  try {
    const response = await fetch(config.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${base64Text(`${credentials.clientId}:${credentials.clientSecret}`)}`,
        "User-Agent": "Kairos-Customer-Portal/1.0",
      },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    const next = normalizeTokenSession(payload, session);
    return next ? { session: next, changed: true } : null;
  } catch { return null; }
}

function normalizeTokenSession(payload, prior = null) {
  const accessToken = clean(payload?.access_token, 16384);
  const refreshToken = clean(payload?.refresh_token, 16384) || clean(prior?.refreshToken, 16384);
  const idToken = clean(payload?.id_token, 16384) || clean(prior?.idToken, 16384);
  const expiresIn = Number(payload?.expires_in);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 7 * 24 * 60 * 60) return null;
  return {
    kind: "session",
    accessToken,
    refreshToken,
    idToken,
    expiresAt: Math.floor(Date.now() / 1000) + Math.floor(expiresIn),
    createdAt: Number.isFinite(prior?.createdAt) ? prior.createdAt : Date.now(),
    shopifyCustomerId: clean(prior?.shopifyCustomerId, 255),
  };
}

async function validateCustomerAccessToken(accessToken, env) {
  const config = await discoverCustomerApi(env);
  if (!config?.graphql_api) return null;
  try {
    const response = await fetch(config.graphql_api, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: accessToken, "User-Agent": "Kairos-Customer-Portal/1.0" },
      body: JSON.stringify({ operationName: "KairosCustomerIdentity", query: "query KairosCustomerIdentity { customer { id } }", variables: {} }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || (Array.isArray(payload?.errors) && payload.errors.length)) return null;
    const shopifyCustomerId = clean(payload?.data?.customer?.id, 255);
    if (!/^gid:\/\/shopify\/Customer\/\d+$/u.test(shopifyCustomerId)) return null;
    return { shopifyCustomerId };
  } catch { return null; }
}

async function discoverOpenId(env) {
  const domain = storefrontDomain(env);
  try {
    const response = await fetch(`https://${domain}/.well-known/openid-configuration`, { headers: { Accept: "application/json", "User-Agent": "Kairos-Customer-Portal/1.0" }, cf: { cacheTtl: 300, cacheEverything: true } });
    if (!response.ok) return null;
    const value = await response.json().catch(() => ({}));
    if (!isHttpsUrl(value?.authorization_endpoint) || !isHttpsUrl(value?.token_endpoint)) return null;
    return value;
  } catch { return null; }
}

async function discoverCustomerApi(env) {
  const domain = storefrontDomain(env);
  try {
    const response = await fetch(`https://${domain}/.well-known/customer-account-api`, { headers: { Accept: "application/json", "User-Agent": "Kairos-Customer-Portal/1.0" }, cf: { cacheTtl: 300, cacheEverything: true } });
    if (!response.ok) return null;
    const value = await response.json().catch(() => ({}));
    if (!isHttpsUrl(value?.graphql_api)) return null;
    return value;
  } catch { return null; }
}

async function readSession(request, env) {
  const value = await readEncryptedCookie(request, env, SESSION_COOKIE, "session");
  if (!value || value.kind !== "session") return null;
  if (!clean(value.accessToken, 16384) || !clean(value.refreshToken, 16384)) return null;
  if (!Number.isFinite(value.createdAt) || Date.now() - value.createdAt > SESSION_TTL_SECONDS * 1000) return null;
  return value;
}

async function sessionCookie(session, env) { return encryptedCookie(SESSION_COOKIE, session, env, SESSION_TTL_SECONDS, "session"); }

async function encryptedCookie(name, payload, env, maxAge, purpose) {
  const secret = resolveCookieSecret(env);
  if (!secret || !globalThis.crypto?.subtle) return "";
  const key = await encryptionKey(secret, purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const value = `${base64Url(iv)}.${base64Url(ciphertext)}`;
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}

async function readEncryptedCookie(request, env, name, purpose) {
  const raw = readCookie(request, name);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const iv = decodeBase64Url(parts[0]);
  const ciphertext = decodeBase64Url(parts[1]);
  if (!iv || iv.byteLength !== 12 || !ciphertext) return null;
  const secret = resolveCookieSecret(env);
  if (!secret || !globalThis.crypto?.subtle) return null;
  try {
    const key = await encryptionKey(secret, purpose);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch { return null; }
}

async function encryptionKey(secret, purpose) {
  const material = new TextEncoder().encode(`kairos:${purpose}:v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function resolveCredentials(env) {
  const clientId = first(env, ["KAIROS_SHOPIFY_CUSTOMER_CLIENT_ID", "KAIROS_SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_ID", "SHOPIFY_API_KEY", "SHOPIFY_APP_CLIENT_ID"]);
  const clientSecret = first(env, ["KAIROS_SHOPIFY_CUSTOMER_CLIENT_SECRET", "KAIROS_SHOPIFY_CLIENT_SECRET", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_API_SECRET", "SHOPIFY_APP_CLIENT_SECRET", "SHOPIFY_CLIENT_SECRET_KEY"]);
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(clientId) || clientSecret.length < 16) return null;
  return { clientId, clientSecret };
}

function resolveCookieSecret(env) {
  return first(env, ["KAIROS_CUSTOMER_SESSION_SECRET", "KAIROS_SHOPIFY_CUSTOMER_CLIENT_SECRET", "KAIROS_SHOPIFY_CLIENT_SECRET", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_API_SECRET", "SHOPIFY_APP_CLIENT_SECRET", "SHOPIFY_CLIENT_SECRET_KEY"]);
}

function storefrontDomain(env) {
  const explicit = first(env, ["KAIROS_SHOPIFY_STOREFRONT_DOMAIN"]).replace(/^https?:\/\//iu, "").replace(/\/$/u, "");
  if (/^[A-Za-z0-9.-]+$/u.test(explicit)) return explicit;
  try { const origin = first(env, ["MMG_STOREFRONT_ORIGIN"]); if (origin) return new URL(origin).hostname; } catch {}
  return DEFAULT_STOREFRONT_DOMAIN;
}

function callbackUrl(env) { const value = first(env, ["KAIROS_CUSTOMER_AUTH_CALLBACK_URL"]); return isHttpsUrl(value) ? value : DEFAULT_CALLBACK_URL; }
function portalUrl(env) { const value = first(env, ["KAIROS_CUSTOMER_PORTAL_URL"]); return isHttpsUrl(value) ? value : DEFAULT_PORTAL_URL; }
function publicPortalUrl(env) { const value = first(env, ["KAIROS_CUSTOMER_PUBLIC_PORTAL_URL"]); return isHttpsUrl(value) ? value : DEFAULT_PUBLIC_PORTAL_URL; }
function startUrl(env) { try { return new URL(START_PATH, portalUrl(env)).toString(); } catch { return `https://mmg-ios.info-mindsetmediagroup.workers.dev${START_PATH}`; } }

function securePortalHeaders(source = new Headers()) {
  const headers = new Headers(source);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-Kairos-Customer-Auth", KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD);
  headers.set("Content-Security-Policy", "default-src 'self' https://themindsetmediagroup.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://themindsetmediagroup.com");
  return headers;
}

function readCookie(request, name) {
  const cookie = String(request.headers.get("Cookie") || "");
  for (const item of cookie.split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    if (item.slice(0, index).trim() === name) return item.slice(index + 1).trim();
  }
  return "";
}
function clearCookie(name) { return `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`; }
function redirect(location, setCookie = "") {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "X-Kairos-Customer-Auth": KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers });
}
function redirectWithClearedOauth(location, reason) {
  const target = new URL(location);
  target.searchParams.set("kairos_auth", reason);
  const headers = new Headers({ Location: target.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearCookie(OAUTH_COOKIE));
  return new Response(null, { status: 302, headers });
}
function json(value, status = 200, setCookie = "") {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Kairos-Customer-Auth": KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(JSON.stringify(value), { status, headers });
}
function authError(status, code) {
  const messages = {
    CUSTOMER_OAUTH_NOT_CONFIGURED: "Kairos customer authentication is not fully configured.",
    CUSTOMER_OAUTH_DISCOVERY_FAILED: "Shopify customer authentication endpoints could not be discovered.",
    CUSTOMER_OAUTH_CALLBACK_INVALID: "The Shopify customer authentication callback is invalid.",
    CUSTOMER_OAUTH_STATE_INVALID: "The customer authentication state could not be verified.",
    CUSTOMER_OAUTH_STATE_EXPIRED: "The customer authentication request expired. Please sign in again.",
    CUSTOMER_OAUTH_TOKEN_UNAVAILABLE: "Shopify customer authentication is temporarily unavailable.",
    CUSTOMER_OAUTH_TOKEN_REJECTED: "Shopify rejected the customer authentication exchange.",
    CUSTOMER_OAUTH_TOKEN_INVALID: "Shopify returned an invalid customer authentication session.",
    CUSTOMER_OAUTH_CUSTOMER_INVALID: "The authenticated Shopify customer could not be verified.",
    CUSTOMER_PORTAL_ASSET_UNAVAILABLE: "The customer portal interface is temporarily unavailable.",
  };
  return json({ ok: false, error: { code, message: messages[code] || "Customer authentication failed." }, build: KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD }, status);
}
function methodNotAllowed(allowed) { const response = json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405); response.headers.set("Allow", allowed); return response; }
function first(env, keys) { for (const key of keys) { try { const value = String(env?.[key] || "").trim(); if (value) return value; } catch {} } return ""; }
function isHttpsUrl(value) { try { return new URL(String(value || "")).protocol === "https:"; } catch { return false; } }
function clean(value, max) { return String(value || "").replace(/\u0000/gu, "").trim().slice(0, max); }
function randomBase64Url(bytes) { return base64Url(crypto.getRandomValues(new Uint8Array(bytes))); }
function base64Text(value) { const bytes = new TextEncoder().encode(value); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64Url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, ""); }
function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(String(value || ""))) return null;
  const normalized = String(value).replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  try { const binary = atob(padded); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes; } catch { return null; }
}
function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) diff |= (left[index] || 0) ^ (right[index] || 0);
  return diff === 0;
}
