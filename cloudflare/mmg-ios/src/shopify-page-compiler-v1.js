const BUILD = "shopify-page-compiler-20260712-2";

const COMPONENTS = [
  component("mmg-hero", "MMG Hero", ["homepage","landing-page","service-page","product-page","collection-page"], ["eyebrow","heading","body","primaryLabel","primaryURL","secondaryLabel","secondaryURL"], "Primary message and first customer action."),
  component("guided-journey", "Guided Journey", ["homepage","landing-page"], ["steps","heading","body"], "Discover → Learn → Create → Publish → Grow → Leave a Legacy."),
  component("choose-next-step", "Choose Your Next Step", ["homepage","landing-page","service-page"], ["cards","heading","body"], "Routes each visitor into a verified next action."),
  component("knowledge-cards", "Knowledge Cards", ["homepage","landing-page","collection-page"], ["cards","heading","body"], "Connects education, books, downloads, and creator resources."),
  component("publishing-pathway", "Publishing Pathway", ["homepage","service-page","landing-page"], ["steps","heading","body","ctaLabel","ctaURL"], "Explains service selection, intake, review, approval, and delivery."),
  component("product-value", "Product Value", ["product-page"], ["heading","body","benefits","learningOutcomes"], "Explains the verified problem, outcome, and customer fit."),
  component("product-purchase", "Product Purchase Card", ["product-page"], ["productHandle","ctaLabel"], "Uses the native Shopify product form and verified product record."),
  component("cross-navigation", "Cross-Navigation Cards", ["homepage","landing-page","service-page","product-page","collection-page","portal-page"], ["cards","heading"], "Prevents dead ends by linking verified next steps."),
  component("customer-progress", "Customer Progress Panel", ["service-page","portal-page"], ["heading","body","stages"], "Shows visible project momentum and approvals."),
  component("trust-standards", "Trust & Standards", ["homepage","landing-page","service-page","product-page","collection-page"], ["heading","body","items"], "Explains stewardship, accuracy, approvals, and production boundaries."),
  component("founder-philosophy", "Founder Philosophy", ["homepage","about-page"], ["heading","body"], "Presents the approved MMG mission and legacy philosophy."),
  component("faq", "FAQ", ["landing-page","service-page","product-page"], ["items","heading"], "Answers verified objections without inventing claims."),
  component("kairos-guidance", "Kairos Guidance Blip", ["homepage","landing-page","service-page","product-page","collection-page","portal-page"], ["message","audioURL","ctaLabel","ctaURL","frequency"], "Restrained, dismissible, captioned page guidance."),
  component("final-cta", "Final Ecosystem CTA", ["homepage","landing-page","service-page","product-page","collection-page"], ["heading","body","ctaLabel","ctaURL"], "Closes the page with one verified next action.")
];

const BLUEPRINTS = {
  "landing-page": ["mmg-hero","choose-next-step","knowledge-cards","trust-standards","faq","cross-navigation","final-cta"],
  "service-page": ["mmg-hero","publishing-pathway","customer-progress","trust-standards","faq","cross-navigation","final-cta"],
  "product-page": ["mmg-hero","product-value","product-purchase","trust-standards","faq","cross-navigation"],
  "collection-page": ["mmg-hero","knowledge-cards","trust-standards","cross-navigation","final-cta"],
  "homepage": ["mmg-hero","guided-journey","choose-next-step","knowledge-cards","publishing-pathway","customer-progress","founder-philosophy","trust-standards","cross-navigation","final-cta"],
  "portal-page": ["customer-progress","kairos-guidance","cross-navigation"]
};

export async function handlePageCompilerRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/page-compiler/components" && request.method === "GET") return json({ status:"ready", build:BUILD, components:COMPONENTS, blueprints:BLUEPRINTS });
  if (url.pathname === "/api/shopify/page-compiler/compile" && request.method === "POST") return compilePage(request);
  if (url.pathname === "/api/shopify/page-compiler/validate" && request.method === "POST") return validatePackage(request);
  return null;
}

async function compilePage(request) {
  const body = await request.json();
  const pageType = normalizePageType(body?.pageType);
  const objective = String(body?.objective || "").trim();
  const title = String(body?.title || titleFromObjective(objective)).trim().slice(0,120);
  const handle = slug(String(body?.handle || title));
  if (objective.length < 8) return json({ status:"needs-input", error:{ code:"page_objective_required", message:"Describe the page objective before compiling the package." } },400);
  const requested = Array.isArray(body?.components) ? body.components.map(String) : BLUEPRINTS[pageType];
  const selected = requested.map(id=>COMPONENTS.find(item=>item.id===id)).filter(Boolean);
  if (!selected.length) return json({ status:"needs-input", error:{ code:"component_selection_required", message:"The page requires at least one approved MMG component." } },400);
  const invalid = selected.filter(item=>!item.pageTypes.includes(pageType));
  if (invalid.length) return json({ status:"needs-attention", error:{ code:"component_page_type_mismatch", message:`These components are not approved for ${pageType}: ${invalid.map(item=>item.label).join(", ")}.` } },409);

  const resourceType = resourceTypeFor(pageType);
  const templateFilename = templateFilenameFor(pageType, handle);
  const sectionIDs = selected.map((item,index)=>`mmg_${String(index+1).padStart(2,"0")}_${item.id.replace(/-/g,"_")}`);
  const template = { sections:{}, order:sectionIDs };
  selected.forEach((item,index)=>{ const id=sectionIDs[index]; template.sections[id]={ type:"mmg-page-component", settings:defaultSettings(item, title, objective), blocks:{}, block_order:[] }; });
  const packageID=crypto.randomUUID();
  const files=[
    { filename:templateFilename, content:`${JSON.stringify(template,null,2)}\n`, purpose:`Shopify JSON ${resourceType} template` },
    { filename:"sections/mmg-page-component.liquid", content:componentLiquid(), purpose:"Reusable governed MMG component renderer" },
    { filename:"assets/mmg-page-system.css", content:componentCSS(), purpose:"Shared responsive MMG page styling" }
  ];
  const manifest=[];
  for(const file of files) manifest.push({ ...file, sha256:await hash(file.content), bytes:new TextEncoder().encode(file.content).length });
  const packageResult={
    packageID,
    status:"compiled-awaiting-source-inspection-and-approval",
    build:BUILD,
    compiledAt:new Date().toISOString(),
    page:{ title, handle, pageType, resourceType, resourceHandle:String(body?.resourceHandle || handle).trim(), resourceID:String(body?.resourceID || "").trim(), templateSuffix:handle, templateFilename },
    componentSequence:selected.map((item,index)=>({ order:index+1, id:item.id, label:item.label, purpose:item.purpose })),
    journey:{ primaryMessage:"Your Knowledge Has Value.", requiredRule:"Every page must lead to a verified next step.", stage:inferStage(pageType), nextSteps:verifiedNextSteps(body?.nextSteps) },
    manifest,
    safeguards:{ stagingOnly:true, sourceInspectionRequired:true, sourceHashBindingRequired:true, executiveApprovalRequired:true, visualVerificationRequired:true, publicationSeparate:true, openAIUsed:false },
    nextAction:"Send this package to the site-wide Shopify execution engine for source inspection, resource resolution, approval, staging installation, verification, and rollback protection."
  };
  return json(packageResult,201);
}

async function validatePackage(request) {
  const body=await request.json();
  const pkg=body?.package;
  const findings=[];
  if(!pkg?.packageID)findings.push(finding("package-id","blocking","Package ID is missing."));
  if(!pkg?.page?.handle)findings.push(finding("page-handle","blocking","Page handle is missing."));
  if(!["page","product","collection","homepage"].includes(pkg?.page?.resourceType))findings.push(finding("resource-type","blocking","A supported Shopify resource type is required."));
  if(!Array.isArray(pkg?.componentSequence)||!pkg.componentSequence.length)findings.push(finding("components","blocking","No components are compiled."));
  if(!Array.isArray(pkg?.manifest)||pkg.manifest.length!==3)findings.push(finding("manifest","blocking","The governed three-file page package is incomplete."));
  if(!pkg?.journey?.nextSteps?.length)findings.push(finding("next-step","warning","No verified next-step pathway is attached."));
  const ids=(pkg?.componentSequence||[]).map(item=>item.id);
  if(!ids.includes("cross-navigation")&&!ids.includes("final-cta")&&!ids.includes("product-purchase"))findings.push(finding("dead-end-risk","warning","The page lacks a terminal conversion or cross-navigation component."));
  const expected = templateFilenameFor(pkg?.page?.pageType,pkg?.page?.handle);
  if(pkg?.page?.templateFilename!==expected)findings.push(finding("template-filename","blocking","The template filename does not match the page type and suffix."));
  return json({ status:findings.some(item=>item.severity==="blocking")?"needs-attention":"validated", build:BUILD, checkedAt:new Date().toISOString(), findings, executable:!findings.some(item=>item.severity==="blocking"), nextAction:findings.length?"Resolve findings before staging execution.":"Resolve the Shopify resource, bind current source hashes, and request executive approval." });
}

function component(id,label,pageTypes,fields,purpose){return{id,label,pageTypes,fields,purpose,version:"1.1.0",status:"approved"};}
function normalizePageType(value){const type=String(value||"landing-page").trim().toLowerCase();return BLUEPRINTS[type]?type:"landing-page";}
function resourceTypeFor(type){if(type==="homepage")return"homepage";if(type==="product-page")return"product";if(type==="collection-page")return"collection";return"page";}
function templateFilenameFor(type,handle){if(type==="homepage")return"templates/index.json";if(type==="product-page")return`templates/product.${handle}.json`;if(type==="collection-page")return`templates/collection.${handle}.json`;return`templates/page.${handle}.json`;}
function titleFromObjective(value){const text=String(value||"New MMG Page").replace(/\s+/g," ").trim();return text.split(/[.!?]/)[0].slice(0,80)||"New MMG Page";}
function slug(value){return String(value||"mmg-page").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"mmg-page";}
function inferStage(type){if(type==="product-page"||type==="collection-page")return"grow";if(type==="service-page")return"publish";if(type==="portal-page")return"grow";return"discover";}
function verifiedNextSteps(value){return(Array.isArray(value)?value:[]).map(item=>({label:String(item?.label||"").slice(0,80),url:String(item?.url||"").slice(0,300)})).filter(item=>item.label&&/^\//.test(item.url)).slice(0,8);}
function defaultSettings(item,title,objective){return{component_type:item.id,eyebrow:"Mindset Media Group",heading:item.id==="mmg-hero"?title:item.label,body:item.id==="mmg-hero"?objective:item.purpose,primary_label:"Explore the MMG Ecosystem",primary_url:"/",secondary_label:"",secondary_url:"",audio_url:"",guidance_message:"",frequency:"once-per-session"};}
function componentLiquid(){return `{% comment %}Kairos governed MMG component renderer v1{% endcomment %}\n{{ 'mmg-page-system.css' | asset_url | stylesheet_tag }}\n<section class="mmg-component mmg-component--{{ section.settings.component_type | escape }}" data-mmg-component="{{ section.settings.component_type | escape }}">\n  <div class="mmg-component__inner page-width">\n    {% if section.settings.eyebrow != blank %}<p class="mmg-component__eyebrow">{{ section.settings.eyebrow | escape }}</p>{% endif %}\n    {% if section.settings.heading != blank %}<h2>{{ section.settings.heading | escape }}</h2>{% endif %}\n    {% if section.settings.body != blank %}<div class="mmg-component__body rte">{{ section.settings.body }}</div>{% endif %}\n    <div class="mmg-component__actions">\n      {% if section.settings.primary_label != blank and section.settings.primary_url != blank %}<a class="button" href="{{ section.settings.primary_url }}">{{ section.settings.primary_label | escape }}</a>{% endif %}\n      {% if section.settings.secondary_label != blank and section.settings.secondary_url != blank %}<a class="button button--secondary" href="{{ section.settings.secondary_url }}">{{ section.settings.secondary_label | escape }}</a>{% endif %}\n    </div>\n  </div>\n</section>\n{% schema %}{"name":"MMG Page Component","settings":[{"type":"text","id":"component_type","label":"Component type"},{"type":"text","id":"eyebrow","label":"Eyebrow"},{"type":"text","id":"heading","label":"Heading"},{"type":"richtext","id":"body","label":"Body"},{"type":"text","id":"primary_label","label":"Primary label"},{"type":"url","id":"primary_url","label":"Primary URL"},{"type":"text","id":"secondary_label","label":"Secondary label"},{"type":"url","id":"secondary_url","label":"Secondary URL"},{"type":"url","id":"audio_url","label":"Approved audio URL"},{"type":"textarea","id":"guidance_message","label":"Kairos guidance"},{"type":"select","id":"frequency","label":"Guidance frequency","default":"once-per-session","options":[{"value":"once-per-session","label":"Once per session"},{"value":"once-ever","label":"Once per visitor"},{"value":"manual","label":"Manual only"}]}],"presets":[{"name":"MMG Page Component"}]}{% endschema %}\n`;}
function componentCSS(){return `.mmg-component{background:#05070a;color:#f7f9fc;padding:clamp(3rem,7vw,7rem) 0;border-top:1px solid rgba(39,128,255,.18)}.mmg-component__inner{max-width:1200px;margin:0 auto;padding:0 1.25rem}.mmg-component__eyebrow{color:#5aa2ff;text-transform:uppercase;letter-spacing:.14em;font-size:.75rem;font-weight:700}.mmg-component h2{font-size:clamp(2rem,5vw,4.75rem);line-height:1.02;max-width:16ch;margin:.5rem 0 1rem}.mmg-component__body{max-width:70ch;color:#c7ced8;font-size:clamp(1rem,2vw,1.2rem)}.mmg-component__actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1.5rem}.mmg-component .button{min-height:48px}.mmg-component--kairos-guidance{position:relative}.mmg-component--kairos-guidance .mmg-component__inner{border:1px solid rgba(90,162,255,.28);border-radius:20px;padding:1.25rem}@media(max-width:749px){.mmg-component{padding:3rem 0}.mmg-component__actions{display:grid}.mmg-component__actions .button{width:100%}}\n`;}
async function hash(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)));return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function finding(id,severity,message){return{id,severity,message};}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
