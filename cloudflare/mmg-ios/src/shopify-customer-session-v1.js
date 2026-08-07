export const SHOPIFY_CUSTOMER_SESSION_BUILD = "shopify-customer-session-20260807-1";

const CUSTOMER_GID = /^gid:\/\/shopify\/Customer\/\d+$/;
const DEFAULT_SHOP = "07kd8e-qw.myshopify.com";
const CLOCK_SKEW_SECONDS = 30;

export async function verifyShopifyCustomerSession(request, env) {
  const token = bearer(request);
  if (!token) return failure("CUSTOMER_AUTH_REQUIRED", "Authenticated Shopify customer access is required.");

  const secret = clean(env?.SHOPIFY_APP_CLIENT_SECRET || env?.SHOPIFY_APP_SECRET, 512);
  const expectedAudience = clean(env?.SHOPIFY_APP_CLIENT_ID || env?.KAIROS_SHOPIFY_APP_CLIENT_ID, 256);
  const expectedShop = clean(env?.SHOPIFY_SHOP_DOMAIN || env?.KAIROS_SHOPIFY_DOMAIN || DEFAULT_SHOP, 320).toLowerCase();
  if (!secret || !expectedAudience) {
    return failure("CUSTOMER_AUTH_CONFIGURATION_MISSING", "Customer authentication is not configured.", 503);
  }

  const parts = token.split(".");
  if (parts.length !== 3) return failure("CUSTOMER_SESSION_INVALID", "Customer session token is invalid.");

  let header;
  let payload;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]));
    payload = JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return failure("CUSTOMER_SESSION_INVALID", "Customer session token is invalid.");
  }

  if (header?.alg !== "HS256") return failure("CUSTOMER_SESSION_INVALID", "Customer session token algorithm is invalid.");
  if (!timingSafeText(await sign(`${parts[0]}.${parts[1]}`, secret), parts[2])) {
    return failure("CUSTOMER_SESSION_INVALID", "Customer session token signature is invalid.");
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload?.exp || 0);
  const nbf = Number(payload?.nbf || 0);
  if (!exp || exp < now - CLOCK_SKEW_SECONDS || (nbf && nbf > now + CLOCK_SKEW_SECONDS)) {
    return failure("CUSTOMER_SESSION_EXPIRED", "Customer session has expired.");
  }
  if (String(payload?.aud || "") !== expectedAudience) {
    return failure("CUSTOMER_SESSION_AUDIENCE_INVALID", "Customer session audience is invalid.");
  }

  const dest = normalizeShop(payload?.dest);
  if (!dest || dest !== normalizeShop(expectedShop)) {
    return failure("CUSTOMER_SESSION_SHOP_INVALID", "Customer session shop is invalid.");
  }

  const shopifyCustomerId = clean(payload?.sub, 180);
  if (!CUSTOMER_GID.test(shopifyCustomerId)) {
    return failure("CUSTOMER_SESSION_SUBJECT_INVALID", "Signed-in Shopify customer identity is required.");
  }

  return {
    ok: true,
    customerId: mapCustomerId(shopifyCustomerId, env),
    shopifyCustomerId,
    shop: dest,
    sessionId: clean(payload?.sid, 180) || null,
    tokenId: clean(payload?.jti, 180) || null,
  };
}

function mapCustomerId(shopifyCustomerId, env) {
  const raw = clean(env?.KAIROS_CUSTOMER_ID_MAP, 20000);
  if (!raw) return shopifyCustomerId;
  try {
    const map = JSON.parse(raw);
    const mapped = clean(map?.[shopifyCustomerId], 180);
    return mapped || shopifyCustomerId;
  } catch {
    return shopifyCustomerId;
  }
}

function bearer(request) {
  const value = String(request.headers.get("authorization") || "");
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function normalizeShop(value) {
  return clean(value, 320).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

async function sign(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return encodeBase64Url(new Uint8Array(signature));
}

function timingSafeText(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function failure(code, message, status = 401) {
  return { ok: false, status, code, message };
}
