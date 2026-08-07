export const KAIROS_SHOPIFY_READ_BOUNDARY_BUILD = "kairos-shopify-read-boundary-20260807-3-scope-implication";

const ALLOWED_API_VERSIONS = new Set(["2026-07"]);
const CAPABILITY_SCOPES = Object.freeze({
  "product-read": Object.freeze({ all: ["read_products"] }),
  "site-inspect": Object.freeze({ any: [["read_online_store_pages", "read_content"]], all: ["read_online_store_navigation"] }),
  "theme-role": Object.freeze({ all: ["read_themes"] }),
});

export function inspectShopifyReadConfiguration(env, capability = "product-read") {
  const normalizedCapability = String(capability || "product-read").trim().toLowerCase();
  const shopDomain = normalizeShopDomain(env?.SHOPIFY_SHOP_DOMAIN);
  const accessTokenConfigured = Boolean(String(env?.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim());
  const apiVersion = String(env?.SHOPIFY_ADMIN_API_VERSION || "2026-07").trim();
  const configuredScopes = new Set(String(env?.SHOPIFY_ADMIN_SCOPES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));
  const requirement = CAPABILITY_SCOPES[normalizedCapability] || null;

  const errors = [];
  if (!requirement) errors.push("CAPABILITY_INVALID");
  if (!shopDomain) errors.push("SHOP_DOMAIN_INVALID");
  if (!accessTokenConfigured) errors.push("ACCESS_TOKEN_MISSING");
  if (!ALLOWED_API_VERSIONS.has(apiVersion)) errors.push("API_VERSION_NOT_ALLOWED");
  if (requirement && !scopesSatisfied(requirement, configuredScopes)) errors.push("REQUIRED_SCOPE_MISSING");

  const requiredScopes = requirement ? [...(requirement.all || []), ...(requirement.any || []).map((group) => group.join("|"))] : [];
  return {
    ready: errors.length === 0,
    capability: normalizedCapability,
    mode: "read-only",
    shopDomain,
    apiVersion,
    requiredScopes,
    requiredScope: requiredScopes.length === 1 ? requiredScopes[0] : null,
    configuredScopes: [...configuredScopes].sort(),
    tokenConfigured: accessTokenConfigured,
    errors,
    build: KAIROS_SHOPIFY_READ_BOUNDARY_BUILD,
  };
}

export function assertShopifyReadConfiguration(env, capability = "product-read") {
  const inspection = inspectShopifyReadConfiguration(env, capability);
  if (!inspection.ready) {
    const error = new Error("The governed Shopify read adapter is not configured.");
    error.code = "SHOPIFY_READ_CONFIGURATION_INVALID";
    error.details = inspection.errors;
    error.configuration = inspection;
    throw error;
  }
  return inspection;
}

export function buildShopifyAdminGraphQLEndpoint(env, capability = "product-read") {
  const inspection = assertShopifyReadConfiguration(env, capability);
  return `https://${inspection.shopDomain}/admin/api/${inspection.apiVersion}/graphql.json`;
}

export function buildShopifyAdminGraphQLEndpointFromConfiguration(configuration) {
  if (!configuration?.shopDomain || !configuration?.apiVersion) {
    const error = new Error("A validated Shopify configuration is required.");
    error.code = "SHOPIFY_CONFIGURATION_REQUIRED";
    throw error;
  }
  return `https://${configuration.shopDomain}/admin/api/${configuration.apiVersion}/graphql.json`;
}

function scopesSatisfied(requirement, configuredScopes) {
  const all = requirement.all || [];
  const any = requirement.any || [];
  return all.every((scope) => hasScope(configuredScopes, scope))
    && any.every((group) => group.some((scope) => hasScope(configuredScopes, scope)));
}

function hasScope(configuredScopes, scope) {
  if (configuredScopes.has(scope)) return true;
  if (scope.startsWith("read_")) return configuredScopes.has(`write_${scope.slice(5)}`);
  return false;
}

function normalizeShopDomain(value) {
  const domain = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : "";
}
