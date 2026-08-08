export const KAIROS_LIVE_HELP_BUILD = "kairos-live-help-20260807-1";
export const KAIROS_LIVE_HELP_PREFIX = "/api/live-help";
export const KAIROS_LIVE_HELP_PUBLISH_CONFIRMATION = "PUBLISH_KAIROS_LIVE_HELP_V1";

const DEFAULT_SITE_ORIGIN = "https://themindsetmediagroup.com";
const DEFAULT_WORKER_ORIGIN = "https://mmg-ios.info-mindsetmediagroup.workers.dev";
const CUSTOMER_SERVICE_PATH = "/pages/customer-service";
const CUSTOMER_PORTAL_PATH = "/pages/customer-portal";
const CONTACT_EMAIL = "info.mindsetmediagroup@gmail.com";
const MAX_MESSAGE_CHARS = 800;
const MAX_BODY_BYTES = 4096;
const SHOPIFY_TIMEOUT_MS = 20_000;
const EVENT_NAMES = new Set([
  "widget_open",
  "widget_close",
  "proactive_prompt_shown",
  "proactive_prompt_dismissed",
  "question_submitted",
  "answer_rendered",
  "escalation_offered",
  "suggested_action_clicked",
]);

const PRIVATE_PATTERNS = [
  /\border\b/i,
  /\bmy account\b/i,
  /\baccount number\b/i,
  /\bsubscription\b/i,
  /\brefund\b/i,
  /\bpayment\b/i,
  /\bcredit card\b/i,
  /\bcard number\b/i,
  /\bshipping address\b/i,
  /\bemail address\b/i,
  /\btracking\b/i,
  /\blog(?:ged)? in\b/i,
  /\bportal\b/i,
];

const PRODUCT_PATTERNS = [
  /\bproduct/i,
  /\bprice/i,
  /\bcost\b/i,
  /\bhow much\b/i,
  /\bavailable\b/i,
  /\bbuy\b/i,
  /\bcatalog\b/i,
  /\bbook\b/i,
  /\bguide\b/i,
  /\bprompt library\b/i,
  /\bpublish[- ]ready\b/i,
];

const FALLBACK_PRODUCTS = [
  { title: "AI Image Mastery™", price: "$9.95", url: "/collections/all" },
  { title: "Publish‑Ready Book Build Service™", price: "Starter $197.95 · Growth $397.95 · Professional $697.95", url: "/pages/publishing-services" },
  { title: "Creator Prompt Library", price: "$14.95 digital · $24.95 paperback", url: "/collections/all" },
  { title: "Creator’s Bible", price: "$49.95 paperback", url: "/collections/all" },
];

const PUBLIC_TOPICS = [
  {
    test: /\b(publishing|publish|manuscript|book build|kdp)\b/i,
    answer: "Mindset Media Group helps turn knowledge and ideas into professional publishing assets. The Publish‑Ready Book Build Service supports manuscript production and KDP-ready deliverables.",
    actions: [{ label: "Explore publishing services", href: "/pages/publishing-services" }],
  },
  {
    test: /\b(free|toolkit|creator tools|free tools)\b/i,
    answer: "You can access Mindset Media Group’s free creator resources from the Free Creator Toolkit.",
    actions: [{ label: "Open free creator toolkit", href: "/pages/free-creator-toolkit" }],
  },
  {
    test: /\b(company|about|mindset media group|what do you do|mission)\b/i,
    answer: "Mindset Media Group transforms knowledge, experience, and ideas into professional digital products, publishing assets, and revenue-generating intellectual property.",
    actions: [{ label: "About Mindset Media Group", href: "/pages/about" }],
  },
  {
    test: /\b(contact|support|help|customer service)\b/i,
    answer: `For customer support, use Customer Service or email ${CONTACT_EMAIL}. For account-specific information, use the authenticated Customer Portal.`,
    actions: [
      { label: "Customer Service", href: CUSTOMER_SERVICE_PATH },
      { label: "Customer Portal", href: CUSTOMER_PORTAL_PATH },
    ],
  },
];

function cleanString(value, max = MAX_MESSAGE_CHARS) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function allowedOrigin(request, env) {
  const origin = String(request.headers.get("Origin") || "").trim();
  if (!origin) return "";
  const configured = String(env.KAIROS_LIVE_HELP_ALLOWED_ORIGINS || DEFAULT_SITE_ORIGIN)
    .split(",").map(value => value.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : "";
}

function headers(request, env, contentType = "application/json; charset=utf-8") {
  const origin = allowedOrigin(request, env);
  const result = {
    "Content-Type": contentType,
    "Cache-Control": contentType.includes("javascript") ? "public, max-age=300" : "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Kairos-Live-Help": KAIROS_LIVE_HELP_BUILD,
  };
  if (origin) {
    result["Access-Control-Allow-Origin"] = origin;
    result["Vary"] = "Origin";
    result["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    result["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return result;
}

function json(request, env, value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: headers(request, env) });
}

function errorResponse(request, env, status, code, message) {
  return json(request, env, { ok: false, error: code, message, build: KAIROS_LIVE_HELP_BUILD }, status);
}

async function readSmallJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413, code: "body_too_large" });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413, code: "body_too_large" });
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400, code: "invalid_json" }); }
}

function classify(message) {
  if (PRIVATE_PATTERNS.some(pattern => pattern.test(message))) return "private";
  if (PRODUCT_PATTERNS.some(pattern => pattern.test(message))) return "commerce";
  if (PUBLIC_TOPICS.some(topic => topic.test.test(message))) return "public_knowledge";
  return "unknown";
}

function privacyEscalation() {
  return {
    answer: "I can help with public product, service, and company information, but I can’t access or collect private account, order, payment, subscription, refund, or customer data here. Please use the authenticated Customer Portal or Customer Service for that request.",
    actions: [
      { label: "Open Customer Portal", href: CUSTOMER_PORTAL_PATH },
      { label: "Customer Service", href: CUSTOMER_SERVICE_PATH },
    ],
    escalation: true,
  };
}

function normalizeCatalogProduct(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const numericPrices = variants.map(item => Number(item?.price)).filter(Number.isFinite);
  const price = numericPrices.length ? Math.min(...numericPrices) : null;
  return {
    id: String(product?.id || ""),
    title: cleanString(product?.title, 180),
    handle: cleanString(product?.handle, 180),
    price: price === null ? "" : `$${price.toFixed(2)}`,
    available: variants.some(item => item?.available !== false),
  };
}

async function fetchPublicCatalog(env) {
  const siteOrigin = String(env.KAIROS_LIVE_HELP_SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
  const response = await fetch(`${siteOrigin}/products.json?limit=100`, {
    headers: { "Accept": "application/json", "User-Agent": `KairosLiveHelp/${KAIROS_LIVE_HELP_BUILD}` },
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`catalog_http_${response.status}`);
  const body = await response.json();
  return (Array.isArray(body?.products) ? body.products : []).map(normalizeCatalogProduct).filter(item => item.title);
}

function productTokens(message) {
  return cleanString(message, MAX_MESSAGE_CHARS).toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3 && !["what","does","have","with","your","price","cost","product","available","book","guide","buy"].includes(token));
}

function selectProducts(products, message) {
  const tokens = productTokens(message);
  if (!tokens.length) return products.slice(0, 4);
  const scored = products.map(product => ({
    product,
    score: tokens.reduce((sum, token) => sum + (product.title.toLowerCase().includes(token) ? 1 : 0), 0),
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  return (scored.length ? scored.map(item => item.product) : products).slice(0, 4);
}

async function commerceAnswer(message, env) {
  try {
    const catalog = await fetchPublicCatalog(env);
    const matches = selectProducts(catalog, message);
    if (matches.length) {
      const detail = matches.map(item => `${item.title}${item.price ? ` — ${item.price}` : ""}${item.available ? "" : " — currently unavailable"}`).join("\n");
      return {
        answer: `Here’s current public catalog information:\n${detail}`,
        actions: matches.slice(0, 3).map(item => ({ label: `View ${item.title}`, href: `/products/${item.handle}` })),
        source: "live_public_shopify_catalog",
      };
    }
  } catch {
    // Fail closed to curated public information. Never substitute private/admin data.
  }
  const detail = FALLBACK_PRODUCTS.map(item => `${item.title} — ${item.price}`).join("\n");
  return {
    answer: `I couldn’t verify the live catalog at this moment. These are the current canonical reference prices:\n${detail}\nOpen the catalog to confirm current availability and checkout pricing.`,
    actions: [{ label: "Open catalog", href: "/collections/all" }],
    source: "curated_catalog_fallback",
  };
}

async function answerMessage(message, env) {
  const intent = classify(message);
  if (intent === "private") return { intent, ...privacyEscalation(), source: "privacy_boundary" };
  if (intent === "commerce") return { intent, ...(await commerceAnswer(message, env)) };
  if (intent === "public_knowledge") {
    const topic = PUBLIC_TOPICS.find(item => item.test.test(message));
    return { intent, answer: topic.answer, actions: topic.actions, source: "curated_public_knowledge", escalation: false };
  }
  return {
    intent,
    answer: "I can help you find Mindset Media Group products, publishing services, free creator tools, company information, and the right support path. What would you like to explore?",
    actions: [
      { label: "Browse products", href: "/collections/all" },
      { label: "Publishing services", href: "/pages/publishing-services" },
      { label: "Customer Service", href: CUSTOMER_SERVICE_PATH },
    ],
    source: "deterministic_fallback",
    escalation: false,
  };
}

function sanitizePagePath(value) {
  const raw = cleanString(value, 180);
  if (!raw.startsWith("/")) return "/";
  return raw.split(/[?#]/)[0].slice(0, 160) || "/";
}

async function handleChat(request, env) {
  if (request.method !== "POST") return errorResponse(request, env, 405, "method_not_allowed", "POST is required.");
  const body = await readSmallJson(request);
  const message = cleanString(body?.message, MAX_MESSAGE_CHARS);
  if (!message) return errorResponse(request, env, 400, "message_required", "A public help question is required.");
  const result = await answerMessage(message, env);
  return json(request, env, {
    ok: true,
    build: KAIROS_LIVE_HELP_BUILD,
    ...result,
    privacy: {
      publicOnly: true,
      privateCustomerDataAccessed: false,
      messagePersisted: false,
    },
  });
}

async function handleEvent(request, env) {
  if (request.method !== "POST") return errorResponse(request, env, 405, "method_not_allowed", "POST is required.");
  const body = await readSmallJson(request);
  const keys = Object.keys(body || {});
  const forbidden = keys.some(key => /message|text|email|order|payment|address|name|phone|token|query/i.test(key));
  if (forbidden) return errorResponse(request, env, 400, "event_payload_rejected", "Live Help analytics accepts event metadata only.");
  const event = cleanString(body?.event, 80);
  if (!EVENT_NAMES.has(event)) return errorResponse(request, env, 400, "event_not_allowed", "Unsupported Live Help event.");
  const safeEvent = {
    event,
    pagePath: sanitizePagePath(body?.pagePath),
    build: KAIROS_LIVE_HELP_BUILD,
    recordedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify({ type: "kairos_live_help_event", ...safeEvent }));
  return json(request, env, { ok: true, accepted: true, event, build: KAIROS_LIVE_HELP_BUILD });
}

function statusPayload(env) {
  return {
    ok: true,
    build: KAIROS_LIVE_HELP_BUILD,
    mode: "deterministic-public-assistance",
    externalInferenceProvider: false,
    publicOnly: true,
    privateCustomerDataAccess: false,
    catalogSource: "public-shopify-storefront",
    routes: {
      chat: `${KAIROS_LIVE_HELP_PREFIX}/chat`,
      event: `${KAIROS_LIVE_HELP_PREFIX}/event`,
      widget: `${KAIROS_LIVE_HELP_PREFIX}/widget.js`,
    },
    limits: { messageCharacters: MAX_MESSAGE_CHARS, requestBytes: MAX_BODY_BYTES },
    customerService: CUSTOMER_SERVICE_PATH,
    customerPortal: CUSTOMER_PORTAL_PATH,
    themePublishingEnabled: String(env.KAIROS_LIVE_HELP_THEME_PUBLISH_ENABLED || "false") === "true",
  };
}

function widgetSource(env) {
  const workerOrigin = String(env.KAIROS_LIVE_HELP_WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN).replace(/\/$/, "");
  return `(()=>{'use strict';
const BUILD=${JSON.stringify(KAIROS_LIVE_HELP_BUILD)},API=${JSON.stringify(workerOrigin + KAIROS_LIVE_HELP_PREFIX)},SITE=${JSON.stringify(DEFAULT_SITE_ORIGIN)};
if(document.querySelector('[data-kairos-live-help="'+BUILD+'"]'))return;
const css='.klh{position:fixed;right:20px;bottom:88px;z-index:2147482000;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101828}.klh *{box-sizing:border-box}.klh-launch{width:54px;height:54px;border:0;border-radius:50%;background:#066cff;color:#fff;box-shadow:0 12px 30px rgba(0,59,143,.26);font-weight:700;cursor:pointer}.klh-panel{position:absolute;right:0;bottom:66px;width:min(390px,calc(100vw - 28px));max-height:min(650px,calc(100vh - 130px));display:none;grid-template-rows:auto 1fr auto;background:#fff;border:1px solid #dbe5f2;border-radius:22px;box-shadow:0 24px 70px rgba(17,34,68,.22);overflow:hidden}.klh[data-open="true"] .klh-panel{display:grid}.klh-head{padding:17px 18px;background:#f5f9ff;border-bottom:1px solid #e4edf7;display:flex;align-items:center;justify-content:space-between}.klh-title{font-weight:750;font-size:16px}.klh-close{border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer}.klh-body{padding:16px;overflow:auto;display:grid;gap:12px;align-content:start}.klh-msg{white-space:pre-wrap;padding:11px 13px;border-radius:14px;max-width:92%}.klh-msg--bot{background:#f2f6fb}.klh-msg--user{justify-self:end;background:#066cff;color:#fff}.klh-actions{display:flex;flex-wrap:wrap;gap:8px}.klh-action{border:1px solid #b8cff0;border-radius:999px;padding:8px 11px;background:#fff;color:#064fae;text-decoration:none;font:inherit;cursor:pointer}.klh-form{padding:12px;border-top:1px solid #e4edf7;display:grid;grid-template-columns:1fr auto;gap:8px}.klh-input{min-width:0;border:1px solid #aabbd0;border-radius:12px;padding:11px;font:inherit}.klh-send{border:0;border-radius:12px;background:#066cff;color:#fff;padding:0 15px;font-weight:700;cursor:pointer}.klh-note{font-size:12px;color:#667085;grid-column:1/-1}.klh-prompt{position:absolute;right:0;bottom:66px;width:280px;padding:13px 42px 13px 14px;background:#fff;border:1px solid #dbe5f2;border-radius:15px;box-shadow:0 16px 38px rgba(17,34,68,.16)}.klh-prompt button{position:absolute;right:8px;top:7px;border:0;background:transparent;font-size:20px;cursor:pointer}@media(max-width:520px){.klh{right:14px;bottom:82px}.klh-panel{position:fixed;left:10px;right:10px;bottom:76px;width:auto;max-height:72vh}}@media(prefers-reduced-motion:reduce){.klh *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}';
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
const root=document.createElement('section');root.className='klh';root.dataset.kairosLiveHelp=BUILD;root.dataset.open='false';
const launch=document.createElement('button');launch.className='klh-launch';launch.type='button';launch.setAttribute('aria-label','Open Mindset Media Group live help');launch.setAttribute('aria-expanded','false');launch.textContent='Help';
const panel=document.createElement('section');panel.className='klh-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','Mindset Media Group live help');
const head=document.createElement('header');head.className='klh-head';const title=document.createElement('div');title.className='klh-title';title.textContent='Mindset Media Group Help';const close=document.createElement('button');close.className='klh-close';close.type='button';close.setAttribute('aria-label','Close live help');close.textContent='×';head.append(title,close);
const body=document.createElement('div');body.className='klh-body';body.setAttribute('aria-live','polite');
const form=document.createElement('form');form.className='klh-form';const input=document.createElement('input');input.className='klh-input';input.type='text';input.maxLength=800;input.autocomplete='off';input.placeholder='Ask about products, services, or tools';input.setAttribute('aria-label','Ask Mindset Media Group a public question');const send=document.createElement('button');send.className='klh-send';send.type='submit';send.textContent='Send';const note=document.createElement('div');note.className='klh-note';note.textContent='Public help only. Do not enter order, payment, account, or personal information.';form.append(input,send,note);panel.append(head,body,form);root.append(panel,launch);document.body.appendChild(root);
function path(href){if(!href)return'#';if(/^https:\/\//i.test(href))return href;return SITE+href}
function event(name){fetch(API+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:name,pagePath:location.pathname})}).catch(()=>{})}
function actionRow(actions){if(!Array.isArray(actions)||!actions.length)return;const row=document.createElement('div');row.className='klh-actions';actions.forEach(a=>{const link=document.createElement('a');link.className='klh-action';link.href=path(a.href);link.textContent=String(a.label||'Open');link.addEventListener('click',()=>event('suggested_action_clicked'));row.appendChild(link)});body.appendChild(row)}
function message(text,kind){const item=document.createElement('div');item.className='klh-msg klh-msg--'+kind;item.textContent=String(text||'');body.appendChild(item);body.scrollTop=body.scrollHeight}
function open(){root.dataset.open='true';launch.setAttribute('aria-expanded','true');promptRemove(false);event('widget_open');setTimeout(()=>input.focus(),0)}
function shut(){root.dataset.open='false';launch.setAttribute('aria-expanded','false');event('widget_close');launch.focus()}
launch.addEventListener('click',()=>root.dataset.open==='true'?shut():open());close.addEventListener('click',shut);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.dataset.open==='true')shut()});
message('How can I help? I can answer public questions about products, publishing services, creator tools, and Mindset Media Group.','bot');actionRow([{label:'Browse products',href:'/collections/all'},{label:'Publishing services',href:'/pages/publishing-services'}]);
form.addEventListener('submit',async e=>{e.preventDefault();const q=input.value.trim();if(!q)return;input.value='';message(q,'user');event('question_submitted');send.disabled=true;try{const r=await fetch(API+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q,pagePath:location.pathname})});const data=await r.json();message(data.answer||'I could not answer that request. Please use Customer Service.','bot');actionRow(data.actions);event('answer_rendered');if(data.escalation)event('escalation_offered')}catch(_){message('Live Help is temporarily unavailable. Please use Customer Service.','bot');actionRow([{label:'Customer Service',href:'/pages/customer-service'}])}finally{send.disabled=false;input.focus()}});
let prompt=null;function promptRemove(track){if(prompt){prompt.remove();prompt=null;if(track)event('proactive_prompt_dismissed')}}function maybePrompt(){const key='kairos-live-help-prompt:'+location.pathname;try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,String(Date.now()))}catch(_){}setTimeout(()=>{if(root.dataset.open==='true')return;prompt=document.createElement('div');prompt.className='klh-prompt';prompt.setAttribute('role','status');const text=document.createElement('span');text.textContent='Need help finding the right product, service, or creator resource?';const dismiss=document.createElement('button');dismiss.type='button';dismiss.setAttribute('aria-label','Dismiss help prompt');dismiss.textContent='×';dismiss.addEventListener('click',()=>promptRemove(true));prompt.append(text,dismiss);root.appendChild(prompt);event('proactive_prompt_shown')},7000)}maybePrompt();
})();`;
}

async function resolveShopifyAuth(env) {
  const storeDomain = cleanString(env.SHOPIFY_STORE_DOMAIN, 240);
  const apiVersion = cleanString(env.SHOPIFY_API_VERSION || env.KAIROS_SHOPIFY_ADMIN_API_VERSION || "2026-07", 30);
  if (!storeDomain) throw Object.assign(new Error("SHOPIFY_STORE_DOMAIN is required."), { status: 500, code: "shopify_store_domain_missing" });
  const direct = cleanString(env.SHOPIFY_ADMIN_ACCESS_TOKEN, 1000);
  if (direct) return { storeDomain, apiVersion, token: direct, credentialPath: "admin_access_token" };
  const clientId = cleanString(env.SHOPIFY_CLIENT_ID, 500);
  const clientSecret = cleanString(env.SHOPIFY_CLIENT_SECRET, 1000);
  if (!clientId || !clientSecret) throw Object.assign(new Error("Shopify publishing credentials are unavailable."), { status: 503, code: "shopify_credentials_missing" });
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token) throw Object.assign(new Error("Unable to obtain Shopify publishing token."), { status: 502, code: "shopify_token_error" });
  return { storeDomain, apiVersion, token: String(body.access_token), credentialPath: "client_credentials" };
}

async function shopifyGraphQL(auth, query, variables = {}) {
  const response = await fetch(`https://${auth.storeDomain}/admin/api/${auth.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Shopify GraphQL returned HTTP ${response.status}.`), { status: 502, code: "shopify_graphql_http_error" });
  if (body?.errors?.length) throw Object.assign(new Error(body.errors.map(item => item.message).join("; ")), { status: 422, code: "shopify_graphql_error" });
  return body?.data || {};
}

async function listThemes(auth) {
  const data = await shopifyGraphQL(auth, `query KairosLiveHelpThemes { themes(first:20) { nodes { id name role processing processingFailed } } }`);
  return (data?.themes?.nodes || []).filter(theme => !theme?.processing && !theme?.processingFailed);
}

async function readThemeLayout(auth, themeId) {
  const data = await shopifyGraphQL(auth, `query KairosLiveHelpLayout($themeId:ID!,$filenames:[String!]) { theme(id:$themeId) { files(first:1,filenames:$filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } } } }`, { themeId, filenames: ["layout/theme.liquid"] });
  const body = data?.theme?.files?.nodes?.[0]?.body;
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") { try { return atob(body.contentBase64); } catch { return ""; } }
  return "";
}

async function writeThemeLayout(auth, themeId, content) {
  const data = await shopifyGraphQL(auth, `mutation KairosLiveHelpLayoutWrite($themeId:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId:$themeId,files:$files) { upsertedThemeFiles { filename } userErrors { field message } } }`, { themeId, files: [{ filename: "layout/theme.liquid", body: { type: "TEXT", value: content } }] });
  const payload = data?.themeFilesUpsert;
  const errors = (payload?.userErrors || []).filter(item => item?.message);
  if (errors.length) throw Object.assign(new Error(errors.map(item => item.message).join("; ")), { status: 422, code: "theme_write_rejected" });
  if (!(payload?.upsertedThemeFiles || []).some(item => item?.filename === "layout/theme.liquid")) throw Object.assign(new Error("Shopify did not confirm the theme layout write."), { status: 502, code: "theme_write_unconfirmed" });
}

function injectWidget(layout, env) {
  const start = "<!-- KAIROS_LIVE_HELP_V1_START -->";
  const end = "<!-- KAIROS_LIVE_HELP_V1_END -->";
  let source = String(layout || "");
  while (true) {
    const a = source.indexOf(start), b = source.indexOf(end);
    if (a < 0 || b <= a) break;
    source = source.slice(0, a) + source.slice(b + end.length);
  }
  const workerOrigin = String(env.KAIROS_LIVE_HELP_WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN).replace(/\/$/, "");
  const block = `${start}\n<meta name="kairos-live-help" content="${KAIROS_LIVE_HELP_BUILD}">\n<script src="${workerOrigin}${KAIROS_LIVE_HELP_PREFIX}/widget.js" defer crossorigin="anonymous"></script>\n${end}`;
  return /<\/body>/i.test(source) ? source.replace(/<\/body>/i, `${block}\n</body>`) : `${source}\n${block}`;
}

async function handleThemePublish(request, env) {
  if (request.method !== "POST") return errorResponse(request, env, 405, "method_not_allowed", "POST is required.");
  if (String(env.KAIROS_LIVE_HELP_THEME_PUBLISH_ENABLED || "false") !== "true") return errorResponse(request, env, 403, "theme_publish_disabled", "Live Help theme publishing is disabled.");
  const body = await readSmallJson(request);
  if (body?.confirmation !== KAIROS_LIVE_HELP_PUBLISH_CONFIRMATION) return errorResponse(request, env, 403, "publish_confirmation_required", "Exact publish confirmation is required.");
  const auth = await resolveShopifyAuth(env);
  const themes = await listThemes(auth);
  const main = themes.find(theme => String(theme?.role || "").toUpperCase() === "MAIN");
  if (!main?.id) return errorResponse(request, env, 409, "main_theme_not_found", "Shopify MAIN theme was not found.");
  const before = await readThemeLayout(auth, main.id);
  if (!before) return errorResponse(request, env, 409, "main_theme_layout_unreadable", "Shopify MAIN theme layout is not readable.");
  const after = injectWidget(before, env);
  await writeThemeLayout(auth, main.id, after);
  const readBack = await readThemeLayout(auth, main.id);
  const exactReadBack = readBack === after;
  if (!exactReadBack) return errorResponse(request, env, 502, "theme_readback_mismatch", "Live Help theme write could not be verified exactly.");
  return json(request, env, {
    ok: true,
    status: "completed",
    build: KAIROS_LIVE_HELP_BUILD,
    theme: { id: main.id, name: main.name, role: main.role },
    verification: { exactReadBack: true, widgetEmbedded: readBack.includes(`content="${KAIROS_LIVE_HELP_BUILD}"`) && readBack.includes(`${KAIROS_LIVE_HELP_PREFIX}/widget.js`) },
    credentialPath: auth.credentialPath,
  });
}

export async function handleKairosLiveHelpRequest(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(KAIROS_LIVE_HELP_PREFIX)) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(request, env) });
  try {
    if (url.pathname === `${KAIROS_LIVE_HELP_PREFIX}/status` && request.method === "GET") return json(request, env, statusPayload(env));
    if (url.pathname === `${KAIROS_LIVE_HELP_PREFIX}/chat`) return handleChat(request, env);
    if (url.pathname === `${KAIROS_LIVE_HELP_PREFIX}/event`) return handleEvent(request, env);
    if (url.pathname === `${KAIROS_LIVE_HELP_PREFIX}/widget.js` && request.method === "GET") return new Response(widgetSource(env), { status: 200, headers: headers(request, env, "application/javascript; charset=utf-8") });
    if (url.pathname === `${KAIROS_LIVE_HELP_PREFIX}/theme/publish`) return handleThemePublish(request, env);
    return errorResponse(request, env, 404, "live_help_route_not_found", "Unknown Live Help route.");
  } catch (error) {
    return errorResponse(request, env, Number(error?.status || 500), String(error?.code || "live_help_internal_error"), Number(error?.status || 500) >= 500 ? "Live Help could not complete the request." : String(error?.message || "Request failed."));
  }
}

export const __test = {
  classify,
  privacyEscalation,
  sanitizePagePath,
  injectWidget,
  widgetSource,
  answerMessage,
  EVENT_NAMES,
};
