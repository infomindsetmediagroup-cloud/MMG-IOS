export const KAIROS_NATIVE_NAVIGATION_BUILD = "kairos-native-navigation-publisher-20260718-1";
export const NATIVE_NAVIGATION_PATH = "/api/shopify/navigation/publish";
export const NATIVE_NAVIGATION_CONFIRMATION = "PUBLISH_MMG_NATIVE_MAIN_NAVIGATION";

const SHOPIFY_TIMEOUT_MS = 25_000;
const tokenCache = new Map();

const REQUIRED_LINKS = [
  { title: "Home", url: "/" },
  { title: "Knowledge Library", url: "/pages/knowledge-library" },
  { title: "Products", url: "/pages/products" },
  { title: "Publishing Services", url: "/pages/publishing-services" },
  { title: "Membership", url: "/pages/membership" },
  { title: "Kairos", url: "/pages/kairos" },
  { title: "About", url: "/pages/about-mindset-media-group" },
  { title: "Contact", url: "/pages/contact" },
  { title: "Customer Portal", url: "/pages/customer-portal" },
];

const LANDING_PAGES = [
  { title: "Knowledge Library", handle: "knowledge-library", templateSuffix: "knowledge-library" },
  { title: "Products", handle: "products", templateSuffix: "products" },
  { title: "Publishing Services", handle: "publishing-services", templateSuffix: "publishing-services" },
  { title: "Membership", handle: "membership", templateSuffix: "membership" },
  { title: "Kairos", handle: "kairos", templateSuffix: "kairos" },
  { title: "Customer Portal", handle: "customer-portal", templateSuffix: "customer-portal" },
  { title: "About Mindset Media Group", handle: "about-mindset-media-group", templateSuffix: null },
  { title: "Contact", handle: "contact", templateSuffix: null },
];

export async function handleNativeNavigationPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== NATIVE_NAVIGATION_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== NATIVE_NAVIGATION_CONFIRMATION) {
    return json({ status: "failed", error: { code: "native_navigation_confirmation_required", message: `Provide the exact confirmation phrase: ${NATIVE_NAVIGATION_CONFIRMATION}.` } }, 403);
  }

  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const pages = [];
  for (const page of LANDING_PAGES) pages.push(await ensurePage(config, auth, page));
  const menu = await getMainMenu(config, auth);
  const items = mergeMenuItems(menu.items || [], REQUIRED_LINKS);
  const updated = await updateMenu(config, auth, menu, items);

  return json({
    status: "completed",
    build: KAIROS_NATIVE_NAVIGATION_BUILD,
    summary: "Kairos wired all MMG ecosystem destinations into Shopify's native main navigation and ensured each landing-page URL exists.",
    navigation: { id: updated.id, handle: updated.handle, title: updated.title, items: updated.items },
    pages,
    safeguards: { nativeShopifyMenuOnly: true, duplicateStandaloneNavigation: false, existingMenuItemsPreserved: true, landingPagesPublished: true },
  });
}

async function getMainMenu(config, auth) {
  const data = await shopifyGraphQL(config, auth, `query KairosMenus { menus(first: 50) { nodes { id handle title isDefault items { id title type url resourceId items { id title type url resourceId items { id title type url resourceId } } } } } }`, {});
  const menus = data?.menus?.nodes || [];
  const menu = menus.find(item => item.handle === "main-menu") || menus.find(item => item.isDefault && /main/i.test(item.title)) || menus.find(item => /main/i.test(item.title));
  if (!menu?.id) throw error(404, "main_menu_not_found", "Shopify's native main menu could not be identified.");
  return menu;
}

function mergeMenuItems(existing, required) {
  const output = existing.map(toUpdateInput);
  const seen = new Set(output.map(item => normalize(item.url)));
  for (const link of required) {
    const key = normalize(link.url);
    if (seen.has(key)) continue;
    output.push({ title: link.title, type: "HTTP", url: link.url, items: [] });
    seen.add(key);
  }
  return output;
}

function toUpdateInput(item) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    ...(item.url ? { url: item.url } : {}),
    ...(item.resourceId ? { resourceId: item.resourceId } : {}),
    items: Array.isArray(item.items) ? item.items.map(toUpdateInput) : [],
  };
}

async function updateMenu(config, auth, menu, items) {
  const data = await shopifyGraphQL(config, auth, `mutation KairosUpdateMainMenu($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $title, items: $items) { menu { id handle title items { id title type url items { id title type url } } } userErrors { code field message } } }`, { id: menu.id, title: menu.title, items });
  const errors = data?.menuUpdate?.userErrors || [];
  if (errors.length) throw error(422, "native_navigation_update_failed", errors.map(item => item.message).join("; "));
  return data?.menuUpdate?.menu;
}

async function ensurePage(config, auth, definition) {
  const query = `handle:${definition.handle}`;
  const found = await shopifyGraphQL(config, auth, `query KairosFindPage($query: String!) { pages(first: 10, query: $query) { nodes { id title handle templateSuffix publishedAt } } }`, { query });
  const page = (found?.pages?.nodes || []).find(item => item.handle === definition.handle);
  const pageInput = { title: definition.title, handle: definition.handle, isPublished: true, ...(definition.templateSuffix ? { templateSuffix: definition.templateSuffix } : {}) };
  if (!page) {
    const created = await shopifyGraphQL(config, auth, `mutation KairosCreatePage($page: PageCreateInput!) { pageCreate(page: $page) { page { id title handle templateSuffix publishedAt } userErrors { code field message } } }`, { page: pageInput });
    const errors = created?.pageCreate?.userErrors || [];
    if (errors.length) throw error(422, "landing_page_create_failed", `${definition.handle}: ${errors.map(item => item.message).join("; ")}`);
    return { ...created.pageCreate.page, action: "created" };
  }
  const updated = await shopifyGraphQL(config, auth, `mutation KairosUpdatePage($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id title handle templateSuffix publishedAt } userErrors { code field message } } }`, { id: page.id, page: pageInput });
  const errors = updated?.pageUpdate?.userErrors || [];
  if (errors.length) throw error(422, "landing_page_update_failed", `${definition.handle}: ${errors.map(item => item.message).join("; ")}`);
  return { ...updated.pageUpdate.page, action: "updated" };
}

function normalize(value) {
  try { const parsed = new URL(value, "https://store.invalid"); return (parsed.pathname.replace(/\/$/, "") || "/").toLowerCase(); }
  catch { return String(value || "").replace(/\/$/, "").toLowerCase(); }
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw error(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  return { storeDomain, apiVersion };
}

async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const cacheKey = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) return { token: cached.token };
    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
    const body = await safeResponseJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) throw error(401, "shopify_client_credentials_invalid", body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`);
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token };
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw error(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return { token };
}

async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
  const body = await safeResponseJSON(response);
  if (!response.ok) throw error(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (body?.errors?.length) throw error(422, "shopify_graphql_error", body.errors.map(item => item.message).join("; "));
  return body?.data || {};
}

function error(status, code, message) { const value = new Error(message); value.status = status; value.code = code; return value; }
async function safeRequestJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Native-Navigation": KAIROS_NATIVE_NAVIGATION_BUILD, "X-Content-Type-Options": "nosniff" } }); }
