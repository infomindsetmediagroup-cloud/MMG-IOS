export const KAIROS_TOOL_ARGUMENTS_BUILD = "kairos-tool-arguments-20260807-3-shopify-site-capabilities";

const SCHEMAS = Object.freeze({
  "knowledge.search": Object.freeze({ required: ["query"], optional: ["department", "limit"] }),
  "publishing.project.read": Object.freeze({ required: ["projectId"], optional: [] }),
  "shopify.site.inspect": Object.freeze({ required: [], optional: [] }),
  "shopify.product.read": Object.freeze({ required: ["productId"], optional: [] }),
  "shopify.product.create": Object.freeze({ required: ["title"], optional: ["descriptionHtml", "handle", "vendor", "productType", "tags", "status", "seoTitle", "seoDescription", "templateSuffix"] }),
  "shopify.product.update": Object.freeze({ required: ["productId", "changes"], optional: [] }),
  "shopify.product.publish": Object.freeze({ required: ["productId", "publicationId"], optional: [] }),
  "shopify.collection.create": Object.freeze({ required: ["title"], optional: ["descriptionHtml", "handle", "productIds", "templateSuffix", "sortOrder", "seoTitle", "seoDescription"] }),
  "shopify.collection.update": Object.freeze({ required: ["collectionId", "changes"], optional: [] }),
  "shopify.page.create": Object.freeze({ required: ["title"], optional: ["body", "handle", "templateSuffix", "isPublished"] }),
  "shopify.page.update": Object.freeze({ required: ["pageId", "changes"], optional: [] }),
  "shopify.menu.create": Object.freeze({ required: ["title", "handle", "items"], optional: [] }),
  "shopify.menu.update": Object.freeze({ required: ["menuId", "title", "items"], optional: ["handle"] }),
  "shopify.theme.files.upsert": Object.freeze({ required: ["themeId", "files"], optional: [] }),
});

const PRODUCT_STATUSES = new Set(["ACTIVE", "DRAFT", "ARCHIVED", "UNLISTED"]);
const COLLECTION_SORT_ORDERS = new Set(["ALPHA_ASC", "ALPHA_DESC", "BEST_SELLING", "CREATED", "CREATED_DESC", "MANUAL", "PRICE_ASC", "PRICE_DESC"]);
const MENU_ITEM_TYPES = new Set(["FRONTPAGE", "COLLECTION", "COLLECTIONS", "PRODUCT", "CATALOG", "PAGE", "BLOG", "ARTICLE", "SEARCH", "SHOP_POLICY", "HTTP", "METAOBJECT", "CUSTOMER_ACCOUNT_PAGE"]);
const THEME_FILE_PATTERN = /^(assets|config|layout|locales|sections|snippets|templates)\/[A-Za-z0-9_.\/-]+$/;

export function validateKairosToolArguments(toolId, input) {
  const normalizedToolId = String(toolId || "").trim().toLowerCase();
  const schema = SCHEMAS[normalizedToolId];
  if (!schema) return failure("TOOL_SCHEMA_MISSING", "No governed argument schema exists for this tool.");
  if (!input || typeof input !== "object" || Array.isArray(input)) return failure("TOOL_ARGUMENTS_INVALID", "Tool arguments must be a JSON object.");
  const allowed = new Set([...schema.required, ...schema.optional]);
  const extras = Object.keys(input).filter((key) => !allowed.has(key));
  if (extras.length) return failure("TOOL_ARGUMENTS_EXCESS", `Unexpected tool arguments: ${extras.join(", ")}.`);
  for (const key of schema.required) if (!present(input[key])) return failure("TOOL_ARGUMENT_REQUIRED", `Missing required tool argument: ${key}.`);

  const value = sanitize(normalizedToolId, input);
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
    case "publishing.project.read": return identifier(input.projectId, "projectId", 160);
    case "shopify.site.inspect": return { ok: true, arguments: {} };
    case "shopify.product.read": return shopifyId(input.productId, "productId", "Product");
    case "shopify.product.publish": {
      const product = shopifyId(input.productId, "productId", "Product"); if (!product.ok) return product;
      const publication = shopifyId(input.publicationId, "publicationId", "Publication"); if (!publication.ok) return publication;
      return { ok: true, arguments: { productId: product.arguments.productId, publicationId: publication.arguments.publicationId } };
    }
    case "shopify.product.create": return sanitizeProductCreate(input);
    case "shopify.product.update": return sanitizeProductUpdate(input);
    case "shopify.collection.create": return sanitizeCollectionCreate(input);
    case "shopify.collection.update": return sanitizeCollectionUpdate(input);
    case "shopify.page.create": return sanitizePageCreate(input);
    case "shopify.page.update": return sanitizePageUpdate(input);
    case "shopify.menu.create": return sanitizeMenuCreate(input);
    case "shopify.menu.update": return sanitizeMenuUpdate(input);
    case "shopify.theme.files.upsert": return sanitizeThemeFiles(input);
    default: return failure("TOOL_SCHEMA_MISSING", "No governed argument schema exists for this tool.");
  }
}

function sanitizeProductCreate(input) {
  const title = text(input.title, 255); if (!title) return failure("TOOL_ARGUMENT_INVALID_VALUE", "title is required.");
  const status = input.status == null ? "DRAFT" : enumValue(input.status, PRODUCT_STATUSES, "status"); if (typeof status !== "string") return status;
  const result = { title, status };
  assignText(result, input, "descriptionHtml", 50000); assignHandle(result, input, "handle"); assignText(result, input, "vendor", 255); assignText(result, input, "productType", 255); assignText(result, input, "templateSuffix", 120);
  const tags = stringList(input.tags, 250, 255, "tags"); if (!tags.ok) return tags; if (input.tags != null) result.tags = tags.value;
  assignText(result, input, "seoTitle", 255); assignText(result, input, "seoDescription", 500);
  return { ok: true, arguments: result };
}

function sanitizeProductUpdate(input) {
  const product = shopifyId(input.productId, "productId", "Product"); if (!product.ok) return product;
  if (!plain(input.changes)) return failure("TOOL_ARGUMENTS_INVALID", "changes must be an object.");
  const allowed = new Set(["title", "descriptionHtml", "seoTitle", "seoDescription", "status"]); const extra = extras(input.changes, allowed); if (extra.length) return failure("TOOL_ARGUMENTS_EXCESS", `Unsupported product changes: ${extra.join(", ")}.`);
  const changes = {}; assignText(changes, input.changes, "title", 255); assignText(changes, input.changes, "descriptionHtml", 50000); assignText(changes, input.changes, "seoTitle", 255); assignText(changes, input.changes, "seoDescription", 500);
  if (input.changes.status != null) { const status = enumValue(input.changes.status, PRODUCT_STATUSES, "status"); if (typeof status !== "string") return status; changes.status = status; }
  if (!Object.keys(changes).length) return failure("TOOL_ARGUMENT_REQUIRED", "At least one approved product change is required.");
  return { ok: true, arguments: { productId: product.arguments.productId, changes } };
}

function sanitizeCollectionCreate(input) {
  const title = text(input.title, 255); if (!title) return failure("TOOL_ARGUMENT_INVALID_VALUE", "title is required.");
  const result = { title }; assignText(result, input, "descriptionHtml", 50000); assignHandle(result, input, "handle"); assignText(result, input, "templateSuffix", 120); assignText(result, input, "seoTitle", 255); assignText(result, input, "seoDescription", 500);
  if (input.sortOrder != null) { const sortOrder = enumValue(input.sortOrder, COLLECTION_SORT_ORDERS, "sortOrder"); if (typeof sortOrder !== "string") return sortOrder; result.sortOrder = sortOrder; }
  if (input.productIds != null) { const ids = gidList(input.productIds, "Product", 250, "productIds"); if (!ids.ok) return ids; result.productIds = ids.value; }
  return { ok: true, arguments: result };
}

function sanitizeCollectionUpdate(input) {
  const collection = shopifyId(input.collectionId, "collectionId", "Collection"); if (!collection.ok) return collection;
  if (!plain(input.changes)) return failure("TOOL_ARGUMENTS_INVALID", "changes must be an object.");
  const allowed = new Set(["title", "descriptionHtml", "handle", "templateSuffix", "sortOrder", "seoTitle", "seoDescription", "redirectNewHandle"]); const extra = extras(input.changes, allowed); if (extra.length) return failure("TOOL_ARGUMENTS_EXCESS", `Unsupported collection changes: ${extra.join(", ")}.`);
  const changes = {}; assignText(changes, input.changes, "title", 255); assignText(changes, input.changes, "descriptionHtml", 50000); assignHandle(changes, input.changes, "handle"); assignText(changes, input.changes, "templateSuffix", 120); assignText(changes, input.changes, "seoTitle", 255); assignText(changes, input.changes, "seoDescription", 500);
  if (input.changes.sortOrder != null) { const sortOrder = enumValue(input.changes.sortOrder, COLLECTION_SORT_ORDERS, "sortOrder"); if (typeof sortOrder !== "string") return sortOrder; changes.sortOrder = sortOrder; }
  if (input.changes.redirectNewHandle != null) changes.redirectNewHandle = Boolean(input.changes.redirectNewHandle);
  if (!Object.keys(changes).length) return failure("TOOL_ARGUMENT_REQUIRED", "At least one approved collection change is required.");
  return { ok: true, arguments: { collectionId: collection.arguments.collectionId, changes } };
}

function sanitizePageCreate(input) {
  const title = text(input.title, 255); if (!title) return failure("TOOL_ARGUMENT_INVALID_VALUE", "title is required.");
  const result = { title, isPublished: input.isPublished == null ? false : Boolean(input.isPublished) }; assignText(result, input, "body", 100000); assignHandle(result, input, "handle"); assignText(result, input, "templateSuffix", 120);
  return { ok: true, arguments: result };
}

function sanitizePageUpdate(input) {
  const page = shopifyId(input.pageId, "pageId", "Page"); if (!page.ok) return page;
  if (!plain(input.changes)) return failure("TOOL_ARGUMENTS_INVALID", "changes must be an object.");
  const allowed = new Set(["title", "body", "handle", "templateSuffix", "isPublished", "redirectNewHandle"]); const extra = extras(input.changes, allowed); if (extra.length) return failure("TOOL_ARGUMENTS_EXCESS", `Unsupported page changes: ${extra.join(", ")}.`);
  const changes = {}; assignText(changes, input.changes, "title", 255); assignText(changes, input.changes, "body", 100000); assignHandle(changes, input.changes, "handle"); assignText(changes, input.changes, "templateSuffix", 120);
  if (input.changes.isPublished != null) changes.isPublished = Boolean(input.changes.isPublished); if (input.changes.redirectNewHandle != null) changes.redirectNewHandle = Boolean(input.changes.redirectNewHandle);
  if (!Object.keys(changes).length) return failure("TOOL_ARGUMENT_REQUIRED", "At least one approved page change is required.");
  return { ok: true, arguments: { pageId: page.arguments.pageId, changes } };
}

function sanitizeMenuCreate(input) {
  const title = text(input.title, 255); const handle = handleValue(input.handle); if (!title || !handle) return failure("TOOL_ARGUMENT_INVALID_VALUE", "title and a valid handle are required.");
  const items = menuItems(input.items, false); if (!items.ok) return items;
  return { ok: true, arguments: { title, handle, items: items.value } };
}

function sanitizeMenuUpdate(input) {
  const menu = shopifyId(input.menuId, "menuId", "Menu"); if (!menu.ok) return menu;
  const title = text(input.title, 255); if (!title) return failure("TOOL_ARGUMENT_INVALID_VALUE", "title is required.");
  const items = menuItems(input.items, true); if (!items.ok) return items;
  const result = { menuId: menu.arguments.menuId, title, items: items.value }; if (input.handle != null) { const handle = handleValue(input.handle); if (!handle) return failure("TOOL_ARGUMENT_INVALID_VALUE", "handle is invalid."); result.handle = handle; }
  return { ok: true, arguments: result };
}

function sanitizeThemeFiles(input) {
  const theme = shopifyId(input.themeId, "themeId", "OnlineStoreTheme"); if (!theme.ok) return theme;
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > 40) return failure("TOOL_ARGUMENT_INVALID_VALUE", "files must contain 1-40 theme files.");
  let total = 0; const files = [];
  for (const raw of input.files) {
    if (!plain(raw) || Object.keys(raw).some((key) => !new Set(["filename", "body"]).has(key))) return failure("TOOL_ARGUMENTS_EXCESS", "Each theme file supports only filename and body.");
    const filename = text(raw.filename, 240); const body = String(raw.body ?? "").replace(/\u0000/g, "");
    if (!THEME_FILE_PATTERN.test(filename) || filename.includes("..")) return failure("TOOL_ARGUMENT_INVALID_VALUE", `Invalid theme filename: ${filename || "(empty)"}.`);
    if (body.length > 500000) return failure("TOOL_ARGUMENT_INVALID_VALUE", `${filename} exceeds the 500 KB governed file limit.`); total += body.length; if (total > 2000000) return failure("TOOL_ARGUMENT_INVALID_VALUE", "Theme file payload exceeds the 2 MB governed request limit."); files.push({ filename, body });
  }
  return { ok: true, arguments: { themeId: theme.arguments.themeId, files } };
}

function menuItems(value, updating, depth = 0) {
  if (!Array.isArray(value) || value.length > 50) return failure("TOOL_ARGUMENT_INVALID_VALUE", "items must be an array with at most 50 entries per level.");
  if (depth > 2) return failure("TOOL_ARGUMENT_INVALID_VALUE", "Menu nesting is limited to three levels.");
  const output = [];
  for (const raw of value) {
    if (!plain(raw)) return failure("TOOL_ARGUMENTS_INVALID", "Each menu item must be an object.");
    const allowed = new Set(["id", "title", "type", "resourceId", "url", "tags", "items"]); const extra = extras(raw, allowed); if (extra.length) return failure("TOOL_ARGUMENTS_EXCESS", `Unsupported menu item fields: ${extra.join(", ")}.`);
    const title = text(raw.title, 255); const type = enumValue(raw.type, MENU_ITEM_TYPES, "menu item type"); if (!title || typeof type !== "string") return typeof type === "string" ? failure("TOOL_ARGUMENT_INVALID_VALUE", "Menu item title is required.") : type;
    const item = { title, type };
    if (updating && raw.id != null) { const id = shopifyId(raw.id, "id", "MenuItem"); if (!id.ok) return id; item.id = id.arguments.id; }
    if (raw.resourceId != null) { const rid = text(raw.resourceId, 220); if (!/^gid:\/\/shopify\/[A-Za-z][A-Za-z0-9]*\/\d+$/.test(rid)) return failure("TOOL_ARGUMENT_INVALID_VALUE", "resourceId must be a Shopify GID."); item.resourceId = rid; }
    if (raw.url != null) { const url = text(raw.url, 2000); if (!url) return failure("TOOL_ARGUMENT_INVALID_VALUE", "url is invalid."); item.url = url; }
    if (raw.tags != null) { const tags = stringList(raw.tags, 50, 255, "menu tags"); if (!tags.ok) return tags; item.tags = tags.value; }
    if (raw.items != null) { const nested = menuItems(raw.items, updating, depth + 1); if (!nested.ok) return nested; item.items = nested.value; }
    output.push(item);
  }
  return { ok: true, value: output };
}

function assignText(target, input, key, max) { if (input[key] != null) target[key] = text(input[key], max); }
function assignHandle(target, input, key) { if (input[key] != null) { const value = handleValue(input[key]); if (value) target[key] = value; } }
function handleValue(value) { const result = text(value, 255).toLowerCase(); return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result) ? result : ""; }
function enumValue(value, allowed, label) { const result = text(value, 80).toUpperCase(); return allowed.has(result) ? result : failure("TOOL_ARGUMENT_INVALID_VALUE", `${label} is not allowlisted.`); }
function gidList(value, type, max, label) { if (!Array.isArray(value) || value.length > max) return failure("TOOL_ARGUMENT_INVALID_VALUE", `${label} must be an array with at most ${max} entries.`); const output = []; for (const raw of value) { const parsed = shopifyId(raw, "id", type); if (!parsed.ok) return parsed; output.push(parsed.arguments.id); } return { ok: true, value: output }; }
function stringList(value, maxItems, maxLength, label) { if (!Array.isArray(value) || value.length > maxItems) return failure("TOOL_ARGUMENT_INVALID_VALUE", `${label} must be an array with at most ${maxItems} entries.`); return { ok: true, value: value.map((item) => text(item, maxLength)).filter(Boolean) }; }
function identifier(value, key, max) { const result = text(value, max); return result ? { ok: true, arguments: { [key]: result } } : failure("TOOL_ARGUMENT_INVALID_VALUE", `${key} is invalid.`); }
function shopifyId(value, key, expectedType) { const result = text(value, 220); const pattern = new RegExp(`^gid:\/\/shopify\/${expectedType}\/\\d+$`); return pattern.test(result) ? { ok: true, arguments: { [key]: result } } : failure("TOOL_ARGUMENT_INVALID_VALUE", `${key} must be a Shopify ${expectedType} GID.`); }
function extras(value, allowed) { return Object.keys(value).filter((key) => !allowed.has(key)); }
function plain(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function present(value) { if (Array.isArray(value)) return value.length > 0; if (value && typeof value === "object") return Object.keys(value).length > 0; return value !== undefined && value !== null && String(value).trim() !== ""; }
function text(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function failure(code, message) { return { ok: false, error: { code, message }, build: KAIROS_TOOL_ARGUMENTS_BUILD }; }
