export const KAIROS_NATIVE_MAIN_MENU_BUILD = "kairos-native-main-menu-publisher-20260718-4";
export const NATIVE_MAIN_MENU_PATH = "/api/shopify/native-main-menu/publish";
export const NATIVE_MAIN_MENU_CONFIRMATION = "PUBLISH_MMG_NATIVE_MAIN_MENU_NOW";

const SHOPIFY_TIMEOUT_MS = 25_000;
const tokenCache = new Map();
const LEGACY_TITLES = new Set(["Home", "Catalog", "Publishing Services", "Knowledge Library", "Customer Portal", "Company"]);

const CANONICAL_ITEMS = [
  { title: "Shop", type: "HTTP", url: "/collections/all", items: [
    { title: "All Products", type: "HTTP", url: "/collections/all", items: [] }
  ]},
  { title: "Create & Learn", type: "HTTP", url: "/pages/free-creator-toolkit", items: [
    { title: "Free Creator Toolkit", type: "HTTP", url: "/pages/free-creator-toolkit", items: [] },
    { title: "CapCut Templates", type: "HTTP", url: "/pages/capcut-templates", items: [] }
  ]},
  { title: "Services", type: "HTTP", url: "/pages/publishing-services", items: [
    { title: "Publishing Services", type: "HTTP", url: "/pages/publishing-services", items: [] },
    { title: "Customer Portal", type: "HTTP", url: "/pages/customer-portal", items: [] }
  ]},
  { title: "Company", type: "HTTP", url: "/pages/about", items: [
    { title: "Company Overview", type: "HTTP", url: "/pages/about", items: [] },
    { title: "Founder", type: "HTTP", url: "/pages/founder", items: [] },
    { title: "Our Standards", type: "HTTP", url: "/pages/our-standards", items: [] },
    { title: "Publishing Philosophy", type: "HTTP", url: "/pages/publishing-philosophy", items: [] },
    { title: "Contact", type: "HTTP", url: "/pages/contact", items: [] }
  ]},
  { title: "Support", type: "HTTP", url: "/pages/customer-portal", items: [
    { title: "Customer Portal", type: "HTTP", url: "/pages/customer-portal", items: [] },
    { title: "Contact", type: "HTTP", url: "/pages/contact", items: [] },
    { title: "Privacy Policy", type: "HTTP", url: "/policies/privacy-policy", items: [] },
    { title: "Terms of Service", type: "HTTP", url: "/policies/terms-of-service", items: [] },
    { title: "Refund Policy", type: "HTTP", url: "/policies/refund-policy", items: [] },
    { title: "Shipping Policy", type: "HTTP", url: "/policies/shipping-policy", items: [] }
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
  const menus = await getMenus(config, auth);
  const candidates = selectTargetMenus(menus);
  if (!candidates.length) throw error(404, "live_navigation_menu_not_found", "No Shopify navigation menu matched the live legacy navigation or the default/main menu fallback.");

  const expected = normalize(CANONICAL_ITEMS);
  const updatedMenus = [];
  for (const menu of candidates) {
    const before = normalize(menu.items || []);
    const updated = await updateMenu(config, auth, menu.id, menu.title, CANONICAL_ITEMS);
    const after = normalize(updated.items || []);
    if (JSON.stringify(after) !== JSON.stringify(expected)) {
      throw error(502, "native_main_menu_readback_mismatch", `Shopify did not return the exact canonical tree for ${menu.handle || menu.title}.`);
    }
    updatedMenus.push({ id: updated.id, handle: updated.handle, title: updated.title, before, after });
  }

  return json({
    status: "completed",
    build: KAIROS_NATIVE_MAIN_MENU_BUILD,
    summary: "Replaced every Shopify navigation menu matching the live legacy header signature, plus the active main/default fallback.",
    discovery: menus.map(m => ({ id: m.id, handle: m.handle, title: m.title, isDefault: m.isDefault, topLevelTitles: (m.items || []).map(i => i.title), legacyScore: legacyScore(m) })),
    updatedMenus,
    verification: {
      exactNativeMenuReadBack: true,
      knowledgeLibraryRemoved: updatedMenus.every(m => !JSON.stringify(m.after).includes("Knowledge Library")),
      liveLegacySignatureTargeted: candidates.some(m => legacyScore(m) >= 3),
      updatedMenuCount: updatedMenus.length,
      themeOverrideNotUsed: true
    }
  });
}

async function getMenus(config, auth) {
  const data = await gql(config, auth, `query { menus(first:100) { nodes { id handle title isDefault items { title type url items { title type url items { title type url } } } } } }`, {});
  return data?.menus?.nodes || [];
}

function legacyScore(menu) {
  const titles = new Set((menu?.items || []).map(i => i.title));
  let score = 0;
  for (const title of LEGACY_TITLES) if (titles.has(title)) score += 1;
  return score;
}

function selectTargetMenus(menus) {
  const selected = [];
  const seen = new Set();
  const add = menu => { if (menu?.id && !seen.has(menu.id)) { seen.add(menu.id); selected.push(menu); } };
  menus.filter(m => legacyScore(m) >= 3).sort((a, b) => legacyScore(b) - legacyScore(a)).forEach(add);
  menus.filter(m => m.handle === "main-menu" || m.isDefault || /main/i.test(m.title || "")).forEach(add);
  return selected;
}

async function updateMenu(config, auth, id, title, items) {
  const data = await gql(config, auth, `mutation($id:ID!,$title:String!,$items:[MenuItemUpdateInput!]!){menuUpdate(id:$id,title:$title,items:$items){menu{id handle title items{title type url items{title type url items{title type url}}}} userErrors{field message code}}}`, { id, title, items });
  const errors = data?.menuUpdate?.userErrors || [];
  if (errors.length) throw error(422, "native_main_menu_update_failed", errors.map(e => `${(e.field || []).join(".")}: ${e.message}`).join("; "));
  return data?.menuUpdate?.menu;
}

function normalize(items) { return (items || []).map(i => ({ title: i.title, type: i.type, url: pathOnly(i.url), items: normalize(i.items) })); }
function pathOnly(value) { try { const u = new URL(value, "https://themindsetmediagroup.com"); return u.pathname + u.search; } catch { return String(value || ""); } }
function readConfig(env) { const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim(); const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim(); if (!storeDomain) throw error(500, "shopify_store_domain_missing", "SHOPIFY_STORE_DOMAIN is required."); return { storeDomain, apiVersion }; }
async function resolveToken(config, env) { const direct = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(); if (direct) return { token: direct }; const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim(); const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim(); if (!clientId || !clientSecret) throw error(500, "shopify_credentials_missing", "Shopify credentials are required."); const key = `${config.storeDomain}:${clientId}`; const cached = tokenCache.get(key); if (cached && cached.expiresAt > Date.now() + 60000) return { token: cached.token }; const r = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const b = await safeJSON(r); if (!r.ok || !b?.access_token) throw error(r.status || 502, "shopify_token_error", "Unable to obtain Shopify token."); tokenCache.set(key, { token: b.access_token, expiresAt: Date.now() + Number(b.expires_in || 86300) * 1000 }); return { token: b.access_token }; }
async function gql(config, auth, query, variables) { const r = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const b = await safeJSON(r); if (!r.ok) throw error(r.status, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${r.status}.`); if (b?.errors?.length) throw error(422, "shopify_graphql_error", b.errors.map(e => e.message).join("; ")); return b?.data || {}; }
async function safeJSON(value) { try { return await value.json(); } catch { return {}; } }
function error(status, code, message) { const e = new Error(message); e.status = status; e.code = code; return e; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Native-Main-Menu": KAIROS_NATIVE_MAIN_MENU_BUILD } }); }
