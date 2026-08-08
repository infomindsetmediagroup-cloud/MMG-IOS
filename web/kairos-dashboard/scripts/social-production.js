const BUILD="kairos-social-production-ui-20260807-3-tiktok-framework";
const ACCOUNT="@mindset.media.group";
const state={open:false,busy:false,error:"",package:null,mode:"tiktok-single-image",sourceCard:"social-production",carouselCount:5,ctaMode:"follow"};
const modes={
  "tiktok-text":"TikTok Native Text Post",
  "tiktok-single-image":"TikTok Single Image Post",
  "tiktok-carousel":"TikTok Multi-Image / Carousel Post",
  "tiktok-video":"TikTok Video Post"
};
const cardEntries={
  "creative-studio":{label:"Build TikTok Asset",note:"Create the TikTok package first, then use Creative Studio to produce its approved media brief."},
  "product-launch":{label:"Build TikTok Launch Post",note:"Translate an approved product launch into a TikTok package. Shopify/product publishing remains separate."},
  "campaign-operations":{label:"Build TikTok Campaign Post",note:"Create an approved TikTok campaign asset with timing, CTA, and measurement intent."},
  "growth-plan":{label:"Build TikTok Growth Post",note:"Create a TikTok experiment package tied to retention, shares, saves, profile actions, and conversion signals."}
};

window.KairosSocialProduction={open};
window.addEventListener("kairos:social-production:open",event=>open(event?.detail?.sourceCard||"social-production"));

installCardEntries();
new MutationObserver(installCardEntries).observe(document.documentElement,{childList:true,subtree:true});

function open(sourceCard="social-production"){
  state.open=true;
  state.sourceCard=sourceCard in cardEntries?sourceCard:"social-production";
  state.package=null;
  state.error="";
  draw();
}

function installCardEntries(){
  document.querySelectorAll(".child-card .child-action[data-child]").forEach(primary=>{
    const id=primary.dataset.child;
    const config=cardEntries[id];
    if(!config)return;
    const card=primary.closest(".child-card");
    if(!card||card.querySelector("[data-kairos-tiktok-entry]"))return;
    const badge=document.createElement("span");
    badge.className="kairos-tiktok-badge";
    badge.textContent="TikTok framework";
    card.querySelector("h3")?.after(badge);
    const button=document.createElement("button");
    button.type="button";
    button.className="kairos-tiktok-entry";
    button.dataset.kairosTiktokEntry=id;
    button.textContent=config.label;
    button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();open(id);});
    primary.insertAdjacentElement("afterend",button);
  });
}

function draw(){
  document.querySelector("#social-production-overlay")?.remove();
  if(!state.open)return;
  const overlay=document.createElement("div");
  overlay.id="social-production-overlay";
  overlay.className="social-production-overlay";
  overlay.innerHTML=`<section class="social-production-panel"><header><div><p class="eyebrow">Content Center · TikTok Production</p><h2>${ACCOUNT}</h2><p>Build a complete approval-ready TikTok package now. Platform connectors are a separate future integration layer.</p></div><button data-close aria-label="Close Social Production">×</button></header>${state.package?resultView():formView()}</section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function formView(){
  const source=cardEntries[state.sourceCard];
  return `${source?`<div class="social-contract"><strong>Source card</strong><p>${esc(source.note)}</p></div>`:""}<div class="social-mode-grid">${Object.entries(modes).map(([id,label])=>`<button type="button" data-mode="${id}" class="${state.mode===id?"active":""}">${label}</button>`).join("")}</div><label>Content objective<textarea id="social-objective" maxlength="8000" placeholder="Describe the topic, audience problem, useful outcome, and intended action."></textarea></label><div class="social-two"><label>Audience<input id="social-audience" value="creators, entrepreneurs, authors, and small businesses"></label><label>CTA type<select id="social-cta-mode"><option value="follow" ${state.ctaMode==="follow"?"selected":""}>Follow</option><option value="save" ${state.ctaMode==="save"?"selected":""}>Save</option><option value="comment" ${state.ctaMode==="comment"?"selected":""}>Comment</option><option value="link-in-bio" ${state.ctaMode==="link-in-bio"?"selected":""}>Link in bio</option></select></label></div>${state.mode==="tiktok-carousel"?`<label>Carousel cards<input id="social-carousel-count" type="number" min="3" max="10" value="${state.carouselCount}"></label>`:""}<label>Custom CTA <span class="quiet">optional</span><input id="social-cta" placeholder="Leave blank to use the canonical CTA for the selected type."></label><div class="social-contract"><strong>Locked TikTok framework</strong><p>Full handle ${ACCOUNT} · native text posts ≤250 characters · hook in first 3 seconds · copy-paste-ready captions · exactly five hashtags using 2 broad + 2 niche + 1 #MindsetMediaGroup · single image / carousel / vertical video media rules · accessibility · approval · connector-ready payload.</p></div><div class="social-slices"><strong>Execution slices</strong><ol><li>Objective</li><li>Format</li><li>Hook</li><li>Copy</li><li>Hashtag Pyramid</li><li>Media Brief</li><li>QA & Approval</li><li>Connector Handoff</li></ol></div>${state.error?`<p class="social-error">${esc(state.error)}</p>`:""}<button class="primary" data-prepare ${state.busy?"disabled":""}>${state.busy?"Preparing package…":"Build TikTok Package"}</button>`;
}

function resultView(){
  const p=state.package;
  const pyramid=p.hashtagPyramid;
  return `<div class="social-status"><span>${esc(p.status)}</span><strong>${esc(modes[p.mode]||p.mode)}</strong></div><h3>${esc(p.title)}</h3><div class="social-output"><article><strong>Hook</strong><p>${esc(p.hook)}</p></article>${p.textPost?`<article><strong>Native text post · ${String(p.textPost).length}/250</strong><p>${esc(p.textPost)}</p></article>`:""}<article><strong>Caption</strong><p>${esc(p.body)}</p><p>${esc((p.hashtags||[]).join(" "))}</p></article>${pyramid?`<article><strong>Hashtag pyramid · 2 + 2 + 1</strong><p>Broad: ${esc((pyramid.broad||[]).join(" "))}</p><p>Niche: ${esc((pyramid.niche||[]).join(" "))}</p><p>Brand: ${esc(pyramid.brand||"")}</p></article>`:""}<article><strong>Accessibility</strong><p>${esc(p.accessibilityText)}</p></article><article><strong>Media requirements</strong><pre>${esc(JSON.stringify(p.mediaRequirements||[],null,2))}</pre></article>${p.sequence?.length?`<article><strong>Sequence</strong><pre>${esc(JSON.stringify(p.sequence,null,2))}</pre></article>`:""}${p.retentionRules?`<article><strong>Retention rules</strong><pre>${esc(JSON.stringify(p.retentionRules,null,2))}</pre></article>`:""}${p.measurementPlan?`<article><strong>Measurement</strong><pre>${esc(JSON.stringify(p.measurementPlan,null,2))}</pre></article>`:""}<article><strong>Disclosure</strong><p>Your brand: on · Paid partnership: off · Brand partner: off</p></article></div>${p.productionSlices?.length?`<details open><summary>Production slices</summary><pre>${esc(JSON.stringify(p.productionSlices,null,2))}</pre></details>`:""}<details><summary>Future connector payload</summary><pre>${esc(JSON.stringify(p.connectorReadyPayload,null,2))}</pre></details>${state.error?`<p class="social-error">${esc(state.error)}</p>`:""}<div class="social-actions">${p.approval?.state==="pending"?`<button class="primary" data-decision="approve">Approve Package</button><button data-decision="fix">Request Fix</button><button data-decision="deny">Deny</button>`:""}<button data-new>Build Another</button></div><p class="social-honesty">TikTok connector: not connected yet. No post, upload, or schedule has occurred. Approval prepares the immutable package for the future connector; it does not publish.</p>`;
}

function bind(root){
  root.querySelector("[data-close]").onclick=()=>{state.open=false;draw();};
  root.querySelectorAll("[data-mode]").forEach(button=>button.onclick=()=>{state.mode=button.dataset.mode;draw();});
  root.querySelector("#social-cta-mode")?.addEventListener("change",event=>{state.ctaMode=event.target.value;});
  root.querySelector("#social-carousel-count")?.addEventListener("change",event=>{state.carouselCount=Math.max(3,Math.min(10,Number(event.target.value||5)));});
  root.querySelector("[data-prepare]")?.addEventListener("click",prepare);
  root.querySelectorAll("[data-decision]").forEach(button=>button.onclick=()=>decide(button.dataset.decision));
  root.querySelector("[data-new]")?.addEventListener("click",()=>{state.package=null;state.error="";draw();});
}

async function prepare(){
  const objective=document.querySelector("#social-objective")?.value.trim()||"";
  const audience=document.querySelector("#social-audience")?.value.trim()||"";
  const cta=document.querySelector("#social-cta")?.value.trim()||"";
  const ctaMode=document.querySelector("#social-cta-mode")?.value||state.ctaMode;
  const carouselCount=Number(document.querySelector("#social-carousel-count")?.value||state.carouselCount||5);
  if(objective.length<8){state.error="Describe the content objective before production begins.";draw();return;}
  state.ctaMode=ctaMode;
  state.carouselCount=carouselCount;
  await run("/api/social-production/prepare",{mode:state.mode,objective,audience,cta,ctaMode,carouselCount,sourceCard:state.sourceCard},body=>state.package=body.socialPackage);
}

async function decide(decision){
  let note="";
  if(decision==="fix"){note=window.prompt("What should Kairos correct?")||"";if(!note)return;}
  await run("/api/social-production/decide",{packageID:state.package.id,decision,note,actor:"Executive"},body=>state.package=body.socialPackage);
}

async function run(url,payload,onSuccess){
  state.busy=true;state.error="";draw();
  try{const response=await fetch(url,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Social production failed.");onSuccess(body);}
  catch(error){state.error=error.message||"Social production failed.";}
  finally{state.busy=false;draw();}
}

function esc(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}
