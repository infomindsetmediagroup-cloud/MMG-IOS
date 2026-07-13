const BUILD = "manuscript-studio-20260712-2";
const MAX_TEXT_CHARS = 180000;
const MAX_DOCX_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 400;
const state = { open:false, working:false, extracting:false, result:null, error:"", title:"", manuscript:"", source:null };

const LIBRARIES = {
  mammoth: [
    "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm",
    "https://esm.sh/mammoth@1.8.0"
  ],
  pdfjs: [
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs",
    "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs"
  ]
};

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
  overlay.innerHTML=`<section class="manuscript-panel"><header><div><p class="eyebrow">Customer Portal · Publishing</p><h2>Manuscript Studio</h2><p>Upload a manuscript or paste text for editorial correction and MMG KDP-readiness review.</p></div><button data-close aria-label="Close">×</button></header>${state.result?resultView():inputView()}</section>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close]").onclick=()=>{state.open=false;render();};
  overlay.querySelector("[data-review]")?.addEventListener("click",runReview);
  overlay.querySelector("[data-file]")?.addEventListener("change",loadFile);
  overlay.querySelector("[data-edit]")?.addEventListener("click",()=>{state.result=null;render();});
  overlay.querySelector("[data-approve]")?.addEventListener("click",approveRevision);
  overlay.querySelector("[data-download]")?.addEventListener("click",downloadRevision);
}

function inputView(){
  const source=state.source?`<p class="manuscript-source"><strong>Loaded:</strong> ${esc(state.source.name)} · ${esc(state.source.format.toUpperCase())} · ${formatBytes(state.source.size)}${state.source.pages?` · ${state.source.pages} pages`:""}</p>`:"";
  return `<div class="manuscript-grid"><label>Publication title<input id="ms-title" maxlength="200" value="${esc(state.title)}" placeholder="Book title"></label><label>Manuscript file<input data-file type="file" accept=".txt,.md,.rtf,.docx,.pdf,text/plain,text/markdown,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"></label></div>${source}<label>Extracted manuscript text<textarea id="ms-body" maxlength="${MAX_TEXT_CHARS}" placeholder="Paste text or load TXT, MD, RTF, DOCX, or a text-based PDF.">${esc(state.manuscript)}</textarea></label><p class="manuscript-note">DOCX and text-based PDF files are supported. Scanned or image-only PDFs require OCR and will be rejected rather than processed inaccurately. The original file is used only for extraction in this browser session.</p>${state.extracting?`<p class="manuscript-progress">Extracting manuscript text…</p>`:""}${state.error?`<p class="manuscript-error">${esc(state.error)}</p>`:""}<button class="primary" data-review ${(state.working||state.extracting)?"disabled":""}>${state.working?"Kairos is reviewing…":state.extracting?"Extracting file…":"Run Editorial & KDP Review"}</button>`;
}

function resultView(){const r=state.result.result||{};const issues=Array.isArray(r.issues)?r.issues:[];const readiness=r.kdpReadiness||{};return `<div class="manuscript-result"><div class="manuscript-status"><span>Customer review required</span><strong>${esc(readiness.status||"review_complete")}</strong></div><h3>${esc(r.summary||"Editorial review complete")}</h3><p>${issues.length} issue${issues.length===1?"":"s"} identified.</p><div class="issue-list">${issues.slice(0,100).map(i=>`<article><b>${esc(i.category||"Editorial")} · ${esc(i.severity||"review")}</b><p>${esc(i.problem||"")}</p><small>${esc(i.location||"")} ${esc(i.recommendation||"")}</small></article>`).join("")||"<p>No specific issues returned.</p>"}</div><label>Proposed revised manuscript<textarea id="ms-revised">${esc(r.revisedManuscript||state.manuscript)}</textarea></label><p class="manuscript-note">${esc(r.disclaimer||"This is an MMG KDP-readiness review. Amazon KDP makes final acceptance decisions.")}</p><div class="manuscript-actions"><button class="primary" data-approve>Approve Revision</button><button class="secondary" data-edit>Revise Request</button><button class="secondary" data-download>Download Proposed TXT</button></div></div>`}

async function loadFile(event){
  const file=event.target.files?.[0];
  if(!file)return;
  state.error="";
  state.extracting=true;
  state.result=null;
  render();
  try{
    const format=fileFormat(file);
    validateFile(file,format);
    const extracted=await extractFile(file,format);
    const normalized=normalizeText(extracted.text);
    if(normalized.length<50)throw new Error(format==="pdf"?"This PDF contains no usable selectable text. It may be scanned or image-only; OCR is not enabled in this launch build.":"No usable manuscript text was found in this file.");
    if(normalized.length>MAX_TEXT_CHARS)throw new Error(`The extracted manuscript contains ${normalized.length.toLocaleString()} characters. This review supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters per pass.`);
    state.manuscript=normalized;
    state.source={name:file.name,size:file.size,format,pages:extracted.pages||null,checksum:await fileChecksum(file)};
    if(!state.title)state.title=file.name.replace(/\.[^.]+$/,"");
  }catch(error){
    state.manuscript="";
    state.source=null;
    state.error=error?.message||"Kairos could not extract this manuscript.";
  }finally{
    state.extracting=false;
    render();
  }
}

function fileFormat(file){
  const name=String(file.name||"").toLowerCase();
  if(name.endsWith(".docx")||file.type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document")return "docx";
  if(name.endsWith(".pdf")||file.type==="application/pdf")return "pdf";
  if(name.endsWith(".rtf")||file.type==="application/rtf"||file.type==="text/rtf")return "rtf";
  if(name.endsWith(".md")||file.type==="text/markdown")return "md";
  if(name.endsWith(".txt")||file.type==="text/plain"||!file.type)return "txt";
  throw new Error("Supported manuscript formats are TXT, MD, RTF, DOCX, and PDF.");
}

function validateFile(file,format){
  if(!file.size)throw new Error("The selected file is empty.");
  if(format==="docx"&&file.size>MAX_DOCX_BYTES)throw new Error("DOCX files must be 15 MB or smaller.");
  if(format==="pdf"&&file.size>MAX_PDF_BYTES)throw new Error("PDF files must be 20 MB or smaller.");
  if(!["docx","pdf"].includes(format)&&file.size>5*1024*1024)throw new Error("Text manuscript files must be 5 MB or smaller.");
}

async function extractFile(file,format){
  if(format==="docx")return extractDocx(file);
  if(format==="pdf")return extractPdf(file);
  const raw=await file.text();
  return {text:format==="rtf"?stripRtf(raw):raw};
}

async function extractDocx(file){
  const mammoth=await importWithFallback(LIBRARIES.mammoth,"DOCX extraction service");
  const api=mammoth.default||mammoth;
  if(typeof api.extractRawText!=="function")throw new Error("DOCX extraction service did not initialize correctly.");
  const result=await api.extractRawText({arrayBuffer:await file.arrayBuffer()});
  const warnings=(result.messages||[]).filter(m=>m.type==="error");
  if(warnings.length)throw new Error(warnings[0].message||"The DOCX file could not be read.");
  return {text:result.value||""};
}

async function extractPdf(file){
  const pdfjs=await importWithFallback(LIBRARIES.pdfjs,"PDF extraction service");
  if(pdfjs.GlobalWorkerOptions)pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
  let pdf;
  try{
    pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWorkerFetch:true,isEvalSupported:false}).promise;
  }catch(error){
    const message=String(error?.message||"");
    if(/password/i.test(message))throw new Error("Password-protected PDFs are not supported. Remove the password and upload the file again.");
    throw new Error("The PDF is damaged, unsupported, or could not be opened.");
  }
  if(pdf.numPages>MAX_PDF_PAGES)throw new Error(`PDF manuscripts are limited to ${MAX_PDF_PAGES} pages per review.`);
  const pages=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber);
    const content=await page.getTextContent({includeMarkedContent:false});
    pages.push(joinPdfItems(content.items||[]));
    page.cleanup?.();
  }
  await pdf.destroy?.();
  return {text:pages.join("\n\n"),pages:pages.length};
}

function joinPdfItems(items){
  let out="";
  let previousY=null;
  for(const item of items){
    if(!item||typeof item.str!=="string")continue;
    const y=Array.isArray(item.transform)?item.transform[5]:null;
    if(previousY!==null&&y!==null&&Math.abs(y-previousY)>4)out+="\n";
    else if(out&&!out.endsWith("\n")&&!/\s$/.test(out))out+=" ";
    out+=item.str;
    previousY=y;
  }
  return out;
}

function stripRtf(value){
  return String(value||"")
    .replace(/\\par[d]?\b/g,"\n")
    .replace(/\\tab\b/g,"\t")
    .replace(/\\'[0-9a-fA-F]{2}/g,m=>String.fromCharCode(parseInt(m.slice(2),16)))
    .replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCharCode(Number(n)<0?Number(n)+65536:Number(n)))
    .replace(/\{\\\*[^{}]*\}/g,"")
    .replace(/\\[a-zA-Z]+-?\d* ?/g,"")
    .replace(/[{}]/g,"");
}

function normalizeText(value){
  return String(value||"")
    .replace(/\r\n?/g,"\n")
    .replace(/\u0000/g,"")
    .replace(/\u00a0/g," ")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

async function importWithFallback(urls,label){
  let lastError;
  for(const url of urls){
    try{return await import(url);}catch(error){lastError=error;}
  }
  throw new Error(`${label} is temporarily unavailable. Check the connection and try again.${lastError?.message?` (${lastError.message})`:""}`);
}

async function fileChecksum(file){
  const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function runReview(){state.title=document.querySelector("#ms-title")?.value.trim()||"Untitled manuscript";state.manuscript=document.querySelector("#ms-body")?.value||"";if(state.manuscript.trim().length<50){state.error="Provide at least 50 characters of manuscript text.";render();return;}state.working=true;state.error="";render();try{const response=await fetch("/api/manuscript/review",{method:"POST",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},credentials:"include",body:JSON.stringify({title:state.title,manuscript:state.manuscript,source:state.source})});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"The manuscript review failed.");state.result=body;sessionStorage.setItem("mmg.manuscript.review",JSON.stringify({title:state.title,result:body,source:state.source?{name:state.source.name,format:state.source.format,checksum:state.source.checksum}:null}));}catch(error){state.error=error.message||"The manuscript review failed.";}finally{state.working=false;render();}}

function approveRevision(){const revised=document.querySelector("#ms-revised")?.value||"";state.result.approvedAt=new Date().toISOString();state.result.approvedManuscript=revised;state.result.status="revision_approved";sessionStorage.setItem("mmg.manuscript.approved",JSON.stringify({title:state.title,reviewID:state.result.reviewID,approvedAt:state.result.approvedAt,manuscript:revised,source:state.source?{name:state.source.name,format:state.source.format,checksum:state.source.checksum}:null}));downloadText(revised,`${safeName(state.title)}-mmg-approved.txt`);render();}
function downloadRevision(){downloadText(document.querySelector("#ms-revised")?.value||state.result?.result?.revisedManuscript||"",`${safeName(state.title)}-proposed-revision.txt`);}
function downloadText(text,name){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function formatBytes(value){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/(1024*1024)).toFixed(1)} MB`;}
function safeName(v){return String(v||"manuscript").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"manuscript";}
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);}

mount();