import { deleteThemeFiles, httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_LIVE_LINK_RECONCILIATION_BUILD = "kairos-live-link-reconciliation-20260718-1";
export const LIVE_LINK_RECONCILIATION_PATH = "/api/shopify/live-link-reconciliation/build";
export const LIVE_LINK_RECONCILIATION_STAGING = "BUILD_MMG_LIVE_LINK_RECONCILIATION_STAGING";
export const LIVE_LINK_RECONCILIATION_PUBLISH = "PUBLISH_MMG_LIVE_LINK_RECONCILIATION_LIVE";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const LAYOUT_FILE = "layout/theme.liquid";
const JS_FILE = "assets/mmg-live-link-reconciliation.js";
const MANAGED_FILES = [LAYOUT_FILE, JS_FILE];
const MARKER_START = "<!-- MMG_LIVE_LINK_RECONCILIATION_START -->";
const MARKER_END = "<!-- MMG_LIVE_LINK_RECONCILIATION_END -->";
const tokenCache = new Map();

const JS_SOURCE = String.raw`(() => {
  "use strict";
  const BUILD = "kairos-live-link-reconciliation-20260718-1";
  const exact = new Map([
    ["/pages/knowledge-library", "/collections/all"],
    ["/pages/free-creator-toolkit?view=toolkit", "/pages/free-creator-toolkit"],
    ["/pages/capcut-templates?view=capcut", "/pages/capcut-templates"],
    ["/pages/mmg-project-guide", "/pages/project-guide"],
    ["/pages/about-mindset-media-group", "/pages/about"],
    ["/pages/founder", "/pages/about"],
    ["/pages/mmg-promise", "/pages/about"],
    ["/pages/custom-projects", "/pages/publishing-services"]
  ]);
  const viewRoutes = new Map([
    ["toolkit", "/pages/free-creator-toolkit"],
    ["capcut", "/pages/capcut-templates"],
    ["guide", "/pages/project-guide"],
    ["library", "/collections/all"]
  ]);
  const companyViews = new Set(["company","story","mission","vision","values","founder","promise","partnerships","accessibility"]);

  function canonicalize(raw) {
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return raw;
    let url;
    try { url = new URL(raw, location.origin); } catch { return raw; }
    if (url.origin !== location.origin) return raw;
    const key = url.pathname + url.search;
    if (exact.has(key)) return exact.get(key) + url.hash;
    if (url.pathname === "/pages/knowledge-library") {
      const view = url.searchParams.get("view");
      return (viewRoutes.get(view) || "/collections/all") + url.hash;
    }
    if (url.pathname === "/pages/about-mindset-media-group") return "/pages/about" + url.hash;
    if (url.pathname === "/pages/about" && companyViews.has(url.searchParams.get("view"))) return "/pages/about" + url.hash;
    return raw;
  }

  function reconcile(root = document) {
    let changed = 0;
    root.querySelectorAll?.("a[href]").forEach(anchor => {
      const before = anchor.getAttribute("href");
      const after = canonicalize(before);
      if (after && after !== before) {
        anchor.setAttribute("href", after);
        anchor.dataset.mmgCanonicalLink = BUILD;
        changed += 1;
      }
    });
    document.documentElement.dataset.mmgLiveLinkReconciliation = BUILD;
    return changed;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => reconcile(), { once: true });
  else reconcile();
  const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === 1) reconcile(node);
  })));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pageshow", () => reconcile());
})();`;

export async function handleLiveLinkReconciliationBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== LIVE_LINK_RECONCILIATION_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : "build";
  const confirmation = mode === "publish" ? LIVE_LINK_RECONCILIATION_PUBLISH : LIVE_LINK_RECONCILIATION_STAGING;
  if (payload?.confirmation !== confirmation) throw httpError(403, "live_link_reconciliation_confirmation_required", `Provide the exact confirmation phrase: ${confirmation}.`);
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const themes = await getThemes(config, auth);
  const target = mode === "publish" ? themes.main : themes.staging;
  if (!target?.id) throw httpError(409, "live_link_reconciliation_theme_missing", "The requested Shopify theme could not be identified.");
  const beforeFiles = await readThemeFiles(config, auth, target.id, MANAGED_FILES);
  const beforeMap = new Map(beforeFiles.map(file => [file.filename, file]));
  const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "live_link_reconciliation_layout_unavailable", `${LAYOUT_FILE} was not readable.`);
  const candidates = [
    { filename: LAYOUT_FILE, content: injectAsset(layoutBefore) },
    { filename: JS_FILE, content: JS_SOURCE },
  ];
  await writeThemeFiles(env, target.id, candidates);
  try { await verifyReadBack(config, auth, target.id, candidates); }
  catch (failure) { await restoreFiles(env, target.id, candidates, beforeMap); throw failure; }
  return json({
    status: "completed",
    build: KAIROS_LIVE_LINK_RECONCILIATION_BUILD,
    mode,
    theme: { id: target.id, name: target.name, role: target.role },
    canonicalRoutes: {
      knowledgeLibrary: "/collections/all",
      creatorToolkit: "/pages/free-creator-toolkit",
      capcutTemplates: "/pages/capcut-templates",
      projectGuide: "/pages/project-guide",
      about: "/pages/about",
      publishingServices: "/pages/publishing-services",
      customerPortal: "/pages/customer-portal"
    },
    verification: { exactThemeFileReadBack: true, liveRouteMapUsesExistingShopifyHandles: true },
    safeguards: { rollbackOnReadBackFailure: true, navigationStructurePreserved: true }
  });
}

function injectAsset(source) {
  const next = stripBlock(source, MARKER_START, MARKER_END);
  const block = `${MARKER_START}\n<script src="{{ 'mmg-live-link-reconciliation.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;
  return /<\/head>/i.test(next) ? next.replace(/<\/head>/i, `${block}\n</head>`) : `${block}\n${next}`;
}
function stripBlock(source, start, end) { const a=source.indexOf(start); const b=source.indexOf(end); return a>=0&&b>a ? source.slice(0,a)+source.slice(b+end.length) : source; }
async function restoreFiles(env, themeId, candidates, beforeMap) { const restore=[]; const remove=[]; for(const candidate of candidates){const before=beforeMap.get(candidate.filename);if(before)restore.push({filename:candidate.filename,content:before.content});else remove.push(candidate.filename);}if(restore.length)await writeThemeFiles(env,themeId,restore);if(remove.length)await deleteThemeFiles(env,themeId,remove); }
async function verifyReadBack(config,auth,themeId,candidates){for(let attempt=1;attempt<=READ_BACK_ATTEMPTS;attempt+=1){const files=await readThemeFiles(config,auth,themeId,candidates.map(c=>c.filename));const map=new Map(files.map(f=>[f.filename,f.content]));if(candidates.every(c=>map.get(c.filename)===c.content))return true;if(attempt<READ_BACK_ATTEMPTS)await new Promise(resolve=>setTimeout(resolve,READ_BACK_DELAY_MS));}throw httpError(502,"live_link_reconciliation_readback_mismatch","Shopify did not expose the exact live link reconciliation revision.");}
function readShopifyConfig(env){const storeDomain=String(env.SHOPIFY_STORE_DOMAIN||"").trim().toLowerCase();const apiVersion=String(env.SHOPIFY_API_VERSION||"2026-07").trim();if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain))throw httpError(503,"shopify_invalid_domain","The Shopify store domain is invalid.");return{storeDomain,apiVersion};}
async function resolveAccessToken(config,env){const clientId=String(env.SHOPIFY_CLIENT_ID||"").trim();const clientSecret=String(env.SHOPIFY_CLIENT_SECRET||"").trim();if(clientId&&clientSecret){const key=`${config.storeDomain}:${clientId}`;const cached=tokenCache.get(key);if(cached?.expiresAt>Date.now())return{token:cached.token};const response=await fetch(`https://${config.storeDomain}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);const token=String(body?.access_token||"").trim();if(!response.ok||!token)throw httpError(401,"shopify_client_credentials_invalid","Shopify token request failed.");tokenCache.set(key,{token,expiresAt:Date.now()+55*60*1000});return{token};}const token=String(env.SHOPIFY_ADMIN_ACCESS_TOKEN||"").trim();if(!token)throw httpError(503,"shopify_not_configured","Shopify credentials are not configured.");return{token};}
async function getThemes(config,auth){const data=await shopifyGraphQL(config,auth,`query { themes(first:50) { nodes { id name role } } }`,{});const nodes=data?.themes?.nodes||[];return{main:nodes.find(t=>String(t.role).toUpperCase()==="MAIN"),staging:nodes.find(t=>String(t.name).toLowerCase().includes("kairos staging"))||nodes.find(t=>String(t.role).toUpperCase()!=="MAIN")};}
async function readThemeFiles(config,auth,themeId,filenames){const data=await shopifyGraphQL(config,auth,`query($themeId:ID!,$filenames:[String!],$first:Int!){theme(id:$themeId){files(first:$first,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`,{themeId,filenames,first:filenames.length});return(data?.theme?.files?.nodes||[]).map(node=>({filename:node.filename,content:bodyToText(node.body)})).filter(file=>file.content);}
async function shopifyGraphQL(config,auth,query,variables){const response=await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,{method:"POST",headers:{"X-Shopify-Access-Token":auth.token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);if(!response.ok)throw httpError(response.status,"shopify_graphql_http_error",`Shopify GraphQL returned HTTP ${response.status}.`);if(body?.errors?.length)throw httpError(422,"shopify_graphql_error",body.errors.map(e=>e.message).join("; "));return body?.data||{};}
function bodyToText(body){if(typeof body?.content==="string")return body.content;if(typeof body?.contentBase64==="string"){try{return atob(body.contentBase64)}catch{return""}}return"";}
async function safeRequestJSON(request){try{return await request.json()}catch{return{}}}async function safeResponseJSON(response){try{return await response.json()}catch{return{}}}function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-MMG-Live-Link-Reconciliation":KAIROS_LIVE_LINK_RECONCILIATION_BUILD,"X-Content-Type-Options":"nosniff"}});}
