export const KAIROS_SHOPIFY_EXECUTION_POLICY_BUILD = "kairos-shopify-execution-policy-20260807-1";

const CREATE_WITH_HANDLE = new Set([
  "shopify.product.create",
  "shopify.collection.create",
  "shopify.page.create",
  "shopify.menu.create",
]);

export function validateKairosShopifyExecutionPolicy(toolId, args) {
  const id = String(toolId || "").trim().toLowerCase();
  if (!id.startsWith("shopify.")) return { ok: true, build: KAIROS_SHOPIFY_EXECUTION_POLICY_BUILD };

  if (CREATE_WITH_HANDLE.has(id) && !String(args?.handle || "").trim()) {
    return failure("SHOPIFY_IDEMPOTENCY_HANDLE_REQUIRED", "A deterministic Shopify handle is required before creating this resource.");
  }

  if (id === "shopify.product.create" && String(args?.status || "DRAFT").toUpperCase() !== "DRAFT") {
    return failure("SHOPIFY_PRODUCT_CREATE_DRAFT_ONLY", "New Shopify products must be created as DRAFT. Publishing is a separate approved action.");
  }

  if (id === "shopify.page.create" && args?.isPublished === true) {
    return failure("SHOPIFY_PAGE_CREATE_UNPUBLISHED_ONLY", "New Shopify pages must be created unpublished. Publication is a separate approved update.");
  }

  return { ok: true, build: KAIROS_SHOPIFY_EXECUTION_POLICY_BUILD };
}

function failure(code, message) {
  return {
    ok: false,
    error: { code, message },
    build: KAIROS_SHOPIFY_EXECUTION_POLICY_BUILD,
  };
}
