import { httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_THEME_MENU_HOTFIX_BUILD = "kairos-theme-menu-hotfix-20260718-2";
export const THEME_MENU_HOTFIX_PATH = "/api/shopify/theme-menu-hotfix/publish";
export const THEME_MENU_HOTFIX_CONFIRMATION = "PUBLISH_MMG_THEME_MENU_HOTFIX_NOW";

const SHOPIFY_TIMEOUT_MS = 25_000;
const EXPECTED_STOREFRONT_HOST = "themindsetmediagroup.com";
const LAYOUT_FILE = "layout/theme.liquid";
const MARKER_START = "<!-- MMG_THEME_MENU_HOTFIX_START -->";
const MARKER_END = "<!-- MMG_THEME_MENU_HOTFIX_END -->";
const tokenCache = new Map();

const NAV = [
  ["Shop", [["All Products", "/collections/all"]]],
  ["Create & Learn", [["Free Creator Toolkit", "/pages/free-creator-toolkit"], ["CapCut Templates", "/pages/capcut-templates"]]],
  ["Services", [["Publishing Services", "/pages/publishing-services"], ["Customer Portal", "/pages/customer-portal"]]],
  ["Company", [["Company Overview", "/pages/about"], ["Founder", "/pages/founder"], ["Our Standards", "/pages/our-standards"], ["Publishing Philosophy", "/pages/publishing-philosophy"], ["Contact", "/pages/contact"]]],
  ["Support", [["Customer Portal", "/pages/customer-portal"], ["Contact", "/pages/contact"], ["Privacy Policy", "/policies/privacy-policy"], ["Terms of Service", "/policies/terms-of-service"], ["Refund Policy", "/policies/refund-policy"], ["Shipping Policy", "/policies/shipping-policy"]]]
];

export async function handleThemeMenuHotfixPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== THEME_MENU_HOTFIX_PATH) return null;
  const payload = await safeJSON(request.clone());
  if (payload?.confirmation !== THEME_MENU_HOTFIX_CONFIRMATION) {
    throw httpError(403, "theme_menu_hotfix_confirmation_required", `Provide the exact confirmation phrase: ${THEME_MENU_HOTFIX_CONFIRMATION}.`);
  }

  const config = readConfig(env);
  const auth = await resolveToken(config, env);
  const identity = await getShopIdentity(config, auth);
  const observedHosts = new Set([
    normalizeHost(identity?.primaryDomain?.host),
    normalizeHost(identity?.primaryDomain?.url),
    normalizeHost(identity?.myshopifyDomain),
  ].filter(Boolean));

  if (!observedHosts.has(EXPECTED_STOREFRONT_HOST)) {
    throw httpError(409, "shop_domain_identity_mismatch", `Connected Shopify shop does not own ${EXPECTED_STOREFRONT_HOST}. Observed: ${[...observedHosts].join(", ") || "none"}.`);
  }

  const theme = await getMainTheme(config, auth);
  const before = await readThemeFile(config, auth, theme.id, LAYOUT_FILE);
  if (!before) throw httpError(409, "theme_layout_unavailable", `${LAYOUT_FILE} was not readable from verified Shopify MAIN.`);

  const block = buildInlineBlock(theme.id, identity);
  const after = injectBlock(before, block);
  await writeThemeFiles(env, theme.id, [{ filename: LAYOUT_FILE, content: after }]);
  const readBack = await readThemeFile(config, auth, theme.id, LAYOUT_FILE);
  if (readBack !== after) throw httpError(502, "theme_menu_hotfix_readback_mismatch", "Shopify did not expose the exact menu hotfix revision from verified MAIN.");

  return json({
    status: "completed",
    build: KAIROS_THEME_MENU_HOTFIX_BUILD,
    summary: "Verified Shopify shop/domain identity and published corrected MMG navigation into the verified MAIN theme.",
    shop: {
      name: identity?.name || null,
      myshopifyDomain: identity?.myshopifyDomain || null,
      primaryDomain: identity?.primaryDomain || null,
      expectedStorefrontHost: EXPECTED_STOREFRONT_HOST,
      domainIdentityVerified: true,
    },
    theme: { id: theme.id, name: theme.name, role: theme.role },
    verification: {
      exactThemeReadBack: true,
      menuApiScopeRequired: false,
      knowledgeLibraryRemoved: !after.includes('>Knowledge Library<'),
      companyScopeRestricted: true,
      inlineReleaseMarkerPresent: after.includes(KAIROS_THEME_MENU_HOTFIX_BUILD),
      shopDomainIdentityVerified: true,
      mainThemeRoleVerified: String(theme.role).toUpperCase() === "MAIN",
      targetThemeIdEmbedded: after.includes(theme.id),
    }
  });
}

function buildInlineBlock(themeId, identity) {
  const navJSON = JSON.stringify(NAV).replace(/</g, "\\u003c");
  const identityJSON = JSON.stringify({ themeId, primaryDomain: identity?.primaryDomain || null, myshopifyDomain: identity?.myshopifyDomain || null }).replace(/</g, "\\u003c");
  return `${MARKER_START}\n<meta name="mmg-theme-menu-hotfix" content="${KAIROS_THEME_MENU_HOTFIX_BUILD}">\n<script type="application/json" id="mmg-theme-menu-identity">${identityJSON}</script>\n<style id="mmg-theme-menu-hotfix-style">
@media(max-width:989px){.mmg-hotfix-drawer{display:grid;padding:0 0 4rem}.mmg-hotfix-drawer details{border-bottom:1px solid rgba(var(--color-foreground),.12)}.mmg-hotfix-drawer summary{display:flex;align-items:center;justify-content:space-between;list-style:none;padding:1.8rem 2.4rem;font-size:2.1rem;cursor:pointer}.mmg-hotfix-drawer summary::-webkit-details-marker{display:none}.mmg-hotfix-drawer summary:after{content:"+"}.mmg-hotfix-drawer details[open] summary:after{content:"−"}.mmg-hotfix-drawer div{display:grid;padding:0 2.4rem 1.6rem}.mmg-hotfix-drawer a{color:inherit;text-decoration:none;font-size:1.65rem;padding:1rem 0}}
@media(min-width:990px){.mmg-hotfix-desktop{display:flex;align-items:center;gap:2rem;list-style:none;margin:0;padding:0}.mmg-hotfix-desktop>li{position:relative}.mmg-hotfix-desktop a,.mmg-hotfix-desktop summary{color:inherit;text-decoration:none;cursor:pointer;list-style:none}.mmg-hotfix-desktop summary::-webkit-details-marker{display:none}.mmg-hotfix-desktop ul{position:absolute;z-index:50;top:100%;left:0;min-width:24rem;background:rgb(var(--color-background));border:1px solid rgba(var(--color-foreground),.12);padding:1rem;list-style:none}.mmg-hotfix-desktop ul a{display:block;padding:.8rem 1rem}}
</style>
<script id="mmg-theme-menu-hotfix-script">
(()=>{"use strict";const BUILD="${KAIROS_THEME_MENU_HOTFIX_BUILD}";const NAV=${navJSON};const esc=v=>String(v).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]);const children=g=>g[1].map(x=>'<a href="'+esc(x[1])+'">'+esc(x[0])+'</a>').join('');const drawer='<nav class="mmg-hotfix-drawer" data-mmg-menu="'+BUILD+'">'+NAV.map(g=>'<details><summary>'+esc(g[0])+'</summary><div>'+children(g)+'</div></details>').join('')+'</nav>';const desktop='<ul class="mmg-hotfix-desktop" data-mmg-menu="'+BUILD+'">'+NAV.map(g=>'<li><details><summary>'+esc(g[0])+'</summary><ul>'+g[1].map(x=>'<li><a href="'+esc(x[1])+'">'+esc(x[0])+'</a></li>').join('')+'</ul></details></li>').join('')+'</ul>';function install(){for(const target of document.querySelectorAll('.menu-drawer__navigation')){if(target.dataset.mmgHotfix!==BUILD){target.innerHTML=drawer;target.dataset.mmgHotfix=BUILD}}for(const target of document.querySelectorAll('.header__inline-menu')){if(target.dataset.mmgHotfix!==BUILD){target.innerHTML=desktop;target.dataset.mmgHotfix=BUILD}}document.documentElement.dataset.mmgThemeMenuHotfix=BUILD}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();let n=0;const timer=setInterval(()=>{n++;install();if(n>=80)clearInterval(timer)},125);new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});})();
</script>\n${MARKER_END}`;
}

function injectBlock(source, block) {
  const stripped = stripBlock(source);
  return /<\/body>/i.test(stripped) ? stripped.replace(/<\/body>/i, `${block}\n</body>`) : `${stripped}\n${block}`;
}
function stripBlock(source) { const a = source.indexOf(MARKER_START); const b = source.indexOf(MARKER_END); return a >= 0 && b > a ? source.slice(0, a) + source.slice(b + MARKER_END.length) : source; }
function normalizeHost(value) { try { return new URL(String(value).startsWith("http") ? String(value) : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return String(value || "").toLowerCase().replace(/^www\./, "").split("/")[0]; } }
function readConfig(env) { const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim(); const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim(); if (!storeDomain) throw httpError(500, "shopify_store_domain_missing", "SHOPIFY_STORE_DOMAIN is required."); return { storeDomain, apiVersion }; }
async function resolveToken(config, env) { const direct = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(); if (direct) return { token: direct }; const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim(); const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim(); if (!clientId || !clientSecret) throw httpError(500, "shopify_credentials_missing", "Shopify credentials are required."); const key = `${config.storeDomain}:${clientId}`; const cached = tokenCache.get(key); if (cached && cached.expiresAt > Date.now() + 60000) return { token: cached.token }; const r = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const b = await safeJSON(r); if (!r.ok || !b?.access_token) throw httpError(r.status || 502, "shopify_token_error", "Unable to obtain Shopify token."); tokenCache.set(key, { token: b.access_token, expiresAt: Date.now() + Number(b.expires_in || 86300) * 1000 }); return { token: b.access_token }; }
async function getShopIdentity(config, auth) { const data = await gql(config, auth, `query { shop { name myshopifyDomain primaryDomain { host url } } }`, {}); if (!data?.shop) throw httpError(502, "shop_identity_unavailable", "Shopify shop identity could not be read."); return data.shop; }
async function getMainTheme(config, auth) { const data = await gql(config, auth, `query { themes(first:50) { nodes { id name role } } }`, {}); const theme = (data?.themes?.nodes || []).find(t => String(t.role).toUpperCase() === "MAIN"); if (!theme?.id) throw httpError(404, "main_theme_not_found", "Shopify MAIN theme could not be identified."); return theme; }
async function readThemeFile(config, auth, themeId, filename) { const data = await gql(config, auth, `query($themeId:ID!,$filenames:[String!]){theme(id:$themeId){files(first:1,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`, { themeId, filenames: [filename] }); const body = data?.theme?.files?.nodes?.[0]?.body; if (typeof body?.content === "string") return body.content; if (typeof body?.contentBase64 === "string") { try { return atob(body.contentBase64); } catch { return ""; } } return ""; }
async function gql(config, auth, query, variables) { const r = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const b = await safeJSON(r); if (!r.ok) throw httpError(r.status, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${r.status}.`); if (b?.errors?.length) throw httpError(422, "shopify_graphql_error", b.errors.map(e => e.message).join("; ")); return b?.data || {}; }
async function safeJSON(value) { try { return await value.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Theme-Menu-Hotfix": KAIROS_THEME_MENU_HOTFIX_BUILD } }); }
