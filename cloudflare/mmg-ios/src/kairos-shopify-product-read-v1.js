import { assertShopifyReadConfiguration, buildShopifyAdminGraphQLEndpoint } from "./kairos-shopify-read-boundary-v1.js";

export const KAIROS_SHOPIFY_PRODUCT_READ_BUILD = "kairos-shopify-product-read-20260725-2-least-privilege";
const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 30000;

export const SHOPIFY_PRODUCT_READ_QUERY = `query KairosProductRead($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    status
    descriptionHtml
    vendor
    productType
    tags
    createdAt
    updatedAt
    publishedAt
    onlineStoreUrl
    seo {
      title
      description
    }
    featuredMedia {
      alt
      preview {
        image {
          url
          width
          height
        }
      }
    }
    variants(first: 25) {
      nodes {
        id
        title
        sku
        barcode
        price
        compareAtPrice
        availableForSale
        selectedOptions {
          name
          value
        }
      }
    }
  }
}`;

export async function readShopifyProduct(env, { productId, requestId } = {}) {
  const config = assertShopifyReadConfiguration(env);
  const id = String(productId || "").trim();
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(id)) {
    throw shopifyReadError("SHOPIFY_PRODUCT_ID_INVALID", "productId must be a Shopify Product GID.", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Shopify Admin timeout"), clampTimeout(env?.SHOPIFY_ADMIN_TIMEOUT_MS));
  try {
    const response = await fetch(buildShopifyAdminGraphQLEndpoint(env), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": String(env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        "X-Kairos-Client": KAIROS_SHOPIFY_PRODUCT_READ_BUILD,
        ...(requestId ? { "X-Request-Id": String(requestId).slice(0, 160) } : {}),
      },
      body: JSON.stringify({ query: SHOPIFY_PRODUCT_READ_QUERY, variables: { id } }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw shopifyReadError(
        response.status === 401 || response.status === 403 ? "SHOPIFY_ADMIN_AUTH_FAILED" : "SHOPIFY_ADMIN_HTTP_ERROR",
        `Shopify Admin returned HTTP ${response.status}.`,
        response.status >= 500 ? 503 : 502,
      );
    }
    if (!payload || typeof payload !== "object") {
      throw shopifyReadError("SHOPIFY_ADMIN_RESPONSE_INVALID", "Shopify Admin returned an unreadable response.", 502);
    }
    if (Array.isArray(payload.errors) && payload.errors.length) {
      const message = payload.errors.map((item) => String(item?.message || "GraphQL error")).slice(0, 3).join("; ");
      throw shopifyReadError("SHOPIFY_ADMIN_GRAPHQL_ERROR", message, 502);
    }
    if (!payload.data?.product) {
      throw shopifyReadError("SHOPIFY_PRODUCT_NOT_FOUND", "The Shopify product was not found or is not accessible.", 404);
    }

    return {
      verified: true,
      source: "shopify-admin-graphql",
      shopDomain: config.shopDomain,
      apiVersion: config.apiVersion,
      product: normalizeProduct(payload.data.product),
      cost: normalizeCost(payload.extensions?.cost),
      build: KAIROS_SHOPIFY_PRODUCT_READ_BUILD,
    };
  } catch (error) {
    if (error?.name === "AbortError" || String(error).toLowerCase().includes("timeout")) {
      throw shopifyReadError("SHOPIFY_ADMIN_TIMEOUT", "Shopify Admin did not respond before the read timeout.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeProduct(product) {
  return {
    id: text(product.id, 220),
    title: text(product.title, 500),
    handle: text(product.handle, 255),
    status: text(product.status, 40),
    descriptionHtml: text(product.descriptionHtml, 50000),
    vendor: text(product.vendor, 500),
    productType: text(product.productType, 500),
    tags: Array.isArray(product.tags) ? product.tags.map((tag) => text(tag, 255)).filter(Boolean).slice(0, 250) : [],
    createdAt: iso(product.createdAt),
    updatedAt: iso(product.updatedAt),
    publishedAt: iso(product.publishedAt),
    onlineStoreUrl: safeUrl(product.onlineStoreUrl),
    seo: {
      title: text(product.seo?.title, 500),
      description: text(product.seo?.description, 1000),
    },
    featuredMedia: normalizeFeaturedMedia(product.featuredMedia),
    variants: Array.isArray(product.variants?.nodes)
      ? product.variants.nodes.slice(0, 25).map(normalizeVariant)
      : [],
  };
}

function normalizeVariant(variant) {
  return {
    id: text(variant?.id, 220),
    title: text(variant?.title, 500),
    sku: text(variant?.sku, 255),
    barcode: text(variant?.barcode, 255),
    price: money(variant?.price),
    compareAtPrice: money(variant?.compareAtPrice),
    availableForSale: Boolean(variant?.availableForSale),
    selectedOptions: Array.isArray(variant?.selectedOptions)
      ? variant.selectedOptions.slice(0, 20).map((option) => ({ name: text(option?.name, 255), value: text(option?.value, 255) }))
      : [],
  };
}

function normalizeFeaturedMedia(media) {
  if (!media) return null;
  const image = media.preview?.image;
  return {
    alt: text(media.alt, 1000),
    image: image ? { url: safeUrl(image.url), width: integer(image.width), height: integer(image.height) } : null,
  };
}

function normalizeCost(cost) {
  if (!cost || typeof cost !== "object") return null;
  return {
    requestedQueryCost: integer(cost.requestedQueryCost),
    actualQueryCost: integer(cost.actualQueryCost),
    throttleStatus: cost.throttleStatus ? {
      maximumAvailable: integer(cost.throttleStatus.maximumAvailable),
      currentlyAvailable: integer(cost.throttleStatus.currentlyAvailable),
      restoreRate: integer(cost.throttleStatus.restoreRate),
    } : null,
  };
}

function clampTimeout(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(number))) : DEFAULT_TIMEOUT_MS;
}
function text(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function integer(value) { const number = Number(value); return Number.isFinite(number) ? Math.trunc(number) : 0; }
function money(value) { const number = Number(value); return Number.isFinite(number) ? number.toFixed(2) : null; }
function iso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function safeUrl(value) { const textValue = text(value, 2048); if (!textValue) return null; try { const url = new URL(textValue); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function shopifyReadError(code, message, status = 502) { const error = new Error(message); error.code = code; error.status = status; return error; }
