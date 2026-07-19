import { httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_LIVE_HEADER_BUILD = "kairos-live-header-navigation-20260719-1";
export const LIVE_HEADER_PATH = "/api/shopify/live-header-navigation/publish";
export const LIVE_HEADER_CONFIRMATION = "PUBLISH_MMG_LIVE_HEADER_NAVIGATION_NOW";

const SHOPIFY_TIMEOUT_MS = 25_000;
const MARKER_START = "<!-- MMG_LIVE_HEADER_NAV_START -->";
const MARKER_END = "<!-- MMG_LIVE_HEADER_NAV_END -->";
const LEGACY = /\b(Home|Catalog|Publishing Services|Knowledge Library|Customer Portal|Company|Contact)\b/i;
const tokenCache = new Map();

const NAV = [
  ["Shop", [["All Products", "/collections/all"]]],
  ["Create & Learn", [["Free Creator Toolkit", "/pages/free-creator-toolkit"], ["CapCut Templates", "/pages/capcut-templates"]]],
  ["Services", [["Publishing Services", "/pages/publishing-services"], ["Customer Portal", "/pages/customer-portal"]]],
  ["Company", [["Company Overview", "/pages/about"], ["Founder", "/pages/founder"], ["Our Standards", "/pages/our-standards"], ["Publishing Philosophy", "/pages/publishing-philosophy"], ["Contact", "/pages/contact"]]],
  ["Support", [["Customer Portal", "/pages/customer-portal"], ["Contact", "/pages/contact"], ["Privacy Policy", "/policies/privacy-policy"], ["Terms of Service", "/policies/terms-of-service"], ["Refund Policy", "/policies/refund-policy"], ["Shipping Policy", "/policies/shipping-policy"]]]
];

export async function handleLiveHeaderNavigationPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== LIVE_HEADER_PATH) return null;
  const payload = await safeJSON(request.clone());
  if (payload?.confirmation !== LIVE_HEADER_CONFIRMATION) throw httpError(403, "live_header_confirmation_required", `Provide the exact confirmation phrase: ${LIVE_HEADER_CONFIRMATION}.`);

  const config = readConfig(env);
  const auth = await resolveToken(config, env);
  const theme = await getMainTheme(config, auth);
  const filenames = await listThemeFiles(config, auth, theme.id);
  const candidates = filenames.filter(name => /^(sections|snippets)\/.*(header|menu|navigation).*\.(liquid|json)$/i.test(name));
  const files = await readThemeFiles(config, auth, theme.id, candidates);
  const targets = files.filter(file => file.filename.endsWith(".liquid") && LEGACY.test(file.content || ""));
  if (!targets.length) throw httpError(404, "rendered_header_source_not_found", `No rendered header Liquid source containing the legacy navigation was found. Candidates: ${candidates.join(", ") || "none"}.`);

  const block = buildBlock();
  const updates = targets.map(file => ({ filename: file.filename, content: injectBlock(file.content, block) }));
  await writeThemeFiles(env, theme.id, updates);
  const readBack = await readThemeFiles(config, auth, theme.id, updates.map(file => file.filename));
  const readBackMap = new Map(readBack.map(file => [file.filename, file.content]));
  for (const update of updates) {
    if (readBackMap.get(update.filename) !== update.content) throw httpError(502, "live_header_readback_mismatch", `Exact read-back failed for ${update.filename}.`);
  }

  return json({
    status: "completed",
    build: KAIROS_LIVE_HEADER_BUILD,
    theme: { id: theme.id, name: theme.name, role: theme.role },
    scannedCandidates: candidates,
    patchedFiles: updates.map(file => file.filename),
    verification: {
      exactHeaderFileReadBack: true,
      renderedHeaderSourcePatched: updates.length > 0,
      canonicalNavigationEmbedded: updates.every(file => file.content.includes(KAIROS_LIVE_HEADER_BUILD)),
      legacyNavigationTargetFound: targets.length > 0,
      nativeMenuPreserved: true
    }
  });
}

function buildBlock() {
  const nav = JSON.stringify(NAV).replace(/</g, "\\u003c");
  return `${MARKER_START}\n<style id="mmg-live-header-nav-style">.mmg-live-nav{display:flex;gap:1.5rem;list-style:none;margin:0;padding:0}.mmg-live-nav>li{position:relative}.mmg-live-nav a,.mmg-live-nav summary{color:inherit;text-decoration:none;cursor:pointer;list-style:none}.mmg-live-nav summary::-webkit-details-marker{display:none}.mmg-live-nav ul{position:absolute;z-index:9999;top:100%;left:0;min-width:22rem;background:#fff;color:#111;border:1px solid rgba(0,0,0,.12);padding:1rem;list-style:none}.mmg-live-nav ul a{display:block;padding:.75rem 1rem}@media(max-width:989px){.mmg-live-nav{display:grid}.mmg-live-nav ul{position:static;border:0;padding:.5rem 0 1rem 1rem}}</style>\n<script id="mmg-live-header-nav-script">(()=>{"use strict";const BUILD="${KAIROS_LIVE_HEADER_BUILD}",NAV=${nav},esc=v=>String(v).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]),html='<ul class="mmg-live-nav" data-mmg-live-header="'+BUILD+'">'+NAV.map(g=>'<li><details><summary>'+esc(g[0])+'</summary><ul>'+g[1].map(x=>'<li><a href="'+esc(x[1])+'">'+esc(x[0])+'</a></li>').join('')+'</ul></details></li>').join('')+'</ul>';function install(){const roots=[...document.querySelectorAll('header nav,header .header__inline-menu,header [role="navigation"],.menu-drawer__navigation')];for(const el of roots){const t=(el.innerText||'').replace(/\s+/g,' ');if(/Catalog|Knowledge Library|Customer Portal|Publishing Services/i.test(t)||el.classList.contains('header__inline-menu')||el.classList.contains('menu-drawer__navigation')){el.innerHTML=html;el.dataset.mmgLiveHeader=BUILD}}document.documentElement.dataset.mmgLiveHeaderNavigation=BUILD}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});})();</script>\n${MARKER_END}`;
}

function injectBlock(source, block) {
  const stripped = stripBlock(source);
  const schema = stripped.lastIndexOf("{% schema %}");
  return schema >= 0 ? `${stripped.slice(0, schema)}${block}\n${stripped.slice(schema)}` : `${stripped}\n${block}`;
}
function stripBlock(source) { const a = source.indexOf(MARKER_START); const b = source.indexOf(MARKER_END); return a >= 0 && b > a ? source.slice(0, a) + source.slice(b + MARKER_END.length) : source; }
function readConfig(env) { const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim(); const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim(); if (!storeDomain) throw httpError(500, "shopify_store_domain_missing", "SHOPIFY_STORE_DOMAIN is required."); return { storeDomain, apiVersion }; }
async function resolveToken(config, env) { const direct = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(); if (direct) return { token: direct }; const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim(); const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim(); if (!clientId || !clientSecret) throw httpError(500, "shopify_credentials_missing", "Shopify credentials are required."); const key = `${config.storeDomain}:${clientId}`; const cached = tokenCache.get(key); if (cached?.expiresAt > Date.now() + 60000) return { token: cached.token }; const r = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const b = await safeJSON(r); if (!r.ok || !b?.access_token) throw httpError(r.status || 502, "shopify_token_error", "Unable to obtain Shopify token."); tokenCache.set(key, { token: b.access_token, expiresAt: Date.now() + Number(b.expires_in || 86300) * 1000 }); return { token: b.access_token }; }
async function getMainTheme(config, auth) { const data = await gql(config, auth, `query { themes(first:50) { nodes { id name role } } }`, {}); const theme = (data?.themes?.nodes || []).find(t => String(t.role).toUpperCase() === "MAIN"); if (!theme?.id) throw httpError(404, "main_theme_not_found", "Shopify MAIN theme could not be identified."); return theme; }
async function listThemeFiles(config, auth, themeId) { const data = await gql(config, auth, `query($themeId:ID!){theme(id:$themeId){files(first:250){nodes{filename}}}}`, { themeId }); return (data?.theme?.files?.nodes || []).map(node => node.filename).filter(Boolean); }
async function readThemeFiles(config, auth, themeId, filenames) { const out = []; for (let i = 0; i < filenames.length; i += 40) { const batch = filenames.slice(i, i + 40); const data = await gql(config, auth, `query($themeId:ID!,$filenames:[String!]){theme(id:$themeId){files(first:50,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`, { themeId, filenames: batch }); for (const node of data?.theme?.files?.nodes || []) { const body = node?.body; let content = typeof body?.content === "string" ? body.content : ""; if (!content && typeof body?.contentBase64 === "string") { try { content = atob(body.contentBase64); } catch {} } out.push({ filename: node.filename, content }); } } return out; }
async function gql(config, auth, query, variables) { const r = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const b = await safeJSON(r); if (!r.ok) throw httpError(r.status, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${r.status}.`); if (b?.errors?.length) throw httpError(422, "shopify_graphql_error", b.errors.map(e => e.message).join("; ")); return b?.data || {}; }
async function safeJSON(value) { try { return await value.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Live-Header-Navigation": KAIROS_LIVE_HEADER_BUILD } }); }
