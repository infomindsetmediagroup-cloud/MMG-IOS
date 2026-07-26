import { assertShopifyMutationConfiguration, assertApprovalExecutionContext } from "./kairos-shopify-mutation-boundary-v1.js";
import { buildShopifyAdminGraphQLEndpoint } from "./kairos-shopify-read-boundary-v1.js";

export const KAIROS_SHOPIFY_PRODUCT_PUBLISH_BUILD = "kairos-shopify-product-publish-20260725-1";
const DEFAULT_TIMEOUT_MS = 15000;

export const SHOPIFY_PRODUCT_PUBLISH_MUTATION = `mutation KairosProductPublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    publishable {
      availablePublicationsCount { count }
      resourcePublicationsCount { count }
    }
    userErrors { field message }
  }
}`;

export async function publishShopifyProduct(env, { tool, arguments: args, identity, approvalId } = {}) {
  assertApprovalExecutionContext({ approvalId, identity, tool, arguments: args });
  const config = assertShopifyMutationConfiguration(env, "product-publication");
  if (tool?.id !== "shopify.product.publish" || tool?.executor !== "shopify-product-publish") {
    throw publicationError("SHOPIFY_PUBLICATION_TOOL_MISMATCH", "The approval is not bound to the Shopify publication executor.", 403);
  }

  const productId = requireGid(args?.productId, "Product", "productId");
  const publicationId = requireGid(args?.publicationId, "Publication", "publicationId");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), clampTimeout(env?.SHOPIFY_ADMIN_TIMEOUT_MS));

  try {
    const response = await fetch(buildShopifyAdminGraphQLEndpoint(env), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": String(env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        "X-Kairos-Client": KAIROS_SHOPIFY_PRODUCT_PUBLISH_BUILD,
        "X-Kairos-Approval-Id": String(approvalId),
        "X-Kairos-Approval-Identity": String(identity).slice(0, 240),
      },
      body: JSON.stringify({
        query: SHOPIFY_PRODUCT_PUBLISH_MUTATION,
        variables: { id: productId, input: [{ publicationId }] },
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw publicationError(response.status === 401 || response.status === 403 ? "SHOPIFY_ADMIN_AUTH_FAILED" : "SHOPIFY_ADMIN_HTTP_ERROR", `Shopify Admin returned HTTP ${response.status}.`, response.status >= 500 ? 503 : 502);
    if (!payload || typeof payload !== "object") throw publicationError("SHOPIFY_ADMIN_RESPONSE_INVALID", "Shopify Admin returned an unreadable response.", 502);
    if (Array.isArray(payload.errors) && payload.errors.length) throw publicationError("SHOPIFY_ADMIN_GRAPHQL_ERROR", summarizeErrors(payload.errors), 502);

    const mutation = payload.data?.publishablePublish;
    const userErrors = mutation?.userErrors || [];
    if (userErrors.length) throw publicationError("SHOPIFY_PRODUCT_PUBLICATION_REJECTED", summarizeErrors(userErrors), 422);
    if (!mutation?.publishable) throw publicationError("SHOPIFY_PRODUCT_PUBLICATION_RESPONSE_INVALID", "Shopify did not confirm the publication.", 502);

    return {
      verified: true,
      mutated: true,
      source: "shopify-admin-graphql",
      approvalId,
      identity: String(identity),
      shopDomain: config.shopDomain,
      apiVersion: config.apiVersion,
      productId,
      publicationId,
      publicationCounts: {
        available: integer(mutation.publishable.availablePublicationsCount?.count),
        active: integer(mutation.publishable.resourcePublicationsCount?.count),
      },
      build: KAIROS_SHOPIFY_PRODUCT_PUBLISH_BUILD,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw publicationError("SHOPIFY_ADMIN_TIMEOUT", "Shopify Admin did not respond before the publication timeout.", 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requireGid(value, type, key) {
  const id = String(value || "").trim();
  if (!new RegExp(`^gid:\/\/shopify\/${type}\/\\d+$`).test(id)) throw publicationError("SHOPIFY_PUBLICATION_ARGUMENT_INVALID", `${key} must be a Shopify ${type} GID.`, 400);
  return id;
}
function summarizeErrors(errors) { return errors.slice(0, 5).map((item) => `${Array.isArray(item?.field) ? item.field.join(".") + ": " : ""}${String(item?.message || "Shopify error")}`).join("; "); }
function clampTimeout(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(3000, Math.min(30000, Math.floor(n))) : DEFAULT_TIMEOUT_MS; }
function integer(value) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function publicationError(code, message, status = 502) { const error = new Error(message); error.code = code; error.status = status; return error; }
