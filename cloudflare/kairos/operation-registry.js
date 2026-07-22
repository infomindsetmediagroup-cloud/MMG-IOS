import { ShopifyRuntimeError } from "./shopify-client.js";

const INSTALLATION_QUERY = `query KairosShopifyInstallationVerification {
  shop { id name myshopifyDomain }
  currentAppInstallation { id accessScopes { handle } }
}`;

const PRODUCT_READ = `query KairosProductReadback($id: ID!) {
  product(id: $id) {
    id title handle descriptionHtml status tags vendor productType templateSuffix
    seo { title description }
    updatedAt
  }
}`;
const PRODUCT_UPDATE = `mutation KairosProductUpdate($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle updatedAt }
    userErrors { field message }
  }
}`;

const PAGE_READ = `query KairosPageReadback($id: ID!) {
  page(id: $id) {
    id title handle body isPublished templateSuffix updatedAt
  }
}`;
const PAGE_UPDATE = `mutation KairosPageUpdate($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) {
    page { id title handle updatedAt }
    userErrors { field message }
  }
}`;

const MENU_READ = `query KairosMenuReadback($id: ID!) {
  menu(id: $id) {
    id title handle
    items {
      id title type url resourceId
      items {
        id title type url resourceId
        items { id title type url resourceId }
      }
    }
  }
}`;
const MENU_UPDATE = `mutation KairosMenuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!, $handle: String) {
  menuUpdate(id: $id, title: $title, items: $items, handle: $handle) {
    menu { id title handle }
    userErrors { field message }
  }
}`;

const THEME_READ = `query KairosThemeFilesReadback($id: ID!, $filenames: [String!]!) {
  theme(id: $id) {
    id name role processing processingFailed
    files(filenames: $filenames, first: 50) {
      nodes { filename checksumMd5 contentType size updatedAt }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
const THEME_FILES_UPSERT = `mutation KairosThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
  themeFilesUpsert(themeId: $themeId, files: $files) {
    upsertedThemeFiles { filename }
    job { id done }
    userErrors { field message }
  }
}`;

export async function executeRegisteredOperation({ operationName, args, shopifyClient }) {
  switch (operationName) {
    case "artifact.manuscript.write":
      return assembleManuscript(args);
    case "shopify.verifyInstallation":
      return shopifyClient.verifyInstallation({ fresh: true });
    case "shopify.product.update":
      return updateProduct(shopifyClient, args);
    case "shopify.page.update":
      return updatePage(shopifyClient, args);
    case "shopify.menu.update":
      return updateMenu(shopifyClient, args);
    case "shopify.theme.unpublishedFiles.upsert":
      return upsertUnpublishedThemeFiles(shopifyClient, args);
    default:
      throw new ShopifyRuntimeError(
        "UNREGISTERED_OPERATION",
        `No executor exists for ${operationName}.`,
        403,
      );
  }
}

async function updateProduct(client, args) {
  await client.assertScopeGroups([["write_products"], ["read_products"]]);
  const id = args.product.id;
  const before = (await client.request(PRODUCT_READ, { id })).product;
  requireTarget(before, "product", id);

  const result = (await client.request(PRODUCT_UPDATE, { product: args.product })).productUpdate;
  rejectUserErrors(result?.userErrors);
  const after = (await client.request(PRODUCT_READ, { id })).product;
  requireTarget(after, "product", id);
  return mutationEvidence("product", before, after, result?.product);
}

async function updatePage(client, args) {
  await client.assertScopeGroups([
    ["write_content", "write_online_store_pages"],
    ["read_content", "read_online_store_pages"],
  ]);
  const id = args.id;
  const before = (await client.request(PAGE_READ, { id })).page;
  requireTarget(before, "page", id);

  const result = (await client.request(PAGE_UPDATE, { id, page: args.page })).pageUpdate;
  rejectUserErrors(result?.userErrors);
  const after = (await client.request(PAGE_READ, { id })).page;
  requireTarget(after, "page", id);
  return mutationEvidence("page", before, after, result?.page);
}

async function updateMenu(client, args) {
  await client.assertScopeGroups([
    ["write_online_store_navigation"],
    ["read_online_store_navigation"],
  ]);
  const id = args.id;
  const before = (await client.request(MENU_READ, { id })).menu;
  requireTarget(before, "menu", id);

  const variables = {
    id,
    title: args.title,
    items: args.items,
    ...(args.handle === undefined ? {} : { handle: args.handle }),
  };
  const result = (await client.request(MENU_UPDATE, variables)).menuUpdate;
  rejectUserErrors(result?.userErrors);
  const after = (await client.request(MENU_READ, { id })).menu;
  requireTarget(after, "menu", id);
  return mutationEvidence("menu", before, after, result?.menu);
}

async function upsertUnpublishedThemeFiles(client, args) {
  await client.assertScopeGroups([["write_themes"], ["read_themes"]]);
  const filenames = args.files.map((file) => file.filename);
  const before = (await client.request(THEME_READ, { id: args.themeId, filenames })).theme;
  requireTarget(before, "theme", args.themeId);
  if (before.role !== "UNPUBLISHED") {
    throw new ShopifyRuntimeError(
      "THEME_ROLE_DENIED",
      `Theme writes require role UNPUBLISHED; received ${before.role}.`,
      403,
    );
  }
  if (before.processing || before.processingFailed) {
    throw new ShopifyRuntimeError(
      "THEME_NOT_READY",
      "The target theme is processing or has failed processing.",
      409,
    );
  }

  const result = (
    await client.request(THEME_FILES_UPSERT, { themeId: args.themeId, files: args.files })
  ).themeFilesUpsert;
  rejectUserErrors(result?.userErrors);

  const after = (await client.request(THEME_READ, { id: args.themeId, filenames })).theme;
  requireTarget(after, "theme", args.themeId);
  if (after.role !== "UNPUBLISHED") {
    throw new ShopifyRuntimeError(
      "THEME_ROLE_CHANGED",
      "The theme role changed during execution; the operation is not accepted.",
      409,
    );
  }
  const returnedFiles = new Set((after.files?.nodes || []).map((file) => file.filename));
  const missing = filenames.filter((filename) => !returnedFiles.has(filename));
  if (missing.length) {
    throw new ShopifyRuntimeError(
      "THEME_READBACK_FAILED",
      `Shopify readback did not return: ${missing.join(", ")}`,
      502,
    );
  }

  return {
    resourceType: "theme",
    targetId: args.themeId,
    before,
    after,
    mutation: {
      upsertedThemeFiles: result?.upsertedThemeFiles || [],
      job: result?.job || null,
    },
  };
}

function assembleManuscript(args) {
  const manuscript = args.manuscript || {};
  const chapters = Array.isArray(manuscript.chapters) ? manuscript.chapters : [];
  if (!manuscript.title || chapters.length === 0) {
    throw new ShopifyRuntimeError(
      "MANUSCRIPT_INPUT_INVALID",
      "A deterministic manuscript requires a title and at least one supplied chapter.",
      400,
    );
  }
  const frontMatter = [
    `# ${manuscript.title}`,
    manuscript.subtitle ? `\n## ${manuscript.subtitle}` : "",
    manuscript.author ? `\n**Author:** ${manuscript.author}` : "",
  ].filter(Boolean).join("");
  const body = chapters.map((chapter, index) => {
    const title = chapter?.title || `Chapter ${index + 1}`;
    const content = String(chapter?.content || "").trim();
    return `\n\n## ${title}\n\n${content}`;
  }).join("");
  return {
    resourceType: "manuscript",
    targetId: args.manuscriptId,
    markdown: `${frontMatter}${body}\n`,
    chapterCount: chapters.length,
    shopifyOperationsExecuted: 0,
  };
}

function mutationEvidence(resourceType, before, after, mutation) {
  if (stableJson(before) === stableJson(after)) {
    throw new ShopifyRuntimeError(
      "SHOPIFY_NO_VERIFIED_CHANGE",
      `Shopify returned success but no verified ${resourceType} change was observed.`,
      409,
    );
  }
  return { resourceType, targetId: after.id, before, after, mutation };
}

function requireTarget(value, resourceType, id) {
  if (!value?.id || value.id !== id) {
    throw new ShopifyRuntimeError(
      "SHOPIFY_TARGET_NOT_FOUND",
      `The exact ${resourceType} target was not found: ${id}`,
      404,
    );
  }
}

function rejectUserErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return;
  throw new ShopifyRuntimeError(
    "SHOPIFY_USER_ERROR",
    errors.map((error) => error.message).join("; "),
    400,
    errors,
  );
}

function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObject(value[key])]),
  );
}

export const VALIDATED_SHOPIFY_OPERATIONS = Object.freeze({
  installation: INSTALLATION_QUERY,
  productRead: PRODUCT_READ,
  productUpdate: PRODUCT_UPDATE,
  pageRead: PAGE_READ,
  pageUpdate: PAGE_UPDATE,
  menuRead: MENU_READ,
  menuUpdate: MENU_UPDATE,
  themeRead: THEME_READ,
  themeFilesUpsert: THEME_FILES_UPSERT,
});
