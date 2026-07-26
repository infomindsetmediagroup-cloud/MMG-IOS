export const KAIROS_SHOPIFY_MUTATION_BOUNDARY_BUILD = "kairos-shopify-mutation-boundary-20260725-1";

const UPDATE_SCOPE = "write_products";
const PUBLICATION_SCOPE = "write_publications";
const ALLOWED_API_VERSIONS = new Set(["2026-07"]);

export function inspectShopifyMutationConfiguration(env, capability) {
  const normalizedCapability = String(capability || "").trim().toLowerCase();
  const shopDomain = normalizeShopDomain(env?.SHOPIFY_SHOP_DOMAIN);
  const apiVersion = String(env?.SHOPIFY_ADMIN_API_VERSION || "2026-07").trim();
  const tokenConfigured = Boolean(String(env?.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim());
  const configuredScopes = new Set(String(env?.SHOPIFY_ADMIN_SCOPES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));

  const requiredScope = normalizedCapability === "product-update"
    ? UPDATE_SCOPE
    : normalizedCapability === "product-publication"
      ? PUBLICATION_SCOPE
      : "";

  const errors = [];
  if (!requiredScope) errors.push("CAPABILITY_INVALID");
  if (!shopDomain) errors.push("SHOP_DOMAIN_INVALID");
  if (!tokenConfigured) errors.push("ACCESS_TOKEN_MISSING");
  if (!ALLOWED_API_VERSIONS.has(apiVersion)) errors.push("API_VERSION_NOT_ALLOWED");
  if (requiredScope && !configuredScopes.has(requiredScope)) errors.push("REQUIRED_SCOPE_MISSING");

  return {
    ready: errors.length === 0,
    capability: normalizedCapability,
    mode: "approval-gated-mutation",
    shopDomain,
    apiVersion,
    tokenConfigured,
    configuredScopes: [...configuredScopes].sort(),
    requiredScope,
    errors,
    build: KAIROS_SHOPIFY_MUTATION_BOUNDARY_BUILD,
  };
}

export function assertShopifyMutationConfiguration(env, capability) {
  const inspection = inspectShopifyMutationConfiguration(env, capability);
  if (!inspection.ready) {
    const error = new Error("The governed Shopify mutation adapter is not configured.");
    error.code = "SHOPIFY_MUTATION_CONFIGURATION_INVALID";
    error.details = inspection.errors;
    throw error;
  }
  return inspection;
}

export function assertApprovalExecutionContext({ approvalId, identity, tool, arguments: args } = {}) {
  if (!String(approvalId || "").startsWith("kap_")) throw boundaryError("APPROVAL_ID_REQUIRED", "A durable Kairos approval ID is required.");
  if (!String(identity || "").trim()) throw boundaryError("APPROVAL_IDENTITY_REQUIRED", "An authenticated approval identity is required.");
  if (!tool?.approvalRequired || tool?.capability !== "mutation") throw boundaryError("MUTATION_TOOL_INVALID", "A registered approval-gated mutation tool is required.");
  if (!args || typeof args !== "object" || Array.isArray(args)) throw boundaryError("MUTATION_ARGUMENTS_INVALID", "Validated mutation arguments are required.");
  return true;
}

function normalizeShopDomain(value) {
  const domain = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : "";
}

function boundaryError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 403;
  return error;
}
