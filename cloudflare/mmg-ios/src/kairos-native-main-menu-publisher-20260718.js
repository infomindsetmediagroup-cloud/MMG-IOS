export const KAIROS_NATIVE_MAIN_MENU_BUILD = "kairos-native-main-menu-publisher-20260718-7";
export const NATIVE_MAIN_MENU_PATH = "/api/shopify/native-main-menu/publish";
export const NATIVE_MAIN_MENU_CONFIRMATION = "PUBLISH_MMG_NATIVE_MAIN_MENU_NOW";

const SHOPIFY_TIMEOUT_MS = 25_000;
const STOREFRONT_ORIGIN = "https://themindsetmediagroup.com";
const tokenCache = new Map();
const THEME_FILES = ["sections/header-group.json", "config/settings_data.json"];
const LEGACY_TITLES = new Set(["Home", "Catalog", "Publishing Services", "Knowledge Library", "Customer Portal", "Company", "Contact"]);

const CANONICAL_ITEMS = [
  { title: "Shop", type: "HTTP", url: `${STOREFRONT_ORIGIN}/collections/all`, items: [
    { title: "All Products", type: "HTTP", url: `${STOREFRONT_ORIGIN}/collections/all`, items: [] }
  ]},
  { title: "Create & Learn", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/free-creator-toolkit`, items: [
    { title: "Free Creator Toolkit", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/free-creator-toolkit`, items: [] },
    { title: "CapCut Templates", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/capcut-templates`, items: [] }
  ]},
  { title: "Services", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/publishing-services`, items: [
    { title: "Publishing Services", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/publishing-services`, items: [] },
    { title: "Customer Portal", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/customer-portal`, items: [] }
  ]},
  { title: "Company", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/about`, items: [
    { title: "Company Overview", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/about`, items: [] },
    { title: "Founder", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/founder`, items: [] },
    { title: "Our Standards", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/our-standards`, items: [] },
    { title: "Publishing Philosophy", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/publishing-philosophy`, items: [] },
    { title: "Contact", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/contact`, items: [] }
  ]},
  { title: "Support", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/customer-portal`, items: [
    { title: "Customer Portal", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/customer-portal`, items: [] },
    { title: "Contact", type: "HTTP", url: `${STOREFRONT_ORIGIN}/pages/contact`, items: [] },
    { title: "Privacy Policy", type: "HTTP", url: `${STOREFRONT_ORIGIN}/policies/privacy-policy`, items: [] },
    { title: "Terms of Service", type: "HTTP", url: `${STOREFRONT_ORIGIN}/policies/terms-of-service`, items: [] },
    { title: "Refund Policy", type: "HTTP", url: `${STOREFRONT_ORIGIN}/policies/refund-policy`, items: [] },
    { title: "Shipping Policy", type: "HTTP", url: `${STOREFRONT_ORIGIN}/policies/shipping-policy`, items: [] }
  ]}
];

export async function handleNativeMainMenuPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== NATIVE_MAIN_MENU_PATH) return null;
  const payload = await safeJSON(request.clone());
  if (payload?.confirmation !== NATIVE_MAIN_MENU_CONFIRMATION) {
    throw error(403, "native_main_menu_confirmation_required", `Provide the exact confirmation phrase: ${NATIVE_MAIN_MENU_CONFIRMATION}.`);
  }

  const config = readConfig(env);
  const auth = await resolveToken(config, env);
  const theme = await getMainTheme(config, auth);
  const themeConfig = await readThemeFiles(config, auth, theme.id, THEME_FILES);
  const boundHandles = extractMenuHandles(themeConfig);
  const menus = await getMenus(config, auth);
  const candidates = selectTargetMenus(menus, boundHandles);
  if (!candidates.length) {
    throw error(404, "live_header_menu_not_found", `No Shopify menu matched the MAIN theme binding, live legacy signature, or main/default fallback. Handles found: ${[...boundHandles].join(", ") || "none"}.`);
  }

  const expected = normalize(CANONICAL_ITEMS);
  const updatedMenus = [];
  for (const menu of candidates) {
    const before = normalize(menu.items || []);
    const updated = await updateMenu(config, auth, menu.id, menu.title, CANONICAL_ITEMS);
    const after = normalize(updated.items || []);
    if (JSON.stringify(after) !== JSON.stringify(expected)) {
      throw error(502, "native_main_menu_readback_mismatch", `Shopify did not return the canonical tree for ${menu.handle || menu.title}.`);
    }
    updatedMenus.push({ id: updated.id, handle: updated.handle, title: updated.title, before, after, legacyScore: legacyScore(menu), bound: boundHandles.has(menu.handle) });
  }

  const legacyTargets = candidates.filter(m => legacyScore(m) >= 3);
  return json({
    status: "completed",
    build: KAIROS_NATIVE_MAIN_MENU_BUILD,
    authSource: auth.source,
    theme: { id: theme.id, name: theme.name, role: theme.role },
    boundHandles: [...boundHandles],
    discovery: menus.map(m => ({ id: m.id, handle: m.handle, title: m.title, isDefault: m.isDefault, topLevelTitles: (m.items || []).map(i => i.title), legacyScore: legacyScore(m) })),
    updatedMenus,
    verification: {
      exactNativeMenuReadBack: true,
      liveThemeBindingResolved: boundHandles.size > 0,
      boundMenuUpdated: updatedMenus.some(m => m.bound),
      liveLegacySignatureTargeted: legacyTargets.length > 0,
      legacyMenuUpdated: updatedMenus.some(m => m.legacyScore >= 3),
      knowledgeLibraryRemoved: updatedMenus.every(m => !JSON.stringify(m.after).includes("Knowledge Library")),
      updatedMenuCount: updatedMenus.length,
      freshClientCredentialsTokenUsed: auth.source === "client_credentials",
      absoluteUrlsUsed: true,
      themeOverrideNotUsed: true
    }
  });
}

async function getMainTheme(config, auth) {
  const data = await gql(config, auth, `query { themes(first:50) { nodes { id name role } } }`, {});
  const theme = (data?.themes?.nodes || []).find(t => String(t.role).toUpperCase() === "MAIN");
  if (!theme?.id) throw error(404, "main_theme_not_found", "Shopify MAIN theme could not be identified.");
  return theme;
}

async function readThemeFiles(config, auth, themeId, filenames) {
  const data = await gql(config, auth, `query($themeId:ID!,$filenames:[String!]){theme(id:$themeId){files(first:20,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`, { themeId, filenames });
  const out = {};
  for (const node of data?.theme?.files?.nodes || []) {
    const body = node?.body;
    if (typeof body?.content === "string") out[node.filename] = body.content;
    else if (typeof body?.contentBase64 === "string") {
      try { out[node.filename] = atob(body.contentBase64); } catch { out[node.filename] = ""; }
    }
  }
  return out;
}

function extractMenuHandles(files) {
  const handles = new Set();
  for (const [filename, text] of Object.entries(files || {})) {
    const parsed = parseJSON(text);
    if (!parsed) continue;
    walk(parsed, [], (key, value, path) => {
      const lower = String(key || "").toLowerCase();
      const inHeader = filename.includes("header") || path.some(p => String(p).toLowerCase().includes("header"));
      if (inHeader && typeof value === "string" && (lower === "menu" || lower.endsWith("_menu") || lower.includes("menu_handle"))) {
        const handle = value.trim();
        if (handle) handles.add(handle);
      }
    });
  }
  return handles;
}

function walk(value, path, visit) {
  if (Array.isArray(value)) return value.forEach((v, i) => walk(v, [...path, i], visit));
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    visit(k, v, path);
    walk(v, [...path, k], visit);
  }
}

function legacyScore(menu) {
  const titles = new Set((menu?.items || []).map(i => i.title));
  let score = 0;
  for (const title of LEGACY_TITLES) if (titles.has(title)) score += 1;
  return score;
}

function selectTargetMenus(menus, handles) {
  const selected = [];
  const seen = new Set();
  const add = m => { if (m?.id && !seen.has(m.id)) { seen.add(m.id); selected.push(m); } };
  menus.filter(m => handles.has(m.handle)).forEach(add);
  menus.filter(m => legacyScore(m) >= 3).sort((a, b) => legacyScore(b) - legacyScore(a)).forEach(add);
  menus.filter(m => m.handle === "main-menu" || m.isDefault || /main/i.test(m.title || "")).forEach(add);
  return selected;
}

async function getMenus(config, auth) {
  const data = await gql(config, auth, `query { menus(first:100) { nodes { id handle title isDefault items { title type url items { title type url items { title type url } } } } } }`, {});
  return data?.menus?.nodes || [];
}

async function updateMenu(config, auth, id, title, items) {
  const data = await gql(config, auth, `mutation($id:ID!,$title:String!,$items:[MenuItemUpdateInput!]!){menuUpdate(id:$id,title:$title,items:$items){menu{id handle title items{title type url items{title type url items{title type url}}}} userErrors{field message code}}}`, { id, title, items });
  const errors = data?.menuUpdate?.userErrors || [];
  if (errors.length) throw error(422, "native_main_menu_update_failed", errors.map(e => `${(e.field || []).join(".")}: ${e.message}`).join("; "));
  return data?.menuUpdate?.menu;
}

function normalize(items) { return (items || []).map(i => ({ title: i.title, type: i.type, url: pathOnly(i.url), items: normalize(i.items) })); }
function pathOnly(value) { try { const u = new URL(value, STOREFRONT_ORIGIN); return u.pathname + u.search; } catch { return String(value || ""); } }
function parseJSON(text) { try { return JSON.parse(String(text || "")); } catch { return null; } }
function readConfig(env) { const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim(); const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim(); if (!storeDomain) throw error(500, "shopify_store_domain_missing", "SHOPIFY_STORE_DOMAIN is required."); return { storeDomain, apiVersion }; }

async function resolveToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const key = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > Date.now() + 60000) return { token: cached.token, source: "client_credentials" };
    const r = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
    const b = await safeJSON(r);
    if (!r.ok || !b?.access_token) throw error(r.status || 502, "shopify_token_error", "Unable to obtain a fresh Shopify client-credentials token.");
    tokenCache.set(key, { token: b.access_token, expiresAt: Date.now() + Number(b.expires_in || 86300) * 1000 });
    return { token: b.access_token, source: "client_credentials" };
  }
  const direct = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (direct) return { token: direct, source: "legacy_direct_token" };
  throw error(500, "shopify_credentials_missing", "Shopify client credentials are required; no fallback Admin token is configured.");
}

async function gql(config, auth, query, variables) {
  const r = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
  const b = await safeJSON(r);
  if (!r.ok) throw error(r.status, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${r.status}.`);
  if (b?.errors?.length) throw error(422, "shopify_graphql_error", b.errors.map(e => e.message).join("; "));
  return b?.data || {};
}

async function safeJSON(value) { try { return await value.json(); } catch { return {}; } }
function error(status, code, message) { const e = new Error(message); e.status = status; e.code = code; return e; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Native-Main-Menu": KAIROS_NATIVE_MAIN_MENU_BUILD } }); }
