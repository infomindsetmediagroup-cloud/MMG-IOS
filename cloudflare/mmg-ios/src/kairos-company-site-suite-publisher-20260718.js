import { deleteThemeFiles, hashText, httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_COMPANY_SITE_SUITE_BUILD = "kairos-company-site-suite-publisher-20260718-1";
export const COMPANY_SITE_SUITE_PATH = "/api/shopify/company-site-suite/build";
export const COMPANY_SITE_SUITE_STAGING = "BUILD_MMG_COMPANY_SITE_SUITE_STAGING";
export const COMPANY_SITE_SUITE_PUBLISH = "PUBLISH_MMG_COMPANY_SITE_SUITE_LIVE";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const LAYOUT_FILE = "layout/theme.liquid";
const CSS_FILE = "assets/mmg-company-site-suite.css";
const JS_FILE = "assets/mmg-company-site-suite.js";
const MANAGED_FILES = [LAYOUT_FILE, CSS_FILE, JS_FILE];
const MARKER_START = "<!-- MMG_COMPANY_SITE_SUITE_START -->";
const MARKER_END = "<!-- MMG_COMPANY_SITE_SUITE_END -->";
const LEGACY_START = "<!-- MMG_COMPANY_LANDING_START -->";
const LEGACY_END = "<!-- MMG_COMPANY_LANDING_END -->";
const tokenCache = new Map();

const VIEWS = {
  company: {
    eyebrow: "Mindset Media Group™",
    title: "Built to open doors.",
    lead: "Mindset Media Group unifies publishing, education, digital products, creator tools, services, and Kairos intelligence into one coherent ecosystem designed to move people from intention to execution.",
    sections: [
      ["Our operating philosophy", "We are not gatekeepers. We are door openers. Knowledge grows when it is shared, opportunity grows when doors are opened, and technology should reduce friction rather than create dependency."],
      ["Trusted stewardship", "MMG organizes complexity, protects user intent, and builds systems people can consistently depend on."],
      ["Visible momentum", "Every experience should make completed work, current progress, and the next meaningful action clear."],
    ],
  },
  story: {
    eyebrow: "Our Story",
    title: "Built from lived experience.",
    lead: "Mindset Media Group was built from resilience, rebuilding, creative work, and the conviction that people deserve practical access to knowledge, tools, and execution support.",
    sections: [
      ["Why MMG exists", "Talent and ambition are often blocked by fragmented tools, unclear information, cost barriers, and systems that expect people to already know the path. MMG exists to reduce that friction."],
      ["What we are building", "A connected operating environment where creators, authors, entrepreneurs, and people rebuilding their lives can develop ideas, produce assets, publish work, and see durable forward progress."],
      ["What remains constant", "The company grows through stewardship rather than gatekeeping: share meaningful knowledge, open practical doors, and help people become more capable over time."],
    ],
  },
  mission: {
    eyebrow: "Mission",
    title: "Turn clarity into forward motion.",
    lead: "Our mission is to reduce friction, expand opportunity, and help people transform ideas, knowledge, and lived experience into useful work, published assets, and sustainable progress.",
    sections: [
      ["Open access", "Make high-value guidance, education, and execution pathways easier to understand and use."],
      ["Unify the work", "Bring scattered tools, plans, content, products, and workflows into one coherent system."],
      ["Strengthen capability", "Help users build confidence and durable skills instead of creating artificial dependency."],
    ],
  },
  vision: {
    eyebrow: "Vision",
    title: "One ecosystem for meaningful creation.",
    lead: "We envision an environment where people can move from an early idea to a finished, published, and supported outcome without losing momentum across disconnected systems.",
    sections: [
      ["A guided experience", "Users should primarily express objectives while the system translates those objectives into clear, governed execution."],
      ["Durable progress", "Success is measured through completed assets, knowledge growth, business advancement, and long-term value creation."],
      ["Responsible intelligence", "Kairos should support sound decisions, preserve human intent, and operate within explicit authority and verification boundaries."],
    ],
  },
  values: {
    eyebrow: "Values",
    title: "The standards behind the system.",
    lead: "MMG’s values govern how products are designed, how services are delivered, and how intelligence is used throughout the ecosystem.",
    sections: [
      ["Stewardship", "Protect trust, user intent, privacy, quality, and the long-term usefulness of the work."],
      ["Accessibility", "Remove avoidable barriers and design for clarity, inclusion, and practical usability."],
      ["Resilience", "Treat setbacks as information, preserve momentum, and continue building with discipline."],
      ["Integrity", "Make claims that are supportable, distinguish verified execution from plans, and correct errors directly."],
      ["Unification", "Favor connected systems and coherent journeys over fragmented tools and isolated transactions."],
      ["Service", "Use knowledge and technology to open doors and strengthen people’s capacity to move forward."],
    ],
  },
  contact: {
    eyebrow: "Contact",
    title: "Start with the right path.",
    lead: "Use the destination that best matches your request so support, publishing, partnership, and customer questions reach the correct workflow.",
    sections: [
      ["Customer support", "For orders, downloads, account access, or fulfillment questions, use the Customer Portal and include the email associated with your purchase."],
      ["Publishing services", "For book development, editing, cover design, production, or publishing support, begin with Publishing Services."],
      ["General inquiries", "For company questions that do not fit another category, contact the MMG team through the storefront contact channel."],
    ],
    actions: [["Customer Portal", "/pages/customer-portal"], ["Publishing Services", "/pages/publishing-services"], ["Store contact", "/pages/contact"]],
  },
  partnerships: {
    eyebrow: "Partnerships",
    title: "Build aligned opportunity.",
    lead: "MMG considers partnerships that expand responsible access, improve creator outcomes, strengthen publishing pathways, or add durable value to the ecosystem.",
    sections: [
      ["Strategic fit", "Partnerships should align with MMG’s stewardship, accessibility, execution, and user-capability principles."],
      ["Potential areas", "Creator education, publishing, responsible technology, distribution, community programs, recovery-oriented initiatives, and platform integrations."],
      ["Evaluation", "Opportunities are evaluated for user benefit, operational feasibility, trust, data handling, commercial clarity, and long-term alignment."],
    ],
    actions: [["Begin a partnership inquiry", "/pages/contact?view=partnerships"]],
  },
  accessibility: {
    eyebrow: "Accessibility",
    title: "Usability is a continuing responsibility.",
    lead: "Mindset Media Group is committed to improving access across navigation, content, purchasing, digital delivery, and customer support.",
    sections: [
      ["Design approach", "We prioritize readable hierarchy, keyboard access, meaningful labels, responsive layouts, clear focus states, and reduced workflow complexity."],
      ["Content approach", "Instructions, eligibility, delivery, policies, and calls to action should be understandable without unnecessary jargon or hidden requirements."],
      ["Continuous improvement", "Accessibility is reviewed as the platform changes. Report a barrier through Contact with the affected page, device, browser, and task."],
    ],
    actions: [["Report an accessibility issue", "/pages/contact?view=accessibility"]],
  },
  founder: {
    eyebrow: "Founder",
    title: "Experience turned into infrastructure.",
    lead: "Mindset Media Group was founded by Michael King to convert hard-earned experience, creative skill, technical discipline, and recovery into systems that help other people build forward.",
    sections: [
      ["The perspective", "The company is shaped by rebuilding, authorship, digital creation, business development, technical problem-solving, and a commitment to leave a durable legacy."],
      ["The responsibility", "MMG is intended to be dependable: honest about what is verified, disciplined about execution, and useful to people who need a clearer route forward."],
      ["The legacy", "The work is ultimately about opening doors, preserving knowledge, and creating something of lasting value for family, customers, creators, and future communities."],
    ],
  },
  promise: {
    eyebrow: "The MMG Promise",
    title: "Clarity before complexity.",
    lead: "MMG will work to make each interaction understandable, each claim supportable, each deliverable visible, and each next step actionable.",
    sections: [
      ["We will not hide the path", "Requirements, constraints, eligibility, delivery, and limitations should be disclosed where decisions are made."],
      ["We will preserve your intent", "Systems and services should organize and execute the user’s objective without quietly replacing it with a different one."],
      ["We will show the work", "Completed changes, evidence, remaining risks, and next actions should be made visible rather than implied."],
    ],
  },
};

const DIRECTORY = [
  ["Our Story", "story"], ["Mission", "mission"], ["Vision", "vision"], ["Values", "values"],
  ["Founder", "founder"], ["The MMG Promise", "promise"], ["Partnerships", "partnerships"], ["Accessibility", "accessibility"],
  ["Our Standards", "/pages/our-standards"], ["Publishing Philosophy", "/pages/publishing-philosophy"], ["Contact", "contact"],
  ["Privacy Policy", "/policies/privacy-policy"], ["Terms of Service", "/policies/terms-of-service"],
  ["Refund Policy", "/policies/refund-policy"], ["Shipping Policy", "/policies/shipping-policy"],
];

const CSS_SOURCE = String.raw`/* MMG company site suite · kairos-company-site-suite-publisher-20260718-1 */
.mmg-suite{--blue:#1268ff;--ink:#0b1220;--muted:#556274;--line:rgba(11,18,32,.12);background:rgb(var(--color-background));color:rgb(var(--color-foreground));padding:clamp(3rem,6vw,7rem) 0 8rem}.mmg-suite__shell{margin:auto;max-width:116rem;padding:0 clamp(1.8rem,4vw,5rem)}.mmg-suite__crumbs{display:flex;flex-wrap:wrap;gap:.7rem;font-size:1.35rem;margin-bottom:3rem}.mmg-suite__crumbs a{color:var(--blue);text-decoration:none}.mmg-suite__hero{display:grid;gap:3rem;grid-template-columns:minmax(0,1.25fr) minmax(28rem,.75fr);margin-bottom:4rem}.mmg-suite__eyebrow{font-size:1.3rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.mmg-suite h1{font-size:clamp(4rem,7vw,7.8rem);letter-spacing:-.05em;line-height:.96;margin:1.5rem 0 2rem;max-width:12ch}.mmg-suite__lead{color:var(--muted);font-size:clamp(1.8rem,2vw,2.25rem);line-height:1.6;margin:0;max-width:72rem}.mmg-suite__aside{background:linear-gradient(145deg,rgba(18,104,255,.12),rgba(18,104,255,.025));border:1px solid rgba(18,104,255,.22);border-radius:2.4rem;padding:2.6rem}.mmg-suite__aside strong{display:block;font-size:2rem;margin-bottom:1rem}.mmg-suite__aside p{font-size:1.55rem;line-height:1.65;margin:0}.mmg-suite__grid{display:grid;gap:1.6rem;grid-template-columns:repeat(3,minmax(0,1fr))}.mmg-suite__card{border:1px solid var(--line);border-radius:1.8rem;padding:2.5rem}.mmg-suite__card h2{font-size:2.25rem;margin:0 0 1rem}.mmg-suite__card p{color:var(--muted);font-size:1.55rem;line-height:1.65;margin:0}.mmg-suite__actions{display:flex;flex-wrap:wrap;gap:1rem;margin-top:3rem}.mmg-suite__button{background:var(--ink);border-radius:999px;color:#fff;display:inline-flex;font-size:1.5rem;font-weight:800;padding:1.25rem 2rem;text-decoration:none}.mmg-suite__directory{border-top:1px solid var(--line);margin-top:5rem;padding-top:4rem}.mmg-suite__directory h2{font-size:clamp(3rem,4vw,4.8rem);margin:0 0 2rem}.mmg-suite__links{display:grid;gap:1rem;grid-template-columns:repeat(3,minmax(0,1fr))}.mmg-suite__link{border:1px solid var(--line);border-radius:1.4rem;color:inherit;font-size:1.5rem;font-weight:700;padding:1.5rem;text-decoration:none}.mmg-suite__link:hover,.mmg-suite__link:focus-visible{border-color:var(--blue);color:var(--blue)}@media(max-width:900px){.mmg-suite__hero{grid-template-columns:1fr}.mmg-suite__grid,.mmg-suite__links{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.mmg-suite__grid,.mmg-suite__links{grid-template-columns:1fr}}
`;

const JS_SOURCE = String.raw`(() => {
  "use strict";
  const BUILD = "kairos-company-site-suite-publisher-20260718-1";
  const VIEWS = ${JSON.stringify(VIEWS)};
  const DIRECTORY = ${JSON.stringify(DIRECTORY)};
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const existing = {"/pages/about-mindset-media-group":"company","/pages/about":"company","/pages/our-story":"story","/pages/mission":"mission","/pages/vision":"vision","/pages/values":"values","/pages/partnerships":"partnerships","/pages/accessibility":"accessibility","/pages/founder":"founder","/pages/mmg-promise":"promise"};
  let view = new URLSearchParams(location.search).get("view") || existing[path];
  if (path === "/pages/contact" && !view) view = "contact";
  if (!view || !VIEWS[view]) return;
  const esc = value => String(value || "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]);
  const hrefFor = target => target.startsWith("/") ? target : "/pages/about-mindset-media-group?view=" + encodeURIComponent(target);
  const data = VIEWS[view];
  const cards = data.sections.map(item => '<article class="mmg-suite__card"><h2>'+esc(item[0])+'</h2><p>'+esc(item[1])+'</p></article>').join("");
  const actions = (data.actions || []).map(item => '<a class="mmg-suite__button" href="'+esc(item[1])+'">'+esc(item[0])+'</a>').join("");
  const directory = DIRECTORY.map(item => '<a class="mmg-suite__link" href="'+esc(hrefFor(item[1]))+'">'+esc(item[0])+'</a>').join("");
  const html = '<section class="mmg-suite" data-mmg-company-suite="'+BUILD+'"><div class="mmg-suite__shell"><nav class="mmg-suite__crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/pages/about-mindset-media-group">Company</a><span>/</span><span>'+esc(data.eyebrow)+'</span></nav><div class="mmg-suite__hero"><div><div class="mmg-suite__eyebrow">'+esc(data.eyebrow)+'</div><h1>'+esc(data.title)+'</h1><p class="mmg-suite__lead">'+esc(data.lead)+'</p><div class="mmg-suite__actions">'+actions+'</div></div><aside class="mmg-suite__aside"><strong>MMG operating standard</strong><p>Every published link must resolve to a useful destination, every destination must state its purpose, and every page must provide a logical next action.</p></aside></div><div class="mmg-suite__grid">'+cards+'</div><section class="mmg-suite__directory"><h2>Explore the company</h2><div class="mmg-suite__links">'+directory+'</div></section></div></section>';
  function install(){ const main=document.querySelector('main#MainContent,main[role="main"],#MainContent'); if(!main)return false; if(main.dataset.mmgCompanySuite===BUILD+":"+view)return true; main.innerHTML=html; main.dataset.mmgCompanySuite=BUILD+":"+view; document.documentElement.dataset.mmgCompanySuite=BUILD; return true; }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install(); let n=0;const timer=setInterval(()=>{n+=1;if(install()||n>=48)clearInterval(timer)},125);
})();`;

export async function handleCompanySiteSuiteBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== COMPANY_SITE_SUITE_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : "build";
  const confirmation = mode === "publish" ? COMPANY_SITE_SUITE_PUBLISH : COMPANY_SITE_SUITE_STAGING;
  if (payload?.confirmation !== confirmation) throw httpError(403, "company_site_suite_confirmation_required", `Provide the exact confirmation phrase: ${confirmation}.`);
  const config = readShopifyConfig(env); const auth = await resolveAccessToken(config, env); const themes = await getThemes(config, auth); const target = mode === "publish" ? themes.main : themes.staging;
  if (!target?.id) throw httpError(409, "company_site_suite_theme_missing", "The requested Shopify theme could not be identified.");
  const beforeFiles = await readThemeFiles(config, auth, target.id, MANAGED_FILES); const beforeMap = new Map(beforeFiles.map(file => [file.filename, file])); const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "company_site_suite_layout_unavailable", `${LAYOUT_FILE} was not readable.`);
  const candidates = [{ filename:LAYOUT_FILE, content:injectAssets(layoutBefore) }, { filename:CSS_FILE, content:CSS_SOURCE }, { filename:JS_FILE, content:JS_SOURCE }];
  await writeThemeFiles(env, target.id, candidates); try { await verifyReadBack(config, auth, target.id, candidates); } catch (failure) { await restoreFiles(env, target.id, candidates, beforeMap); throw failure; }
  return json({ status:"completed", build:KAIROS_COMPANY_SITE_SUITE_BUILD, mode, summary:`Installed the resolving MMG Company supporting-page suite on ${mode === "publish" ? "Shopify MAIN" : "Kairos Staging"}.`, views:Object.keys(VIEWS), theme:summarizeTheme(target), production:mode === "publish" ? { url:`${storefrontOrigin(env)}/pages/about-mindset-media-group`, publishedThemeChanged:true } : null, verification:{ exactThemeFileReadBack:true, unsupportedSlugsReplacedByResolvingViews:true, navigationV8Untouched:true }, safeguards:{ rollbackOnReadBackFailure:true, pageApiRequired:false, fabricated200RoutesPrevented:true } });
}

function injectAssets(source) { let next = stripBlock(source, LEGACY_START, LEGACY_END); next = stripBlock(next, MARKER_START, MARKER_END); const block = `${MARKER_START}\n{{ 'mmg-company-site-suite.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-company-site-suite.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`; return /<\/head>/i.test(next) ? next.replace(/<\/head>/i, `${block}\n</head>`) : `${block}\n${next}`; }
function stripBlock(source,start,end){ const a=source.indexOf(start); const b=source.indexOf(end); return a>=0&&b>a ? source.slice(0,a)+source.slice(b+end.length) : source; }
async function restoreFiles(env, themeId, candidates, beforeMap) { const restore=[]; const remove=[]; for(const candidate of candidates){const before=beforeMap.get(candidate.filename); if(before)restore.push({filename:candidate.filename,content:before.content}); else remove.push(candidate.filename);} if(restore.length)await writeThemeFiles(env,themeId,restore); if(remove.length)await deleteThemeFiles(env,themeId,remove); }
async function verifyReadBack(config,auth,themeId,candidates){ for(let attempt=1;attempt<=READ_BACK_ATTEMPTS;attempt+=1){const files=await readThemeFiles(config,auth,themeId,candidates.map(c=>c.filename));const map=new Map(files.map(f=>[f.filename,f.content]));if(candidates.every(c=>map.get(c.filename)===c.content))return true;if(attempt<READ_BACK_ATTEMPTS)await delay(READ_BACK_DELAY_MS);}throw httpError(502,"company_site_suite_readback_mismatch","Shopify did not expose the exact Company site suite revision."); }
function readShopifyConfig(env){const storeDomain=String(env.SHOPIFY_STORE_DOMAIN||"").trim().toLowerCase();const apiVersion=String(env.SHOPIFY_API_VERSION||"2026-07").trim();if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain))throw httpError(503,"shopify_invalid_domain","The Shopify store domain is invalid.");return{storeDomain,apiVersion};}
async function resolveAccessToken(config,env){const clientId=String(env.SHOPIFY_CLIENT_ID||"").trim();const clientSecret=String(env.SHOPIFY_CLIENT_SECRET||"").trim();if(clientId&&clientSecret){const key=`${config.storeDomain}:${clientId}`;const cached=tokenCache.get(key);if(cached?.expiresAt>Date.now())return{token:cached.token};const response=await fetch(`https://${config.storeDomain}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);const token=String(body?.access_token||"").trim();if(!response.ok||!token)throw httpError(401,"shopify_client_credentials_invalid","Shopify token request failed.");tokenCache.set(key,{token,expiresAt:Date.now()+55*60*1000});return{token};}const token=String(env.SHOPIFY_ADMIN_ACCESS_TOKEN||"").trim();if(!token)throw httpError(503,"shopify_not_configured","Shopify credentials are not configured.");return{token};}
async function getThemes(config,auth){const data=await shopifyGraphQL(config,auth,`query { themes(first:50) { nodes { id name role } } }`,{});const nodes=data?.themes?.nodes||[];return{main:nodes.find(t=>String(t.role).toUpperCase()==="MAIN"),staging:nodes.find(t=>String(t.name).toLowerCase().includes("kairos staging"))||nodes.find(t=>String(t.role).toUpperCase()!=="MAIN")};}
async function readThemeFiles(config,auth,themeId,filenames){const data=await shopifyGraphQL(config,auth,`query($themeId:ID!,$filenames:[String!],$first:Int!){theme(id:$themeId){files(first:$first,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}}}}}`,{themeId,filenames,first:filenames.length});return(data?.theme?.files?.nodes||[]).map(node=>({filename:node.filename,content:bodyToText(node.body)})).filter(file=>file.content);}
async function shopifyGraphQL(config,auth,query,variables){const response=await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,{method:"POST",headers:{"X-Shopify-Access-Token":auth.token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);if(!response.ok)throw httpError(response.status,"shopify_graphql_http_error",`Shopify GraphQL returned HTTP ${response.status}.`);if(body?.errors?.length)throw httpError(422,"shopify_graphql_error",body.errors.map(e=>e.message).join("; "));return body?.data||{};}
function bodyToText(body){if(typeof body?.content==="string")return body.content;if(typeof body?.contentBase64==="string"){try{return atob(body.contentBase64)}catch{return""}}return"";}
function summarizeTheme(theme){return{id:theme.id,name:theme.name,role:theme.role};} function storefrontOrigin(env){return String(env.MMG_STOREFRONT_ORIGIN||"https://themindsetmediagroup.com").replace(/\/+$/,"");} async function safeRequestJSON(request){try{return await request.json()}catch{return{}}} async function safeResponseJSON(response){try{return await response.json()}catch{return{}}} function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));} function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-MMG-Company-Site-Suite":KAIROS_COMPANY_SITE_SUITE_BUILD,"X-Content-Type-Options":"nosniff"}});}
