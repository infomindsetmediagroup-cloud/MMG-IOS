const BUILD = "manuscript-studio-20260713-3";
const MAX_TEXT_CHARS = 180000;
const MAX_DOCX_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 400;
const ACTIVE_KEY = "kairos.production.active-workspace";
const state = { open:false, working:false, extracting:false, storing:false, result:null, error:"", title:"", manuscript:"", source:null, projectId:null };

const LIBRARIES = {
  mammoth: ["https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm", "https://esm.sh/mammoth@1.8.0"],
  pdfjs: ["https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs", "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs"]
};

window.addEventListener("kairos:manuscript:restore", event => {
  const detail = event.detail || {};
  state.projectId = detail.project?.projectId || detail.source?.projectId || null;
  state.title = detail.project?.title || detail.source?.title || "Untitled manuscript";
  state.manuscript = String(detail.manuscript || "");
  state.source = detail.source ? normalizeSource(detail.source) : null;
  state.result = null;
  state.error = "";
  state.open = true;
  render();
});

function mount(){
  const button=document.createElement("button");
  button.className="manuscript-launch";
  button.textContent="Open Manuscript Studio";
  button.onclick=()=>{state.open=true;state.projectId=state.projectId||activeProjectId();render();};
  document.body.appendChild(button);
  render();
}

function render(){
  document.querySelector("#manuscript-studio-overlay")?.remove();
  if(!state.open)return;
  const overlay=document.createElement("div");
  overlay.id="manuscript-studio-overlay";
  overlay.className="manuscript-overlay";
  overlay.innerHTML=`<section class="manuscript-panel"><header><div><p class="eyebrow">Customer Portal · Publishing</p><h2>Manuscript Studio</h2><p>Upload a manuscript, preserve the original source, and advance it directly into MMG production intake.</p></div><button data-close aria-label="Close">×</button></header>${state.result?resultView():inputView()}</section>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close]").onclick=()=>{state.open=false;window.dispatchEvent(new CustomEvent("kairos:production:close"));render();};
  overlay.querySelector("[data-advance]")?.addEventListener("click",runIntake);
  overlay.querySelector("[data-file]")?.addEventListener("change",loadFile);
  overlay.querySelector("[data-edit]")?.addEventListener("click",()=>{state.result=null;render();});
  overlay.querySelector("[data-finish]")?.addEventListener("click",()=>{state.open=false;window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));render();});
}

function inputView(){
  const source=state.source?`<p class="manuscript-source"><strong>Durable source:</strong> ${esc(state.source.name)} · ${esc(state.source.format.toUpperCase())} · ${formatBytes(state.source.size)}${state.source.pages?` · ${state.source.pages} pages`:""} · ${state.source.stored?"stored and verified":"awaiting storage"}</p>`:"";
  const busy=state.working||state.extracting||state.storing;
  const label=state.extracting?"Extracting file…":state.storing?"Preserving source…":state.working?"Creating production intake…":"Continue to Production Intake";
  return `<div class="manuscript-grid"><label>Publication title<input id="ms-title" maxlength="200" value="${esc(state.title)}" placeholder="Book title"></label><label>Manuscript file<input data-file type="file" accept=".txt,.md,.rtf,.docx,.pdf,text/plain,text/markdown,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"></label></div>${source}<label>Extracted manuscript text<textarea id="ms-body" maxlength="${MAX_TEXT_CHARS}" placeholder="Paste text or load TXT, MD, RTF, DOCX, or a text-based PDF.">${esc(state.manuscript)}</textarea></label><p class="manuscript-note">The original source and extracted text are preserved in the Kairos project runtime for cross-session and cross-device recovery. Scanned or image-only PDFs are rejected because OCR is not enabled.</p>${busy?`<p class="manuscript-progress">${label}</p>`:""}${state.error?`<p class="manuscript-error">${esc(state.error)}</p>`:""}<button class="primary" data-advance ${busy?"disabled":""}>${label}</button>`;
}

function resultView(){
  const r=state.result||{};
  const actions=r.workflow?.requiredNextActions||[];
  return `<div class="manuscript-result"><div class="manuscript-status"><span>Production intake created</span><strong>${esc(r.status||"production_intake")}</strong></div><h3>${esc(r.customerMessage||"Your manuscript has advanced into MMG production intake.")}</h3><p><strong>Project:</strong> ${esc(r.projectID||"—")} · <strong>Intake:</strong> ${esc(r.intakeID||"—")}</p><div class="issue-list">${actions.map((item,index)=>`<article><b>${index+1}. ${esc(item)}</b><p>${index===0?"This is the next required production step.":"Queued in the production setup sequence."}</p></article>`).join("")}</div><p class="manuscript-note">The original manuscript source remains stored in the durable production registry. This workflow does not stop at a file download.</p><div class="manuscript-actions"><button class="primary" data-finish>Return to Production Center</button><button class="secondary" data-edit>Review Intake Source</button></div></div>`;
}

async function loadFile(event){
  const file=event.target.files?.[0];
  if(!file)return;
  state.error="";state.extracting=true;state.result=null;render();
  try{
    const format=fileFormat(file);validateFile(file,format);
    const extracted=await extractFile(file,format);
    const normalized=normalizeText(extracted.text);
    if(normalized.length<50)throw new Error(format==="pdf"?"This PDF contains no usable selectable text. It may be scanned or image-only; OCR is not enabled.":"No usable manuscript text was found in this file.");
    if(normalized.length>MAX_TEXT_CHARS)throw new Error(`The extracted manuscript contains ${normalized.length.toLocaleString()} characters. Intake supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
    state.manuscript=normalized;
    const checksum=await fileChecksum(file);
    state.source={name:file.name,size:file.size,format,pages:extracted.pages||null,checksum,stored:false};
    if(!state.title)state.title=file.name.replace(/\.[^.]+$/,"");
    state.extracting=false;state.storing=true;render();
    await storeDurableSource(file);
  }catch(error){
    state.manuscript="";state.source=null;state.error=error?.message||"Kairos could not extract this manuscript.";
  }finally{state.extracting=false;state.storing=false;render();}
}

async function storeDurableSource(file){
  const projectId=ensureProjectId();
  const form=new FormData();
  form.append("file",file,file.name);
  form.append("extractedText",state.manuscript);
  form.append("title",state.title||file.name.replace(/\.[^.]+$/,"")||"Untitled manuscript");
  form.append("format",state.source?.format||fileFormat(file));
  form.append("pages",String(state.source?.pages||""));
  form.append("checksum",state.source?.checksum||"");
  const response=await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source`,{method:"POST",credentials:"include",headers:{"X-MMG-Client-Build":BUILD},body:form});
  const body=await response.json();
  if(!response.ok)throw new Error(body?.error?.message||"The manuscript source could not be stored.");
  state.source={...normalizeSource(body.source),stored:true};
  window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
}

async function storePastedText(){
  const file=new File([state.manuscript],`${safeName(state.title||"manuscript")}.txt`,{type:"text/plain"});
  state.source={name:file.name,size:file.size,format:"txt",pages:null,checksum:await fileChecksum(file),stored:false};
  state.storing=true;render();
  try{await storeDurableSource(file);}finally{state.storing=false;render();}
}

async function runIntake(){
  state.title=document.querySelector("#ms-title")?.value.trim()||"Untitled manuscript";
  state.manuscript=document.querySelector("#ms-body")?.value||"";
  if(state.manuscript.trim().length<50){state.error="Provide at least 50 characters of manuscript text.";render();return;}
  state.working=true;state.error="";render();
  try{
    if(!state.source?.stored)await storePastedText();
    const response=await fetch("/api/manuscript/intake/advance",{method:"POST",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},credentials:"include",body:JSON.stringify({title:state.title,manuscript:state.manuscript,source:state.source})});
    const body=await response.json();
    if(!response.ok)throw new Error(body?.error?.message||"The manuscript could not advance into production intake.");
    state.result=body;
    await updateRegistry(body);
  }catch(error){state.error=error.message||"The manuscript could not advance into production intake.";}
  finally{state.working=false;render();}
}

async function updateRegistry(intake){
  const projectId=ensureProjectId();
  const response=await fetch(`/api/production-registry/projects/${encodeURIComponent(projectId)}`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},body:JSON.stringify({title:state.title,status:"production_intake",stage:"project_setup",progress:25,activeWorkspace:"manuscript-studio",sourceProjectId:intake.projectID||null,summary:intake.customerMessage||"Manuscript accepted into production intake.",nextAction:intake.workflow?.requiredNextActions?.[0]||"Continue project setup.",checkpoints:[{id:"durable-source",label:"Original manuscript source stored",status:"completed",recordedAt:state.source?.storedAt||new Date().toISOString()},{id:"production-intake",label:"Production intake created",status:"completed",recordedAt:new Date().toISOString()}]})});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body?.error?.message||"The production registry could not be updated.");}
  window.KairosProductionWorkspace?.refresh?.();
}

function ensureProjectId(){
  if(state.projectId)return state.projectId;
  const active=readJSON(ACTIVE_KEY);
  state.projectId=active?.workspace==="manuscript-studio"&&active.projectId?active.projectId:`manuscript-studio-${crypto.randomUUID()}`;
  sessionStorage.setItem(ACTIVE_KEY,JSON.stringify({workspace:"manuscript-studio",projectId:state.projectId,openedAt:new Date().toISOString(),build:BUILD}));
  return state.projectId;
}
function activeProjectId(){const active=readJSON(ACTIVE_KEY);return active?.workspace==="manuscript-studio"?active.projectId||null:null;}
function normalizeSource(value){return {projectId:value.projectId||state.projectId,name:value.name||value.filename||"manuscript",size:Number(value.size||0),format:value.format||"txt",pages:value.pages||null,checksum:value.checksum||"",stored:true,storedAt:value.storedAt||null,sourceDownloadURL:value.sourceDownloadURL||null,extractedTextURL:value.extractedTextURL||null};}

function fileFormat(file){const name=String(file.name||"").toLowerCase();if(name.endsWith(".docx")||file.type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document")return"docx";if(name.endsWith(".pdf")||file.type==="application/pdf")return"pdf";if(name.endsWith(".rtf")||file.type==="application/rtf"||file.type==="text/rtf")return"rtf";if(name.endsWith(".md")||file.type==="text/markdown")return"md";if(name.endsWith(".txt")||file.type==="text/plain"||!file.type)return"txt";throw new Error("Supported manuscript formats are TXT, MD, RTF, DOCX, and PDF.");}
function validateFile(file,format){if(!file.size)throw new Error("The selected file is empty.");if(format==="docx"&&file.size>MAX_DOCX_BYTES)throw new Error("DOCX files must be 15 MB or smaller.");if(format==="pdf"&&file.size>MAX_PDF_BYTES)throw new Error("PDF files must be 20 MB or smaller.");if(!["docx","pdf"].includes(format)&&file.size>5*1024*1024)throw new Error("Text manuscript files must be 5 MB or smaller.");}
async function extractFile(file,format){if(format==="docx")return extractDocx(file);if(format==="pdf")return extractPdf(file);const raw=await file.text();return{text:format==="rtf"?stripRtf(raw):raw};}
async function extractDocx(file){const mammoth=await importWithFallback(LIBRARIES.mammoth,"DOCX extraction service");const api=mammoth.default||mammoth;const result=await api.extractRawText({arrayBuffer:await file.arrayBuffer()});const warnings=(result.messages||[]).filter(m=>m.type==="error");if(warnings.length)throw new Error(warnings[0].message||"The DOCX file could not be read.");return{text:result.value||""};}
async function extractPdf(file){const pdfjs=await importWithFallback(LIBRARIES.pdfjs,"PDF extraction service");if(pdfjs.GlobalWorkerOptions)pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";let pdf;try{pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWorkerFetch:true,isEvalSupported:false}).promise;}catch(error){if(/password/i.test(String(error?.message||"")))throw new Error("Password-protected PDFs are not supported.");throw new Error("The PDF is damaged, unsupported, or could not be opened.");}if(pdf.numPages>MAX_PDF_PAGES)throw new Error(`PDF manuscripts are limited to ${MAX_PDF_PAGES} pages.`);const pages=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);const content=await page.getTextContent({includeMarkedContent:false});pages.push(joinPdfItems(content.items||[]));page.cleanup?.();}await pdf.destroy?.();return{text:pages.join("\n\n"),pages:pages.length};}
function joinPdfItems(items){let out="",previousY=null;for(const item of items){if(!item||typeof item.str!=="string")continue;const y=Array.isArray(item.transform)?item.transform[5]:null;if(previousY!==null&&y!==null&&Math.abs(y-previousY)>4)out+="\n";else if(out&&!out.endsWith("\n")&&!/\s$/.test(out))out+=" ";out+=item.str;previousY=y;}return out;}
function stripRtf(value){return String(value||"").replace(/\\par[d]?\b/g,"\n").replace(/\\tab\b/g,"\t").replace(/\\'[0-9a-fA-F]{2}/g,m=>String.fromCharCode(parseInt(m.slice(2),16))).replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCharCode(Number(n)<0?Number(n)+65536:Number(n))).replace(/\{\\\*[^{}]*\}/g,"").replace(/\\[a-zA-Z]+-?\d* ?/g,"").replace(/[{}]/g,"");}
function normalizeText(value){return String(value||"").replace(/\r\n?/g,"\n").replace(/\u0000/g,"").replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();}
async function importWithFallback(urls,label){let lastError;for(const url of urls){try{return await import(url);}catch(error){lastError=error;}}throw new Error(`${label} is temporarily unavailable.${lastError?.message?` (${lastError.message})`:""}`);}
async function fileChecksum(file){const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function formatBytes(value){if(value<1024)return`${value} B`;if(value<1024*1024)return`${(value/1024).toFixed(1)} KB`;return`${(value/(1024*1024)).toFixed(1)} MB`;}
function safeName(v){return String(v||"manuscript").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"manuscript";}
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}
function readJSON(key){try{return JSON.parse(sessionStorage.getItem(key)||"null");}catch{return null;}}

mount();
