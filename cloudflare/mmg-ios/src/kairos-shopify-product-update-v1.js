import { assertShopifyMutationConfiguration, assertApprovalExecutionContext } from "./kairos-shopify-mutation-boundary-v1.js";
import { buildShopifyAdminGraphQLEndpoint } from "./kairos-shopify-read-boundary-v1.js";

export const KAIROS_SHOPIFY_PRODUCT_UPDATE_BUILD = "kairos-shopify-product-update-20260725-1";
const DEFAULT_TIMEOUT_MS = 15000;

export const SHOPIFY_PRODUCT_UPDATE_MUTATION = `mutation KairosProductUpdate($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product {
      id
      title
      status
      updatedAt
      seo { title description }
    }
    userErrors { field message }
  }
}`;

export async function updateShopifyProduct(env, { tool, arguments: args, identity, approvalId } = {}) {
  assertApprovalExecutionContext({ approvalId, identity, tool, arguments: args });
  const config = assertShopifyMutationConfiguration(env, "product-update");
  if (tool?.id !== "shopify.product.update" || tool?.executor !== "shopify-product-update") {
    throw mutationError("SHOPIFY_UPDATE_TOOL_MISMATCH", "The approval is not bound to the Shopify product update executor.", 403);
  }

  const product = buildProductInput(args);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), clampTimeout(env?.SHOPIFY_ADMIN_TIMEOUT_MS));
  try {
    const response = await fetch(buildShopifyAdminGraphQLEndpoint(env), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": String(env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        "X-Kairos-Client": KAIROS_SHOPIFY_PRODUCT_UPDATE_BUILD,
        "X-Kairos-Approval-Id": String(approvalId),
        "X-Kairos-Approval-Identity": String(identity).slice(0, 240),
      },
      body: JSON.stringify({ query: SHOPIFY_PRODUCT_UPDATE_MUTATION, variables: { product } }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw mutationError(response.status === 401 || response.status === 403 ? "SHOPIFY_ADMIN_AUTH_FAILED" : "SHOPIFY_ADMIN_HTTP_ERROR", `Shopify Admin returned HTTP ${response.status}.`, response.status >= 500 ? 503 : 502);
    if (!payload || typeof payload !== "object") throw mutationError("SHOPIFY_ADMIN_RESPONSE_INVALID", "Shopify Admin returned an unreadable response.", 502);
    if (Array.isArray(payload.errors) && payload.errors.length) throw mutationError("SHOPIFY_ADMIN_GRAPHQL_ERROR", summarizeErrors(payload.errors), 502);
    const userErrors = payload.data?.productUpdate?.userErrors || [];
    if (userErrors.length) throw mutationError("SHOPIFY_PRODUCT_UPDATE_REJECTED", summarizeErrors(userErrors), 422);
    const updated = payload.data?.productUpdate?.product;
    if (!updated?.id) throw mutationError("SHOPIFY_PRODUCT_UPDATE_RESPONSE_INVALID", "Shopify did not return the updated product.", 502);

    return {
      verified: true,
      mutated: true,
      source: "shopify-admin-graphql",
      approvalId,
      identity: String(identity),
      shopDomain: config.shopDomain,
      apiVersion: config.apiVersion,
      changedFields: Object.keys(args.changes || {}).sort(),
      product: {
        id: text(updated.id, 220),
        title: text(updated.title, 500),
        status: text(updated.status, 40),
        updatedAt: iso(updated.updatedAt),
        seo: { title: text(updated.seo?.title, 500), description: text(updated.seo?.description, 1000) },
      },
      build: KAIROS_SHOPIFY_PRODUCT_UPDATE_BUILD,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw mutationError("SHOPIFY_ADMIN_TIMEOUT", "Shopify Admin did not respond before the mutation timeout.", 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildProductInput(args) {
  const id = String(args?.productId || "").trim();
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(id)) throw mutationError("SHOPIFY_PRODUCT_ID_INVALID", "productId must be a Shopify Product GID.", 400);
  const changes = args?.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw mutationError("SHOPIFY_PRODUCT_CHANGES_INVALID", "Validated product changes are required.", 400);
  const product = { id };
  if (changes.title !== undefined) product.title = String(changes.title);
  if (changes.descriptionHtml !== undefined) product.descriptionHtml = String(changes.descriptionHtml);
  if (changes.status !== undefined) product.status = String(changes.status);
  if (changes.seoTitle !== undefined || changes.seoDescription !== undefined) {
    product.seo = {};
    if (changes.seoTitle !== undefined) product.seo.title = String(changes.seoTitle);
    if (changes.seoDescription !== undefined) product.seo.description = String(changes.seoDescription);
  }
  if (Object.keys(product).length === 1) throw mutationError("SHOPIFY_PRODUCT_CHANGES_EMPTY", "At least one approved product field must change.", 400);
  return product;
}

function summarizeErrors(errors) { return errors.slice(0, 5).map((item) => `${Array.isArray(item?.field) ? item.field.join(".") + ": " : ""}${String(item?.message || "Shopify error")}`).join("; "); }
function clampTimeout(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(3000, Math.min(30000, Math.floor(n))) : DEFAULT_TIMEOUT_MS; }
function text(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function iso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function mutationError(code, message, status = 502) { const error = new Error(message); error.code = code; error.status = status; return error; }
