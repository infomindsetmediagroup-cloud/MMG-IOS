const BUILD="kairos-social-production-ui-20260713-2";
const state={open:false,busy:false,error:"",package:null,mode:"tiktok-single-image"};
const modes={
  "tiktok-single-image":"TikTok Single Image Post",
  "tiktok-carousel":"TikTok Multi-Image / Carousel Post",
  "tiktok-video":"TikTok Video Post",
  "cross-platform-caption":"Cross-Platform Caption Package",
  "social-asset-queue":"Social Asset Production Queue"
};

window.KairosSocialProduction={open};
window.addEventListener("kairos:social-production:open",open);

function open(){state.open=true;draw();}

function draw(){
  document.querySelector("#social-production-overlay")?.remove();
  if(!state.open)return;
  const overlay=document.createElement("div");
  overlay.id="social-production-overlay";
  overlay.className="social-production-overlay";
  overlay.innerHTML=`<section class="social-production-panel"><header><div><p class="eyebrow">Content Center · Social Production</p><h2>Connector-Ready Content</h2><p>Build complete approval-ready social packages without publishing externally.</p></div><button data-close aria-label="Close Social Production">×</button></header>${state.package?resultView():formView()}</section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function formView(){return `<div class="social-mode-grid">${Object.entries(modes).map(([id,label])=>`<button data-mode="${id}" class="${state.mode===id?"active":""}">${label}</button>`).join("")}</div><label>Content objective<textarea id="social-objective" maxlength="8000" placeholder="Describe the post, audience problem, promise, and intended action."></textarea></label><div class="social-two"><label>Audience<input id="social-audience" value="creators, entrepreneurs, authors, and small businesses"></label><label>Call to action<input id="social-cta" value="Follow for practical creator systems."></label></div><div class="social-contract"><strong>Production contract</strong><p>Title/hook · body/caption · five-hashtag Pyramid Mix · media requirements · disclosure defaults · accessibility text · export manifest · connector-ready payload · approval state</p></div>${state.error?`<p class="social-error">${esc(state.error)}</p>`:""}<button class="primary" data-prepare ${state.busy?"disabled":""}>${state.busy?"Preparing package…":"Build Social Package"}</button>`;}
function resultView(){const p=state.package;return `<div class="social-status"><span>${esc(p.status)}</span><strong>${esc(modes[p.mode]||p.mode)}</strong></div><h3>${esc(p.title)}</h3><div class="social-output"><article><strong>Hook</strong><p>${esc(p.hook)}</p></article><article><strong>Caption</strong><p>${esc(p.body)}</p><p>${esc((p.hashtags||[]).join(" "))}</p></article><article><strong>Accessibility</strong><p>${esc(p.accessibilityText)}</p></article><article><strong>Media requirements</strong><pre>${esc(JSON.stringify(p.mediaRequirements||[],null,2))}</pre></article>${p.sequence?.length?`<article><strong>Sequence</strong><pre>${esc(JSON.stringify(p.sequence,null,2))}</pre></article>`:""}<article><strong>Disclosure</strong><p>Your brand: on · Paid partnership: off · Brand partner: off</p></article></div><details><summary>Connector-ready payload</summary><pre>${esc(JSON.stringify(p.connectorReadyPayload,null,2))}</pre></details>${state.error?`<p class="social-error">${esc(state.error)}</p>`:""}<div class="social-actions">${p.approval?.state==="pending"?`<button class="primary" data-decision="approve">Approve Package</button><button data-decision="fix">Request Fix</button><button data-decision="deny">Deny</button>`:""}<button data-new>Build Another</button></div><p class="social-honesty">External publishing connector: not connected. No post, schedule, or upload has occurred.</p>`;}
function bind(root){root.querySelector("[data-close]").onclick=()=>{state.open=false;draw();};root.querySelectorAll("[data-mode]").forEach(button=>button.onclick=()=>{state.mode=button.dataset.mode;draw();});root.querySelector("[data-prepare]")?.addEventListener("click",prepare);root.querySelectorAll("[data-decision]").forEach(button=>button.onclick=()=>decide(button.dataset.decision));root.querySelector("[data-new]")?.addEventListener("click",()=>{state.package=null;state.error="";draw();});}
async function prepare(){const objective=document.querySelector("#social-objective")?.value.trim()||"";const audience=document.querySelector("#social-audience")?.value.trim()||"";const cta=document.querySelector("#social-cta")?.value.trim()||"";if(objective.length<8){state.error="Describe the content objective before production begins.";draw();return;}await run("/api/social-production/prepare",{mode:state.mode,objective,audience,cta},body=>state.package=body.socialPackage);}
async function decide(decision){let note="";if(decision==="fix"){note=window.prompt("What should Kairos correct?")||"";if(!note)return;}await run("/api/social-production/decide",{packageID:state.package.id,decision,note,actor:"Executive"},body=>state.package=body.socialPackage);}
async function run(url,payload,onSuccess){state.busy=true;state.error="";draw();try{const response=await fetch(url,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Social production failed.");onSuccess(body);}catch(error){state.error=error.message||"Social production failed.";}finally{state.busy=false;draw();}}
function esc(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}
