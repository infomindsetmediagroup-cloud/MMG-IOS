const BUILD="kairos-website-intent-router-20260716-1";
const STATE_KEY="kairos.website.operational-flow.v2";
const RELOAD_KEY="kairos.website.intent-router.reload.v1";
const STRUCTURAL_PATTERNS=[
  /\b(full|complete|comprehensive|canonical|premium|cinematic)\b[\s\S]{0,90}\b(website|site|homepage|storefront|customer journey)\b[\s\S]{0,90}\b(retool|redesign|rebuild|build|overhaul|implementation|experience)\b/i,
  /\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b[\s\S]{0,120}\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system)\b/i,
  /\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system)\b[\s\S]{0,120}\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b/i,
  /\bapple[- ]inspired\b/i,
  /\bnike[- ]inspired\b/i,
  /\b(structural|layout|visual|styling|responsive|mobile|desktop|animation|motion|component|template|theme)\b[\s\S]{0,50}\b(change|changes|work|update|updates|implementation|retool|redesign|build)\b/i,
  /\b(add|remove|move|reorder|create|replace|rebuild)\b[\s\S]{0,80}\b(section|sections|component|components|navigation|header|footer|layout|template|card|cards|carousel|hero)\b/i,
];

const structuralObjective=value=>STRUCTURAL_PATTERNS.some(pattern=>pattern.test(String(value||"")));

function migrateStoredWebsiteState(){
  let stored;
  try{stored=JSON.parse(sessionStorage.getItem(STATE_KEY)||"null");}catch{return false;}
  if(!stored||typeof stored!=="object"||!structuralObjective(stored.objective))return false;
  const stalePlan=stored.requestType!=="full-retool"||stored?.plan?.plan?.requestType==="content-only"||stored?.plan?.plan?.installationMode==="inspection-only";
  if(!stalePlan)return false;
  const migrated={...stored,mode:"input",requestType:"full-retool",plan:null,execution:null,verification:null,release:null};
  sessionStorage.setItem(STATE_KEY,JSON.stringify(migrated));
  if(sessionStorage.getItem(RELOAD_KEY)!==BUILD){
    sessionStorage.setItem(RELOAD_KEY,BUILD);
    location.reload();
    return true;
  }
  return false;
}

function applyFullRetoolSelection(){
  const objective=document.querySelector("#website-objective")?.value||"";
  const select=document.querySelector("#website-request-type");
  const confirmation=document.querySelector("[data-website-full-retool-confirm]");
  if(!select)return;
  if(!objective.trim()||structuralObjective(objective)){
    select.value="full-retool";
    if(confirmation)confirmation.checked=true;
  }
}

if(!migrateStoredWebsiteState()){
  sessionStorage.removeItem(RELOAD_KEY);
  document.addEventListener("focusin",event=>{
    if(event.target?.id==="website-objective"||event.target?.id==="website-request-type")applyFullRetoolSelection();
  });
  document.addEventListener("input",event=>{
    if(event.target?.id==="website-objective"&&structuralObjective(event.target.value))applyFullRetoolSelection();
  });
  document.addEventListener("click",event=>{
    if(event.target?.closest?.("[data-website-plan]"))applyFullRetoolSelection();
  },true);
}

window.KairosWebsiteIntentRouter={build:BUILD,structuralObjective};
