export const KAIROS_SHOPIFY_ADMIN_AUTH_BUILD =
  "kairos-shopify-admin-auth-20260802-4-public-client-id";

const MAX_TOKEN_BYTES = 8192;
const MAX_SECRET_BYTES = 1024;
const CLOCK_SKEW_SECONDS = 10;
const MAX_TOKEN_LIFETIME_SECONDS = 120;
const MAX_TOKEN_AGE_SECONDS = 300;
const DEFAULT_SHOP_DOMAIN = "07kd8e-qw.myshopify.com";
const SAFE_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u;
const SAFE_CLIENT_ID = /^[A-Za-z0-9_-]{16,128}$/u;
const SAFE_USER_ID = /^[A-Za-z0-9_:/.-]{1,256}$/u;
const SAFE_JWT_PART = /^[A-Za-z0-9_-]+$/u;

const CREDENTIAL_PAIRS = Object.freeze([
  Object.freeze(["KAIROS_SHOPIFY_CLIENT_ID", "KAIROS_SHOPIFY_CLIENT_SECRET"]),
  Object.freeze(["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"]),
  Object.freeze(["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"]),
  Object.freeze(["SHOPIFY_APP_CLIENT_ID", "SHOPIFY_APP_CLIENT_SECRET"]),
  Object.freeze(["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET_KEY"]),
]);

export async function verifyShopifyAdminSession(
  request,
  env = {},
  options = {},
) {
  const shopDomain = resolveShopDomain(env);
  const credentials = resolveShopifyCredentials(env);
  if (!shopDomain || !credentials) {
    return failure("SHOPIFY_ADMIN_AUTH_NOT_CONFIGURED", 503);
  }

  const token = readBearerToken(request);
  if (!token) return failure("SHOPIFY_ADMIN_AUTH_REQUIRED", 401);

  const parsed = parseJwt(token);
  if (!parsed) return failure("SHOPIFY_ADMIN_SESSION_INVALID", 401);
  if (parsed.header.alg !== "HS256") {
    return failure("SHOPIFY_ADMIN_SESSION_INVALID", 401);
  }

  const cryptoObject = readOwn(options, "crypto") || globalThis.crypto;
  if (!cryptoObject?.subtle) {
    return failure("SHOPIFY_ADMIN_AUTH_UNAVAILABLE", 503);
  }

  const verified = await verifySignature(
    cryptoObject,
    credentials.clientSecret,
    parsed.signingInput,
    parsed.signature,
  );
  if (!verified) return failure("SHOPIFY_ADMIN_SESSION_INVALID", 401);

  const nowSeconds = resolveNowSeconds(options);
  const claims = parsed.payload;
  if (!validClaims(claims, credentials.clientId, shopDomain, nowSeconds)) {
    return failure("SHOPIFY_ADMIN_SESSION_INVALID", 401);
  }

  const staffUserId = normalizeUserId(claims.sub);
  const allowlist = parseAllowlist(readBinding(env, "KAIROS_SHOPIFY_ADMIN_USER_IDS"));
  if (allowlist.length > 0 && !allowlist.includes(staffUserId)) {
    return failure("SHOPIFY_ADMIN_ACCESS_DENIED", 403);
  }

  return Object.freeze({
    ok: true,
    status: 200,
    build: KAIROS_SHOPIFY_ADMIN_AUTH_BUILD,
    shopDomain,
    staffUserId,
    sessionId: cleanOptionalIdentifier(claims.sid),
  });
}

export function resolveShopDomain(env = {}) {
  const candidate = cleanDomain(
    readBinding(env, "KAIROS_SHOPIFY_SHOP_DOMAIN")
      || readBinding(env, "SHOPIFY_STORE_DOMAIN")
      || DEFAULT_SHOP_DOMAIN,
  );
  return candidate || null;
}

export function resolveShopifyClientId(env = {}) {
  for (const [clientIdKey] of CREDENTIAL_PAIRS) {
    const clientId = cleanClientId(readBinding(env, clientIdKey));
    if (clientId) return clientId;
  }
  return "";
}

export function validateShopifyBootstrap(url, env = {}) {
  if (!(url instanceof URL)) return false;
  const shopDomain = resolveShopDomain(env);
  if (!shopDomain || url.searchParams.get("shop") !== shopDomain) return false;

  const host = url.searchParams.get("host");
  if (!host || host.length > 1024) return false;
  const decodedHost = decodeBase64UrlText(host);
  if (!decodedHost) return false;

  const shopName = shopDomain.slice(0, -".myshopify.com".length);
  const allowedHosts = new Set([
    `admin.shopify.com/store/${shopName}`,
    `${shopDomain}/admin`,
  ]);
  return allowedHosts.has(decodedHost.replace(/\/+$/u, ""));
}

function resolveShopifyCredentials(env) {
  for (const [clientIdKey, clientSecretKey] of CREDENTIAL_PAIRS) {
    const clientId = cleanClientId(readBinding(env, clientIdKey));
    const clientSecret = cleanSecret(readBinding(env, clientSecretKey));
    if (clientId && clientSecret) {
      return Object.freeze({ clientId, clientSecret });
    }
  }
  return null;
}

function validClaims(claims, clientId, shopDomain, nowSeconds) {
  if (!isPlainObject(claims)) return false;
  if (!audienceIncludes(claims.aud, clientId)) return false;
  if (claims.dest !== `https://${shopDomain}`) return false;
  if (claims.iss !== `https://${shopDomain}/admin`) return false;

  const staffUserId = normalizeUserId(claims.sub);
  if (!staffUserId) return false;

  const exp = integerClaim(claims.exp);
  const nbf = integerClaim(claims.nbf);
  const iat = integerClaim(claims.iat);
  if (exp === null || nbf === null || iat === null) return false;
  if (exp <= nowSeconds - CLOCK_SKEW_SECONDS) return false;
  if (nbf > nowSeconds + CLOCK_SKEW_SECONDS) return false;
  if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return false;
  if (iat < nowSeconds - MAX_TOKEN_AGE_SECONDS) return false;
  if (exp <= iat || exp - iat > MAX_TOKEN_LIFETIME_SECONDS) return false;
  return true;
}

async function verifySignature(cryptoObject, secret, signingInput, signature) {
  try {
    const encoder = new TextEncoder();
    const key = await cryptoObject.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await cryptoObject.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(signingInput),
    );
  } catch {
    return false;
  }
}

function parseJwt(token) {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_BYTES) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !SAFE_JWT_PART.test(part))) return null;
  const header = parseJsonPart(parts[0]);
  const payload = parseJsonPart(parts[1]);
  const signature = decodeBase64UrlBytes(parts[2]);
  if (!isPlainObject(header) || !isPlainObject(payload) || !signature) return null;
  return { header, payload, signature, signingInput: `${parts[0]}.${parts[1]}` };
}

function parseJsonPart(part) {
  const bytes = decodeBase64UrlBytes(part);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function decodeBase64UrlText(value) {
  const bytes = decodeBase64UrlBytes(value);
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decodeBase64UrlBytes(value) {
  if (typeof value !== "string" || value.length === 0 || !SAFE_JWT_PART.test(value)) return null;
  const remainder = value.length % 4;
  if (remainder === 1) return null;
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - remainder) % 4);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function readBearerToken(request) {
  try {
    const value = request?.headers?.get("Authorization");
    if (typeof value !== "string") return null;
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u.exec(value);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function audienceIncludes(value, clientId) {
  if (typeof value === "string") return value === clientId;
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return false;
  return value.every((item) => typeof item === "string") && value.includes(clientId);
}

function integerClaim(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function normalizeUserId(value) {
  const normalized = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";
  return SAFE_USER_ID.test(normalized) ? normalized : "";
}

function parseAllowlist(value) {
  if (typeof value !== "string" || value.length > 8192) return [];
  const output = [];
  for (const item of value.split(",")) {
    const normalized = normalizeUserId(item);
    if (normalized && !output.includes(normalized)) output.push(normalized);
    if (output.length >= 128) break;
  }
  return output;
}

function cleanDomain(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return SAFE_DOMAIN.test(normalized) ? normalized : "";
}

function cleanClientId(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return SAFE_CLIENT_ID.test(normalized) ? normalized : "";
}

function cleanSecret(value) {
  if (typeof value !== "string") return "";
  const bytes = new TextEncoder().encode(value).byteLength;
  return bytes >= 16 && bytes <= MAX_SECRET_BYTES ? value : "";
}

function cleanOptionalIdentifier(value) {
  return typeof value === "string" && SAFE_USER_ID.test(value) ? value : null;
}

function resolveNowSeconds(options) {
  const value = readOwn(options, "now");
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Math.floor(value.getTime() / 1000);
  }
  if (Number.isFinite(value)) return Math.floor(value / 1000);
  return Math.floor(Date.now() / 1000);
}

function readOwn(object, key) {
  if (!object || typeof object !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function readBinding(object, key) {
  if (!object || typeof object !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor) {
      return Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
    }
  } catch {
    return undefined;
  }
  try {
    return object[key];
  } catch {
    return undefined;
  }
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

function failure(code, status) {
  return Object.freeze({
    ok: false,
    status,
    build: KAIROS_SHOPIFY_ADMIN_AUTH_BUILD,
    code,
  });
}
