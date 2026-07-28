export const KAIROS_REVENUE_PRODUCT_BLUEPRINT_BUILD = "kairos-revenue-product-blueprint-20260727-1";

const PRODUCT_TYPES = new Set(["digital_guide", "prompt_library", "workbook", "template_pack", "service_package"]);
const REQUIRED_ASSETS = Object.freeze({
  digital_guide: ["manuscript", "pdf", "docx", "cover", "product_image", "shopify_package"],
  prompt_library: ["prompt_library", "pdf", "docx", "cover", "product_image", "shopify_package"],
  workbook: ["workbook", "pdf", "docx", "cover", "product_image", "shopify_package"],
  template_pack: ["template_files", "instructions", "cover", "product_image", "shopify_package"],
  service_package: ["service_scope", "intake_form", "delivery_plan", "product_image", "shopify_package"],
});

export function createKairosRevenueProductBlueprint(input = {}) {
  const productType = clean(input.productType, 80);
  if (!PRODUCT_TYPES.has(productType)) throw blueprintError("PRODUCT_TYPE_INVALID", "A supported revenue product type is required.");
  const title = clean(input.title, 240);
  const objective = clean(input.objective, 4000);
  const audience = clean(input.audience, 1000);
  if (!title || !objective || !audience) throw blueprintError("BLUEPRINT_INPUT_REQUIRED", "Title, objective, and audience are required.");
  const price = normalizeMoney(input.price);
  const blueprintId = clean(input.blueprintId, 180) || `rbp_${stableHash(`${title}:${productType}:${objective}`)}`;
  const requiredAssets = REQUIRED_ASSETS[productType];
  const acceptanceCriteria = Object.freeze([
    "All required revenue assets are present and versioned.",
    "Shopify metadata is complete and internally consistent.",
    "Customer-facing copy contains no internal prompts, credentials, or execution metadata.",
    "Publication remains approval-gated.",
  ]);
  return Object.freeze({
    blueprintId,
    productType,
    title,
    objective,
    audience,
    price,
    currency: clean(input.currency || "USD", 3).toUpperCase(),
    doctrineRefs: Object.freeze(bound(input.doctrineRefs, 40, 180)),
    requiredAssets: Object.freeze(requiredAssets.slice()),
    productionStages: Object.freeze(["blueprint", "content_generation", "asset_generation", "commerce_packaging", "quality_assurance", "approval", "ready_to_publish"]),
    acceptanceCriteria,
    publicationApprovalRequired: true,
    deploymentExecutionAllowed: false,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
    build: KAIROS_REVENUE_PRODUCT_BLUEPRINT_BUILD,
  });
}

function normalizeMoney(value) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw blueprintError("PRICE_INVALID", "Price must be a non-negative number."); return Math.round(number * 100) / 100; }
function bound(value, limit, max) { return (Array.isArray(value) ? value : []).slice(0, limit).map((item) => clean(item, max)).filter(Boolean); }
function stableHash(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function blueprintError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
