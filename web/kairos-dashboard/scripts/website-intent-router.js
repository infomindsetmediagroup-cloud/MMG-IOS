const BUILD="kairos-website-intent-router-20260716-2";
const STATE_KEY="kairos.website.operational-flow.v2";
const RELOAD_KEY="kairos.website.intent-router.reload.v2";

const EXPLICIT_CONTENT_ONLY=/\breplace\s+source\s*:\s*[\s\S]+?\bwith\s+replacement\s*:/i;
const WEBSITE_LANGUAGE=/\b(website|site|homepage|storefront|shopify|theme|header|footer|hero|section|sections|layout|navigation|customer journey|mobile|desktop|responsive|preview|template|liquid|css|javascript)\b/i;
const STRUCTURAL_LANGUAGE=/\b(full|complete|comprehensive|canonical|premium|cinematic|retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform|create|add|remove|move|reorder|replace|structural|layout|visual|styling|responsive|animation|motion|component|template|theme|apple[- ]inspired|nike[- ]inspired)\b/i;

function isExplicitContentOnly(value){
  return EXPLICIT_CONTENT_ONLY.test(String(value||""));
}

function structuralObjective(value){
  const text=String(value||"").trim();
  if(!text)return true;
  if(isExplicitContentOnly(text))return false;
  return WEBSITE_LANGUAGE.test(text)||STRUCTURAL_LANGUAGE.test(text);
}

function forceStructuralState(stored){
  return {
    ...stored,
    mode:"input",
    requestType:"full-retool",
    plan:null,
    execution:null,
    verification:null,
    release:null,
  };
}

function migrateStoredWebsiteState(){
  let stored;
  try{stored=JSON.parse(sessionStorage.getItem(STATE_KEY)||"null");}catch{return false;}
  if(!stored||typeof stored!=="object")return false;
  const objective=String(stored.objective||"");
  const staleContentPlan=stored.requestType!=="full-retool"||stored?.plan?.plan?.requestType==="content-only"||stored?.plan?.plan?.installationMode==="inspection-only"||String(stored?.plan?.summary||"").toLowerCase().includes("content-only");
  if(!structuralObjective(objective)||!staleContentPlan)return false;
  sessionStorage.setItem(STATE_KEY,JSON.stringify(forceStructuralState(stored)));
  if(sessionStorage.getItem(RELOAD_KEY)!==BUILD){
    sessionStorage.setItem(RELOAD_KEY,BUILD);
    location.reload();
    return true;
  }
  return false;
}

function applyRouting(){
  const objective=document.querySelector("#website-objective")?.value||"";
  const select=document.querySelector("#website-request-type");
  const confirmation=document.querySelector("[data-website-full-retool-confirm]");
  if(!select)return;
  const fullRetool=structuralObjective(objective);
  select.value=fullRetool?"full-retool":"content-only";
  if(confirmation)confirmation.checked=fullRetool;
}

if(!migrateStoredWebsiteState()){
  sessionStorage.removeItem(RELOAD_KEY);
  queueMicrotask(applyRouting);
  document.addEventListener("focusin",event=>{
    if(event.target?.id==="website-objective"||event.target?.id==="website-request-type")applyRouting();
  });
  document.addEventListener("input",event=>{
    if(event.target?.id==="website-objective")applyRouting();
  });
  document.addEventListener("click",event=>{
    if(event.target?.closest?.("[data-website-plan]"))applyRouting();
  },true);
}

window.KairosWebsiteIntentRouter={build:BUILD,structuralObjective,isExplicitContentOnly};
