const BUILD = "kairos-page-compiler-ui-20260712-1";
const state = { open:false, loading:false, error:"", catalog:null, result:null, pageType:"landing-page" };

function mount(){
  const observer = new MutationObserver(addLauncher);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addLauncher();
}

function addLauncher(){
  const host=document.querySelector("#website-production-overlay .website-production-panel");
  if(!host||host.querySelector("[data-page-compiler-launch]"))return;
  const button=document.createElement("button");
  button.type="button";
  button.className="secondary";
  button.dataset.pageCompilerLaunch="true";
  button.textContent="Open Component Library & Page Compiler";
  button.onclick=()=>{state.open=true;render();};
  host.querySelector("header")?.insertAdjacentElement("afterend",button);
}

function render(){
  document.querySelector("#page-compiler-overlay")?.remove();
  if(!state.open)return;
  const overlay=document.createElement("div");
  overlay.id="page-compiler-overlay";
  overlay.className="page-compiler-overlay";
  overlay.innerHTML=`<section class="page-compiler-panel"><header><div><p class="eyebrow">Website Production · Governed Components</p><h2>MMG Page Compiler</h2><p>Compile a Shopify page package from the approved MMG component library.</p></div><button data-pc-close aria-label="Close">×</button></header>${state.result?resultView():inputView()}</section>`;
  document.body.appendChild(overlay);
  bind(overlay);
  if(!state.catalog&&!state.loading)loadCatalog();
}

function inputView(){
  const components=(state.catalog?.components||[]).filter(item=>item.pageTypes.includes(state.pageType));
  return `<div class="pc-grid"><label>Page type<select id="pc-type">${["landing-page","service-page","product-page","collection-page","homepage","portal-page"].map(type=>`<option value="${type}" ${type===state.pageType?"selected":""}>${label(type)}</option>`).join("")}</select></label><label>Page title<input id="pc-title" maxlength="120" placeholder="Example: Free Creator Toolkit"></label><label>Page handle<input id="pc-handle" maxlength="60" placeholder="free-creator-toolkit"></label></div><label>What should this page accomplish?<textarea id="pc-objective" maxlength="4000" placeholder="Describe the visitor, intended outcome, and verified next step."></textarea></label><section class="pc-components"><h3>Approved components</h3>${components.map(item=>`<article><strong>${esc(item.label)}</strong><p>${esc(item.purpose)}</p></article>`).join("")}</section><label>Verified next steps<textarea id="pc-next" maxlength="2000" placeholder="One per line: Label | /verified-path"></textarea></label>${state.error?`<p class="pc-error">${esc(state.error)}</p>`:""}<div class="pc-actions"><button class="primary" data-pc-compile ${state.loading?"disabled":""}>Compile Governed Page Package</button><button class="secondary" data-pc-close>Close</button></div>`;
}

function resultView(){
  const r=state.result;
  return `<div class="pc-status"><span>Compiled package</span><strong>${esc(r.status)}</strong></div><section class="pc-summary"><h3>${esc(r.page.title)}</h3><p>${esc(r.page.pageType)} · /pages/${esc(r.page.handle)}</p><p>${esc(r.page.objective)}</p></section><div class="pc-metrics"><article><strong>${r.componentSequence.length}</strong><span>components</span></article><article><strong>${r.manifest.length}</strong><span>files</span></article><article><strong>${r.journey.nextSteps.length}</strong><span>next steps</span></article></div><section class="pc-components"><h3>Component sequence</h3>${r.componentSequence.map(item=>`<article><strong>${item.order}. ${esc(item.label)}</strong><p>${esc(item.purpose)}</p></article>`).join("")}</section><section class="pc-components"><h3>Compiled manifest</h3>${r.manifest.map(item=>`<article><strong>${esc(item.filename)}</strong><p>${esc(item.purpose)}</p><small>${item.bytes.toLocaleString()} bytes</small></article>`).join("")}</section><p class="pc-valid">The package is compiled. Source inspection, source-hash binding, executive approval, staging execution, visual verification, and publication remain separate gates.</p><div class="pc-actions"><button class="primary" data-pc-send>Send to Website Production</button><button class="secondary" data-pc-new>Compile Another Page</button><button class="secondary" data-pc-close>Close</button></div>`;
}

async function loadCatalog(){
  state.loading=true;render();
  try{
    const response=await fetch("/api/shopify/page-compiler/components",{credentials:"include",cache:"no-store"});
    const body=await response.json();
    if(!response.ok)throw new Error(body?.error?.message||"Component library unavailable.");
    state.catalog=body;
  }catch(error){state.error=error.message||"Component library unavailable.";}
  finally{state.loading=false;render();}
}

async function compile(){
  const pageType=document.querySelector("#pc-type")?.value||state.pageType;
  const title=document.querySelector("#pc-title")?.value.trim()||"";
  const handle=document.querySelector("#pc-handle")?.value.trim()||"";
  const objective=document.querySelector("#pc-objective")?.value.trim()||"";
  const nextSteps=(document.querySelector("#pc-next")?.value||"").split("\n").map(line=>{const parts=line.split("|");return{label:(parts.shift()||"").trim(),url:parts.join("|").trim()};}).filter(item=>item.label&&item.url.startsWith("/"));
  if(objective.length<8){state.error="Describe the page outcome before compiling.";render();return;}
  state.loading=true;state.error="";render();
  try{
    const response=await fetch("/api/shopify/page-compiler/compile",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},body:JSON.stringify({pageType,title,handle,objective,nextSteps})});
    const body=await response.json();
    if(!response.ok)throw new Error(body?.error?.message||"Page compilation failed.");
    state.result=body;
    sessionStorage.setItem("kairos.website.page-package",JSON.stringify(body));
  }catch(error){state.error=error.message||"Page compilation failed.";}
  finally{state.loading=false;render();}
}

function sendToProduction(){
  const objective=`Install the compiled ${state.result.page.pageType} package for ${state.result.page.title}. Preserve its approved component sequence, verified next steps, staging-only boundary, source-hash binding, visual verification, and separate publication gate.`;
  window.dispatchEvent(new CustomEvent("kairos:compiled-page-package",{detail:{package:state.result,objective}}));
  state.open=false;render();
  const textarea=document.querySelector("#website-production-overlay #wp-objective");
  if(textarea)textarea.value=objective;
}

function bind(overlay){
  overlay.querySelectorAll("[data-pc-close]").forEach(button=>button.onclick=()=>{state.open=false;render();});
  overlay.querySelector("#pc-type")?.addEventListener("change",event=>{state.pageType=event.target.value;render();});
  overlay.querySelector("[data-pc-compile]")?.addEventListener("click",compile);
  overlay.querySelector("[data-pc-new]")?.addEventListener("click",()=>{state.result=null;state.error="";render();});
  overlay.querySelector("[data-pc-send]")?.addEventListener("click",sendToProduction);
}
function label(value){return String(value).replace(/-/g," ").replace(/\b\w/g,char=>char.toUpperCase());}
function esc(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);}
mount();
