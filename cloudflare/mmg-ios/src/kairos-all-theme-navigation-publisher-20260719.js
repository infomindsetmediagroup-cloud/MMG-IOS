import { httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_ALL_THEME_NAVIGATION_BUILD = "kairos-all-theme-navigation-20260719-1";
export const ALL_THEME_NAVIGATION_PATH = "/api/shopify/all-theme-navigation/publish";
export const ALL_THEME_NAVIGATION_CONFIRMATION = "PUBLISH_MMG_ALL_THEME_NAVIGATION_NOW";

const SHOPIFY_TIMEOUT_MS = 25_000;
const LAYOUT_FILE = "layout/theme.liquid";
const MARKER_START = "<!-- MMG_ALL_THEME_NAV_START -->";
const MARKER_END = "<!-- MMG_ALL_THEME_NAV_END -->";
const tokenCache = new Map();

const NAV = [
  ["Shop", [["All Products", "/collections/all"]]],
  ["Create & Learn", [["Free Creator Toolkit", "/pages/free-creator-toolkit"], ["CapCut Templates", "/pages/capcut-templates"]]],
  ["Services", [["Publishing Services", "/pages/publishing-services"], ["Customer Portal", "/pages/customer-portal"]]],
  ["Company", [["Company Overview", "/pages/about"], ["Founder", "/pages/founder"], ["Our Standards", "/pages/our-standards"], ["Publishing Philosophy", "/pages/publishing-philosophy"], ["Contact", "/pages/contact"]]],
  ["Support", [["Customer Portal", "/pages/customer-portal"], ["Contact", "/pages/contact"], ["Privacy Policy", "/policies/privacy-policy"], ["Terms of Service", "/policies/terms-of-service"], ["Refund Policy", "/policies/refund-policy"], ["Shipping Policy", "/policies/shipping-policy"]]],
];

export async function handleAllThemeNavigationPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== ALL_THEME_NAVIGATION_PATH) return null;

  const payload = await safeJSON(request.clone());
  if (payload?.confirmation !== ALL_THEME_NAVIGATION_CONFIRMATION) {
    throw httpError(403, "all_theme_navigation_confirmation_required", `Provide the exact confirmation phrase: ${ALL_THEME_NAVIGATION_CONFIRMATION}.`);
  }

  const config = readConfig(env);
  const auth = await resolveToken(config, env);
  const themes = await getThemes(config, auth);
  if (!themes.length) throw httpError(404, "shopify_themes_not_found", "No Shopify themes were returned.");

  const block = buildBlock();
  const patched = [];
  const skipped = [];

  for (const theme of themes) {
    const before = await readThemeFile(config, auth, theme.id, LAYOUT_FILE);
    if (!before) {
      skipped.push({ id: theme.id, name: theme.name, role: theme.role, reason: "layout_unreadable" });
      continue;
    }

    const after = injectBlock(before, block);
    await writeThemeFiles(env, theme.id, [{ filename: LAYOUT_FILE, content: after }]);
    const readBack = await readThemeFile(config, auth, theme.id, LAYOUT_FILE);
    if (readBack !== after) {
      throw httpError(502, "all_theme_navigation_readback_mismatch", `Exact read-back failed for ${theme.name || theme.id}.`);
    }

    patched.push({ id: theme.id, name: theme.name, role: theme.role, exactReadBack: true });
  }

  if (!patched.length) throw httpError(409, "no_renderable_theme_layouts", "No readable theme layout was patched.");

  return json({
    status: "completed",
    build: KAIROS_ALL_THEME_NAVIGATION_BUILD,
    patchedThemes: patched,
    skippedThemes: skipped,
    verification: {
      allReadableThemeLayoutsPatched: true,
      exactThemeReadBack: true,
      canonicalNavigationEmbedded: true,
      patchedThemeCount: patched.length,
      mainThemePatched: patched.some(theme => String(theme.role).toUpperCase() === "MAIN"),
    },
  });
}

function buildBlock() {
  const nav = JSON.stringify(NAV).replace(/</g, "\\u003c");
  return `${MARKER_START}\n<meta name="mmg-all-theme-navigation" content="${KAIROS_ALL_THEME_NAVIGATION_BUILD}">\n<style id="mmg-all-theme-nav-style">.mmg-all-theme-nav{display:flex;gap:1.5rem;list-style:none;margin:0;padding:0}.mmg-all-theme-nav>li{position:relative}.mmg-all-theme-nav a,.mmg-all-theme-nav summary{color:inherit;text-decoration:none;cursor:pointer;list-style:none}.mmg-all-theme-nav summary::-webkit-details-marker{display:none}.mmg-all-theme-nav ul{position:absolute;z-index:9999;top:100%;left:0;min-width:22rem;background:#fff;color:#111;border:1px solid rgba(0,0,0,.12);padding:1rem;list-style:none}.mmg-all-theme-nav ul a{display:block;padding:.75rem 1rem}@media(max-width:989px){.mmg-all-theme-nav{display:grid}.mmg-all-theme-nav ul{position:static;border:0;padding:.5rem 0 1rem 1rem}}</style>\n<script id="mmg-all-theme-nav-script">(()=>{\"use strict\";const BUILD=\"${KAIROS_ALL_THEME_NAVIGATION_BUILD}\",NAV=${nav},esc=v=>String(v).replace(/[&<>\\\"]/g,c=>({\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",\"\\\"\":\"&quot;\"})[c]),html='<ul class="mmg-all-theme-nav" data-mmg-all-theme="'+BUILD+'">'+NAV.map(g=>'<li><details><summary>'+esc(g[0])+'</summary><ul>'+g[1].map(x=>'<li><a href="'+esc(x[1])+'">'+esc(x[0])+'</a></li>').join('')+'</ul></details></li>').join('')+'</ul>';function install(){const roots=[...document.querySelectorAll('header nav,header .header__inline-menu,header [role="navigation"],.menu-drawer__navigation')];for(const el of roots){const text=(el.innerText||'').replace(/\\s+/g,' ');if(/Catalog|Knowledge Library|Customer Portal|Publishing Services/i.test(text)||el.classList.contains('header__inline-menu')||el.classList.contains('menu-drawer__navigation')){el.innerHTML=html;el.dataset.mmgAllTheme=BUILD}}document.documentElement.dataset.mmgAllThemeNavigation=BUILD}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});})();</script>\n${MARKER_END}`;
}

function injectBlock(source, block) {
  const stripped = stripBlock(source);
  return /<\/body>/i.test(stripped) ? stripped.replace(/<\/body>/i, `${block}\n</body>`) : `${stripped}\n${block}`;
}

function stripBlock(source) {
  const start = source.indexOf(MARKER_START);
  const end = source.indexOf(MARKER_END);
  return start >= 0 && end > start ? source.slice(0, start) + source.slice(end + MARKER_END.length) : source;
}

function readConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!storeDomain) throw httpError(500, "shopify_store_domain_missing", "SHOPIFY_STORE_DOMAIN is required.");
  return { storeDomain, apiVersion };
}

async function resolveToken(config, env) {
  const direct = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (direct) return { token: direct };
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw httpError(500, "shopify_credentials_missing", "Shopify credentials are required.");
  const key = `${config.storeDomain}:${clientId}`;
  const cached = tokenCache.get(key);
  if (cached?.expiresAt > Date.now() + 60000) return { token: cached.token };
  const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok || !body?.access_token) throw httpError(response.status || 502, "shopify_token_error", "Unable to obtain Shopify token.");
  tokenCache.set(key, { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 86300) * 1000 });
  return { token: body.access_token };
}

async function getThemes(config, auth) {
  const data = await gql(config, auth, `query { themes(first:50) { nodes { id name role processing processingFailed } } }`, {});
  return (data?.themes?.nodes || []).filter(theme => !theme?.processing && !theme?.processingFailed);
}

async function readThemeFile(config, auth, themeId, filename) {
  const data = await gql(config, auth, `query($themeId:ID!,$filenames:[String!]){theme(id:$themeId){files(first:1,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`, { themeId, filenames: [filename] });
  const body = data?.theme?.files?.nodes?.[0]?.body;
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") {
    try { return atob(body.contentBase64); } catch { return ""; }
  }
  return "";
}

async function gql(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${response.status}.`);
  if (body?.errors?.length) throw httpError(422, "shopify_graphql_error", body.errors.map(error => error.message).join("; "));
  return body?.data || {};
}

async function safeJSON(value) { try { return await value.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-All-Theme-Navigation": KAIROS_ALL_THEME_NAVIGATION_BUILD } }); }
