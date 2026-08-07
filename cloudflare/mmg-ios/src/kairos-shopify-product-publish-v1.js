import { ShopifyAdminClient, ShopifyRuntimeError } from "../../kairos/shopify-client.js";
import { assertApprovalExecutionContext } from "./kairos-shopify-mutation-boundary-v1.js";

export const KAIROS_SHOPIFY_PRODUCT_PUBLISH_BUILD = "kairos-shopify-product-publish-20260807-3-canonical-client-readback";

export const SHOPIFY_PRODUCT_PUBLISH_MUTATION = `mutation KairosProductPublish($id: ID!, $publicationId: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    publishable {
      publishedOnPublication(publicationId: $publicationId)
      availablePublicationsCount { count }
      resourcePublicationsCount { count }
    }
    userErrors { field message }
  }
}`;
const PRODUCT_PUBLICATION_READ = `query KairosProductPublicationPreflight($id: ID!, $publicationId: ID!) {
  product(id: $id) { id title status publishedOnPublication(publicationId: $publicationId) }
}`;

export async function publishShopifyProduct(env, { tool, arguments: args, identity, approvalId } = {}) {
  assertApprovalExecutionContext({ approvalId, identity, tool, arguments: args });
  if (tool?.id !== "shopify.product.publish" || tool?.executor !== "shopify-product-publish") {
    throw error("SHOPIFY_PUBLICATION_TOOL_MISMATCH", "The approval is not bound to the Shopify publication executor.", 403);
  }

  const productId = requireGid(args?.productId, "Product", "productId");
  const publicationId = requireGid(args?.publicationId, "Publication", "publicationId");
  const client = new ShopifyAdminClient(env);
  const installation = await client.assertScopeGroups([["read_products"], ["write_publications"]]);

  const before = await client.request(PRODUCT_PUBLICATION_READ, { id: productId, publicationId });
  if (!before?.product?.id) throw error("SHOPIFY_PRODUCT_NOT_FOUND", "The Shopify product was not found.", 404);
  if (before.product.publishedOnPublication === true) {
    return {
      verified: true,
      mutated: false,
      idempotent: true,
      source: "shopify-admin-graphql",
      approvalId,
      identity: String(identity),
      shopDomain: installation.shop.myshopifyDomain,
      productId,
      publicationId,
      verification: {
        verified: true,
        type: "shopify-publication-target",
        productId,
        publicationId,
        publishedOnTarget: true,
        checkedAt: new Date().toISOString(),
      },
      build: KAIROS_SHOPIFY_PRODUCT_PUBLISH_BUILD,
    };
  }

  const mutation = await client.request(SHOPIFY_PRODUCT_PUBLISH_MUTATION, {
    id: productId,
    publicationId,
    input: [{ publicationId }],
  });
  rejectUserErrors(mutation?.publishablePublish?.userErrors);
  if (!mutation?.publishablePublish?.publishable) throw error("SHOPIFY_PRODUCT_PUBLICATION_RESPONSE_INVALID", "Shopify did not confirm the publication.", 502);

  const after = await client.request(PRODUCT_PUBLICATION_READ, { id: productId, publicationId });
  const publishedOnTarget = after?.product?.publishedOnPublication === true;
  if (!publishedOnTarget) throw error("SHOPIFY_PRODUCT_PUBLICATION_VERIFICATION_FAILED", "Shopify did not confirm publication on the approved publication target after readback.", 409);

  return {
    verified: true,
    mutated: true,
    source: "shopify-admin-graphql",
    approvalId,
    identity: String(identity),
    shopDomain: installation.shop.myshopifyDomain,
    productId,
    publicationId,
    publicationCounts: {
      available: integer(mutation.publishablePublish.availablePublicationsCount?.count),
      active: integer(mutation.publishablePublish.resourcePublicationsCount?.count),
    },
    verification: {
      verified: true,
      type: "shopify-publication-target",
      productId,
      publicationId,
      publishedOnTarget,
      automaticRollback: false,
      requiresNewApprovalForUnpublish: true,
      checkedAt: new Date().toISOString(),
    },
    build: KAIROS_SHOPIFY_PRODUCT_PUBLISH_BUILD,
  };
}

function requireGid(value, type, key) {
  const id = String(value || "").trim();
  if (!new RegExp(`^gid:\/\/shopify\/${type}\/\\d+$`).test(id)) throw error("SHOPIFY_PUBLICATION_ARGUMENT_INVALID", `${key} must be a Shopify ${type} GID.`, 400);
  return id;
}
function rejectUserErrors(errors) {
  if (!Array.isArray(errors) || !errors.length) return;
  throw error("SHOPIFY_PRODUCT_PUBLICATION_REJECTED", errors.slice(0, 5).map((item) => `${Array.isArray(item?.field) ? item.field.join(".") + ": " : ""}${String(item?.message || "Shopify error")}`).join("; "), 422);
}
function integer(value) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function error(code, message, status = 502) { return new ShopifyRuntimeError(code, message, status); }
