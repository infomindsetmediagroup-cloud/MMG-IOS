import { ShopifyAdminClient, ShopifyRuntimeError } from "../../kairos/shopify-client.js";
import { assertApprovalExecutionContext } from "./kairos-shopify-mutation-boundary-v1.js";

export const KAIROS_SHOPIFY_PRODUCT_UPDATE_BUILD = "kairos-shopify-product-update-20260807-2-canonical-client-readback";

export const SHOPIFY_PRODUCT_UPDATE_MUTATION = `mutation KairosProductUpdate($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle status updatedAt seo { title description } }
    userErrors { field message }
  }
}`;
const SHOPIFY_PRODUCT_UPDATE_READ = `query KairosProductUpdateRead($id: ID!) {
  product(id: $id) { id title handle status descriptionHtml updatedAt seo { title description } }
}`;

export async function updateShopifyProduct(env, { tool, arguments: args, identity, approvalId } = {}) {
  assertApprovalExecutionContext({ approvalId, identity, tool, arguments: args });
  if (tool?.id !== "shopify.product.update" || tool?.executor !== "shopify-product-update") {
    throw error("SHOPIFY_UPDATE_TOOL_MISMATCH", "The approval is not bound to the Shopify product update executor.", 403);
  }

  const product = buildProductInput(args);
  const client = new ShopifyAdminClient(env);
  const installation = await client.assertScopeGroups([["read_products"], ["write_products"]]);
  const beforePayload = await client.request(SHOPIFY_PRODUCT_UPDATE_READ, { id: product.id });
  if (!beforePayload?.product?.id) throw error("SHOPIFY_PRODUCT_NOT_FOUND", "The Shopify product was not found.", 404);

  const mutated = await client.request(SHOPIFY_PRODUCT_UPDATE_MUTATION, { product });
  rejectUserErrors(mutated?.productUpdate?.userErrors);
  if (!mutated?.productUpdate?.product?.id) throw error("SHOPIFY_PRODUCT_UPDATE_RESPONSE_INVALID", "Shopify did not return the updated product.", 502);

  const afterPayload = await client.request(SHOPIFY_PRODUCT_UPDATE_READ, { id: product.id });
  if (!afterPayload?.product?.id || afterPayload.product.id !== product.id) throw error("SHOPIFY_PRODUCT_UPDATE_READBACK_FAILED", "Shopify product readback did not match the approved product.", 502);

  return {
    verified: true,
    mutated: true,
    source: "shopify-admin-graphql",
    approvalId,
    identity: String(identity),
    shopDomain: installation.shop.myshopifyDomain,
    changedFields: Object.keys(args.changes || {}).sort(),
    before: normalize(beforePayload.product),
    after: normalize(afterPayload.product),
    product: normalize(afterPayload.product),
    build: KAIROS_SHOPIFY_PRODUCT_UPDATE_BUILD,
  };
}

function buildProductInput(args) {
  const id = String(args?.productId || "").trim();
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(id)) throw error("SHOPIFY_PRODUCT_ID_INVALID", "productId must be a Shopify Product GID.", 400);
  const changes = args?.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw error("SHOPIFY_PRODUCT_CHANGES_INVALID", "Validated product changes are required.", 400);
  const product = { id };
  if (changes.title !== undefined) product.title = String(changes.title);
  if (changes.descriptionHtml !== undefined) product.descriptionHtml = String(changes.descriptionHtml);
  if (changes.status !== undefined) product.status = String(changes.status);
  if (changes.seoTitle !== undefined || changes.seoDescription !== undefined) {
    product.seo = {};
    if (changes.seoTitle !== undefined) product.seo.title = String(changes.seoTitle);
    if (changes.seoDescription !== undefined) product.seo.description = String(changes.seoDescription);
  }
  if (Object.keys(product).length === 1) throw error("SHOPIFY_PRODUCT_CHANGES_EMPTY", "At least one approved product field must change.", 400);
  return product;
}

function rejectUserErrors(errors) {
  if (!Array.isArray(errors) || !errors.length) return;
  throw error("SHOPIFY_PRODUCT_UPDATE_REJECTED", errors.slice(0, 5).map((item) => `${Array.isArray(item?.field) ? item.field.join(".") + ": " : ""}${String(item?.message || "Shopify error")}`).join("; "), 422);
}
function normalize(product) {
  return {
    id: text(product?.id, 220), title: text(product?.title, 500), handle: text(product?.handle, 255), status: text(product?.status, 40),
    descriptionHtml: text(product?.descriptionHtml, 50000), updatedAt: iso(product?.updatedAt),
    seo: { title: text(product?.seo?.title, 500), description: text(product?.seo?.description, 1000) },
  };
}
function text(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function iso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function error(code, message, status = 502) { return new ShopifyRuntimeError(code, message, status); }
