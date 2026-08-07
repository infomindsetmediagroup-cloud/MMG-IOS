import { ShopifyAdminClient, ShopifyRuntimeError } from "../../kairos/shopify-client.js";

export const KAIROS_SHOPIFY_PRODUCT_READ_BUILD = "kairos-shopify-product-read-20260807-3-canonical-client";

export const SHOPIFY_PRODUCT_READ_QUERY = `query KairosProductRead($id: ID!) {
  product(id: $id) {
    id title handle status descriptionHtml vendor productType tags createdAt updatedAt publishedAt onlineStoreUrl
    seo { title description }
    featuredMedia { alt preview { image { url width height } } }
    variants(first: 25) {
      nodes { id title sku barcode price compareAtPrice availableForSale selectedOptions { name value } }
    }
  }
}`;

export async function readShopifyProduct(env, { productId, requestId } = {}) {
  const id = String(productId || "").trim();
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(id)) {
    throw new ShopifyRuntimeError("SHOPIFY_PRODUCT_ID_INVALID", "productId must be a Shopify Product GID.", 400);
  }
  const client = new ShopifyAdminClient(env);
  const installation = await client.assertScopeGroups([["read_products"]]);
  const payload = await client.request(SHOPIFY_PRODUCT_READ_QUERY, { id });
  if (!payload?.product) {
    throw new ShopifyRuntimeError("SHOPIFY_PRODUCT_NOT_FOUND", "The Shopify product was not found or is not accessible.", 404);
  }
  return {
    verified: true,
    mutated: false,
    source: "shopify-admin-graphql",
    requestId: requestId || null,
    shopDomain: installation.shop.myshopifyDomain,
    product: normalizeProduct(payload.product),
    build: KAIROS_SHOPIFY_PRODUCT_READ_BUILD,
  };
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
    seo: { title: text(product.seo?.title, 500), description: text(product.seo?.description, 1000) },
    featuredMedia: normalizeFeaturedMedia(product.featuredMedia),
    variants: Array.isArray(product.variants?.nodes) ? product.variants.nodes.slice(0, 25).map(normalizeVariant) : [],
  };
}

function normalizeVariant(variant) {
  return {
    id: text(variant?.id, 220), title: text(variant?.title, 500), sku: text(variant?.sku, 255), barcode: text(variant?.barcode, 255),
    price: money(variant?.price), compareAtPrice: money(variant?.compareAtPrice), availableForSale: Boolean(variant?.availableForSale),
    selectedOptions: Array.isArray(variant?.selectedOptions) ? variant.selectedOptions.slice(0, 20).map((option) => ({ name: text(option?.name, 255), value: text(option?.value, 255) })) : [],
  };
}
function normalizeFeaturedMedia(media) {
  if (!media) return null;
  const image = media.preview?.image;
  return { alt: text(media.alt, 1000), image: image ? { url: safeUrl(image.url), width: integer(image.width), height: integer(image.height) } : null };
}
function text(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function integer(value) { const number = Number(value); return Number.isFinite(number) ? Math.trunc(number) : 0; }
function money(value) { const number = Number(value); return Number.isFinite(number) ? number.toFixed(2) : null; }
function iso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function safeUrl(value) { const raw = text(value, 2048); if (!raw) return null; try { const url = new URL(raw); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
