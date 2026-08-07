export const KAIROS_SHOPIFY_CUSTOMER_ACCOUNT_AUTH_BUILD = "kairos-shopify-customer-account-auth-20260807-1-session-jwt";

const DEFAULT_SHOP_DOMAIN = "07kd8e-qw.myshopify.com";
const MAX_TOKEN_BYTES = 8192;
const DEFAULT_CLOCK_SKEW_SECONDS = 15;
const DEFAULT_MAX_TOKEN_LIFETIME_SECONDS = 360;
const CUSTOMER_GID_PATTERN = /^gid:\/\/shopify\/Customer\/([1-9]\d*)$/;
const CREDENTIAL_PAIRS = [
  ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
  ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"],
];

export async function verifyShopifyCustomerAccountSession(request, env = {}, options = {}) {
  const token = extractBearerToken(request);
  if (!token) return failure(401, "CUSTOMER_SESSION_TOKEN_MISSING");

  const credentials = resolveCredentials(env);
  if (!credentials) return failure(503, "CUSTOMER_SESSION_AUTH_NOT_CONFIGURED");

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return failure(401, "CUSTOMER_SESSION_TOKEN_INVALID");
  }

  let header;
  let payload;
  let signature;
  try {
    header = decodeJsonSegment(parts[0]);
    payload = decodeJsonSegment(parts[1]);
    signature = decodeBase64Url(parts[2]);
  } catch {
    return failure(401, "CUSTOMER_SESSION_TOKEN_INVALID");
  }

  if (!isRecord(header) || !isRecord(payload) || header.alg !== "HS256") {
    return failure(401, "CUSTOMER_SESSION_TOKEN_INVALID");
  }

  const signatureValid = await verifySignature(`${parts[0]}.${parts[1]}`, signature, credentials.clientSecret)
    .catch(() => false);
  if (!signatureValid) return failure(401, "CUSTOMER_SESSION_SIGNATURE_INVALID");

  if (!audienceMatches(payload.aud, credentials.clientId)) {
    return failure(401, "CUSTOMER_SESSION_AUDIENCE_INVALID");
  }

  const expectedShopDomain = normalizeShopDomain(
    env?.KAIROS_SHOPIFY_SHOP_DOMAIN || env?.SHOPIFY_STORE_DOMAIN || DEFAULT_SHOP_DOMAIN,
  );
  const tokenShopDomain = normalizeShopDomain(payload.dest);
  if (!expectedShopDomain || !tokenShopDomain || tokenShopDomain !== expectedShopDomain) {
    return failure(401, "CUSTOMER_SESSION_DESTINATION_INVALID");
  }

  const now = Number.isFinite(options.nowSeconds)
    ? Math.floor(options.nowSeconds)
    : Math.floor(Date.now() / 1000);
  const clockSkewSeconds = positiveInteger(options.clockSkewSeconds, DEFAULT_CLOCK_SKEW_SECONDS);
  const maxTokenLifetimeSeconds = positiveInteger(
    options.maxTokenLifetimeSeconds,
    DEFAULT_MAX_TOKEN_LIFETIME_SECONDS,
  );

  const issuedAt = numericDate(payload.iat);
  const expiresAt = numericDate(payload.exp);
  const notBefore = payload.nbf == null ? issuedAt : numericDate(payload.nbf);
  if (issuedAt == null || expiresAt == null || notBefore == null) {
    return failure(401, "CUSTOMER_SESSION_TIME_INVALID");
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > maxTokenLifetimeSeconds + clockSkewSeconds) {
    return failure(401, "CUSTOMER_SESSION_TIME_INVALID");
  }
  if (now > expiresAt + clockSkewSeconds) {
    return failure(401, "CUSTOMER_SESSION_EXPIRED");
  }
  if (notBefore > now + clockSkewSeconds || issuedAt > now + clockSkewSeconds) {
    return failure(401, "CUSTOMER_SESSION_NOT_ACTIVE");
  }
  if (now - issuedAt > maxTokenLifetimeSeconds + clockSkewSeconds) {
    return failure(401, "CUSTOMER_SESSION_TOO_OLD");
  }

  const shopifyCustomerId = clean(payload.sub, 255);
  const customerMatch = shopifyCustomerId.match(CUSTOMER_GID_PATTERN);
  if (!customerMatch) return failure(401, "CUSTOMER_SESSION_SUBJECT_INVALID");

  return {
    ok: true,
    status: 200,
    code: "CUSTOMER_SESSION_VALID",
    build: KAIROS_SHOPIFY_CUSTOMER_ACCOUNT_AUTH_BUILD,
    shopDomain: tokenShopDomain,
    shopifyCustomerId,
    customerNumericId: customerMatch[1],
    issuedAt,
    expiresAt,
    sessionId: clean(payload.sid || payload.jti, 255) || null,
  };
}

function extractBearerToken(request) {
  const authorization = String(request?.headers?.get?.("authorization") || "").trim();
  if (!authorization || authorization.length > MAX_TOKEN_BYTES + 32) return "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return "";
  const token = match[1].trim();
  if (!token || token.length > MAX_TOKEN_BYTES || /\s/.test(token)) return "";
  return token;
}

function resolveCredentials(env) {
  for (const [clientIdKey, clientSecretKey] of CREDENTIAL_PAIRS) {
    const clientId = clean(env?.[clientIdKey], 1024);
    const clientSecret = clean(env?.[clientSecretKey], 8192);
    if (clientId && clientSecret) return { clientId, clientSecret };
  }
  return null;
}

async function verifySignature(signingInput, signature, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(signingInput),
  );
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

function decodeBase64Url(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function audienceMatches(audience, expected) {
  if (typeof audience === "string") return audience === expected;
  if (Array.isArray(audience)) return audience.some((value) => value === expected);
  return false;
}

function normalizeShopDomain(value) {
  const raw = clean(value, 1024).toLowerCase();
  if (!raw) return "";
  if (raw.includes("://")) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
      if (url.pathname !== "/" || url.search || url.hash) return "";
      return url.hostname.replace(/\.$/, "");
    } catch {
      return "";
    }
  }
  if (/[\/@:#?]/.test(raw)) return "";
  return raw.replace(/\.$/, "");
}

function numericDate(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}

function positiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function failure(status, code) {
  return {
    ok: false,
    status,
    code,
    build: KAIROS_SHOPIFY_CUSTOMER_ACCOUNT_AUTH_BUILD,
  };
}
