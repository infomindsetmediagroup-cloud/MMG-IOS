const BUILD="kairos-publication-catalog-ui-20260713-1";
const ACTIVE_KEY="kairos.production.active-workspace";
let state={record:null,busy:false,error:""};

async function enhance(){
  const submission=document.querySelector("#manuscript-platform-submission");
  if(!submission||document.querySelector("#publication-catalog"))return;
  const projectId=activeProjectId();if(!projectId)return;
  const section=document.createElement("section");
  section.id="publication-catalog";
  section.className="publication-catalog";
  section.innerHTML='<p class="eyebrow">Publication catalog</p><h3>Loading Canonical Publication Record…</h3>';
  submission.insertAdjacentElement("afterend",section);
  await load(projectId);
}

async function load(projectId){
  state.busy=true;state.error="";render(projectId);
  try{
    const response=await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/publication-catalog`,{credentials:"include",cache:"no-store"});
    const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Publication catalog could not be loaded.");
    state.record=body.publication||null;
  }catch(error){state.error=error?.message||"Publication catalog could not be loaded.";}
  finally{state.busy=false;render(projectId);}
}

function render(projectId){
  const section=document.querySelector("#publication-catalog");if(!section)return;
  if(state.busy){section.innerHTML='<p class="eyebrow">Publication catalog</p><h3>Updating canonical record…</h3><p class="manuscript-progress">Kairos is preserving identifiers, rights, live URLs, pricing, and publication evidence.</p>';return;}
  if(state.error){section.innerHTML=`<p class="eyebrow">Publication catalog</p><h3>Catalog registry needs attention</h3><p class="manuscript-error">${esc(state.error)}</p><button class="secondary" data-catalog-retry>Retry</button>`;section.querySelector("[data-catalog-retry]")?.addEventListener("click",()=>load(projectId));return;}
  const record=state.record;
  if(!record){
    section.innerHTML=`<p class="eyebrow">Publication catalog</p><h3>Register Canonical Publication</h3><p>After platform acceptance is recorded, create the durable MMG publication asset record. This does not publish or alter an external listing.</p><div class="manuscript-grid"><label>Publication title<input data-cat-title maxlength="240"></label><label>Author<input data-cat-author maxlength="180"></label></div><div class="manuscript-grid"><label>Live publication URL<input data-cat-live type="url" maxlength="2000" placeholder="https://..."></label><label>Publisher URL <small>Optional</small><input data-cat-publisher-url type="url" maxlength="2000" placeholder="https://..."></label></div><div class="manuscript-grid"><label>Release date<input data-cat-release type="date"></label><label>Publication status<select data-cat-status><option value="active">Active</option><option value="preorder">Preorder</option><option value="temporarily-unavailable">Temporarily unavailable</option><option value="out-of-print">Out of print</option></select></label></div><div class="manuscript-grid"><label>Price<input data-cat-price maxlength="40" placeholder="9.99"></label><label>Currency<input data-cat-currency maxlength="3" value="USD"></label></div><div class="manuscript-grid"><label>ISBN<input data-cat-isbn maxlength="17"></label><label>ASIN / platform reference<input data-cat-asin maxlength="80"></label></div><label>Rights owner<input data-cat-rights-owner maxlength="180"></label><label>Rights scope<textarea data-cat-rights-scope maxlength="1000">Worldwide publishing and distribution rights as documented by MMG.</textarea></label><label>Territories <small>Comma-separated</small><input data-cat-territories maxlength="1000" value="Worldwide"></label><label>Rights evidence note<textarea data-cat-rights-note maxlength="4000"></textarea></label><button class="primary" data-cat-prepare>Prepare Catalog Record</button>`;
    section.querySelector("[data-cat-prepare]")?.addEventListener("click",()=>prepare(projectId));return;
  }
  if(record.status==="awaiting-catalog-registration"){
    section.innerHTML=`<p class="eyebrow">Catalog proposal</p><h3>${esc(record.title)}</h3><p>${esc(record.author)} · ${esc(record.platform)} · ${esc(record.publicationStatus)}</p><div class="publication-catalog-proof"><span><strong>${esc(record.identifiers?.isbn||"—")}</strong><small>ISBN</small></span><span><strong>${esc(record.identifiers?.asin||record.platformReference||"—")}</strong><small>platform ID</small></span><span><strong>${esc(record.rights?.owner||"—")}</strong><small>rights owner</small></span></div><p><a href="${esc(record.liveURL)}" target="_blank" rel="noopener">Open live publication evidence</a></p><label>Type ${esc(record.confirmationRequired)}<input data-cat-confirm autocomplete="off"></label><button class="primary" data-cat-register>Register Canonical Publication</button>`;
    section.querySelector("[data-cat-register]")?.addEventListener("click",()=>register(projectId));return;
  }
  if(record.status==="registered"){
    section.innerHTML=`<p class="eyebrow">Canonical publication</p><h3>${esc(record.title)}</h3><p>${esc(record.author)} · ${esc(record.publicationStatus)} · ${esc(record.currency)} ${esc(record.price||"—")}</p><div class="publication-catalog-proof"><span><strong>${esc(record.catalogId)}</strong><small>catalog ID</small></span><span><strong>${esc(record.identifiers?.isbn||"—")}</strong><small>ISBN</small></span><span><strong>${esc(record.identifiers?.asin||record.platformReference||"—")}</strong><small>platform ID</small></span></div><div class="manuscript-grid"><label>Publication status<select data-cat-update-status><option value="active" ${record.publicationStatus==="active"?"selected":""}>Active</option><option value="preorder" ${record.publicationStatus==="preorder"?"selected":""}>Preorder</option><option value="temporarily-unavailable" ${record.publicationStatus==="temporarily-unavailable"?"selected":""}>Temporarily unavailable</option><option value="out-of-print" ${record.publicationStatus==="out-of-print"?"selected":""}>Out of print</option></select></label><label>Live URL<input data-cat-update-live type="url" maxlength="2000" value="${esc(record.liveURL)}"></label></div><div class="manuscript-grid"><label>Price<input data-cat-update-price maxlength="40" value="${esc(record.price||"")}"></label><label>Currency<input data-cat-update-currency maxlength="3" value="${esc(record.currency||"USD")}"></label></div><div class="manuscript-actions"><button class="primary" data-cat-update>Update Publication Record</button><a class="manuscript-package" href="/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/publication-catalog/record" download>Download Permanent Record</a><button class="secondary" data-cat-retire>Retire Publication Record</button></div>`;
    section.querySelector("[data-cat-update]")?.addEventListener("click",()=>updateRecord(projectId));
    section.querySelector("[data-cat-retire]")?.addEventListener("click",()=>retire(projectId));return;
  }
  section.innerHTML=`<p class="eyebrow">Publication catalog</p><h3>${esc(record.status||"Publication record")}</h3><p>${esc(record.retirementNote||"The historical catalog and rights evidence remain preserved.")}</p><a class="manuscript-package" href="/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/publication-catalog/record" download>Download Permanent Record</a>`;
}

async function prepare(id){const q=s=>document.querySelector(s);await run(id,"prepare",{title:q("[data-cat-title]")?.value,author:q("[data-cat-author]")?.value,liveURL:q("[data-cat-live]")?.value,publisherURL:q("[data-cat-publisher-url]")?.value,releaseDate:q("[data-cat-release]")?.value,publicationStatus:q("[data-cat-status]")?.value,price:q("[data-cat-price]")?.value,currency:q("[data-cat-currency]")?.value,isbn:q("[data-cat-isbn]")?.value,asin:q("[data-cat-asin]")?.value,rightsOwner:q("[data-cat-rights-owner]")?.value,rightsScope:q("[data-cat-rights-scope]")?.value,territories:(q("[data-cat-territories]")?.value||"").split(",").map(v=>v.trim()).filter(Boolean),rightsNote:q("[data-cat-rights-note]")?.value,actor:"Executive"});}
async function register(id){await run(id,"register",{confirmation:document.querySelector("[data-cat-confirm]")?.value||"",actor:"Executive"});}
async function updateRecord(id){const q=s=>document.querySelector(s);await run(id,"update",{publicationStatus:q("[data-cat-update-status]")?.value,liveURL:q("[data-cat-update-live]")?.value,price:q("[data-cat-update-price]")?.value,currency:q("[data-cat-update-currency]")?.value,actor:"Executive"});}
async function retire(id){const confirmation=window.prompt("Type RETIRE PUBLICATION RECORD to confirm")||"";const note=window.prompt("Retirement note")||"";await run(id,"retire",{confirmation,note,actor:"Executive"});}
async function run(id,action,payload){state.busy=true;state.error="";render(id);try{const response=await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(id)}/publication-catalog/${action}`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Publication catalog action failed.");state.record=body.publication||null;await window.KairosProductionWorkspace?.refresh?.();}catch(error){state.error=error?.message||"Publication catalog action failed.";}finally{state.busy=false;render(id);}}
function activeProjectId(){try{const active=JSON.parse(sessionStorage.getItem(ACTIVE_KEY)||"null");return active?.workspace==="manuscript-studio"?active.projectId||null:null;}catch{return null;}}
function esc(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener("kairos:production:state-changed",enhance);enhance();
