const BUILD="kairos-social-production-ui-20260807-4-tiktok-connector";
const ACCOUNT="@mindset.media.group";
const CONNECTOR_ROOT="/api/social-connectors/tiktok";
const state={open:false,busy:false,connectorBusy:false,error:"",connectorError:"",package:null,connector:null,receipt:null,mode:"tiktok-single-image",sourceCard:"social-production",carouselCount:5,ctaMode:"follow",handoffMode:"upload"};
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
  state.receipt=null;
  state.error="";
  state.connectorError="";
  draw();
  loadConnectorStatus();
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
  overlay.innerHTML=`<section class="social-production-panel"><header><div><p class="eyebrow">Content Center · TikTok Production</p><h2>${ACCOUNT}</h2><p>Build, approve, and hand off TikTok packages through the governed connector. TikTok access tokens stay server-side.</p></div><button data-close aria-label="Close Social Production">×</button></header>${connectorView()}${state.package?resultView():formView()}</section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function connectorView(){
  if(state.connectorBusy&&!state.connector)return `<section class="tiktok-connector-card"><div><p class="eyebrow">TikTok Connector</p><strong>Checking connection…</strong></div></section>`;
  if(state.connectorError&&!state.connector)return `<section class="tiktok-connector-card is-warning"><div><p class="eyebrow">TikTok Connector</p><strong>Connector status unavailable</strong><p>${esc(state.connectorError)}</p></div><button type="button" data-connector-refresh>Retry</button></section>`;
  const c=state.connector;
  if(!c)return `<section class="tiktok-connector-card"><div><p class="eyebrow">TikTok Connector</p><strong>Loading connector state…</strong></div></section>`;
  if(!c.configured){
    return `<section class="tiktok-connector-card is-warning"><div><p class="eyebrow">TikTok Connector</p><strong>App configuration required</strong><p>Runtime is installed, but TikTok client credentials and/or configuration are incomplete. No token or publishing claim is being made.</p><p class="connector-meta">Required account: ${esc(c.expectedAccount||ACCOUNT)} · Direct Post audit: ${c.directPostAudited?"complete":"not complete"} · Verified media origins: ${esc((c.verifiedMediaOrigins||[]).join(", ")||"none")}</p></div><button type="button" data-connector-refresh>Recheck</button></section>`;
  }
  if(!c.connected){
    return `<section class="tiktok-connector-card"><div><p class="eyebrow">TikTok Connector</p><strong>Ready to authorize ${esc(c.expectedAccount||ACCOUNT)}</strong><p>Connect the exact TikTok account. Authorization opens TikTok directly; Kairos stores tokens only in its server-side connector vault.</p></div><div class="connector-actions"><button class="primary compact" type="button" data-connect-tiktok ${state.connectorBusy?"disabled":""}>${state.connectorBusy?"Connecting…":"Connect TikTok"}</button><button type="button" data-connector-refresh>Refresh</button></div></section>`;
  }
  const creator=c.creator;
  return `<section class="tiktok-connector-card is-connected"><div><p class="eyebrow">TikTok Connector · Connected</p><strong>${esc(creator?.creator_nickname||c.profile?.display_name||c.expectedAccount||ACCOUNT)}</strong><p>${esc(creator?.creator_username?`@${creator.creator_username}`:c.expectedAccount||ACCOUNT)} · Account match: ${c.accountMatch?"verified":"not verified"}</p><p class="connector-meta">Upload: ${c.capabilities?.videoUpload?"ready":"blocked"} · Direct Post: ${c.capabilities?.directVideo?"ready":"audit/configuration gated"} · Analytics: ${c.capabilities?.analyticsReadback?"ready":"scope gated"}</p></div><div class="connector-actions"><button type="button" data-creator-refresh ${state.connectorBusy?"disabled":""}>Refresh Account</button><button type="button" data-disconnect-tiktok ${state.connectorBusy?"disabled":""}>Disconnect</button></div></section>${state.connectorError?`<p class="social-error">${esc(state.connectorError)}</p>`:""}`;
}

function formView(){
  const source=cardEntries[state.sourceCard];
  return `${source?`<div class="social-contract"><strong>Source card</strong><p>${esc(source.note)}</p></div>`:""}<div class="social-mode-grid">${Object.entries(modes).map(([id,label])=>`<button type="button" data-mode="${id}" class="${state.mode===id?"active":""}">${label}</button>`).join("")}</div><label>Content objective<textarea id="social-objective" maxlength="8000" placeholder="Describe the topic, audience problem, useful outcome, and intended action."></textarea></label><div class="social-two"><label>Audience<input id="social-audience" value="creators, entrepreneurs, authors, and small businesses"></label><label>CTA type<select id="social-cta-mode"><option value="follow" ${state.ctaMode==="follow"?"selected":""}>Follow</option><option value="save" ${state.ctaMode==="save"?"selected":""}>Save</option><option value="comment" ${state.ctaMode==="comment"?"selected":""}>Comment</option><option value="link-in-bio" ${state.ctaMode==="link-in-bio"?"selected":""}>Link in bio</option></select></label></div>${state.mode==="tiktok-carousel"?`<label>Carousel cards<input id="social-carousel-count" type="number" min="3" max="10" value="${state.carouselCount}"></label>`:""}<label>Custom CTA <span class="quiet">optional</span><input id="social-cta" placeholder="Leave blank to use the canonical CTA for the selected type."></label><div class="social-contract"><strong>Locked TikTok framework</strong><p>Full handle ${ACCOUNT} · native text posts ≤250 characters · hook in first 3 seconds · copy-paste-ready captions · exactly five hashtags using 2 broad + 2 niche + 1 #MindsetMediaGroup · single image / carousel / vertical video media rules · accessibility · approval · connector-ready payload.</p></div><div class="social-slices"><strong>Execution slices</strong><ol><li>Objective</li><li>Format</li><li>Hook</li><li>Copy</li><li>Hashtag Pyramid</li><li>Media Brief</li><li>QA & Approval</li><li>Connector Handoff</li></ol></div>${state.error?`<p class="social-error">${esc(state.error)}</p>`:""}<button class="primary" data-prepare ${state.busy?"disabled":""}>${state.busy?"Preparing package…":"Build TikTok Package"}</button>`;
}

function resultView(){
  const p=state.package;
  const pyramid=p.hashtagPyramid;
  return `<div class="social-status"><span>${esc(p.status)}</span><strong>${esc(modes[p.mode]||p.mode)}</strong></div><h3>${esc(p.title)}</h3><div class="social-output"><article><strong>Hook</strong><p>${esc(p.hook)}</p></article>${p.textPost?`<article><strong>Native text post · ${String(p.textPost).length}/250</strong><p>${esc(p.textPost)}</p></article>`:""}<article><strong>Caption</strong><p>${esc(p.body)}</p><p>${esc((p.hashtags||[]).join(" "))}</p></article>${pyramid?`<article><strong>Hashtag pyramid · 2 + 2 + 1</strong><p>Broad: ${esc((pyramid.broad||[]).join(" "))}</p><p>Niche: ${esc((pyramid.niche||[]).join(" "))}</p><p>Brand: ${esc(pyramid.brand||"")}</p></article>`:""}<article><strong>Accessibility</strong><p>${esc(p.accessibilityText)}</p></article><article><strong>Media requirements</strong><pre>${esc(JSON.stringify(p.mediaRequirements||[],null,2))}</pre></article>${p.sequence?.length?`<article><strong>Sequence</strong><pre>${esc(JSON.stringify(p.sequence,null,2))}</pre></article>`:""}${p.retentionRules?`<article><strong>Retention rules</strong><pre>${esc(JSON.stringify(p.retentionRules,null,2))}</pre></article>`:""}${p.measurementPlan?`<article><strong>Measurement</strong><pre>${esc(JSON.stringify(p.measurementPlan,null,2))}</pre></article>`:""}<article><strong>Disclosure</strong><p>Your brand: on · Paid partnership: off · Brand partner: off</p></article></div>${p.productionSlices?.length?`<details open><summary>Production slices</summary><pre>${esc(JSON.stringify(p.productionSlices,null,2))}</pre></details>`:""}<details><summary>Connector payload source contract</summary><pre>${esc(JSON.stringify(p.connectorReadyPayload,null,2))}</pre></details>${p.approval?.state==="approved"?handoffView(p):""}${state.error?`<p class="social-error">${esc(state.error)}</p>`:""}<div class="social-actions">${p.approval?.state==="pending"?`<button class="primary" data-decision="approve">Approve Package</button><button data-decision="fix">Request Fix</button><button data-decision="deny">Deny</button>`:""}<button data-new>Build Another</button></div><p class="social-honesty">The production package remains immutable and retains <code>publish:false</code>. A separate authenticated connector action is required for any TikTok export.</p>`;
}

function handoffView(p){
  if(p.mode==="tiktok-text")return `<section class="connector-handoff is-manual"><p class="eyebrow">Connector Handoff</p><h3>Manual TikTok native text handoff</h3><p>TikTok’s Content Posting API does not expose native text-post publishing. Copy the approved text post into TikTok manually; Kairos will not pretend this format was API-published.</p><div class="manual-copy"><strong>${String(p.textPost||"").length}/250</strong><p>${esc(p.textPost||"")}</p></div></section>`;
  if(state.receipt)return receiptView(state.receipt);
  const c=state.connector;
  if(!c?.configured||!c?.connected||!c?.accountMatch)return `<section class="connector-handoff is-blocked"><p class="eyebrow">Connector Handoff</p><h3>TikTok connector not ready</h3><p>Approve the package now; connect and verify ${ACCOUNT} above before export. The approved package will not be rewritten.</p></section>`;
  const directReady=Boolean(p.mode==="tiktok-video"?c.capabilities?.directVideo:c.capabilities?.directPhoto);
  const uploadReady=Boolean(p.mode==="tiktok-video"?c.capabilities?.videoUpload:c.capabilities?.photoUpload);
  if(!uploadReady&&!directReady)return `<section class="connector-handoff is-blocked"><p class="eyebrow">Connector Handoff</p><h3>Authorized account is missing connector capability</h3><p>Required TikTok scopes and at least one verified media origin must be active before handoff.</p></section>`;
  if(state.handoffMode==="direct"&&!directReady)state.handoffMode="upload";
  const count=Number(p.mediaRequirements?.[0]?.count||1);
  const creator=c.creator||{};
  const privacy=Array.isArray(creator.privacy_level_options)?creator.privacy_level_options:[];
  const privacyOptions=privacy.map(value=>`<option value="${esc(value)}">${esc(privacyLabel(value))}</option>`).join("");
  const isVideo=p.mode==="tiktok-video";
  const isPhoto=!isVideo;
  return `<section class="connector-handoff"><p class="eyebrow">Connector Handoff · ${ACCOUNT}</p><h3>Export approved package to TikTok</h3><p>Choose how TikTok receives this already-approved package. Upload sends the media into TikTok for final editing/posting. Direct Post is available only after TikTok client audit and creator capability verification.</p><div class="handoff-mode-grid"><button type="button" data-handoff-mode="upload" class="${state.handoffMode==="upload"?"active":""}" ${uploadReady?"":"disabled"}>Upload to TikTok</button><button type="button" data-handoff-mode="direct" class="${state.handoffMode==="direct"?"active":""}" ${directReady?"":"disabled"}>Direct Post${c.directPostAudited?"":" · audit gated"}</button></div><label>Verified media URL${count===1?"":"s"} · exactly ${count}<textarea id="tiktok-media-urls" class="connector-url-input" placeholder="One HTTPS media URL per line. Each URL must use a TikTok-verified domain or URL prefix."></textarea></label>${state.handoffMode==="direct"?`<div class="social-two"><label>Privacy<select id="tiktok-privacy">${privacyOptions}</select></label>${isPhoto?`<label>Photo cover index<input id="tiktok-cover-index" type="number" min="0" max="${Math.max(0,count-1)}" value="0"></label>`:"<span></span>"}</div><div class="connector-check-grid"><label class="check-row"><input id="tiktok-disable-comments" type="checkbox" ${creator.comment_disabled?"checked disabled":""}><span>Disable comments${creator.comment_disabled?" · required by TikTok account":""}</span></label>${isVideo?`<label class="check-row"><input id="tiktok-disable-duet" type="checkbox" ${creator.duet_disabled?"checked disabled":""}><span>Disable Duet${creator.duet_disabled?" · required":""}</span></label><label class="check-row"><input id="tiktok-disable-stitch" type="checkbox" ${creator.stitch_disabled?"checked disabled":""}><span>Disable Stitch${creator.stitch_disabled?" · required":""}</span></label><label class="check-row"><input id="tiktok-is-aigc" type="checkbox"><span>Mark content as AI-generated when applicable</span></label>`:`<label class="check-row"><input id="tiktok-auto-music" type="checkbox"><span>Allow TikTok to add music automatically</span></label>`}</div>`:""}<div class="connector-check-grid required"><label class="check-row"><input id="tiktok-brand-organic" type="checkbox" checked><span>This post promotes our own brand/business</span></label><label class="check-row"><input id="tiktok-guidelines" type="checkbox"><span>I confirm the media follows TikTok Content Sharing Guidelines and contains no prohibited watermark/logo/promotional overlay.</span></label><label class="check-row"><input id="tiktok-consent" type="checkbox"><span>I explicitly consent to export this approved package to TikTok now.</span></label></div>${state.handoffMode==="upload"&&isVideo?`<p class="connector-note">TikTok’s video upload endpoint sends the video into the TikTok inbox/editor. The approved caption remains visible here for manual transfer because that upload endpoint does not accept caption text.</p>`:""}<button class="primary" type="button" data-tiktok-publish ${state.connectorBusy?"disabled":""}>${state.connectorBusy?"Sending to TikTok…":state.handoffMode==="direct"?"Publish Approved Package":"Upload Approved Package"}</button></section>`;
}

function receiptView(receipt){
  const metrics=Array.isArray(receipt.metrics)?receipt.metrics:[];
  return `<section class="connector-handoff receipt"><p class="eyebrow">TikTok Connector Receipt</p><h3>${esc(receipt.state||"processing")}</h3><div class="receipt-grid"><div><span>Package</span><strong>${esc(receipt.packageID||"")}</strong></div><div><span>Account</span><strong>${esc(receipt.account||ACCOUNT)}</strong></div><div><span>Handoff</span><strong>${esc(receipt.handoffMode||"")}</strong></div><div><span>Publish ID</span><strong>${esc(receipt.publishId||"")}</strong></div></div>${receipt.captionManualTransferRequired?`<p class="connector-note">Video uploaded to TikTok. Copy the approved caption from this package into TikTok before final posting.</p>`:""}${metrics.length?`<div class="metric-grid">${metrics.map(item=>`<div><strong>${Number(item.views||0).toLocaleString()}</strong><span>Views</span><strong>${Number(item.shares||0).toLocaleString()}</strong><span>Shares</span><strong>${Number(item.likes||0).toLocaleString()}</strong><span>Likes</span></div>`).join("")}</div>`:""}<details><summary>Verified receipt data</summary><pre>${esc(JSON.stringify(receipt,null,2))}</pre></details><button type="button" data-receipt-refresh ${state.connectorBusy?"disabled":""}>${state.connectorBusy?"Refreshing…":"Refresh TikTok Status"}</button></section>`;
}

function bind(root){
  root.querySelector("[data-close]").onclick=()=>{state.open=false;draw();};
  root.querySelectorAll("[data-mode]").forEach(button=>button.onclick=()=>{state.mode=button.dataset.mode;draw();});
  root.querySelector("#social-cta-mode")?.addEventListener("change",event=>{state.ctaMode=event.target.value;});
  root.querySelector("#social-carousel-count")?.addEventListener("change",event=>{state.carouselCount=Math.max(3,Math.min(10,Number(event.target.value||5)));});
  root.querySelector("[data-prepare]")?.addEventListener("click",prepare);
  root.querySelectorAll("[data-decision]").forEach(button=>button.onclick=()=>decide(button.dataset.decision));
  root.querySelector("[data-new]")?.addEventListener("click",()=>{state.package=null;state.receipt=null;state.error="";draw();});
  root.querySelector("[data-connector-refresh]")?.addEventListener("click",loadConnectorStatus);
  root.querySelector("[data-connect-tiktok]")?.addEventListener("click",connectTikTok);
  root.querySelector("[data-disconnect-tiktok]")?.addEventListener("click",disconnectTikTok);
  root.querySelector("[data-creator-refresh]")?.addEventListener("click",refreshCreator);
  root.querySelectorAll("[data-handoff-mode]").forEach(button=>button.addEventListener("click",()=>{state.handoffMode=button.dataset.handoffMode;draw();}));
  root.querySelector("[data-tiktok-publish]")?.addEventListener("click",publishTikTok);
  root.querySelector("[data-receipt-refresh]")?.addEventListener("click",refreshReceipt);
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
  await run("/api/social-production/prepare",{mode:state.mode,objective,audience,cta,ctaMode,carouselCount,sourceCard:state.sourceCard},body=>{state.package=body.socialPackage;state.receipt=null;});
}

async function decide(decision){
  let note="";
  if(decision==="fix"){note=window.prompt("What should Kairos correct?")||"";if(!note)return;}
  await run("/api/social-production/decide",{packageID:state.package.id,decision,note,actor:"Executive"},body=>{state.package=body.socialPackage;state.receipt=null;});
  if(decision==="approve")await loadConnectorStatus();
}

async function loadConnectorStatus(){
  if(!state.open)return;
  state.connectorBusy=true;state.connectorError="";draw();
  try{const body=await connectorJSON(`${CONNECTOR_ROOT}/status`);state.connector=body.connector||null;}
  catch(error){state.connectorError=error.message||"TikTok connector status failed.";}
  finally{state.connectorBusy=false;draw();}
}

async function connectTikTok(){
  const popup=window.open("about:blank","kairos-tiktok-connect","width=620,height=760,resizable=yes,scrollbars=yes");
  if(!popup){state.connectorError="Allow pop-ups for Kairos to open TikTok authorization.";draw();return;}
  state.connectorBusy=true;state.connectorError="";draw();
  try{
    const body=await connectorJSON(`${CONNECTOR_ROOT}/connect-url`,{method:"POST",body:{}});
    if(!body.authorizeUrl)throw new Error("TikTok authorization URL was not returned.");
    popup.location.href=body.authorizeUrl;
    await pollConnection(popup);
  }catch(error){try{popup.close();}catch{}state.connectorError=error.message||"TikTok connection failed.";}
  finally{state.connectorBusy=false;draw();}
}

async function pollConnection(popup){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    await delay(2500);
    try{
      const body=await connectorJSON(`${CONNECTOR_ROOT}/status`);
      state.connector=body.connector||null;
      if(state.connector?.connected&&state.connector?.accountMatch){try{popup.close();}catch{}return;}
    }catch{}
    if(popup.closed)break;
  }
  const body=await connectorJSON(`${CONNECTOR_ROOT}/status`);
  state.connector=body.connector||null;
  if(!state.connector?.connected)throw new Error("TikTok authorization was not completed.");
}

async function disconnectTikTok(){
  if(!window.confirm("Disconnect TikTok from Kairos? Stored TikTok connector tokens will be deleted."))return;
  state.connectorBusy=true;state.connectorError="";draw();
  try{const body=await connectorJSON(`${CONNECTOR_ROOT}/disconnect`,{method:"POST",body:{}});state.connector=body.connector||null;state.receipt=null;}
  catch(error){state.connectorError=error.message||"TikTok disconnect failed.";}
  finally{state.connectorBusy=false;draw();}
}

async function refreshCreator(){
  state.connectorBusy=true;state.connectorError="";draw();
  try{const body=await connectorJSON(`${CONNECTOR_ROOT}/creator-info`,{method:"POST",body:{}});state.connector=body.connector||state.connector;}
  catch(error){state.connectorError=error.message||"TikTok creator verification failed.";}
  finally{state.connectorBusy=false;draw();}
}

async function publishTikTok(){
  const urls=(document.querySelector("#tiktok-media-urls")?.value||"").split(/\n+/).map(value=>value.trim()).filter(Boolean);
  const explicitConsent=Boolean(document.querySelector("#tiktok-consent")?.checked);
  const mediaGuidelinesConfirmed=Boolean(document.querySelector("#tiktok-guidelines")?.checked);
  const creator=state.connector?.creator||{};
  const privacyLevel=document.querySelector("#tiktok-privacy")?.value||"";
  const payload={
    packageID:state.package.id,
    handoffMode:state.handoffMode,
    mediaUrls:urls,
    privacyLevel,
    disableComment:Boolean(document.querySelector("#tiktok-disable-comments")?.checked||creator.comment_disabled),
    disableDuet:Boolean(document.querySelector("#tiktok-disable-duet")?.checked||creator.duet_disabled),
    disableStitch:Boolean(document.querySelector("#tiktok-disable-stitch")?.checked||creator.stitch_disabled),
    autoAddMusic:Boolean(document.querySelector("#tiktok-auto-music")?.checked),
    isAigc:Boolean(document.querySelector("#tiktok-is-aigc")?.checked),
    brandOrganic:Boolean(document.querySelector("#tiktok-brand-organic")?.checked),
    photoCoverIndex:Number(document.querySelector("#tiktok-cover-index")?.value||0),
    explicitConsent,
    mediaGuidelinesConfirmed
  };
  state.connectorBusy=true;state.connectorError="";state.error="";draw();
  try{const body=await connectorJSON(`${CONNECTOR_ROOT}/publish`,{method:"POST",body:payload});state.receipt=body.receipt||null;state.connector=body.connector||state.connector;}
  catch(error){state.error=error.message||"TikTok handoff failed.";}
  finally{state.connectorBusy=false;draw();}
}

async function refreshReceipt(){
  if(!state.package?.id)return;
  state.connectorBusy=true;state.error="";draw();
  try{const body=await connectorJSON(`${CONNECTOR_ROOT}/receipt/refresh`,{method:"POST",body:{packageID:state.package.id}});state.receipt=body.receipt||state.receipt;}
  catch(error){state.error=error.message||"TikTok status refresh failed.";}
  finally{state.connectorBusy=false;draw();}
}

async function connectorJSON(url,options={}){
  const token=await shopifyAdminToken();
  const headers={Accept:"application/json",Authorization:`Bearer ${token}`,"X-MMG-Client-Build":BUILD};
  const request={method:options.method||"GET",headers,cache:"no-store",credentials:"omit"};
  if(options.body!==undefined){headers["Content-Type"]="application/json";request.body=JSON.stringify(options.body);}
  const response=await fetch(url,request);
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error?.message||`TikTok connector failed (${response.status}).`);
  return body;
}

async function shopifyAdminToken(){
  if(!window.shopify||typeof window.shopify.idToken!=="function")throw new Error("Open Kairos from Shopify Admin to use the TikTok connector.");
  const token=await window.shopify.idToken();
  if(typeof token!=="string"||!token)throw new Error("Shopify Admin authentication failed.");
  return token;
}

async function run(url,payload,onSuccess){
  state.busy=true;state.error="";draw();
  try{const response=await fetch(url,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Social production failed.");onSuccess(body);}
  catch(error){state.error=error.message||"Social production failed.";}
  finally{state.busy=false;draw();}
}

function privacyLabel(value){return ({PUBLIC_TO_EVERYONE:"Public",MUTUAL_FOLLOW_FRIENDS:"Friends",FOLLOWER_OF_CREATOR:"Followers",SELF_ONLY:"Only me"})[value]||value;}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function esc(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}
