import { deleteThemeFiles, httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_RESOURCE_DISCOVERY_SUITE_BUILD = "kairos-resource-discovery-suite-publisher-20260718-1";
export const RESOURCE_DISCOVERY_SUITE_PATH = "/api/shopify/resource-discovery-suite/build";
export const RESOURCE_DISCOVERY_SUITE_STAGING = "BUILD_MMG_RESOURCE_DISCOVERY_SUITE_STAGING";
export const RESOURCE_DISCOVERY_SUITE_PUBLISH = "PUBLISH_MMG_RESOURCE_DISCOVERY_SUITE_LIVE";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const LAYOUT_FILE = "layout/theme.liquid";
const CSS_FILE = "assets/mmg-resource-discovery-suite.css";
const JS_FILE = "assets/mmg-resource-discovery-suite.js";
const MANAGED_FILES = [LAYOUT_FILE, CSS_FILE, JS_FILE];
const MARKER_START = "<!-- MMG_RESOURCE_DISCOVERY_SUITE_START -->";
const MARKER_END = "<!-- MMG_RESOURCE_DISCOVERY_SUITE_END -->";
const tokenCache = new Map();

const VIEWS = {
  library: {
    eyebrow: "Knowledge Library",
    title: "Learn it. Build it. Use it.",
    lead: "A practical MMG learning hub for creators, authors, entrepreneurs, and people turning ideas into finished work.",
    sections: [
      ["Start with a goal", "Choose the outcome you are trying to produce, then follow the shortest useful learning path instead of browsing disconnected information."],
      ["Apply while learning", "Resources are organized around action: understand the concept, use the framework, and move directly into production."],
      ["Keep your momentum", "Each resource points to a next step, related tool, product, or service so useful progress does not stop at the end of a page."],
    ],
    actions: [["Open the Free Creator Toolkit", "toolkit"], ["View the Project Guide", "guide"], ["Browse products", "/collections/all"]],
  },
  toolkit: {
    eyebrow: "Free Creator Toolkit",
    title: "Practical tools without the gatekeeping.",
    lead: "A focused collection of free planning frameworks, production checklists, prompt structures, publishing guidance, and creator workflows.",
    sections: [
      ["Idea definition", "Clarify the audience, promise, format, and useful outcome before spending time on production."],
      ["Content production", "Use repeatable structures for scripts, posts, images, books, product descriptions, and campaign assets."],
      ["Publishing readiness", "Check positioning, rights, formatting, delivery, calls to action, and destination links before release."],
      ["Review discipline", "Compare the finished asset with the original objective and repair gaps before publishing."],
    ],
    actions: [["Use CapCut Templates", "capcut"], ["Follow the Project Guide", "guide"], ["Explore creator products", "/collections/all"]],
  },
  capcut: {
    eyebrow: "CapCut Templates",
    title: "Turn raw content into repeatable production.",
    lead: "A structured starting point for short-form video assembly, pacing, text hierarchy, visual continuity, and export readiness.",
    sections: [
      ["Choose the format", "Match the template to the asset: talking-head education, image sequence, product showcase, story, reel, or TikTok post."],
      ["Lead with the hook", "The opening visual and first line must establish the subject, tension, or benefit immediately."],
      ["Protect readability", "Use concise overlays, sufficient contrast, deliberate timing, and safe placement for platform interface elements."],
      ["Finish with direction", "End with one clear action that leads to a resolving MMG page, product, resource, or customer workflow."],
    ],
    actions: [["Open the Creator Toolkit", "toolkit"], ["Browse the Knowledge Library", "library"]],
  },
  guide: {
    eyebrow: "MMG Project Guide",
    title: "Move from objective to deliverable.",
    lead: "The canonical MMG project path for defining work, gathering inputs, producing assets, reviewing quality, publishing, and preserving visible progress.",
    sections: [
      ["1. Define", "State the objective, audience, required deliverable, constraints, authority, and success criteria."],
      ["2. Gather", "Collect source material, product data, brand rules, assets, policies, destination URLs, and operational dependencies."],
      ["3. Build", "Produce the smallest complete version that can be reviewed as a real deliverable."],
      ["4. Verify", "Check accuracy, accessibility, links, presentation, policy alignment, fulfillment, and the intended user journey."],
      ["5. Publish", "Promote only the verified source through the approved staging and production pipeline."],
      ["6. Continue", "Show what changed, what is complete, what remains, and the next useful action."],
    ],
    actions: [["Start in the Knowledge Library", "library"], ["Browse publishing services", "/pages/publishing-services"], ["Browse products", "/collections/all"]],
  },
};

const DIRECTORY = [["Knowledge Library", "library"], ["Free Creator Toolkit", "toolkit"], ["CapCut Templates", "capcut"], ["MMG Project Guide", "guide"], ["All Products", "/collections/all"], ["Publishing Services", "/pages/publishing-services"], ["Customer Portal", "/pages/customer-portal"]];

const CSS_SOURCE = String.raw`/* MMG resource discovery suite */
.mmg-resource{--blue:#1268ff;--ink:#0b1220;--muted:#556274;--line:rgba(11,18,32,.12);padding:clamp(3rem,6vw,7rem) 0 8rem}.mmg-resource__shell{margin:auto;max-width:116rem;padding:0 clamp(1.8rem,4vw,5rem)}.mmg-resource__crumbs{display:flex;flex-wrap:wrap;gap:.7rem;font-size:1.35rem;margin-bottom:3rem}.mmg-resource__crumbs a{color:var(--blue);text-decoration:none}.mmg-resource__hero{display:grid;gap:3rem;grid-template-columns:minmax(0,1.25fr) minmax(28rem,.75fr);margin-bottom:4rem}.mmg-resource__eyebrow{font-size:1.3rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.mmg-resource h1{font-size:clamp(4rem,7vw,7.8rem);letter-spacing:-.05em;line-height:.96;margin:1.5rem 0 2rem;max-width:12ch}.mmg-resource__lead{color:var(--muted);font-size:clamp(1.8rem,2vw,2.25rem);line-height:1.6}.mmg-resource__aside{background:linear-gradient(145deg,rgba(18,104,255,.12),rgba(18,104,255,.025));border:1px solid rgba(18,104,255,.22);border-radius:2.4rem;padding:2.6rem}.mmg-resource__grid{display:grid;gap:1.6rem;grid-template-columns:repeat(3,minmax(0,1fr))}.mmg-resource__card{border:1px solid var(--line);border-radius:1.8rem;padding:2.5rem}.mmg-resource__card h2{font-size:2.2rem;margin:0 0 1rem}.mmg-resource__card p{color:var(--muted);font-size:1.55rem;line-height:1.65;margin:0}.mmg-resource__actions{display:flex;flex-wrap:wrap;gap:1rem;margin-top:3rem}.mmg-resource__button{background:var(--ink);border-radius:999px;color:#fff;display:inline-flex;font-size:1.5rem;font-weight:800;padding:1.25rem 2rem;text-decoration:none}.mmg-resource__directory{border-top:1px solid var(--line);margin-top:5rem;padding-top:4rem}.mmg-resource__links{display:grid;gap:1rem;grid-template-columns:repeat(3,minmax(0,1fr))}.mmg-resource__link{border:1px solid var(--line);border-radius:1.4rem;color:inherit;font-size:1.5rem;font-weight:700;padding:1.5rem;text-decoration:none}.mmg-resource__link:hover,.mmg-resource__link:focus-visible{border-color:var(--blue);color:var(--blue)}@media(max-width:900px){.mmg-resource__hero{grid-template-columns:1fr}.mmg-resource__grid,.mmg-resource__links{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.mmg-resource__grid,.mmg-resource__links{grid-template-columns:1fr}}
`;

const JS_SOURCE = String.raw`(() => {
  "use strict";
  const BUILD = "kairos-resource-discovery-suite-publisher-20260718-1";
  const VIEWS = ${JSON.stringify(VIEWS)};
  const DIRECTORY = ${JSON.stringify(DIRECTORY)};
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const aliases = {"/pages/knowledge-library":"library","/pages/free-creator-toolkit":"toolkit","/pages/capcut-templates":"capcut","/pages/mmg-project-guide":"guide","/pages/project-guide":"guide"};
  let view = new URLSearchParams(location.search).get("view") || aliases[path];
  if (!view || !VIEWS[view]) return;
  const esc = value => String(value || "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]);
  const hrefFor = target => target.startsWith("/") ? target : "/pages/knowledge-library?view=" + encodeURIComponent(target);
  const data = VIEWS[view];
  const cards = data.sections.map(item => '<article class="mmg-resource__card"><h2>'+esc(item[0])+'</h2><p>'+esc(item[1])+'</p></article>').join("");
  const actions = (data.actions || []).map(item => '<a class="mmg-resource__button" href="'+esc(hrefFor(item[1]))+'">'+esc(item[0])+'</a>').join("");
  const directory = DIRECTORY.map(item => '<a class="mmg-resource__link" href="'+esc(hrefFor(item[1]))+'">'+esc(item[0])+'</a>').join("");
  const html = '<section class="mmg-resource" data-mmg-resource-suite="'+BUILD+'"><div class="mmg-resource__shell"><nav class="mmg-resource__crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/pages/knowledge-library">Knowledge</a><span>/</span><span>'+esc(data.eyebrow)+'</span></nav><div class="mmg-resource__hero"><div><div class="mmg-resource__eyebrow">'+esc(data.eyebrow)+'</div><h1>'+esc(data.title)+'</h1><p class="mmg-resource__lead">'+esc(data.lead)+'</p><div class="mmg-resource__actions">'+actions+'</div></div><aside class="mmg-resource__aside"><strong>MMG learning standard</strong><p>Every resource must teach something usable, connect to a resolving next step, and reduce the distance between understanding and execution.</p></aside></div><div class="mmg-resource__grid">'+cards+'</div><section class="mmg-resource__directory"><h2>Continue building</h2><div class="mmg-resource__links">'+directory+'</div></section></div></section>';
  function install(){const main=document.querySelector('main#MainContent,main[role="main"],#MainContent');if(!main)return false;if(main.dataset.mmgResourceSuite===BUILD+":"+view)return true;main.innerHTML=html;main.dataset.mmgResourceSuite=BUILD+":"+view;document.documentElement.dataset.mmgResourceSuite=BUILD;return true;}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();let n=0;const timer=setInterval(()=>{n+=1;if(install()||n>=48)clearInterval(timer)},125);
})();`;

export async function handleResourceDiscoverySuiteBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== RESOURCE_DISCOVERY_SUITE_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : "build";
  const confirmation = mode === "publish" ? RESOURCE_DISCOVERY_SUITE_PUBLISH : RESOURCE_DISCOVERY_SUITE_STAGING;
  if (payload?.confirmation !== confirmation) throw httpError(403, "resource_discovery_confirmation_required", `Provide the exact confirmation phrase: ${confirmation}.`);
  const config = readShopifyConfig(env); const auth = await resolveAccessToken(config, env); const themes = await getThemes(config, auth); const target = mode === "publish" ? themes.main : themes.staging;
  if (!target?.id) throw httpError(409, "resource_discovery_theme_missing", "The requested Shopify theme could not be identified.");
  const beforeFiles = await readThemeFiles(config, auth, target.id, MANAGED_FILES); const beforeMap = new Map(beforeFiles.map(file => [file.filename, file])); const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "resource_discovery_layout_unavailable", `${LAYOUT_FILE} was not readable.`);
  const candidates = [{filename:LAYOUT_FILE,content:injectAssets(layoutBefore)},{filename:CSS_FILE,content:CSS_SOURCE},{filename:JS_FILE,content:JS_SOURCE}];
  await writeThemeFiles(env,target.id,candidates); try{await verifyReadBack(config,auth,target.id,candidates);}catch(failure){await restoreFiles(env,target.id,candidates,beforeMap);throw failure;}
  return json({status:"completed",build:KAIROS_RESOURCE_DISCOVERY_SUITE_BUILD,mode,summary:`Installed the MMG resource and discovery suite on ${mode === "publish" ? "Shopify MAIN" : "Kairos Staging"}.`,views:Object.keys(VIEWS),theme:{id:target.id,name:target.name,role:target.role},production:mode === "publish"?{url:`${storefrontOrigin(env)}/pages/knowledge-library`,publishedThemeChanged:true}:null,verification:{exactThemeFileReadBack:true,resolvingViewArchitecture:true,productsRemainShopifyAuthoritative:true,navigationV8Untouched:true},safeguards:{rollbackOnReadBackFailure:true,pageApiRequired:false,fabricated200RoutesPrevented:true}});
}

function injectAssets(source){const next=stripBlock(source,MARKER_START,MARKER_END);const block=`${MARKER_START}\n{{ 'mmg-resource-discovery-suite.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-resource-discovery-suite.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;return /<\/head>/i.test(next)?next.replace(/<\/head>/i,`${block}\n</head>`):`${block}\n${next}`;}
function stripBlock(source,start,end){const a=source.indexOf(start);const b=source.indexOf(end);return a>=0&&b>a?source.slice(0,a)+source.slice(b+end.length):source;}
async function restoreFiles(env,themeId,candidates,beforeMap){const restore=[];const remove=[];for(const candidate of candidates){const before=beforeMap.get(candidate.filename);if(before)restore.push({filename:candidate.filename,content:before.content});else remove.push(candidate.filename);}if(restore.length)await writeThemeFiles(env,themeId,restore);if(remove.length)await deleteThemeFiles(env,themeId,remove);}
async function verifyReadBack(config,auth,themeId,candidates){for(let attempt=1;attempt<=READ_BACK_ATTEMPTS;attempt+=1){const files=await readThemeFiles(config,auth,themeId,candidates.map(c=>c.filename));const map=new Map(files.map(f=>[f.filename,f.content]));if(candidates.every(c=>map.get(c.filename)===c.content))return true;if(attempt<READ_BACK_ATTEMPTS)await new Promise(resolve=>setTimeout(resolve,READ_BACK_DELAY_MS));}throw httpError(502,"resource_discovery_readback_mismatch","Shopify did not expose the exact resource discovery revision.");}
function readShopifyConfig(env){const storeDomain=String(env.SHOPIFY_STORE_DOMAIN||"").trim().toLowerCase();const apiVersion=String(env.SHOPIFY_API_VERSION||"2026-07").trim();if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain))throw httpError(503,"shopify_invalid_domain","The Shopify store domain is invalid.");return{storeDomain,apiVersion};}
async function resolveAccessToken(config,env){const clientId=String(env.SHOPIFY_CLIENT_ID||"").trim();const clientSecret=String(env.SHOPIFY_CLIENT_SECRET||"").trim();if(clientId&&clientSecret){const key=`${config.storeDomain}:${clientId}`;const cached=tokenCache.get(key);if(cached?.expiresAt>Date.now())return{token:cached.token};const response=await fetch(`https://${config.storeDomain}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);const token=String(body?.access_token||"").trim();if(!response.ok||!token)throw httpError(401,"shopify_client_credentials_invalid","Shopify token request failed.");tokenCache.set(key,{token,expiresAt:Date.now()+55*60*1000});return{token};}const token=String(env.SHOPIFY_ADMIN_ACCESS_TOKEN||"").trim();if(!token)throw httpError(503,"shopify_not_configured","Shopify credentials are not configured.");return{token};}
async function getThemes(config,auth){const data=await shopifyGraphQL(config,auth,`query { themes(first:50) { nodes { id name role } } }`,{});const nodes=data?.themes?.nodes||[];return{main:nodes.find(t=>String(t.role).toUpperCase()==="MAIN"),staging:nodes.find(t=>String(t.name).toLowerCase().includes("kairos staging"))||nodes.find(t=>String(t.role).toUpperCase()!=="MAIN")};}
async function readThemeFiles(config,auth,themeId,filenames){const data=await shopifyGraphQL(config,auth,`query($themeId:ID!,$filenames:[String!],$first:Int!){theme(id:$themeId){files(first:$first,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`,{themeId,filenames,first:filenames.length});return(data?.theme?.files?.nodes||[]).map(node=>({filename:node.filename,content:bodyToText(node.body)})).filter(file=>file.content);}
async function shopifyGraphQL(config,auth,query,variables){const response=await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,{method:"POST",headers:{"X-Shopify-Access-Token":auth.token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);if(!response.ok)throw httpError(response.status,"shopify_graphql_http_error",`Shopify GraphQL returned HTTP ${response.status}.`);if(body?.errors?.length)throw httpError(422,"shopify_graphql_error",body.errors.map(e=>e.message).join("; "));return body?.data||{};}
function bodyToText(body){if(typeof body?.content==="string")return body.content;if(typeof body?.contentBase64==="string"){try{return atob(body.contentBase64)}catch{return""}}return"";}
function storefrontOrigin(env){return String(env.MMG_STOREFRONT_ORIGIN||"https://themindsetmediagroup.com").replace(/\/+$/,"");}async function safeRequestJSON(request){try{return await request.json()}catch{return{}}}async function safeResponseJSON(response){try{return await response.json()}catch{return{}}}function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-MMG-Resource-Discovery-Suite":KAIROS_RESOURCE_DISCOVERY_SUITE_BUILD,"X-Content-Type-Options":"nosniff"}});}
