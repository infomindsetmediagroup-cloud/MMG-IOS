import { assertShopifyReadConfiguration, buildShopifyAdminGraphQLEndpointFromConfiguration } from "./kairos-shopify-read-boundary-v1.js";
import { assertShopifyMutationConfiguration, assertApprovalExecutionContext } from "./kairos-shopify-mutation-boundary-v1.js";

export const KAIROS_SHOPIFY_SITE_ADMIN_BUILD = "kairos-shopify-site-admin-20260807-1";
const DEFAULT_TIMEOUT_MS = 15000;

export const SHOPIFY_SITE_INSPECT_QUERY = `query KairosSiteInspect {
  shop { name myshopifyDomain primaryDomain { url } }
  pages(first: 50) { nodes { id title handle isPublished templateSuffix updatedAt } }
  menus(first: 20) { nodes { id title handle items { id title type url resourceId } } }
}`;

export const SHOPIFY_THEME_ROLE_QUERY = `query KairosThemeRole($id: ID!) {
  node(id: $id) { ... on OnlineStoreTheme { id name role processing processingFailed updatedAt } }
}`;

export const SHOPIFY_PRODUCT_CREATE_MUTATION = `mutation KairosProductCreate($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product { id title handle status updatedAt seo { title description } }
    userErrors { field message }
  }
}`;

export const SHOPIFY_COLLECTION_CREATE_MUTATION = `mutation KairosCollectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection { id title handle updatedAt }
    userErrors { field message }
  }
}`;

export const SHOPIFY_COLLECTION_UPDATE_MUTATION = `mutation KairosCollectionUpdate($input: CollectionInput!) {
  collectionUpdate(input: $input) {
    collection { id title handle updatedAt }
    userErrors { field message }
  }
}`;

export const SHOPIFY_PAGE_CREATE_MUTATION = `mutation KairosPageCreate($page: PageCreateInput!) {
  pageCreate(page: $page) {
    page { id title handle isPublished templateSuffix updatedAt }
    userErrors { field message }
  }
}`;

export const SHOPIFY_PAGE_UPDATE_MUTATION = `mutation KairosPageUpdate($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) {
    page { id title handle isPublished templateSuffix updatedAt }
    userErrors { field message }
  }
}`;

export const SHOPIFY_MENU_CREATE_MUTATION = `mutation KairosMenuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
  menuCreate(title: $title, handle: $handle, items: $items) {
    menu { id title handle }
    userErrors { field message }
  }
}`;

export const SHOPIFY_MENU_UPDATE_MUTATION = `mutation KairosMenuUpdate($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
  menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
    menu { id title handle }
    userErrors { field message }
  }
}`;

export const SHOPIFY_THEME_FILES_UPSERT_MUTATION = `mutation KairosThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
  themeFilesUpsert(themeId: $themeId, files: $files) {
    upsertedThemeFiles { filename }
    userErrors { field message }
  }
}`;

export async function inspectShopifySite(env, { requestId } = {}) {
  const config = assertShopifyReadConfiguration(env, "site-inspect");
  const payload = await graphQL(env, config, SHOPIFY_SITE_INSPECT_QUERY, {}, { requestId, client: "site-inspect" });
  const shop = payload.data?.shop;
  if (!shop?.myshopifyDomain) throw adminError("SHOPIFY_SITE_INSPECT_RESPONSE_INVALID", "Shopify did not return store identity.", 502);
  return {
    verified: true,
    mutated: false,
    source: "shopify-admin-graphql",
    shopDomain: config.shopDomain,
    apiVersion: config.apiVersion,
    shop: { name: clean(shop.name, 500), myshopifyDomain: clean(shop.myshopifyDomain, 500), primaryUrl: clean(shop.primaryDomain?.url, 2000) },
    pages: (payload.data?.pages?.nodes || []).map((page) => ({ id: clean(page.id, 220), title: clean(page.title, 500), handle: clean(page.handle, 500), isPublished: Boolean(page.isPublished), templateSuffix: clean(page.templateSuffix, 240), updatedAt: iso(page.updatedAt) })),
    menus: (payload.data?.menus?.nodes || []).map((menu) => ({ id: clean(menu.id, 220), title: clean(menu.title, 500), handle: clean(menu.handle, 500), items: normalizeMenuEvidence(menu.items || []) })),
    build: KAIROS_SHOPIFY_SITE_ADMIN_BUILD,
  };
}

export async function createShopifyProduct(env, context = {}) {
  return executeMutation(env, context, {
    toolId: "shopify.product.create", executor: "shopify-product-create", capability: "product-create", query: SHOPIFY_PRODUCT_CREATE_MUTATION,
    variables: (args) => ({ product: productCreateInput(args) }), path: "productCreate", entity: "product",
  });
}

export async function createShopifyCollection(env, context = {}) {
  return executeMutation(env, context, {
    toolId: "shopify.collection.create", executor: "shopify-collection-create", capability: "collection-create", query: SHOPIFY_COLLECTION_CREATE_MUTATION,
    variables: (args) => ({ input: collectionCreateInput(args) }), path: "collectionCreate", entity: "collection",
  });
}

export async function updateShopifyCollection(env, context = {}) {
  return executeMutation(env, context, {
    toolId: "shopify.collection.update", executor: "shopify-collection-update", capability: "collection-update", query: SHOPIFY_COLLECTION_UPDATE_MUTATION,
    variables: (args) => ({ input: { id: args.collectionId, ...collectionChangeInput(args.changes) } }), path: "collectionUpdate", entity: "collection",
  });
}

export async function createShopifyPage(env, context = {}) {
  return executeMutation(env, context, {
    toolId: "shopify.page.create", executor: "shopify-page-create", capability: "page-create", query: SHOPIFY_PAGE_CREATE_MUTATION,
    variables: (args) => ({ page: pick(args, ["title", "body", "handle", "templateSuffix", "isPublished"]) }), path: "pageCreate", entity: "page",
  });
}

export async function updateShopifyPage(env, context = {}) {
  return executeMutation(env, context, {
    toolId: "shopify.page.update", executor: "shopify-page-update", capability: "page-update", query: SHOPIFY_PAGE_UPDATE_MUTATION,
    variables: (args) => ({ id: args.pageId, page: pick(args.changes, ["title", "body", "handle", "templateSuffix", "isPublished", "redirectNewHandle"]) }), path: "pageUpdate", entity: "page",
  });
}

export async function createShopifyMenu(env, context = {}) {
  return executeMutation(env, context, {
    toolId: "shopify.menu.create", executor: "shopify-menu-create", capability: "menu-create", query: SHOPIFY_MENU_CREATE_MUTATION,
    variables: (args) => ({ title: args.title, handle: args.handle, items: args.items }), path: "menuCreate", entity: "menu",
  });
}

export async function updateShopifyMenu(env, context = {}) {
  return executeMutation(env, context, {
    toolId: "shopify.menu.update", executor: "shopify-menu-update", capability: "menu-update", query: SHOPIFY_MENU_UPDATE_MUTATION,
    variables: (args) => ({ id: args.menuId, title: args.title, ...(args.handle ? { handle: args.handle } : {}), items: args.items }), path: "menuUpdate", entity: "menu",
  });
}

export async function upsertShopifyThemeFiles(env, context = {}) {
  const { tool, arguments: args, identity, approvalId } = context;
  assertApprovalExecutionContext({ approvalId, identity, tool, arguments: args });
  const config = assertShopifyMutationConfiguration(env, "theme-files-upsert");
  assertTool(tool, "shopify.theme.files.upsert", "shopify-theme-files-upsert");

  const rolePayload = await graphQL(env, config, SHOPIFY_THEME_ROLE_QUERY, { id: args.themeId }, { approvalId, identity, client: "theme-role-preflight" });
  const theme = rolePayload.data?.node;
  if (!theme?.id) throw adminError("SHOPIFY_THEME_NOT_FOUND", "The target Shopify theme could not be verified.", 404);
  const role = clean(theme.role, 80).toUpperCase();
  if (role === "MAIN") throw adminError("SHOPIFY_LIVE_THEME_WRITE_BLOCKED", "Kairos refuses to write files directly to Shopify's live MAIN theme. Use Website Retool staging and an unpublished theme.", 403);
  if (theme.processing || theme.processingFailed) throw adminError("SHOPIFY_THEME_NOT_WRITABLE", "The target theme is processing or has failed processing and cannot be safely staged.", 409);

  const files = args.files.map((file) => ({ filename: file.filename, body: { type: "TEXT", value: file.body } }));
  const payload = await graphQL(env, config, SHOPIFY_THEME_FILES_UPSERT_MUTATION, { themeId: args.themeId, files }, { approvalId, identity, client: "theme-files-upsert" });
  const result = payload.data?.themeFilesUpsert;
  rejectUserErrors(result?.userErrors, "SHOPIFY_THEME_FILES_UPSERT_REJECTED");
  const upserted = (result?.upsertedThemeFiles || []).map((file) => clean(file.filename, 300)).filter(Boolean);
  if (!upserted.length) throw adminError("SHOPIFY_THEME_FILES_UPSERT_RESPONSE_INVALID", "Shopify did not confirm any staged theme files.", 502);
  return mutationEvidence(config, context, { theme: { id: theme.id, name: clean(theme.name, 500), role, updatedAt: iso(theme.updatedAt) }, files: upserted, changedFields: upserted });
}

async function executeMutation(env, context, spec) {
  const { tool, arguments: args, identity, approvalId } = context;
  assertApprovalExecutionContext({ approvalId, identity, tool, arguments: args });
  const config = assertShopifyMutationConfiguration(env, spec.capability);
  assertTool(tool, spec.toolId, spec.executor);
  const payload = await graphQL(env, config, spec.query, spec.variables(args), { approvalId, identity, client: spec.executor });
  const result = payload.data?.[spec.path];
  rejectUserErrors(result?.userErrors, `SHOPIFY_${spec.path.replace(/([A-Z])/g, "_$1").toUpperCase()}_REJECTED`);
  const entity = result?.[spec.entity];
  if (!entity?.id) throw adminError("SHOPIFY_MUTATION_RESPONSE_INVALID", `Shopify did not return the ${spec.entity} after mutation.`, 502);
  return mutationEvidence(config, context, { [spec.entity]: normalizeEntity(entity), changedFields: Object.keys(args.changes || args).filter((key) => !key.endsWith("Id")).sort() });
}

async function graphQL(env, config, query, variables, audit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), clampTimeout(env?.SHOPIFY_ADMIN_TIMEOUT_MS));
  try {
    const headers = { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": String(env.SHOPIFY_ADMIN_ACCESS_TOKEN), "X-Kairos-Client": `${KAIROS_SHOPIFY_SITE_ADMIN_BUILD}:${audit.client || "admin"}` };
    if (audit.approvalId) headers["X-Kairos-Approval-Id"] = String(audit.approvalId);
    if (audit.identity) headers["X-Kairos-Approval-Identity"] = String(audit.identity).slice(0, 240);
    if (audit.requestId) headers["X-Kairos-Request-Id"] = String(audit.requestId).slice(0, 240);
    const response = await fetch(buildShopifyAdminGraphQLEndpointFromConfiguration(config), { method: "POST", headers, body: JSON.stringify({ query, variables }), signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw adminError(response.status === 401 || response.status === 403 ? "SHOPIFY_ADMIN_AUTH_FAILED" : "SHOPIFY_ADMIN_HTTP_ERROR", `Shopify Admin returned HTTP ${response.status}.`, response.status >= 500 ? 503 : 502);
    if (!payload || typeof payload !== "object") throw adminError("SHOPIFY_ADMIN_RESPONSE_INVALID", "Shopify Admin returned an unreadable response.", 502);
    if (Array.isArray(payload.errors) && payload.errors.length) throw adminError("SHOPIFY_ADMIN_GRAPHQL_ERROR", summarizeErrors(payload.errors), 502);
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw adminError("SHOPIFY_ADMIN_TIMEOUT", "Shopify Admin did not respond before the governed timeout.", 504);
    throw error;
  } finally { clearTimeout(timeout); }
}

function productCreateInput(args) {
  const product = pick(args, ["title", "descriptionHtml", "handle", "vendor", "productType", "tags", "status", "templateSuffix"]);
  if (args.seoTitle !== undefined || args.seoDescription !== undefined) product.seo = pick({ title: args.seoTitle, description: args.seoDescription }, ["title", "description"]);
  return product;
}

function collectionCreateInput(args) {
  const input = pick(args, ["title", "descriptionHtml", "handle", "templateSuffix", "sortOrder"]);
  if (args.productIds) input.products = args.productIds;
  if (args.seoTitle !== undefined || args.seoDescription !== undefined) input.seo = pick({ title: args.seoTitle, description: args.seoDescription }, ["title", "description"]);
  return input;
}

function collectionChangeInput(changes) {
  const input = pick(changes, ["title", "descriptionHtml", "handle", "templateSuffix", "sortOrder", "redirectNewHandle"]);
  if (changes.seoTitle !== undefined || changes.seoDescription !== undefined) input.seo = pick({ title: changes.seoTitle, description: changes.seoDescription }, ["title", "description"]);
  return input;
}

function mutationEvidence(config, context, extra) {
  return { verified: true, mutated: true, source: "shopify-admin-graphql", approvalId: context.approvalId, identity: String(context.identity), shopDomain: config.shopDomain, apiVersion: config.apiVersion, ...extra, build: KAIROS_SHOPIFY_SITE_ADMIN_BUILD };
}

function assertTool(tool, toolId, executor) { if (tool?.id !== toolId || tool?.executor !== executor) throw adminError("SHOPIFY_TOOL_MISMATCH", "The approval is not bound to this Shopify executor.", 403); }
function rejectUserErrors(errors, code) { if (Array.isArray(errors) && errors.length) throw adminError(code, summarizeErrors(errors), 422); }
function normalizeEntity(entity) { return Object.fromEntries(Object.entries(entity).map(([key, value]) => [key, key === "updatedAt" ? iso(value) : value && typeof value === "object" ? value : clean(value, 2000)])); }
function normalizeMenuEvidence(items) { return items.slice(0, 50).map((item) => ({ id: clean(item.id, 220), title: clean(item.title, 500), type: clean(item.type, 80), url: clean(item.url, 2000), resourceId: clean(item.resourceId, 220) })); }
function pick(source, keys) { const result = {}; for (const key of keys) if (source?.[key] !== undefined) result[key] = source[key]; return result; }
function summarizeErrors(errors) { return errors.slice(0, 5).map((item) => `${Array.isArray(item?.field) ? item.field.join(".") + ": " : ""}${String(item?.message || "Shopify error")}`).join("; "); }
function clampTimeout(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(3000, Math.min(30000, Math.floor(n))) : DEFAULT_TIMEOUT_MS; }
function clean(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function iso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function adminError(code, message, status = 502) { const error = new Error(message); error.code = code; error.status = status; return error; }
