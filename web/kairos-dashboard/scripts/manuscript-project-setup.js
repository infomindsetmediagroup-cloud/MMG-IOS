const BUILD="kairos-manuscript-project-setup-ui-20260713-1";
const ACTIVE_KEY="kairos.production.active-workspace";
let busy=false,error="",record=null;

function enhance(){
  const result=document.querySelector("#manuscript-studio-overlay .manuscript-result");
  if(!result||result.querySelector("#manuscript-project-setup"))return;
  const projectId=activeProjectId();
  if(!projectId)return;
  const section=document.createElement("section");
  section.id="manuscript-project-setup";
  section.className="manuscript-project-setup";
  section.innerHTML=view(projectId);
  result.appendChild(section);
  bind(section,projectId);
}

function view(projectId){
  if(busy)return `<p class="eyebrow">Project setup</p><h3>Saving production assignment…</h3><p class="manuscript-progress">Kairos is preserving metadata, cover intake, assignments, and milestones.</p>`;
  if(record)return `<p class="eyebrow">Production assignment</p><h3>${esc(record.setup?.status||record.status)}</h3><p>${esc(record.nextAction||"Project setup completed.")}</p><div class="issue-list">${(record.setup?.assignments||[]).map(a=>`<article><b>${esc(a.department)}</b><p>${esc(a.role)}</p><small>${esc(a.status)}</small></article>`).join("")}</div><div class="issue-list">${(record.setup?.milestones||[]).map(m=>`<article><b>${esc(m.label)}</b><p>${esc(m.status)}</p></article>`).join("")}</div><p class="manuscript-note">The project is now stored in the durable production registry and can be resumed across sessions and devices.</p>`;
  return `<p class="eyebrow">Next stage</p><h3>Complete Project Setup</h3><p>Confirm publication metadata, choose the approved service, upload the customer-supplied cover, and assign the project into production.</p><div class="manuscript-grid"><label>Author name<input data-setup-author maxlength="160" placeholder="Author name"></label><label>Publication title<input data-setup-title maxlength="240" value="${esc(currentTitle())}" placeholder="Publication title"></label></div><div class="manuscript-grid"><label>Publishing service<select data-setup-service><option value="">Select service</option><option value="manuscript-correction">Manuscript Correction</option><option value="editorial-production">Editorial Production</option><option value="complete-publishing-package">Complete Publishing Package</option><option value="digital-edition-production">Digital Edition Production</option></select></label><label>Edition<select data-setup-edition><option value="multi-format">Multi-format</option><option value="ebook">eBook</option><option value="paperback">Paperback</option><option value="hardcover">Hardcover</option><option value="digital-pdf">Digital PDF</option></select></label></div><div class="manuscript-grid"><label>Trim size<input data-setup-trim value="6x9" maxlength="40"></label><label>ISBN status<select data-setup-isbn><option value="not-decided">Not decided</option><option value="customer-supplied">Customer supplied</option><option value="kdp-free">KDP free ISBN</option><option value="not-required">Not required</option></select></label></div><label>Customer-supplied cover<input data-setup-cover type="file" accept="image/png,image/jpeg"><small>PNG or JPEG, up to 8 MB. No cover generation is used.</small></label><label>Production notes<textarea data-setup-notes maxlength="4000" placeholder="Special instructions, deadlines, edition notes, or customer requirements."></textarea></label>${error?`<p class="manuscript-error">${esc(error)}</p>`:""}<button class="primary" data-setup-submit>Save Setup & Assign Production</button>`;
}

function bind(section,projectId){section.querySelector("[data-setup-submit]")?.addEventListener("click",()=>submit(section,projectId));}
async function submit(section,projectId){
  const author=section.querySelector("[data-setup-author]")?.value.trim()||"";
  const title=section.querySelector("[data-setup-title]")?.value.trim()||"";
  const service=section.querySelector("[data-setup-service]")?.value||"";
  if(!author)return fail("Enter the author name.");if(!title)return fail("Enter the publication title.");if(!service)return fail("Select the approved publishing service.");
  busy=true;error="";refresh();
  try{
    const form=new FormData();form.append("authorName",author);form.append("publicationTitle",title);form.append("service",service);form.append("edition",section.querySelector("[data-setup-edition]")?.value||"multi-format");form.append("trimSize",section.querySelector("[data-setup-trim]")?.value||"6x9");form.append("isbnStatus",section.querySelector("[data-setup-isbn]")?.value||"not-decided");form.append("notes",section.querySelector("[data-setup-notes]")?.value||"");const cover=section.querySelector("[data-setup-cover]")?.files?.[0];if(cover)form.append("cover",cover,cover.name);
    const response=await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`,{method:"POST",credentials:"include",headers:{"X-MMG-Client-Build":BUILD},body:form});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"Project setup failed.");record=body;window.KairosProductionWorkspace?.refresh?.();
  }catch(x){error=x?.message||"Project setup failed.";}finally{busy=false;refresh();}
}
function refresh(){document.querySelector("#manuscript-project-setup")?.remove();enhance();}
function fail(message){error=message;refresh();}
function activeProjectId(){try{const active=JSON.parse(sessionStorage.getItem(ACTIVE_KEY)||"null");return active?.workspace==="manuscript-studio"?active.projectId||null:null;}catch{return null;}}
function currentTitle(){return document.querySelector("#manuscript-studio-overlay .manuscript-result h3")?.textContent?.trim()||"";}
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});enhance();
