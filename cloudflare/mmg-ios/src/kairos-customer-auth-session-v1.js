export const KAIROS_CUSTOMER_AUTH_SESSION_BUILD = "kairos-customer-auth-session-20260807-1";

const AUTH_PREFIX = "/api/kairos/customer/auth";
const INTERNAL_PATH = "/registry/kairos-customer-auth-sessions";
const DEFAULT_STOREFRONT_DOMAIN = "themindsetmediagroup.com";
const DEFAULT_RETURN_PATH = "/pages/customer-portal";
const AUTH_TRANSACTION_TTL_SECONDS = 10 * 60;
const CUSTOMER_SESSION_TTL_SECONDS = 12 * 60 * 60;
const REFRESH_SKEW_SECONDS = 60;
const SESSION_SCHEME = "KairosSession";
const SAFE_SHOPIFY_CUSTOMER_GID = /^gid:\/\/shopify\/Customer\/\d+$/i;
const SAFE_TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
const CLIENT_CREDENTIAL_PAIRS = Object.freeze([
  Object.freeze(["KAIROS_SHOPIFY_CUSTOMER_CLIENT_ID", "KAIROS_SHOPIFY_CUSTOMER_CLIENT_SECRET"]),
  Object.freeze(["KAIROS_SHOPIFY_CLIENT_ID", "KAIROS_SHOPIFY_CLIENT_SECRET"]),
  Object.freeze(["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"]),
  Object.freeze(["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"]),
  Object.freeze(["SHOPIFY_APP_CLIENT_ID", "SHOPIFY_APP_CLIENT_SECRET"]),
]);

export async function handleKairosCustomerAuthAPI(request, env = {}) {
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (!url.pathname.startsWith(`${AUTH_PREFIX}/`)) return null;

  if (request.method === "OPTIONS") return customerCorsPreflight(request, env);

  if (url.pathname === `${AUTH_PREFIX}/start`) {
    if (request.method !== "GET") return withCustomerPortalCors(methodNotAllowed("GET"), request, env);
    return startAuthorization(request, env);
  }
  if (url.pathname === `${AUTH_PREFIX}/callback`) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return finishAuthorization(request, env);
  }
  if (url.pathname === `${AUTH_PREFIX}/session`) {
    if (request.method !== "GET") return withCustomerPortalCors(methodNotAllowed("GET"), request, env);
    const identity = await authenticateKairosCustomerRequest(request, env);
    if (!identity) return withCustomerPortalCors(authRequired(), request, env);
    return withCustomerPortalCors(json({
      success: true,
      authenticated: true,
      customer: {
        customerId: identity.kairosCustomerId,
        shopifyCustomerIdHash: await sha256Label(identity.shopifyCustomerId),
      },
      build: KAIROS_CUSTOMER_AUTH_SESSION_BUILD,
    }), request, env);
  }
  if (url.pathname === `${AUTH_PREFIX}/logout`) {
    if (request.method !== "POST") return withCustomerPortalCors(methodNotAllowed("POST"), request, env);
    const sessionId = readSessionToken(request);
    if (sessionId) await authStore(env, "delete", `session:${sessionId}`).catch(() => null);
    return withCustomerPortalCors(json({ success: true, authenticated: false, build: KAIROS_CUSTOMER_AUTH_SESSION_BUILD }), request, env);
  }

  return withCustomerPortalCors(json({ success: false, error: { code: "CUSTOMER_AUTH_ROUTE_NOT_FOUND", message: "Customer authentication route was not found." } }, 404), request, env);
}

export async function handleKairosCustomerAuthObjectRequest(state, request) {
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (url.pathname !== INTERNAL_PATH) return null;
  if (request.method !== "POST") return methodNotAllowed("POST");

  const input = await request.json().catch(() => ({}));
  const operation = clean(input.operation, 32);
  const key = clean(input.key, 512);
  if (!/^(tx|session):[A-Za-z0-9_-]{32,256}$/.test(key)) {
    return json({ success: false, error: { code: "CUSTOMER_AUTH_STORE_KEY_INVALID", message: "Authentication store key is invalid." } }, 400);
  }

  if (operation === "put") {
    const record = normalizeStoreRecord(input.record);
    if (!record) return json({ success: false, error: { code: "CUSTOMER_AUTH_STORE_RECORD_INVALID", message: "Authentication store record is invalid." } }, 400);
    await state.storage.put(`kairos-customer-auth:${key}`, record);
    return json({ success: true });
  }

  if (operation === "get") {
    const storageKey = `kairos-customer-auth:${key}`;
    const record = await state.storage.get(storageKey);
    if (!record || typeof record !== "object") return json({ success: true, record: null });
    if (Number(record.expiresAt || 0) <= Date.now()) {
      await state.storage.delete(storageKey);
      return json({ success: true, record: null });
    }
    return json({ success: true, record });
  }

  if (operation === "delete") {
    await state.storage.delete(`kairos-customer-auth:${key}`);
    return json({ success: true });
  }

  return json({ success: false, error: { code: "CUSTOMER_AUTH_STORE_OPERATION_INVALID", message: "Authentication store operation is invalid." } }, 400);
}

export async function authenticateKairosCustomerRequest(request, env = {}) {
  const sessionId = readSessionToken(request);
  if (sessionId) {
    const stored = await authStore(env, "get", `session:${sessionId}`).catch(() => null);
    const session = stored?.record;
    if (!session) return null;

    let accessToken = clean(session.accessToken, 8192);
    let refreshToken = clean(session.refreshToken, 8192);
    let accessTokenExpiresAt = Number(session.accessTokenExpiresAt || 0);
    if (!accessToken) return null;

    if (accessTokenExpiresAt <= Date.now() + REFRESH_SKEW_SECONDS * 1000) {
      const refreshed = await refreshCustomerToken(env, refreshToken).catch(() => null);
      if (!refreshed?.accessToken) {
        await authStore(env, "delete", `session:${sessionId}`).catch(() => null);
        return null;
      }
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken || refreshToken;
      accessTokenExpiresAt = refreshed.accessTokenExpiresAt;
      const updated = {
        ...session,
        accessToken,
        refreshToken,
        accessTokenExpiresAt,
        expiresAt: Math.min(Number(session.expiresAt || 0), Date.now() + CUSTOMER_SESSION_TTL_SECONDS * 1000),
      };
      await authStore(env, "put", `session:${sessionId}`, updated).catch(() => null);
    }

    const identity = await resolveCustomerIdentity(accessToken, env).catch(() => null);
    if (!identity) {
      await authStore(env, "delete", `session:${sessionId}`).catch(() => null);
      return null;
    }
    if (session.shopifyCustomerId && session.shopifyCustomerId !== identity.shopifyCustomerId) {
      await authStore(env, "delete", `session:${sessionId}`).catch(() => null);
      return null;
    }
    return { ...identity, sessionId, mode: "kairos-session" };
  }

  const directAccessToken = readDirectBearerToken(request);
  if (!directAccessToken) return null;
  const identity = await resolveCustomerIdentity(directAccessToken, env).catch(() => null);
  return identity ? { ...identity, sessionId: null, mode: "shopify-customer-access-token" } : null;
}

export function withCustomerPortalCors(response, request, env = {}) {
  const origin = clean(request?.headers?.get?.("Origin"), 1024);
  const allowedOrigin = resolveStorefrontOrigin(env);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", appendVary(headers.get("Vary"), "Origin"));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Kairos-Customer-Auth", KAIROS_CUSTOMER_AUTH_SESSION_BUILD);
  if (origin && origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
    headers.set("Access-Control-Max-Age", "600");
  } else {
    headers.delete("Access-Control-Allow-Origin");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function customerCorsPreflight(request, env = {}) {
  const origin = clean(request?.headers?.get?.("Origin"), 1024);
  if (!origin || origin !== resolveStorefrontOrigin(env)) {
    return json({ success: false, error: { code: "CUSTOMER_PORTAL_ORIGIN_DENIED", message: "Portal origin is not allowed." } }, 403);
  }
  return withCustomerPortalCors(new Response(null, { status: 204 }), request, env);
}

async function startAuthorization(request, env) {
  const config = resolveClientConfig(env);
  if (!config.clientId) {
    return withCustomerPortalCors(json({ success: false, error: { code: "CUSTOMER_AUTH_CLIENT_NOT_CONFIGURED", message: "Shopify Customer Account authentication is not configured for Kairos." } }, 503), request, env);
  }
  if (!env?.KAIROS_PROJECTS) {
    return withCustomerPortalCors(json({ success: false, error: { code: "CUSTOMER_AUTH_STORAGE_UNAVAILABLE", message: "Secure customer authentication storage is unavailable." } }, 503), request, env);
  }

  const discovery = await discoverOpenId(env).catch(() => null);
  if (!discovery?.authorization_endpoint || !discovery?.token_endpoint) {
    return withCustomerPortalCors(json({ success: false, error: { code: "CUSTOMER_AUTH_DISCOVERY_FAILED", message: "Shopify Customer Account authentication endpoints could not be discovered." } }, 502), request, env);
  }

  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("return_to"), env);
  const state = randomToken(32);
  const nonce = randomToken(32);
  const codeVerifier = randomToken(64);
  const challenge = await sha256Base64Url(codeVerifier);
  const redirectUri = resolveCallbackUrl(request, env);
  const now = Date.now();

  await authStore(env, "put", `tx:${state}`, {
    type: "authorization-transaction",
    state,
    nonce,
    codeVerifier,
    redirectUri,
    returnTo,
    tokenEndpoint: discovery.token_endpoint,
    createdAt: now,
    expiresAt: now + AUTH_TRANSACTION_TTL_SECONDS * 1000,
  });

  const authorizationUrl = new URL(discovery.authorization_endpoint);
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("scope", "openid email customer-account-api:full");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return redirect(authorizationUrl.toString());
}

async function finishAuthorization(request, env) {
  const url = new URL(request.url);
  const state = clean(url.searchParams.get("state"), 256);
  const code = clean(url.searchParams.get("code"), 8192);
  if (!SAFE_TOKEN.test(state) || !code) return authFailureRedirect(env, "CUSTOMER_AUTH_CALLBACK_INVALID");

  const stored = await authStore(env, "get", `tx:${state}`).catch(() => null);
  await authStore(env, "delete", `tx:${state}`).catch(() => null);
  const transaction = stored?.record;
  if (!transaction || transaction.state !== state || Number(transaction.expiresAt || 0) <= Date.now()) {
    return authFailureRedirect(env, "CUSTOMER_AUTH_STATE_INVALID");
  }

  const token = await exchangeAuthorizationCode(env, transaction, code).catch(() => null);
  if (!token?.accessToken) return authFailureRedirect(env, "CUSTOMER_AUTH_TOKEN_EXCHANGE_FAILED", transaction.returnTo);

  const identity = await resolveCustomerIdentity(token.accessToken, env).catch(() => null);
  if (!identity) return authFailureRedirect(env, "CUSTOMER_AUTH_IDENTITY_FAILED", transaction.returnTo);

  const sessionId = randomToken(48);
  const now = Date.now();
  await authStore(env, "put", `session:${sessionId}`, {
    type: "customer-session",
    shopifyCustomerId: identity.shopifyCustomerId,
    kairosCustomerId: identity.kairosCustomerId,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || "",
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    createdAt: now,
    expiresAt: now + CUSTOMER_SESSION_TTL_SECONDS * 1000,
  });

  const destination = new URL(sanitizeReturnTo(transaction.returnTo, env));
  destination.hash = `kairos_session=${encodeURIComponent(sessionId)}`;
  return redirect(destination.toString());
}

async function exchangeAuthorizationCode(env, transaction, code) {
  const config = resolveClientConfig(env);
  if (!config.clientId) return null;
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("client_id", config.clientId);
  form.set("redirect_uri", transaction.redirectUri);
  form.set("code", code);
  form.set("code_verifier", transaction.codeVerifier);
  const headers = tokenHeaders(config, env);
  const response = await fetch(transaction.tokenEndpoint, { method: "POST", headers, body: form.toString() });
  if (!response.ok) return null;
  return normalizeTokenPayload(await response.json().catch(() => ({})));
}

async function refreshCustomerToken(env, refreshToken) {
  if (!refreshToken) return null;
  const discovery = await discoverOpenId(env).catch(() => null);
  const config = resolveClientConfig(env);
  if (!discovery?.token_endpoint || !config.clientId) return null;
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("client_id", config.clientId);
  form.set("refresh_token", refreshToken);
  const response = await fetch(discovery.token_endpoint, { method: "POST", headers: tokenHeaders(config, env), body: form.toString() });
  if (!response.ok) return null;
  return normalizeTokenPayload(await response.json().catch(() => ({})));
}

function normalizeTokenPayload(payload) {
  const accessToken = clean(payload?.access_token, 8192);
  const refreshToken = clean(payload?.refresh_token, 8192);
  const expiresIn = Math.max(60, Math.min(24 * 60 * 60, Number(payload?.expires_in || 3600)));
  if (!accessToken) return null;
  return { accessToken, refreshToken, accessTokenExpiresAt: Date.now() + expiresIn * 1000 };
}

async function resolveCustomerIdentity(accessToken, env) {
  const discovery = await discoverCustomerApi(env);
  if (!discovery?.graphql_api) return null;
  const response = await fetch(discovery.graphql_api, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: accessToken,
      Origin: resolveStorefrontOrigin(env),
      "User-Agent": "Kairos-Customer-Portal/1.0",
    },
    body: JSON.stringify({
      operationName: "KairosCustomerIdentity",
      query: "query KairosCustomerIdentity { customer { id } }",
      variables: {},
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  if (Array.isArray(payload?.errors) && payload.errors.length) return null;
  const shopifyCustomerId = clean(payload?.data?.customer?.id, 255);
  if (!SAFE_SHOPIFY_CUSTOMER_GID.test(shopifyCustomerId)) return null;
  return { shopifyCustomerId, kairosCustomerId: mapKairosCustomerId(shopifyCustomerId, env) };
}

async function discoverOpenId(env) {
  const response = await fetch(`https://${resolveStorefrontDomain(env)}/.well-known/openid-configuration`, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": "Kairos-Customer-Portal/1.0" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return /^https:\/\//i.test(clean(payload.authorization_endpoint, 2048)) && /^https:\/\//i.test(clean(payload.token_endpoint, 2048)) ? payload : null;
}

async function discoverCustomerApi(env) {
  const response = await fetch(`https://${resolveStorefrontDomain(env)}/.well-known/customer-account-api`, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": "Kairos-Customer-Portal/1.0" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return /^https:\/\//i.test(clean(payload.graphql_api, 2048)) ? payload : null;
}

function resolveClientConfig(env) {
  for (const [clientIdKey, clientSecretKey] of CLIENT_CREDENTIAL_PAIRS) {
    const clientId = clean(env?.[clientIdKey], 256);
    if (!clientId) continue;
    return { clientId, clientSecret: clean(env?.[clientSecretKey], 1024) };
  }
  return { clientId: "", clientSecret: "" };
}

function tokenHeaders(config, env) {
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    Origin: resolveStorefrontOrigin(env),
    "User-Agent": "Kairos-Customer-Portal/1.0",
  });
  if (config.clientSecret) headers.set("Authorization", `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`);
  return headers;
}

function resolveStorefrontDomain(env) {
  const explicit = clean(env?.KAIROS_SHOPIFY_STOREFRONT_DOMAIN, 255).replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (explicit) return explicit;
  try { return new URL(resolveStorefrontOrigin(env)).host; } catch { return DEFAULT_STOREFRONT_DOMAIN; }
}

function resolveStorefrontOrigin(env) {
  const value = clean(env?.MMG_STOREFRONT_ORIGIN, 1024);
  try {
    const url = new URL(value || `https://${DEFAULT_STOREFRONT_DOMAIN}`);
    return url.protocol === "https:" ? url.origin : `https://${DEFAULT_STOREFRONT_DOMAIN}`;
  } catch { return `https://${DEFAULT_STOREFRONT_DOMAIN}`; }
}

function resolveCallbackUrl(request, env) {
  const explicit = clean(env?.KAIROS_SHOPIFY_CUSTOMER_CALLBACK_URL, 2048);
  if (explicit) {
    try { const value = new URL(explicit); if (value.protocol === "https:") return value.toString(); } catch { /* use request origin */ }
  }
  const url = new URL(request.url);
  return `${url.origin}${AUTH_PREFIX}/callback`;
}

function sanitizeReturnTo(value, env) {
  const origin = resolveStorefrontOrigin(env);
  try {
    const url = new URL(value || DEFAULT_RETURN_PATH, origin);
    if (url.origin !== origin) return `${origin}${DEFAULT_RETURN_PATH}`;
    if (url.pathname !== DEFAULT_RETURN_PATH) return `${origin}${DEFAULT_RETURN_PATH}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch { return `${origin}${DEFAULT_RETURN_PATH}`; }
}

function mapKairosCustomerId(shopifyCustomerId, env) {
  const rawMap = clean(env?.KAIROS_SHOPIFY_CUSTOMER_MAP, 65535);
  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap);
      const mapped = clean(parsed?.[shopifyCustomerId], 180);
      if (mapped) return mapped;
    } catch { /* malformed optional mapping never weakens auth */ }
  }
  return clean(shopifyCustomerId, 180);
}

async function authStore(env, operation, key, record = null) {
  if (!env?.KAIROS_PROJECTS) return null;
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  const response = await stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, key, record }),
  }));
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function normalizeStoreRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const expiresAt = Number(value.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 24 * 60 * 60 * 1000) return null;
  return { ...value, expiresAt };
}

function readSessionToken(request) {
  const value = clean(request?.headers?.get?.("Authorization"), 8192);
  const match = new RegExp(`^${SESSION_SCHEME}\\s+([A-Za-z0-9_-]{32,256})$`, "i").exec(value);
  return match ? match[1] : "";
}

function readDirectBearerToken(request) {
  const value = clean(request?.headers?.get?.("Authorization"), 8192);
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? clean(match[1], 8192) : "";
}

function randomToken(bytes) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function sha256Label(value) {
  const digest = await sha256Base64Url(value);
  return `kcid_${digest.slice(0, 16)}`;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function authFailureRedirect(env, code, returnTo = "") {
  const destination = new URL(sanitizeReturnTo(returnTo, env));
  destination.hash = `kairos_auth_error=${encodeURIComponent(code)}`;
  return redirect(destination.toString());
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Kairos-Customer-Auth": KAIROS_CUSTOMER_AUTH_SESSION_BUILD,
    },
  });
}

function authRequired() {
  return json({ success: false, error: { code: "CUSTOMER_AUTH_REQUIRED", message: "Authenticated Shopify customer access is required." } }, 401);
}

function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }), { status: 405, headers: { "Content-Type": "application/json; charset=utf-8", Allow: allowed, "Cache-Control": "no-store" } });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Kairos-Customer-Auth": KAIROS_CUSTOMER_AUTH_SESSION_BUILD } });
}

function appendVary(existing, value) {
  const values = new Set(String(existing || "").split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  return [...values].join(", ");
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}
