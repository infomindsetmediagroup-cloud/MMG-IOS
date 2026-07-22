const BUILD = "kairos-manuscript-project-setup-20260722-2";
const COVER_CHUNK_BYTES = 96 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const SERVICES = new Set(["manuscript-correction","editorial-production","complete-publishing-package","digital-edition-production"]);

export async function handleManuscriptProjectSetupObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/setup(?:\/(cover))?$/i);
  if (!match) return null;
  const projectId = match[1];
  const action = match[2] || "setup";
  try {
    if (action === "setup" && request.method === "GET") return readSetup(state, projectId);
    if (action === "setup" && request.method === "POST") return saveSetup(state, request, projectId);
    if (action === "cover" && request.method === "GET") return readCover(state, projectId);
    if (action === "cover" && request.method === "DELETE") return deleteCover(state, projectId);
    return json({ status:"not-found", error:{ code:"manuscript_setup_route_not_found", message:"Manuscript project setup route not found." } },404);
  } catch (error) {
    return json({ status:"failed", build:BUILD, error:{ code:error?.code||"manuscript_setup_failed", message:error instanceof Error?error.message:"Project setup failed." } },Number(error?.status||500));
  }
}

async function saveSetup(state, request, projectId) {
  const source = await state.storage.get(`manuscript:${projectId}:metadata`);
  if (!source) throw fail(409,"manuscript_source_required","Store and validate the manuscript source before project setup.");
  const form = await request.formData();
  const authorName = required(form.get("authorName"),"Author name",160);
  const publicationTitle = required(form.get("publicationTitle")||source.title,"Publication title",240);
  const service = String(form.get("service")||"").trim();
  if (!SERVICES.has(service)) throw fail(400,"publishing_service_invalid","Select an approved MMG publishing service.");
  const trimSize = String(form.get("trimSize")||"6x9").trim().slice(0,40);
  const edition = ["ebook","paperback","hardcover","digital-pdf","multi-format"].includes(String(form.get("edition")))?String(form.get("edition")):"multi-format";
  const isbnStatus = ["customer-supplied","kdp-free","not-decided","not-required"].includes(String(form.get("isbnStatus")))?String(form.get("isbnStatus")):"not-decided";
  const notes = String(form.get("notes")||"").trim().slice(0,4000);
  const cover = form.get("cover");
  let coverMetadata = await state.storage.get(coverMetadataKey(projectId));
  if (cover instanceof File && cover.size) coverMetadata = await storeCover(state, projectId, cover);
  const now = new Date().toISOString();
  const setup = {
    projectId, publicationTitle, authorName, service, trimSize, edition, isbnStatus, notes,
    cover: coverMetadata ? publicCover(coverMetadata) : null,
    coverStatus: coverMetadata ? "customer-supplied-cover-stored" : "customer-cover-required",
    assignments: [
      { department:"Publishing Operations", role:"Project ownership and schedule control", status:"assigned" },
      { department:"Editorial Production", role:"Correction, structure, and production review", status:"queued" },
      { department:"Design Production", role:coverMetadata?"Cover validation and placement":"Await customer-supplied cover", status:coverMetadata?"queued":"blocked" },
      { department:"Publishing Readiness", role:"KDP and digital deliverable preparation", status:"queued" }
    ],
    milestones: [
      milestone("source-intake","Source intake and validation","completed",source.storedAt),
      milestone("project-setup","Publication metadata and service confirmed","completed",now),
      milestone("cover-intake","Customer cover received",coverMetadata?"completed":"waiting",coverMetadata?.storedAt||null),
      milestone("editorial-production","Editorial and production pass","queued",null),
      milestone("customer-review","First customer review","queued",null),
      milestone("final-manufacturing","Final files and delivery package","queued",null)
    ],
    status: coverMetadata ? "assigned-to-production" : "awaiting-customer-cover",
    currentStage: coverMetadata ? "editorial-assignment" : "cover-intake",
    progress: coverMetadata ? 40 : 32,
    createdAt: (await state.storage.get(setupKey(projectId)))?.createdAt || now,
    updatedAt: now,
    build: BUILD,
    externalInferenceAPI:false
  };
  await state.storage.put(setupKey(projectId),setup);
  await updateRegistry(state,setup);
  return json({ status:setup.status, build:BUILD, setup, nextAction:coverMetadata?"Begin the assigned editorial and production queue.":"Upload the customer-supplied cover to unlock editorial assignment." },201);
}

async function readSetup(state, projectId) {
  const setup = await state.storage.get(setupKey(projectId));
  return setup?json({status:"ready",build:BUILD,setup}):json({status:"not-found",error:{code:"manuscript_setup_not_found",message:"Project setup has not been completed."}},404);
}

async function storeCover(state, projectId, file) {
  if (!["image/png","image/jpeg"].includes(file.type)) throw fail(400,"cover_type_invalid","Upload the customer cover as PNG or JPEG.");
  if (file.size > MAX_COVER_BYTES) throw fail(413,"cover_too_large","Customer cover files must be 8 MB or smaller.");
  await removeCover(state,projectId);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = Math.ceil(bytes.length/COVER_CHUNK_BYTES);
  const entries = {};
  for (let i=0;i<chunks;i++) entries[`${coverPrefix(projectId)}${i}`] = bytes.slice(i*COVER_CHUNK_BYTES,Math.min(bytes.length,(i+1)*COVER_CHUNK_BYTES));
  if (Object.keys(entries).length) await state.storage.put(entries);
  const metadata={projectId,filename:safeFilename(file.name||"customer-cover.png"),contentType:file.type,size:bytes.length,chunks,storedAt:new Date().toISOString(),downloadURL:`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup/cover`};
  await state.storage.put(coverMetadataKey(projectId),metadata);
  return metadata;
}

async function readCover(state, projectId) {
  const metadata=await state.storage.get(coverMetadataKey(projectId));
  if(!metadata) return json({status:"not-found",error:{code:"customer_cover_not_found",message:"Customer cover was not found."}},404);
  const keys=Array.from({length:Number(metadata.chunks||0)},(_,i)=>`${coverPrefix(projectId)}${i}`);
  const values=keys.length?await state.storage.get(keys):new Map();
  const out=new Uint8Array(metadata.size);let offset=0;
  for(const key of keys){const value=values.get(key);if(!value)throw fail(502,"cover_chunk_missing","A stored cover chunk is missing.");const chunk=value instanceof Uint8Array?value:new Uint8Array(value);out.set(chunk,offset);offset+=chunk.length;}
  return new Response(out,{status:200,headers:{"Content-Type":metadata.contentType,"Content-Disposition":`inline; filename="${metadata.filename.replace(/[\"\r\n]/g,"")}"`,"Cache-Control":"private, no-store","X-Kairos-Manuscript-Setup":BUILD}});
}

async function deleteCover(state, projectId){await removeCover(state,projectId);return json({status:"deleted",build:BUILD,projectId});}
async function removeCover(state,projectId){const metadata=await state.storage.get(coverMetadataKey(projectId));if(!metadata)return;const keys=Array.from({length:Number(metadata.chunks||0)},(_,i)=>`${coverPrefix(projectId)}${i}`);if(keys.length)await state.storage.delete(keys);await state.storage.delete(coverMetadataKey(projectId));}

async function updateRegistry(state,setup){const records=(await state.storage.get("production-registry"))||{};const current=records[setup.projectId]||{};records[setup.projectId]={...current,projectId:setup.projectId,projectType:"manuscript-studio",title:setup.publicationTitle,status:setup.status,stage:setup.currentStage,progress:setup.progress,activeWorkspace:"manuscript-studio",summary:`${setup.authorName} · ${setup.service} · ${setup.coverStatus}`,nextAction:setup.cover?"Begin editorial and production work.":"Upload the customer-supplied cover.",projectSetup:true,coverStored:Boolean(setup.cover),assignments:setup.assignments,milestones:setup.milestones,checkpoints:merge(current.checkpoints,{id:"project-setup",label:"Project setup and production assignment completed",status:"completed",recordedAt:setup.updatedAt}),updatedAt:setup.updatedAt,revision:Number(current.revision||0)+1,ownerScope:"mmg-executive",externalInferenceAPI:false};await state.storage.put("production-registry",records);}
function milestone(id,label,status,completedAt){return{id,label,status,completedAt};}
function publicCover(value){const{chunks,...rest}=value;return rest;}
function merge(values,item){const list=Array.isArray(values)?values.filter(v=>v?.id!==item.id):[];return[...list.slice(-29),item];}
function required(value,label,max){const text=String(value||"").trim().slice(0,max);if(!text)throw fail(400,"required_field_missing",`${label} is required.`);return text;}
function safeFilename(value){return String(value||"cover.png").replace(/[\\/:*?\"<>|\r\n]/g,"-").slice(0,180)||"cover.png";}
function setupKey(id){return `manuscript:${id}:setup`;}
function coverMetadataKey(id){return `manuscript:${id}:cover:metadata`;}
function coverPrefix(id){return `manuscript:${id}:cover:chunk:`;}
function fail(status,code,message){return Object.assign(new Error(message),{status,code});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Kairos-Manuscript-Setup":BUILD}});}
