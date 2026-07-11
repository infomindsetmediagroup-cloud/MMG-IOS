import type { VercelRequest } from "@vercel/node";
import { readCookie, SESSION_COOKIE_NAME, verifyOperatorSession } from "./session-core.js";

const SHOPIFY_API_VERSION = "2026-07";
let cachedToken: { value: string; expiresAt: number } | null = null;

export interface ShopifyEnvironment {
  shop: string;
  clientID: string;
  clientSecret: string;
  runtimeToken: string;
}

export function requireShopifyEnvironment(): ShopifyEnvironment {
  const shop = normalizeShop(process.env.SHOPIFY_SHOP_DOMAIN || "");
  const clientID = process.env.SHOPIFY_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim() || "";
  const runtimeToken = process.env.KAIROS_RUNTIME_TOKEN?.trim() || "";
  if (!shop || !clientID || !clientSecret || !runtimeToken) {
    throw new Error("Shopify publisher is not configured.");
  }
  return { shop, clientID, clientSecret, runtimeToken };
}

export function requireOperatorSession(request: VercelRequest, runtimeToken: string): void {
  const cookieHeader = Array.isArray(request.headers.cookie) ? request.headers.cookie[0] : request.headers.cookie;
  const token = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!verifyOperatorSession(token, runtimeToken)) {
    const error = new Error("Kairos operator session required.");
    error.name = "UnauthorizedError";
    throw error;
  }
}

export async function getShopifyAccessToken(env: ShopifyEnvironment): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.clientID,
    client_secret: env.clientSecret,
  });
  const response = await fetch(`https://${env.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Shopify token request failed (${response.status}).`);
  }
  cachedToken = {
    value: payload.access_token,
    expiresAt: now + Math.max(300, Number(payload.expires_in || 86_399)),
  };
  return cachedToken.value;
}

export async function shopifyGraphQL<T>(env: ShopifyEnvironment, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const accessToken = await getShopifyAccessToken(env);
  const response = await fetch(`https://${env.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.map(item => item.message).filter(Boolean).join("; ") || `Shopify API request failed (${response.status}).`);
  }
  return payload.data;
}

function normalizeShop(value: string): string {
  const shop = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : "";
}
