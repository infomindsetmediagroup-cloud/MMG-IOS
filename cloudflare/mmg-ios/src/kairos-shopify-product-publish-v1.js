import { ShopifyAdminClient, ShopifyRuntimeError } from "../../kairos/shopify-client.js";
import { assertApprovalExecutionContext } from "./kairos-shopify-mutation-boundary-v1.js";

export const KAIROS_SHOPIFY_PRODUCT_PUBLISH_BUILD = "kairos-shopify-product-publish-20260807-4-product-page-qc";

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
  product(id: $id) {
    id
    title
    handle
    status
    descriptionHtml
    vendor
    productType
    tags
    templateSuffix
    seo { title description }
    collections(first: 10) { nodes { id handle } }
    variants(first: 10) { nodes { id price } }
    media(first: 20) { nodes { ... on MediaImage { image { altText } } } }
    publishedOnPublication(publicationId: $publicationId)
  }
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
  const productPageQc = assertPublishReadyProduct(before.product);
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
      productPageContract: "mmg-shopify-product-page-canonical-v1",
      productPageQc,
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
  const afterProductPageQc = assertPublishReadyProduct(after.product);

  return {
    verified: true,
    mutated: true,
    source: "shopify-admin-graphql",
    approvalId,
    identity: String(identity),
    shopDomain: installation.shop.myshopifyDomain,
    productId,
    publicationId,
    productPageContract: "mmg-shopify-product-page-canonical-v1",
    productPageQc: afterProductPageQc,
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

function assertPublishReadyProduct(product) {
  const missing = [];
  if (!clean(product?.title)) missing.push("title");
  if (!clean(product?.handle)) missing.push("handle");
  if (!clean(product?.descriptionHtml)) missing.push("descriptionHtml");
  if (!clean(product?.vendor)) missing.push("vendor");
  if (!clean(product?.productType)) missing.push("productType");
  if (!clean(product?.seo?.title)) missing.push("seo.title");
  if (!clean(product?.seo?.description)) missing.push("seo.description");
  if (!clean(product?.templateSuffix)) missing.push("templateSuffix");

  const tags = Array.isArray(product?.tags) ? product.tags.map(clean).filter(Boolean) : [];
  if (!tags.length) missing.push("tags");
  if (/digital|download|ebook|e-book|pdf/iu.test(clean(product?.productType)) && !tags.includes("Digital Download")) {
    missing.push("Digital Download tag");
  }

  const collections = Array.isArray(product?.collections?.nodes) ? product.collections.nodes.filter((item) => item?.id) : [];
  if (collections.length < 3 || collections.length > 5) missing.push("collections(3-5)");

  const variants = Array.isArray(product?.variants?.nodes) ? product.variants.nodes : [];
  if (!variants.length || variants.some((variant) => !(Number(variant?.price) > 0))) missing.push("variant price");

  const media = Array.isArray(product?.media?.nodes) ? product.media.nodes : [];
  const imageMedia = media.filter((item) => item?.image);
  if (!imageMedia.length) missing.push("product image");
  if (imageMedia.length && imageMedia.some((item) => !clean(item?.image?.altText))) missing.push("product image alt text");

  if (clean(product?.status).toUpperCase() !== "ACTIVE") missing.push("status ACTIVE");

  if (missing.length) {
    throw error(
      "SHOPIFY_PRODUCT_PAGE_CONTRACT_INCOMPLETE",
      `Publication blocked by mmg-shopify-product-page-canonical-v1. Missing or invalid Shopify-native requirements: ${[...new Set(missing)].join(", ")}.`,
      409,
    );
  }

  return {
    verified: true,
    contractId: "mmg-shopify-product-page-canonical-v1",
    shopifyNativeChecks: {
      seo: true,
      handle: true,
      vendorAndProductType: true,
      tags: true,
      collections: collections.length,
      pricedVariants: variants.length,
      productImages: imageMedia.length,
      imageAltText: true,
      template: true,
      activeStatus: true,
    },
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
function clean(value) { return String(value ?? "").replace(/\u0000/g, "").trim(); }
function integer(value) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function error(code, message, status = 502) { return new ShopifyRuntimeError(code, message, status); }
