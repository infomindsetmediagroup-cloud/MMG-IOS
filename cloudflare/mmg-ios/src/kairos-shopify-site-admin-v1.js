import { ShopifyAdminClient, ShopifyRuntimeError } from "../../kairos/shopify-client.js";
import { assertApprovalExecutionContext } from "./kairos-shopify-mutation-boundary-v1.js";

export const KAIROS_SHOPIFY_SITE_ADMIN_BUILD = "kairos-shopify-site-admin-20260807-2-canonical-client";

const SITE_INSPECT_QUERY = `query KairosSiteInspect {
  shop { name myshopifyDomain primaryDomain { url } }
  pages(first: 50) { nodes { id title handle isPublished templateSuffix updatedAt } }
  menus(first: 20) { nodes { id title handle items { id title type url resourceId } } }
}`;
const PRODUCT_BY_HANDLE = `query KairosProductPreflight($identifier: ProductIdentifierInput!) {
  productByIdentifier(identifier: $identifier) { id title handle status updatedAt seo { title description } }
}`;
const PRODUCT_BY_ID = `query KairosProductReadback($id: ID!) {
  product(id: $id) { id title handle status updatedAt seo { title description } }
}`;
const COLLECTION_BY_HANDLE = `query KairosCollectionPreflight($identifier: CollectionIdentifierInput!) {
  collectionByIdentifier(identifier: $identifier) { id title handle updatedAt seo { title description } }
}`;
const COLLECTION_BY_ID = `query KairosCollectionReadback($id: ID!) {
  collection(id: $id) { id title handle updatedAt seo { title description } }
}`;
const PAGE_BY_HANDLE = `query KairosPagePreflight($query: String!) {
  pages(first: 10, query: $query) { nodes { id title handle isPublished templateSuffix updatedAt body } }
}`;
const PAGE_BY_ID = `query KairosPageReadback($id: ID!) {
  page(id: $id) { id title handle isPublished templateSuffix updatedAt body }
}`;
const MENUS_QUERY = `query KairosMenuPreflight { menus(first: 100) { nodes { id title handle } } }`;
const MENU_BY_ID = `query KairosMenuReadback($id: ID!) {
  menu(id: $id) { id title handle items { id title type url resourceId } }
}`;
const THEME_BY_ID = `query KairosThemeRole($id: ID!) {
  node(id: $id) { ... on OnlineStoreTheme { id name role processing processingFailed updatedAt } }
}`;

const PRODUCT_CREATE = `mutation KairosProductCreate($product: ProductCreateInput!) {
  productCreate(product: $product) { product { id title handle status updatedAt seo { title description } } userErrors { field message } }
}`;
const COLLECTION_CREATE = `mutation KairosCollectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) { collection { id title handle updatedAt } userErrors { field message } }
}`;
const COLLECTION_UPDATE = `mutation KairosCollectionUpdate($input: CollectionInput!) {
  collectionUpdate(input: $input) { collection { id title handle updatedAt } userErrors { field message } }
}`;
const PAGE_CREATE = `mutation KairosPageCreate($page: PageCreateInput!) {
  pageCreate(page: $page) { page { id title handle isPublished templateSuffix updatedAt } userErrors { field message } }
}`;
const PAGE_UPDATE = `mutation KairosPageUpdate($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) { page { id title handle isPublished templateSuffix updatedAt } userErrors { field message } }
}`;
const MENU_CREATE = `mutation KairosMenuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
  menuCreate(title: $title, handle: $handle, items: $items) { menu { id title handle } userErrors { field message } }
}`;
const MENU_UPDATE = `mutation KairosMenuUpdate($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
  menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id title handle } userErrors { field message } }
}`;
const THEME_FILES_UPSERT = `mutation KairosThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
  themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message } }
}`;

export async function inspectShopifySite(env, { requestId } = {}) {
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([
    ["read_content", "read_online_store_pages"],
    ["read_online_store_navigation"],
  ]);
  const payload = await client.request(SITE_INSPECT_QUERY, {});
  const shop = payload?.shop;
  if (!shop?.myshopifyDomain) throw shopifyError("SHOPIFY_SITE_INSPECT_RESPONSE_INVALID", "Shopify did not return store identity.", 502);
  return {
    verified: true,
    mutated: false,
    requestId: requestId || null,
    source: "shopify-admin-graphql",
    shop: {
      name: clean(shop.name, 500),
      myshopifyDomain: clean(shop.myshopifyDomain, 500),
      primaryUrl: clean(shop.primaryDomain?.url, 2000),
    },
    pages: (payload.pages?.nodes || []).map(normalizePage),
    menus: (payload.menus?.nodes || []).map(normalizeMenu),
    build: KAIROS_SHOPIFY_SITE_ADMIN_BUILD,
  };
}

export async function createShopifyProduct(env, context = {}) {
  guardMutation(context, "shopify.product.create", "shopify-product-create");
  const args = context.arguments;
  requireHandle(args, "product");
  if (String(args.status || "DRAFT").toUpperCase() !== "DRAFT") {
    throw shopifyError("SHOPIFY_PRODUCT_CREATE_DRAFT_ONLY", "Kairos product creation is draft-only. Publishing requires a separate approved action.", 400);
  }
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([["read_products"], ["write_products"]]);
  const before = await client.request(PRODUCT_BY_HANDLE, { identifier: { handle: args.handle } });
  if (before?.productByIdentifier?.id) throw shopifyError("SHOPIFY_PRODUCT_HANDLE_EXISTS", `A Shopify product already exists with handle ${args.handle}.`, 409);
  const mutated = await client.request(PRODUCT_CREATE, { product: productCreateInput(args) });
  rejectUserErrors(mutated?.productCreate?.userErrors, "SHOPIFY_PRODUCT_CREATE_REJECTED");
  const created = mutated?.productCreate?.product;
  if (!created?.id) throw shopifyError("SHOPIFY_PRODUCT_CREATE_RESPONSE_INVALID", "Shopify did not return the created product.", 502);
  const readback = await client.request(PRODUCT_BY_ID, { id: created.id });
  verifyResource(readback?.product, created.id, args.handle, "product");
  return mutationEvidence(context, {
    product: normalizeEntity(readback.product),
    before: null,
    after: normalizeEntity(readback.product),
    changedFields: Object.keys(args).sort(),
  });
}

export async function createShopifyCollection(env, context = {}) {
  guardMutation(context, "shopify.collection.create", "shopify-collection-create");
  const args = context.arguments;
  requireHandle(args, "collection");
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([["read_products"], ["write_products"]]);
  const before = await client.request(COLLECTION_BY_HANDLE, { identifier: { handle: args.handle } });
  if (before?.collectionByIdentifier?.id) throw shopifyError("SHOPIFY_COLLECTION_HANDLE_EXISTS", `A Shopify collection already exists with handle ${args.handle}.`, 409);
  const mutated = await client.request(COLLECTION_CREATE, { input: collectionCreateInput(args) });
  rejectUserErrors(mutated?.collectionCreate?.userErrors, "SHOPIFY_COLLECTION_CREATE_REJECTED");
  const created = mutated?.collectionCreate?.collection;
  if (!created?.id) throw shopifyError("SHOPIFY_COLLECTION_CREATE_RESPONSE_INVALID", "Shopify did not return the created collection.", 502);
  const readback = await client.request(COLLECTION_BY_ID, { id: created.id });
  verifyResource(readback?.collection, created.id, args.handle, "collection");
  return mutationEvidence(context, {
    collection: normalizeEntity(readback.collection),
    before: null,
    after: normalizeEntity(readback.collection),
    changedFields: Object.keys(args).sort(),
  });
}

export async function updateShopifyCollection(env, context = {}) {
  guardMutation(context, "shopify.collection.update", "shopify-collection-update");
  const args = context.arguments;
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([["read_products"], ["write_products"]]);
  const before = await client.request(COLLECTION_BY_ID, { id: args.collectionId });
  if (!before?.collection?.id) throw shopifyError("SHOPIFY_COLLECTION_NOT_FOUND", "The Shopify collection was not found.", 404);
  const mutated = await client.request(COLLECTION_UPDATE, { input: { id: args.collectionId, ...collectionChangeInput(args.changes) } });
  rejectUserErrors(mutated?.collectionUpdate?.userErrors, "SHOPIFY_COLLECTION_UPDATE_REJECTED");
  const readback = await client.request(COLLECTION_BY_ID, { id: args.collectionId });
  verifyResource(readback?.collection, args.collectionId, args.changes?.handle || null, "collection");
  return mutationEvidence(context, {
    collection: normalizeEntity(readback.collection),
    before: normalizeEntity(before.collection),
    after: normalizeEntity(readback.collection),
    changedFields: Object.keys(args.changes || {}).sort(),
  });
}

export async function createShopifyPage(env, context = {}) {
  guardMutation(context, "shopify.page.create", "shopify-page-create");
  const args = context.arguments;
  requireHandle(args, "page");
  if (args.isPublished === true) {
    throw shopifyError("SHOPIFY_PAGE_CREATE_UNPUBLISHED_ONLY", "Kairos page creation is unpublished-only. Publication must be separately approved through page update.", 400);
  }
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([
    ["read_content", "read_online_store_pages"],
    ["write_content", "write_online_store_pages"],
  ]);
  const before = await pageByHandle(client, args.handle);
  if (before) throw shopifyError("SHOPIFY_PAGE_HANDLE_EXISTS", `A Shopify page already exists with handle ${args.handle}.`, 409);
  const mutated = await client.request(PAGE_CREATE, { page: pick(args, ["title", "body", "handle", "templateSuffix", "isPublished"]) });
  rejectUserErrors(mutated?.pageCreate?.userErrors, "SHOPIFY_PAGE_CREATE_REJECTED");
  const created = mutated?.pageCreate?.page;
  if (!created?.id) throw shopifyError("SHOPIFY_PAGE_CREATE_RESPONSE_INVALID", "Shopify did not return the created page.", 502);
  const readback = await client.request(PAGE_BY_ID, { id: created.id });
  verifyResource(readback?.page, created.id, args.handle, "page");
  return mutationEvidence(context, {
    page: normalizePage(readback.page),
    before: null,
    after: normalizePage(readback.page),
    changedFields: Object.keys(args).sort(),
  });
}

export async function updateShopifyPage(env, context = {}) {
  guardMutation(context, "shopify.page.update", "shopify-page-update");
  const args = context.arguments;
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([
    ["read_content", "read_online_store_pages"],
    ["write_content", "write_online_store_pages"],
  ]);
  const before = await client.request(PAGE_BY_ID, { id: args.pageId });
  if (!before?.page?.id) throw shopifyError("SHOPIFY_PAGE_NOT_FOUND", "The Shopify page was not found.", 404);
  const mutated = await client.request(PAGE_UPDATE, {
    id: args.pageId,
    page: pick(args.changes, ["title", "body", "handle", "templateSuffix", "isPublished", "redirectNewHandle"]),
  });
  rejectUserErrors(mutated?.pageUpdate?.userErrors, "SHOPIFY_PAGE_UPDATE_REJECTED");
  const readback = await client.request(PAGE_BY_ID, { id: args.pageId });
  verifyResource(readback?.page, args.pageId, args.changes?.handle || null, "page");
  return mutationEvidence(context, {
    page: normalizePage(readback.page),
    before: normalizePage(before.page),
    after: normalizePage(readback.page),
    changedFields: Object.keys(args.changes || {}).sort(),
  });
}

export async function createShopifyMenu(env, context = {}) {
  guardMutation(context, "shopify.menu.create", "shopify-menu-create");
  const args = context.arguments;
  requireHandle(args, "menu");
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([["read_online_store_navigation"], ["write_online_store_navigation"]]);
  if (await menuByHandle(client, args.handle)) throw shopifyError("SHOPIFY_MENU_HANDLE_EXISTS", `A Shopify menu already exists with handle ${args.handle}.`, 409);
  const mutated = await client.request(MENU_CREATE, { title: args.title, handle: args.handle, items: args.items });
  rejectUserErrors(mutated?.menuCreate?.userErrors, "SHOPIFY_MENU_CREATE_REJECTED");
  const created = mutated?.menuCreate?.menu;
  if (!created?.id) throw shopifyError("SHOPIFY_MENU_CREATE_RESPONSE_INVALID", "Shopify did not return the created menu.", 502);
  const readback = await client.request(MENU_BY_ID, { id: created.id });
  verifyResource(readback?.menu, created.id, args.handle, "menu");
  return mutationEvidence(context, {
    menu: normalizeMenu(readback.menu),
    before: null,
    after: normalizeMenu(readback.menu),
    changedFields: ["handle", "items", "title"],
  });
}

export async function updateShopifyMenu(env, context = {}) {
  guardMutation(context, "shopify.menu.update", "shopify-menu-update");
  const args = context.arguments;
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([["read_online_store_navigation"], ["write_online_store_navigation"]]);
  const before = await client.request(MENU_BY_ID, { id: args.menuId });
  if (!before?.menu?.id) throw shopifyError("SHOPIFY_MENU_NOT_FOUND", "The Shopify menu was not found.", 404);
  const mutated = await client.request(MENU_UPDATE, {
    id: args.menuId,
    title: args.title,
    ...(args.handle ? { handle: args.handle } : {}),
    items: args.items,
  });
  rejectUserErrors(mutated?.menuUpdate?.userErrors, "SHOPIFY_MENU_UPDATE_REJECTED");
  const readback = await client.request(MENU_BY_ID, { id: args.menuId });
  verifyResource(readback?.menu, args.menuId, args.handle || null, "menu");
  return mutationEvidence(context, {
    menu: normalizeMenu(readback.menu),
    before: normalizeMenu(before.menu),
    after: normalizeMenu(readback.menu),
    changedFields: ["items", "title", ...(args.handle ? ["handle"] : [])],
  });
}

export async function upsertShopifyThemeFiles(env, context = {}) {
  guardMutation(context, "shopify.theme.files.upsert", "shopify-theme-files-upsert");
  const args = context.arguments;
  const client = new ShopifyAdminClient(env);
  await client.assertScopeGroups([["read_themes"], ["write_themes"]]);
  const before = await themeById(client, args.themeId);
  if (!before?.id) throw shopifyError("SHOPIFY_THEME_NOT_FOUND", "The target Shopify theme could not be verified.", 404);
  const role = clean(before.role, 80).toUpperCase();
  if (role === "MAIN") {
    throw shopifyError("SHOPIFY_LIVE_THEME_WRITE_BLOCKED", "Kairos refuses to write files directly to Shopify's live MAIN theme. Use Website Retool staging and an unpublished theme.", 403);
  }
  if (before.processing || before.processingFailed) {
    throw shopifyError("SHOPIFY_THEME_NOT_WRITABLE", "The target theme is processing or has failed processing and cannot be safely staged.", 409);
  }
  const files = args.files.map((file) => ({ filename: file.filename, body: { type: "TEXT", value: file.body } }));
  const mutated = await client.request(THEME_FILES_UPSERT, { themeId: args.themeId, files });
  rejectUserErrors(mutated?.themeFilesUpsert?.userErrors, "SHOPIFY_THEME_FILES_UPSERT_REJECTED");
  const upserted = (mutated?.themeFilesUpsert?.upsertedThemeFiles || []).map((file) => clean(file.filename, 300)).filter(Boolean);
  if (upserted.length !== args.files.length || !args.files.every((file) => upserted.includes(file.filename))) {
    throw shopifyError("SHOPIFY_THEME_FILES_UPSERT_VERIFICATION_FAILED", "Shopify did not confirm the complete staged theme file set.", 502);
  }
  const after = await themeById(client, args.themeId);
  if (!after?.id || clean(after.role, 80).toUpperCase() === "MAIN") {
    throw shopifyError("SHOPIFY_THEME_READBACK_FAILED", "The staged theme could not be safely verified after mutation.", 502);
  }
  return mutationEvidence(context, {
    theme: normalizeTheme(after),
    files: upserted,
    before: normalizeTheme(before),
    after: normalizeTheme(after),
    changedFields: upserted,
  });
}

async function pageByHandle(client, handle) {
  const payload = await client.request(PAGE_BY_HANDLE, { query: `handle:${handle}` });
  return (payload.pages?.nodes || []).find((page) => page.handle === handle) || null;
}

async function menuByHandle(client, handle) {
  const payload = await client.request(MENUS_QUERY, {});
  return (payload.menus?.nodes || []).find((menu) => menu.handle === handle) || null;
}

async function themeById(client, id) {
  const payload = await client.request(THEME_BY_ID, { id });
  return payload?.node || null;
}

function guardMutation(context, toolId, executor) {
  assertApprovalExecutionContext(context);
  if (context.tool?.id !== toolId || context.tool?.executor !== executor) {
    throw shopifyError("SHOPIFY_TOOL_MISMATCH", "The approval is not bound to this Shopify executor.", 403);
  }
}

function requireHandle(args, entity) {
  if (!clean(args?.handle, 255)) throw shopifyError("SHOPIFY_IDEMPOTENCY_HANDLE_REQUIRED", `A deterministic ${entity} handle is required before creation.`, 400);
}

function productCreateInput(args) {
  const product = pick(args, ["title", "descriptionHtml", "handle", "vendor", "productType", "tags", "templateSuffix"]);
  product.status = "DRAFT";
  if (args.seoTitle !== undefined || args.seoDescription !== undefined) {
    product.seo = pick({ title: args.seoTitle, description: args.seoDescription }, ["title", "description"]);
  }
  return product;
}

function collectionCreateInput(args) {
  const input = pick(args, ["title", "descriptionHtml", "handle", "templateSuffix", "sortOrder"]);
  if (args.productIds) input.products = args.productIds;
  if (args.seoTitle !== undefined || args.seoDescription !== undefined) {
    input.seo = pick({ title: args.seoTitle, description: args.seoDescription }, ["title", "description"]);
  }
  return input;
}

function collectionChangeInput(changes) {
  const input = pick(changes, ["title", "descriptionHtml", "handle", "templateSuffix", "sortOrder", "redirectNewHandle"]);
  if (changes.seoTitle !== undefined || changes.seoDescription !== undefined) {
    input.seo = pick({ title: changes.seoTitle, description: changes.seoDescription }, ["title", "description"]);
  }
  return input;
}

function verifyResource(resource, id, expectedHandle, label) {
  if (!resource?.id || resource.id !== id) {
    throw shopifyError("SHOPIFY_READBACK_IDENTITY_MISMATCH", `The Shopify ${label} readback did not match the mutated resource.`, 502);
  }
  if (expectedHandle && resource.handle !== expectedHandle) {
    throw shopifyError("SHOPIFY_READBACK_HANDLE_MISMATCH", `The Shopify ${label} readback handle did not match the approved handle.`, 502);
  }
}

function rejectUserErrors(errors, code) {
  if (!Array.isArray(errors) || !errors.length) return;
  const message = errors.slice(0, 5).map((item) => {
    const field = Array.isArray(item?.field) && item.field.length ? `${item.field.join(".")}: ` : "";
    return `${field}${String(item?.message || "Shopify error")}`;
  }).join("; ");
  throw shopifyError(code, message, 422);
}

function mutationEvidence(context, extra) {
  return {
    verified: true,
    mutated: true,
    source: "shopify-admin-graphql",
    approvalId: context.approvalId,
    identity: String(context.identity || ""),
    ...extra,
    build: KAIROS_SHOPIFY_SITE_ADMIN_BUILD,
  };
}

function normalizePage(page) {
  return page ? {
    id: clean(page.id, 220),
    title: clean(page.title, 500),
    handle: clean(page.handle, 500),
    isPublished: Boolean(page.isPublished),
    templateSuffix: clean(page.templateSuffix, 240),
    updatedAt: iso(page.updatedAt),
    ...(page.body !== undefined ? { body: clean(page.body, 100000) } : {}),
  } : null;
}

function normalizeMenu(menu) {
  return menu ? {
    id: clean(menu.id, 220),
    title: clean(menu.title, 500),
    handle: clean(menu.handle, 500),
    items: (menu.items || []).slice(0, 100).map((item) => ({
      id: clean(item.id, 220),
      title: clean(item.title, 500),
      type: clean(item.type, 80),
      url: clean(item.url, 2000),
      resourceId: clean(item.resourceId, 220),
    })),
  } : null;
}

function normalizeTheme(theme) {
  return theme ? {
    id: clean(theme.id, 220),
    name: clean(theme.name, 500),
    role: clean(theme.role, 80),
    processing: Boolean(theme.processing),
    processingFailed: Boolean(theme.processingFailed),
    updatedAt: iso(theme.updatedAt),
  } : null;
}

function normalizeEntity(entity) {
  if (!entity) return null;
  return Object.fromEntries(Object.entries(entity).map(([key, value]) => [key, key === "updatedAt" ? iso(value) : value]));
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) if (source?.[key] !== undefined) result[key] = source[key];
  return result;
}

function clean(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shopifyError(code, message, status = 502) {
  return new ShopifyRuntimeError(code, message, status);
}
