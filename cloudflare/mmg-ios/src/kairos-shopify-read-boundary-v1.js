export const KAIROS_SHOPIFY_READ_BOUNDARY_BUILD = "kairos-shopify-read-boundary-20260725-1";

const ALLOWED_API_VERSIONS = new Set(["2026-07"]);
const REQUIRED_SCOPE = "read_products";

export function inspectShopifyReadConfiguration(env) {
  const shopDomain = normalizeShopDomain(env?.SHOPIFY_SHOP_DOMAIN);
  const accessTokenConfigured = Boolean(String(env?.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim());
  const apiVersion = String(env?.SHOPIFY_ADMIN_API_VERSION || "2026-07").trim();
  const configuredScopes = new Set(String(env?.SHOPIFY_ADMIN_SCOPES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));

  const errors = [];
  if (!shopDomain) errors.push("SHOP_DOMAIN_INVALID");
  if (!accessTokenConfigured) errors.push("ACCESS_TOKEN_MISSING");
  if (!ALLOWED_API_VERSIONS.has(apiVersion)) errors.push("API_VERSION_NOT_ALLOWED");
  if (!configuredScopes.has(REQUIRED_SCOPE)) errors.push("READ_PRODUCTS_SCOPE_MISSING");

  return {
    ready: errors.length === 0,
    mode: "read-only",
    shopDomain,
    apiVersion,
    requiredScope: REQUIRED_SCOPE,
    configuredScopes: [...configuredScopes].sort(),
    tokenConfigured: accessTokenConfigured,
    errors,
    build: KAIROS_SHOPIFY_READ_BOUNDARY_BUILD,
  };
}

export function assertShopifyReadConfiguration(env) {
  const inspection = inspectShopifyReadConfiguration(env);
  if (!inspection.ready) {
    const error = new Error("The governed Shopify read adapter is not configured.");
    error.code = "SHOPIFY_READ_CONFIGURATION_INVALID";
    error.details = inspection.errors;
    throw error;
  }
  return inspection;
}

export function buildShopifyAdminGraphQLEndpoint(env) {
  const inspection = assertShopifyReadConfiguration(env);
  return `https://${inspection.shopDomain}/admin/api/${inspection.apiVersion}/graphql.json`;
}

function normalizeShopDomain(value) {
  const domain = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : "";
}
