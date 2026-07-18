import { deleteThemeFiles, hashText, httpError, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_COMPANY_LANDING_BUILD = "kairos-company-landing-publisher-20260718-1";
export const COMPANY_BUILD_PATH = "/api/shopify/company-landing/build";
export const COMPANY_STAGING_CONFIRMATION = "BUILD_MMG_COMPANY_LANDING_STAGING";
export const COMPANY_PUBLISH_CONFIRMATION = "PUBLISH_MMG_COMPANY_LANDING_LIVE";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const LAYOUT_FILE = "layout/theme.liquid";
const CSS_FILE = "assets/mmg-company-landing.css";
const JS_FILE = "assets/mmg-company-landing.js";
const MANAGED_FILES = [LAYOUT_FILE, CSS_FILE, JS_FILE];
const MARKER_START = "<!-- MMG_COMPANY_LANDING_START -->";
const MARKER_END = "<!-- MMG_COMPANY_LANDING_END -->";
const tokenCache = new Map();

const COMPANY_LINKS = [
  { title: "About Mindset Media Group™", url: "/pages/about-mindset-media-group", description: "Our purpose, operating philosophy, and the ecosystem we are building." },
  { title: "Our Story", url: "/pages/our-story", description: "The experience, resilience, and conviction behind Mindset Media Group." },
  { title: "Mission", url: "/pages/mission", description: "How we reduce friction, open doors, and help people move forward." },
  { title: "Vision", url: "/pages/vision", description: "A unified system for turning ideas, knowledge, and ambition into durable progress." },
  { title: "Values", url: "/pages/values", description: "Stewardship, accessibility, resilience, clarity, and responsible execution." },
  { title: "Contact", url: "/pages/contact", description: "Reach the MMG team for support, partnerships, services, and general questions." },
  { title: "Partnerships", url: "/pages/partnerships", description: "Explore aligned collaborations, platform partnerships, and strategic opportunities." },
  { title: "Accessibility", url: "/pages/accessibility", description: "Our commitment to a usable, inclusive, and continuously improving experience." },
  { title: "Privacy Policy", url: "/policies/privacy-policy", description: "How information is collected, used, protected, and managed." },
  { title: "Terms of Service", url: "/policies/terms-of-service", description: "The terms governing use of the MMG storefront and services." },
  { title: "Refund Policy", url: "/policies/refund-policy", description: "Refund eligibility, service-specific conditions, and resolution procedures." },
  { title: "Shipping Policy", url: "/policies/shipping-policy", description: "Shipping, delivery, digital fulfillment, and order expectations." },
];

const CSS_SOURCE = String.raw`/* MMG Company landing · kairos-company-landing-publisher-20260718-1 */
.mmg-company{--mmg-blue:#1268ff;--mmg-ink:#0b1220;--mmg-muted:#526071;--mmg-line:rgba(11,18,32,.12);background:rgb(var(--color-background));color:rgb(var(--color-foreground));padding:clamp(2.5rem,5vw,6rem) 0 7rem}
.mmg-company__shell{margin:0 auto;max-width:124rem;padding:0 clamp(1.8rem,4vw,5rem)}
.mmg-company__eyebrow{align-items:center;display:inline-flex;font-size:1.3rem;font-weight:700;gap:.7rem;letter-spacing:.12em;text-transform:uppercase}.mmg-company__eyebrow:before{background:var(--mmg-blue);border-radius:999px;content:"";height:.8rem;width:.8rem}
.mmg-company__hero{display:grid;gap:2.5rem;grid-template-columns:minmax(0,1.35fr) minmax(28rem,.65fr);padding:3rem 0 5rem}.mmg-company h1{font-size:clamp(4.2rem,7vw,8.4rem);letter-spacing:-.05em;line-height:.95;margin:1.8rem 0 2rem;max-width:10ch}.mmg-company__lead{color:var(--mmg-muted);font-size:clamp(1.8rem,2vw,2.25rem);line-height:1.55;max-width:67rem}
.mmg-company__manifesto{background:linear-gradient(145deg,rgba(18,104,255,.11),rgba(18,104,255,.025));border:1px solid rgba(18,104,255,.22);border-radius:2.4rem;padding:2.6rem}.mmg-company__manifesto strong{display:block;font-size:2rem;margin-bottom:1rem}.mmg-company__manifesto p{font-size:1.6rem;line-height:1.65;margin:0}.mmg-company__quote{font-size:2.35rem;font-weight:700;line-height:1.25;margin:2.4rem 0 0}
.mmg-company__principles{display:grid;gap:1.6rem;grid-template-columns:repeat(3,minmax(0,1fr));margin:0 0 5rem}.mmg-company__principle{border:1px solid var(--mmg-line);border-radius:1.8rem;padding:2.4rem}.mmg-company__principle span{color:var(--mmg-blue);font-size:1.25rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.mmg-company__principle h2{font-size:2.2rem;margin:1rem 0}.mmg-company__principle p{color:var(--mmg-muted);font-size:1.55rem;line-height:1.6;margin:0}
.mmg-company__section-head{align-items:end;display:flex;gap:2rem;justify-content:space-between;margin-bottom:2rem}.mmg-company__section-head h2{font-size:clamp(3rem,4vw,5rem);letter-spacing:-.035em;margin:0}.mmg-company__section-head p{color:var(--mmg-muted);font-size:1.55rem;max-width:48rem}
.mmg-company__grid{display:grid;gap:1.4rem;grid-template-columns:repeat(3,minmax(0,1fr))}.mmg-company__card{border:1px solid var(--mmg-line);border-radius:1.6rem;color:inherit;display:flex;flex-direction:column;min-height:19rem;padding:2.2rem;text-decoration:none;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.mmg-company__card:hover,.mmg-company__card:focus-visible{border-color:rgba(18,104,255,.5);box-shadow:0 1.4rem 3.6rem rgba(11,18,32,.1);transform:translateY(-3px)}.mmg-company__card h3{font-size:2rem;margin:0 0 1rem}.mmg-company__card p{color:var(--mmg-muted);font-size:1.48rem;line-height:1.55;margin:0}.mmg-company__card span{color:var(--mmg-blue);font-size:1.4rem;font-weight:700;margin-top:auto;padding-top:2rem}
.mmg-company__cta{align-items:center;background:var(--mmg-ink);border-radius:2.4rem;color:#fff;display:flex;gap:2rem;justify-content:space-between;margin-top:5rem;padding:clamp(2.5rem,4vw,4.5rem)}.mmg-company__cta h2{font-size:clamp(2.7rem,4vw,4.6rem);letter-spacing:-.03em;margin:0 0 .8rem}.mmg-company__cta p{color:rgba(255,255,255,.72);font-size:1.6rem;margin:0}.mmg-company__button{background:#fff;border-radius:999px;color:var(--mmg-ink);display:inline-flex;font-size:1.55rem;font-weight:800;padding:1.35rem 2.2rem;text-decoration:none;white-space:nowrap}
@media(max-width:989px){.mmg-company__hero{grid-template-columns:1fr}.mmg-company__principles,.mmg-company__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.mmg-company{padding-top:2rem}.mmg-company__principles,.mmg-company__grid{grid-template-columns:1fr}.mmg-company__section-head,.mmg-company__cta{align-items:flex-start;flex-direction:column}.mmg-company__card{min-height:0}}
`;

const JS_SOURCE = String.raw`(() => {
  "use strict";
  const BUILD = "kairos-company-landing-publisher-20260718-1";
  const LINKS = ${JSON.stringify(COMPANY_LINKS)};
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/pages/about-mindset-media-group") return;
  const escapeHTML = value => String(value || "").replace(/[&<>\"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[character]);
  const cards = LINKS.map(item => '<a class="mmg-company__card" href="' + escapeHTML(item.url) + '"><h3>' + escapeHTML(item.title) + '</h3><p>' + escapeHTML(item.description) + '</p><span>Explore →</span></a>').join('');
  const html = '<section class="mmg-company" data-mmg-company-build="' + BUILD + '"><div class="mmg-company__shell"><div class="mmg-company__hero"><div><div class="mmg-company__eyebrow">Mindset Media Group™</div><h1>Built to open doors.</h1><p class="mmg-company__lead">Mindset Media Group brings publishing, education, digital products, creator tools, and Kairos intelligence into one connected ecosystem designed to help people move from intention to execution.</p></div><aside class="mmg-company__manifesto"><strong>Our operating philosophy</strong><p>We are not gatekeepers. We are door openers. Knowledge grows when it is shared, opportunity grows when doors are opened, and technology should reduce friction rather than create dependency.</p><div class="mmg-company__quote">Clarity. Momentum. Durable progress.</div></aside></div><div class="mmg-company__principles"><article class="mmg-company__principle"><span>01 · Stewardship</span><h2>Trusted guidance</h2><p>We organize complexity, protect the user’s intent, and build systems people can consistently depend on.</p></article><article class="mmg-company__principle"><span>02 · Unification</span><h2>One connected ecosystem</h2><p>Ideas, content, products, services, and execution belong in one coherent operating environment.</p></article><article class="mmg-company__principle"><span>03 · Momentum</span><h2>Visible forward motion</h2><p>Every interaction should help users see what was completed, what changed, and what meaningful step comes next.</p></article></div><div class="mmg-company__section-head"><div><div class="mmg-company__eyebrow">Company directory</div><h2>Explore Mindset Media Group</h2></div><p>Company information, policies, support, and partnership destinations are organized here as one authoritative hub.</p></div><div class="mmg-company__grid">' + cards + '</div><div class="mmg-company__cta"><div><h2>Need a direct answer?</h2><p>Contact the MMG team for support, publishing services, partnerships, or general inquiries.</p></div><a class="mmg-company__button" href="/pages/contact">Contact Mindset Media Group</a></div></div></section>';
  function install(){
    const main = document.querySelector('main#MainContent, main[role="main"], #MainContent');
    if (!main) return false;
    if (main.dataset.mmgCompanyLanding === BUILD) return true;
    main.innerHTML = html;
    main.dataset.mmgCompanyLanding = BUILD;
    document.documentElement.dataset.mmgCompanyLanding = BUILD;
    window.dispatchEvent(new CustomEvent('mmg:company:ready', { detail: { build: BUILD } }));
    return true;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true }); else install();
  let attempts = 0; const timer = setInterval(() => { attempts += 1; if (install() || attempts >= 40) clearInterval(timer); }, 125);
})();`;

export async function handleCompanyLandingBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== COMPANY_BUILD_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : "build";
  const confirmation = mode === "publish" ? COMPANY_PUBLISH_CONFIRMATION : COMPANY_STAGING_CONFIRMATION;
  if (payload?.confirmation !== confirmation) throw httpError(403, "company_landing_confirmation_required", `Provide the exact confirmation phrase: ${confirmation}.`);

  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const themes = await getThemes(config, auth);
  const target = mode === "publish" ? themes.main : themes.staging;
  if (!target?.id) throw httpError(409, mode === "publish" ? "main_theme_not_found" : "staging_theme_not_found", `The ${mode === "publish" ? "published" : "Kairos Staging"} theme could not be identified.`);

  const beforeFiles = await readThemeFiles(config, auth, target.id, MANAGED_FILES);
  const beforeMap = new Map(beforeFiles.map(file => [file.filename, file]));
  const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "company_layout_unavailable", `${LAYOUT_FILE} was not readable.`);
  const candidates = [
    { filename: LAYOUT_FILE, content: injectAssets(layoutBefore) },
    { filename: CSS_FILE, content: CSS_SOURCE },
    { filename: JS_FILE, content: JS_SOURCE },
  ];
  await writeThemeFiles(env, target.id, candidates);
  try { await verifyReadBack(config, auth, target.id, candidates); }
  catch (failure) { await restoreFiles(env, target.id, candidates, beforeMap); throw failure; }

  return json({
    status: "completed", build: KAIROS_COMPANY_LANDING_BUILD, mode,
    summary: `Published the MMG Company landing experience to ${mode === "publish" ? "Shopify MAIN" : "Kairos Staging"} through the verified theme-file pipeline.`,
    page: { path: "/pages/about-mindset-media-group", links: COMPANY_LINKS.length },
    theme: summarizeTheme(target),
    preview: mode === "build" ? { url: `${storefrontOrigin(env)}/pages/about-mindset-media-group?preview_theme_id=${themeID(target.id)}` } : null,
    production: mode === "publish" ? { url: `${storefrontOrigin(env)}/pages/about-mindset-media-group`, publishedThemeChanged: true } : null,
    files: await Promise.all(candidates.map(async file => ({ filename:file.filename, afterSha256:await hashText(file.content), changed:beforeMap.get(file.filename)?.content !== file.content }))),
    verification: { exactThemeFileReadBack:true, pathScopedRuntime:true, navigationPipelineUntouched:true },
    safeguards: { rollbackOnReadBackFailure:true, headerFooterPreserved:true, canonicalNavigationPreserved:true, pageMutationRequired:false, workersAIUsed:false },
  });
}

function injectAssets(source) {
  const block = `${MARKER_START}\n{{ 'mmg-company-landing.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-company-landing.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;
  const cleaned = String(source || "").replace(new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`, "g"), "").trimEnd();
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${block}\n</head>`);
  if (/<\/body>/i.test(cleaned)) return cleaned.replace(/<\/body>/i, `${block}\n</body>`);
  throw httpError(409, "company_layout_invalid", `${LAYOUT_FILE} contains neither </head> nor </body>.`);
}

async function getThemes(config, auth) {
  const data = await shopifyGraphQL(config, auth, `query KairosCompanyThemes { themes(first:20) { nodes { id name role processing processingFailed } } }`, {});
  const themes = data?.themes?.nodes || [];
  const main = themes.find(theme => String(theme?.role || "").toUpperCase() === "MAIN") || null;
  const staging = themes.find(theme => String(theme?.role || "").toUpperCase() !== "MAIN" && String(theme?.name || "").trim().toLowerCase() === "kairos staging") || null;
  if (main?.processing || main?.processingFailed || staging?.processing || staging?.processingFailed) throw httpError(409, "company_theme_not_ready", "The target Shopify theme is processing or failed processing.");
  return { main, staging };
}

async function readThemeFiles(config, auth, themeId, filenames) {
  const data = await shopifyGraphQL(config, auth, `query KairosCompanyThemeFiles($themeId:ID!,$filenames:[String!],$first:Int!){theme(id:$themeId){files(first:$first,filenames:$filenames){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64}}} userErrors{code filename}}}}`, { themeId, filenames, first:filenames.length });
  const connection = data?.theme?.files; const errors = (connection?.userErrors || []).filter(error => error?.code && error.code !== "NOT_FOUND");
  if (errors.length) throw httpError(502, "company_theme_read_failed", errors.map(error => error.code).join(", "));
  const files = [];
  for (const filename of filenames) { const node = (connection?.nodes || []).find(item => item?.filename === filename); const content = bodyToText(node?.body); if (content) files.push({ filename, content, sha256:await hashText(content) }); }
  return files;
}

async function verifyReadBack(config, auth, themeId, candidates) {
  for (let attempt=1; attempt<=READ_BACK_ATTEMPTS; attempt+=1) {
    const files = await readThemeFiles(config, auth, themeId, candidates.map(file => file.filename)); const map = new Map(files.map(file => [file.filename,file]));
    let valid = true;
    for (const candidate of candidates) { const actual = map.get(candidate.filename); if (!actual || actual.content !== candidate.content || actual.sha256 !== await hashText(candidate.content)) { valid=false; break; } }
    if (valid) return true; if (attempt<READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }
  throw httpError(502, "company_landing_readback_failed", "Shopify did not preserve the exact Company landing files.");
}

async function restoreFiles(env, themeId, candidates, beforeMap) {
  const restore = candidates.filter(file => beforeMap.has(file.filename)).map(file => ({ filename:file.filename, content:beforeMap.get(file.filename).content }));
  const remove = candidates.filter(file => !beforeMap.has(file.filename)).map(file => file.filename);
  if (restore.length) await writeThemeFiles(env, themeId, restore); if (remove.length) await deleteThemeFiles(env, themeId, remove);
}

function readShopifyConfig(env) { const storeDomain=String(env.SHOPIFY_STORE_DOMAIN||"").trim().toLowerCase(); const apiVersion=String(env.SHOPIFY_API_VERSION||"2026-07").trim(); if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503,"shopify_invalid_domain","The Shopify store domain is invalid."); return {storeDomain,apiVersion}; }
async function resolveAccessToken(config,env){const clientId=String(env.SHOPIFY_CLIENT_ID||"").trim(),clientSecret=String(env.SHOPIFY_CLIENT_SECRET||"").trim();if(clientId&&clientSecret){const key=`${config.storeDomain}:${clientId}`,cached=tokenCache.get(key);if(cached?.expiresAt>Date.now())return{token:cached.token};const response=await fetch(`https://${config.storeDomain}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response),token=typeof body?.access_token==="string"?body.access_token.trim():"";if(!response.ok||!token)throw httpError(401,"shopify_client_credentials_invalid",body?.error_description||body?.error||`Shopify token request returned HTTP ${response.status}.`);tokenCache.set(key,{token,expiresAt:Date.now()+55*60*1000});return{token};}const token=String(env.SHOPIFY_ADMIN_ACCESS_TOKEN||"").trim();if(!token)throw httpError(503,"shopify_not_configured","Shopify credentials are not configured.");return{token};}
async function shopifyGraphQL(config,auth,query,variables){const response=await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,{method:"POST",headers:{"X-Shopify-Access-Token":auth.token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(SHOPIFY_TIMEOUT_MS)});const body=await safeResponseJSON(response);if(!response.ok)throw httpError(response.status,"shopify_graphql_http_error",body?.errors?.[0]?.message||`Shopify GraphQL returned HTTP ${response.status}.`);if(body?.errors?.length)throw httpError(422,"shopify_graphql_error",body.errors.map(item=>item?.message).filter(Boolean).join("; "));return body?.data||{};}
function summarizeTheme(theme){return{id:theme.id,name:theme.name,role:theme.role};} function bodyToText(body){if(typeof body?.content==="string")return body.content;if(typeof body?.contentBase64==="string"){try{return atob(body.contentBase64);}catch{}}return"";} function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");} function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));} function themeID(gid){return String(gid||"").split("/").pop();} function storefrontOrigin(env){return String(env.SHOPIFY_STOREFRONT_ORIGIN||env.MMG_STOREFRONT_ORIGIN||"https://themindsetmediagroup.com").replace(/\/+$/,"");} async function safeRequestJSON(request){try{return await request.json();}catch{return{};}} async function safeResponseJSON(response){try{return await response.json();}catch{return{};}} function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-MMG-Company-Landing":KAIROS_COMPANY_LANDING_BUILD,"X-Content-Type-Options":"nosniff"}});}
