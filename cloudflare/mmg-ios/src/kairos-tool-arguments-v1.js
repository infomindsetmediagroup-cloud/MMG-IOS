export const KAIROS_TOOL_ARGUMENTS_BUILD = "kairos-tool-arguments-20260725-1";

const SCHEMAS = Object.freeze({
  "knowledge.search": Object.freeze({ required: ["query"], optional: ["department", "limit"] }),
  "publishing.project.read": Object.freeze({ required: ["projectId"], optional: [] }),
  "shopify.product.read": Object.freeze({ required: ["productId"], optional: [] }),
  "shopify.product.update": Object.freeze({ required: ["productId", "changes"], optional: [] }),
  "shopify.product.publish": Object.freeze({ required: ["productId"], optional: ["publicationId"] }),
});

export function validateKairosToolArguments(toolId, input) {
  const schema = SCHEMAS[String(toolId || "").trim().toLowerCase()];
  if (!schema) return failure("TOOL_SCHEMA_MISSING", "No governed argument schema exists for this tool.");
  if (!input || typeof input !== "object" || Array.isArray(input)) return failure("TOOL_ARGUMENTS_INVALID", "Tool arguments must be a JSON object.");
  const allowed = new Set([...schema.required, ...schema.optional]);
  const extras = Object.keys(input).filter((key) => !allowed.has(key));
  if (extras.length) return failure("TOOL_ARGUMENTS_EXCESS", `Unexpected tool arguments: ${extras.join(", ")}.`);
  for (const key of schema.required) if (!present(input[key])) return failure("TOOL_ARGUMENT_REQUIRED", `Missing required tool argument: ${key}.`);

  const value = sanitize(toolId, input);
  if (!value.ok) return value;
  return { ok: true, arguments: value.arguments, build: KAIROS_TOOL_ARGUMENTS_BUILD };
}

function sanitize(toolId, input) {
  switch (toolId) {
    case "knowledge.search": {
      const query = text(input.query, 12000);
      const department = text(input.department, 120).toLowerCase();
      const limit = clamp(input.limit, 1, 8, 5);
      return { ok: true, arguments: { query, ...(department ? { department } : {}), limit } };
    }
    case "publishing.project.read":
      return identifier(input.projectId, "projectId", 160);
    case "shopify.product.read":
      return shopifyId(input.productId, "productId");
    case "shopify.product.publish": {
      const product = shopifyId(input.productId, "productId"); if (!product.ok) return product;
      const publicationId = input.publicationId ? text(input.publicationId, 200) : "";
      return { ok: true, arguments: { productId: product.arguments.productId, ...(publicationId ? { publicationId } : {}) } };
    }
    case "shopify.product.update": {
      const product = shopifyId(input.productId, "productId"); if (!product.ok) return product;
      if (!input.changes || typeof input.changes !== "object" || Array.isArray(input.changes)) return failure("TOOL_ARGUMENTS_INVALID", "changes must be an object.");
      const allowed = new Set(["title", "descriptionHtml", "seoTitle", "seoDescription", "status"]);
      const extras = Object.keys(input.changes).filter((key) => !allowed.has(key));
      if (extras.length) return failure("TOOL_ARGUMENTS_EXCESS", `Unsupported product changes: ${extras.join(", ")}.`);
      const changes = {};
      if (input.changes.title != null) changes.title = text(input.changes.title, 255);
      if (input.changes.descriptionHtml != null) changes.descriptionHtml = text(input.changes.descriptionHtml, 50000);
      if (input.changes.seoTitle != null) changes.seoTitle = text(input.changes.seoTitle, 255);
      if (input.changes.seoDescription != null) changes.seoDescription = text(input.changes.seoDescription, 500);
      if (input.changes.status != null) {
        const status = text(input.changes.status, 40).toUpperCase();
        if (!new Set(["ACTIVE", "DRAFT", "ARCHIVED"]).has(status)) return failure("TOOL_ARGUMENT_INVALID_VALUE", "status must be ACTIVE, DRAFT, or ARCHIVED.");
        changes.status = status;
      }
      if (!Object.keys(changes).length) return failure("TOOL_ARGUMENT_REQUIRED", "At least one approved product change is required.");
      return { ok: true, arguments: { productId: product.arguments.productId, changes } };
    }
    default: return failure("TOOL_SCHEMA_MISSING", "No governed argument schema exists for this tool.");
  }
}

function identifier(value, key, max) { const result = text(value, max); return result ? { ok: true, arguments: { [key]: result } } : failure("TOOL_ARGUMENT_INVALID_VALUE", `${key} is invalid.`); }
function shopifyId(value, key) { const result = text(value, 220); return /^gid:\/\/shopify\/[A-Za-z]+\/\d+$/.test(result) ? { ok: true, arguments: { [key]: result } } : failure("TOOL_ARGUMENT_INVALID_VALUE", `${key} must be a Shopify GID.`); }
function present(value) { return value !== undefined && value !== null && String(value).trim() !== ""; }
function text(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function failure(code, message) { return { ok: false, error: { code, message }, build: KAIROS_TOOL_ARGUMENTS_BUILD }; }
