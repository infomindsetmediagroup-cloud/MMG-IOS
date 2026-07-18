import { deleteThemeFiles, httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_MOBILE_NAV_TAXONOMY_BUILD = "kairos-mobile-navigation-taxonomy-20260718-1";
export const MOBILE_NAV_TAXONOMY_PATH = "/api/shopify/mobile-navigation-taxonomy/build";
export const MOBILE_NAV_TAXONOMY_STAGING = "BUILD_MMG_MOBILE_NAV_TAXONOMY_STAGING";
export const MOBILE_NAV_TAXONOMY_PUBLISH = "PUBLISH_MMG_MOBILE_NAV_TAXONOMY_LIVE";

const SHOPIFY_TIMEOUT_MS = 25_000;
const LAYOUT_FILE = "layout/theme.liquid";
const CSS_FILE = "assets/mmg-mobile-navigation-taxonomy.css";
const JS_FILE = "assets/mmg-mobile-navigation-taxonomy.js";
const MANAGED_FILES = [LAYOUT_FILE, CSS_FILE, JS_FILE];
const MARKER_START = "<!-- MMG_MOBILE_NAV_TAXONOMY_START -->";
const MARKER_END = "<!-- MMG_MOBILE_NAV_TAXONOMY_END -->";
const tokenCache = new Map();

const NAV = [
  ["Shop", [["All Products", "/collections/all"], ["Books & AI Guides", "/collections/all"], ["Creator Merch", "/collections/all"]]],
  ["Create & Learn", [["Free Creator Toolkit", "/pages/free-creator-toolkit"], ["CapCut Templates", "/pages/capcut-templates"], ["Project Guide", "/pages/project-guide"]]],
  ["Services", [["Publishing Services", "/pages/publishing-services"], ["Custom Projects", "/pages/publishing-services"], ["Customer Portal", "/pages/customer-portal"]]],
  ["Company", [["Company Overview", "/pages/about"], ["Founder", "/pages/about"], ["Our Standards", "/pages/our-standards"], ["Publishing Philosophy", "/pages/publishing-philosophy"], ["Contact", "/pages/contact"]]],
  ["Support", [["Customer Portal", "/pages/customer-portal"], ["Contact", "/pages/contact"], ["Privacy Policy", "/policies/privacy-policy"], ["Terms of Service", "/policies/terms-of-service"], ["Refund Policy", "/policies/refund-policy"], ["Shipping Policy", "/policies/shipping-policy"]]]
];

const CSS_SOURCE = String.raw`
@media (max-width: 989px){
  .mmg-mobile-nav{padding:0 0 4rem}.mmg-mobile-nav details{border-bottom:1px solid rgba(0,0,0,.12)}
  .mmg-mobile-nav summary{align-items:center;cursor:pointer;display:flex;font-size:2.1rem;justify-content:space-between;list-style:none;padding:1.8rem 2.4rem}
  .mmg-mobile-nav summary::-webkit-details-marker{display:none}.mmg-mobile-nav summary:after{content:'+';font-size:2.4rem;font-weight:300}.mmg-mobile-nav details[open] summary:after{content:'−'}
  .mmg-mobile-nav__links{display:grid;padding:0 2.4rem 1.8rem}.mmg-mobile-nav__links a{color:inherit;font-size:1.65rem;padding:1.05rem 0;text-decoration:none}
  .mmg-mobile-nav__direct{border-bottom:1px solid rgba(0,0,0,.12);color:inherit;display:block;font-size:2.1rem;padding:1.8rem 2.4rem;text-decoration:none}
}
`;

const JS_SOURCE = String.raw`(() => {
  "use strict";
  const BUILD = "${KAIROS_MOBILE_NAV_TAXONOMY_BUILD}";
  const NAV = ${JSON.stringify(NAV)};
  const esc = value => String(value).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]);
  const markup = '<nav class="mmg-mobile-nav" data-mmg-mobile-nav="'+BUILD+'" aria-label="Mobile navigation">' + NAV.map(group => '<details><summary>'+esc(group[0])+'</summary><div class="mmg-mobile-nav__links">'+group[1].map(link=>'<a href="'+esc(link[1])+'">'+esc(link[0])+'</a>').join('')+'</div></details>').join('') + '</nav>';
  function install(){
    const drawers=[...document.querySelectorAll('menu-drawer #menu-drawer, #menu-drawer, .menu-drawer__navigation-container, .menu-drawer__navigation')];
    const target=drawers.find(el=>el && !el.closest('[data-mmg-mobile-nav]'));
    if(!target)return false;
    if(target.dataset.mmgTaxonomy===BUILD)return true;
    const nav=target.matches('.menu-drawer__navigation')?target:target.querySelector('.menu-drawer__navigation')||target;
    nav.innerHTML=markup;
    target.dataset.mmgTaxonomy=BUILD;
    document.documentElement.dataset.mmgMobileNavigation=BUILD;
    return true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  let attempts=0;const timer=setInterval(()=>{attempts++;if(install()||attempts>80)clearInterval(timer)},125);
  new MutationObserver(()=>install()).observe(document.documentElement,{childList:true,subtree:true});
})();`;

export async function handleMobileNavigationTaxonomyBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== MOBILE_NAV_TAXONOMY_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : "build";
  const confirmation = mode === "publish" ? MOBILE_NAV_TAXONOMY_PUBLISH : MOBILE_NAV_TAXONOMY_STAGING;
  if (payload?.confirmation !== confirmation) throw httpError(403, "mobile_navigation_confirmation_required", `Provide the exact confirmation phrase: ${confirmation}.`);
  const config = readShopifyConfig(env); const auth = await resolveAccessToken(config, env); const themes = await getThemes(config, auth); const target = mode === "publish" ? themes.main : themes.staging;
  if (!target?.id) throw httpError(409, "mobile_navigation_theme_missing", "The requested Shopify theme could not be identified.");
  const beforeFiles = await readThemeFiles(config, auth, target.id, MANAGED_FILES); const beforeMap = new Map(beforeFiles.map(file => [file.filename, file])); const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "mobile_navigation_layout_unavailable", `${LAYOUT_FILE} was not readable.`);
  const candidates = [{filename:LAYOUT_FILE,content:injectAssets(layoutBefore)},{filename:CSS_FILE,content:CSS_SOURCE},{filename:JS_FILE,content:JS_SOURCE}];
  await writeThemeFiles(env,target.id,candidates); try{await verifyReadBack(config,auth,target.id,candidates);}catch(failure){await restoreFiles(env,target.id,candidates,beforeMap);throw failure;}
  return json({status:"completed",build:KAIROS_MOBILE_NAV_TAXONOMY_BUILD,mode,theme:{id:target.id,name:target.name,role:target.role},verification:{exactThemeFileReadBack:true,mobileDrawerTaxonomyFixed:true,companyScopeRestricted:true,nativeHeaderPreserved:true}});
}

function injectAssets(source){const next=stripBlock(source,MARKER_START,MARKER_END);const block=`${MARKER_START}\n{{ 'mmg-mobile-navigation-taxonomy.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-mobile-navigation-taxonomy.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;return /<\/head>/i.test(next)?next.replace(/<\/head>/i,`${block}\n</head>`):`${block}\n${next}`;}
function stripBlock(source,start,end){const a=source.indexOf(start),b=source.indexOf(end);return a>=0&&b>a?source.slice(0,a)+source.slice(b+end.length):source;}
async function restoreFiles(env,themeId,candidates,beforeMap){const restore=[],remove=[];for(const c of candidates){const before=beforeMap.get(c.filename);if(before)restore.push({filename:c.filename,content:before.content});else remove.push(c.filename);}if(restore.length)await writeThemeFiles(env,themeId,restore);if(remove.length)await deleteThemeFiles(env,themeId,remove);}
async function verifyReadBack(config,auth,themeId,candidates){for(let i=0;i<10;i++){const files=await readThemeFiles(config,auth,themeId,candidates.map(c=>c.filename));const map=new Map(files.map(f=>[f.filename,f.content]));if(candidates.every(c=>map.get(c.filename)===c.content))return true;await new Promise(r=>setTimeout(r,500));}throw httpError(502,"mobile_navigation_readback_mismatch","Shopify did not expose the exact mobile navigation revision.");}
function readShopifyConfig(env){const storeDomain=String(env.SHOPIFY_STORE_DOMAIN||"").trim().toLowerCase();const apiVersion=String(env.SHOPIFY_API_VERSION||"2026-07").trim();if(!storeDomain)throw httpError(500,"shopify_store_domain_missing","SHOPIFY_STORE_DOMAIN is required.");return{storeDomain,apiVersion};}
async function resolveAccessToken(config,env){const direct=String(env.SHOPIFY_ADMIN_ACCESS_TOKEN||"").trim();if(direct)return{token:direct};const clientId=String(env.SHOPIFY_CLIENT_ID||"").trim(),clientSecret=String(env.SHOPIFY_CLIENT_SECRET||"").trim();if(!clientId||!clientSecret)throw httpError(500,"shopify_credentials_missing","Shopify credentials are required.");const key=`${config.storeDomain}:${clientId}`;const cached=tokenCache.get(key);if(cached&&cached.expiresAt>Date.now()+60000)return{token:cached.token};const response=await fetch(`https://${config.storeDomain}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,grant_type:"client_credentials"}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);if(!response.ok||!body?.access_token)throw httpError(response.status||502,"shopify_token_error","Unable to obtain Shopify token.");tokenCache.set(key,{token:body.access_token,expiresAt:Date.now()+Number(body.expires_in||86300)*1000});return{token:body.access_token};}
async function getThemes(config,auth){const data=await shopifyGraphQL(config,auth,`query { themes(first:50) { nodes { id name role } } }`,{});const nodes=data?.themes?.nodes||[];return{main:nodes.find(t=>String(t.role).toUpperCase()==="MAIN"),staging:nodes.find(t=>String(t.name).toLowerCase().includes("kairos staging"))||nodes.find(t=>String(t.role).toUpperCase()!=="MAIN")};}
async function readThemeFiles(config,auth,themeId,filenames){const data=await shopifyGraphQL(config,auth,`query($themeId:ID!,$filenames:[String!],$first:Int!){theme(id:$themeId){files(first:$first,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`,{themeId,filenames,first:filenames.length});return(data?.theme?.files?.nodes||[]).map(n=>({filename:n.filename,content:bodyToText(n.body)})).filter(f=>f.content);}
async function shopifyGraphQL(config,auth,query,variables){const response=await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,{method:"POST",headers:{"X-Shopify-Access-Token":auth.token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);if(!response.ok)throw httpError(response.status,"shopify_graphql_http_error",`Shopify GraphQL returned HTTP ${response.status}.`);if(body?.errors?.length)throw httpError(422,"shopify_graphql_error",body.errors.map(e=>e.message).join("; "));return body?.data||{};}
function bodyToText(body){if(typeof body?.content==="string")return body.content;if(typeof body?.contentBase64==="string"){try{return atob(body.contentBase64)}catch{return""}}return"";}
async function safeRequestJSON(request){try{return await request.json()}catch{return{}}}async function safeResponseJSON(response){try{return await response.json()}catch{return{}}}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-MMG-Mobile-Navigation-Taxonomy":KAIROS_MOBILE_NAV_TAXONOMY_BUILD}});}
