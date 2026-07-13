const BUILD = "manuscript-studio-20260712-1";
const state = { open:false, working:false, result:null, error:"", title:"", manuscript:"" };

function mount(){
  const button=document.createElement("button");
  button.className="manuscript-launch";
  button.textContent="Open Manuscript Studio";
  button.onclick=()=>{state.open=true;render();};
  document.body.appendChild(button);
  render();
}

function render(){
  document.querySelector("#manuscript-studio-overlay")?.remove();
  if(!state.open)return;
  const overlay=document.createElement("div");
  overlay.id="manuscript-studio-overlay";
  overlay.className="manuscript-overlay";
  overlay.innerHTML=`<section class="manuscript-panel"><header><div><p class="eyebrow">Customer Portal · Publishing</p><h2>Manuscript Studio</h2><p>Upload a text manuscript or paste manuscript text for editorial correction and MMG KDP-readiness review.</p></div><button data-close aria-label="Close">×</button></header>${state.result?resultView():inputView()}</section>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close]").onclick=()=>{state.open=false;render();};
  overlay.querySelector("[data-review]")?.addEventListener("click",runReview);
  overlay.querySelector("[data-file]")?.addEventListener("change",loadFile);
  overlay.querySelector("[data-edit]")?.addEventListener("click",()=>{state.result=null;render();});
  overlay.querySelector("[data-approve]")?.addEventListener("click",approveRevision);
  overlay.querySelector("[data-download]")?.addEventListener("click",downloadRevision);
}

function inputView(){return `<div class="manuscript-grid"><label>Publication title<input id="ms-title" maxlength="200" value="${esc(state.title)}" placeholder="Book title"></label><label>Text manuscript<input data-file type="file" accept=".txt,.md,.rtf,text/plain,text/markdown,application/rtf"></label></div><label>Manuscript text<textarea id="ms-body" maxlength="180000" placeholder="Paste the manuscript here or load a TXT, MD, or RTF file.">${esc(state.manuscript)}</textarea></label><p class="manuscript-note">The original text stays in this browser session until submitted. DOCX and PDF binary extraction are not yet enabled in this adapter.</p>${state.error?`<p class="manuscript-error">${esc(state.error)}</p>`:""}<button class="primary" data-review ${state.working?"disabled":""}>${state.working?"Kairos is reviewing…":"Run Editorial & KDP Review"}</button>`}

function resultView(){const r=state.result.result||{};const issues=Array.isArray(r.issues)?r.issues:[];const readiness=r.kdpReadiness||{};return `<div class="manuscript-result"><div class="manuscript-status"><span>Customer review required</span><strong>${esc(readiness.status||"review_complete")}</strong></div><h3>${esc(r.summary||"Editorial review complete")}</h3><p>${issues.length} issue${issues.length===1?"":"s"} identified.</p><div class="issue-list">${issues.slice(0,100).map(i=>`<article><b>${esc(i.category||"Editorial")} · ${esc(i.severity||"review")}</b><p>${esc(i.problem||"")}</p><small>${esc(i.location||"")} ${esc(i.recommendation||"")}</small></article>`).join("")||"<p>No specific issues returned.</p>"}</div><label>Proposed revised manuscript<textarea id="ms-revised">${esc(r.revisedManuscript||state.manuscript)}</textarea></label><p class="manuscript-note">${esc(r.disclaimer||"This is an MMG KDP-readiness review. Amazon KDP makes final acceptance decisions.")}</p><div class="manuscript-actions"><button class="primary" data-approve>Approve Revision</button><button class="secondary" data-edit>Revise Request</button><button class="secondary" data-download>Download Proposed TXT</button></div></div>`}

async function loadFile(e){const file=e.target.files?.[0];if(!file)return;const allowed=/\.(txt|md|rtf)$/i.test(file.name);if(!allowed){state.error="This live adapter accepts TXT, MD, or RTF files.";render();return;}state.manuscript=await file.text();if(!state.title)state.title=file.name.replace(/\.[^.]+$/,"");render();}

async function runReview(){state.title=document.querySelector("#ms-title")?.value.trim()||"Untitled manuscript";state.manuscript=document.querySelector("#ms-body")?.value||"";if(state.manuscript.trim().length<50){state.error="Provide at least 50 characters of manuscript text.";render();return;}state.working=true;state.error="";render();try{const response=await fetch("/api/manuscript/review",{method:"POST",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},credentials:"include",body:JSON.stringify({title:state.title,manuscript:state.manuscript})});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"The manuscript review failed.");state.result=body;sessionStorage.setItem("mmg.manuscript.review",JSON.stringify({title:state.title,result:body}));}catch(error){state.error=error.message||"The manuscript review failed.";}finally{state.working=false;render();}}

function approveRevision(){const revised=document.querySelector("#ms-revised")?.value||"";state.result.approvedAt=new Date().toISOString();state.result.approvedManuscript=revised;state.result.status="revision_approved";sessionStorage.setItem("mmg.manuscript.approved",JSON.stringify({title:state.title,reviewID:state.result.reviewID,approvedAt:state.result.approvedAt,manuscript:revised}));downloadText(revised,`${safeName(state.title)}-mmg-approved.txt`);render();}
function downloadRevision(){downloadText(document.querySelector("#ms-revised")?.value||state.result?.result?.revisedManuscript||"",`${safeName(state.title)}-proposed-revision.txt`);}
function downloadText(text,name){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function safeName(v){return String(v||"manuscript").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"manuscript";}
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}

mount();
