const BUILD="kairos-publication-catalog-20260713-1";
const REGISTER_CONFIRMATION="REGISTER CANONICAL PUBLICATION";
const RETIRE_CONFIRMATION="RETIRE PUBLICATION RECORD";
const STATUSES=new Set(["active","preorder","temporarily-unavailable","out-of-print"]);

export async function handlePublicationCatalogObjectRequest(state,request){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/publication-catalog(?:\/(prepare|register|update|retire|record))?$/i);
  if(!match)return null;
  const projectId=match[1],action=match[2]||"status";
  try{
    if(action==="status"&&request.method==="GET")return read(state,projectId);
    if(action==="prepare"&&request.method==="POST")return prepare(state,request,projectId);
    if(action==="register"&&request.method==="POST")return register(state,request,projectId);
    if(action==="update"&&request.method==="POST")return update(state,request,projectId);
    if(action==="retire"&&request.method==="POST")return retire(state,request,projectId);
    if(action==="record"&&request.method==="GET")return downloadRecord(state,projectId);
    return json({status:"not-found",error:{code:"publication_catalog_route_not_found",message:"Publication catalog route not found."}},404);
  }catch(error){return json({status:"failed",build:BUILD,error:{code:error?.code||"publication_catalog_failed",message:error instanceof Error?error.message:"Publication catalog operation failed."}},Number(error?.status||500));}
}

async function read(state,id){await requireProject(state,id);const record=await state.storage.get(recordKey(id));return json({status:record?.status||"not-prepared",build:BUILD,publication:record||null});}

async function prepare(state,request,id){
  const project=await requireProject(state,id);
  const submission=await state.storage.get(submissionKey(id));
  const setup=await state.storage.get(setupKey(id));
  if(!submission||submission.status!=="accepted"||!submission.externalStatus?.recordedAt)throw fail(409,"accepted_platform_submission_required","Record an accepted platform submission before creating the canonical publication record.");
  const body=await request.json();
  const publicationStatus=STATUSES.has(body?.publicationStatus)?body.publicationStatus:"active";
  const liveURL=validURL(body?.liveURL,"Live publication URL");
  const publisherURL=optionalURL(body?.publisherURL,"Publisher URL");
  const rightsOwner=req(body?.rightsOwner||setup?.authorName||submission.author,"Rights owner",180);
  const rightsScope=req(body?.rightsScope||"Worldwide publishing and distribution rights as documented by MMG.","Rights scope",1000);
  const territories=Array.isArray(body?.territories)?body.territories.slice(0,30).map(v=>String(v).trim().slice(0,80)).filter(Boolean):["Worldwide"];
  const identifiers=normalizeIdentifiers({isbn:body?.isbn||submission.isbn,asin:body?.asin||submission.externalStatus?.reference,shopifyProductId:body?.shopifyProductId,other:body?.otherIdentifier});
  const now=new Date().toISOString();
  const record={
    projectId:id,
    catalogId:`publication-${crypto.randomUUID()}`,
    status:"awaiting-catalog-registration",
    publicationStatus,
    title:req(body?.title||submission.title||project.title,"Title",240),
    subtitle:String(body?.subtitle||submission.subtitle||"").trim().slice(0,240),
    author:req(body?.author||submission.author||setup?.authorName,"Author",180),
    publisher:String(body?.publisher||"Mindset Media Group").trim().slice(0,180),
    imprint:String(body?.imprint||"Mindset Media Group").trim().slice(0,180),
    edition:String(body?.edition||submission.edition||setup?.edition||"multi-format").trim().slice(0,80),
    language:String(body?.language||submission.language||"en").trim().slice(0,20),
    releaseDate:validDate(body?.releaseDate)||now.slice(0,10),
    price:String(body?.price||submission.price||"").trim().slice(0,40),
    currency:String(body?.currency||"USD").trim().toUpperCase().slice(0,3),
    platform:submission.platform,
    platformReference:submission.externalStatus.reference||null,
    platformAcceptedAt:submission.externalStatus.recordedAt,
    liveURL,
    publisherURL,
    identifiers,
    rights:{owner:rightsOwner,scope:rightsScope,territories,exclusive:Boolean(body?.exclusive),sourceNote:String(body?.rightsNote||"").trim().slice(0,4000)},
    source:{submissionId:submission.submissionId,manufacturingReleaseId:submission.manufacturingReleaseId,projectId:id},
    evidence:{acceptanceNote:submission.externalStatus.note||"",acceptanceRecordedBy:submission.externalStatus.recordedBy||null,acceptanceRecordedAt:submission.externalStatus.recordedAt},
    confirmationRequired:REGISTER_CONFIRMATION,
    retirementConfirmation:RETIRE_CONFIRMATION,
    preparedBy:String(body?.actor||"Executive").slice(0,180),
    preparedAt:now,
    registeredAt:null,
    history:[event("catalog-prepared",body?.actor,now)],
    build:BUILD
  };
  await state.storage.put(recordKey(id),record);
  await updateRegistry(state,id,{status:"awaiting-catalog-registration",stage:"publication-catalog",summary:"The accepted publication is ready for canonical catalog registration.",nextAction:`Type ${REGISTER_CONFIRMATION} to register the publication asset.`,checkpoint:{id:record.catalogId,label:"Publication catalog record prepared",status:"completed",recordedAt:now}});
  return json({status:record.status,build:BUILD,publication:record},201);
}

async function register(state,request,id){
  await requireProject(state,id);
  const body=await request.json();
  if(String(body?.confirmation||"").trim()!==REGISTER_CONFIRMATION)throw fail(403,"catalog_registration_confirmation_required",`Type ${REGISTER_CONFIRMATION} to register the publication.`);
  const current=await state.storage.get(recordKey(id));
  if(!current||current.status!=="awaiting-catalog-registration")throw fail(409,"catalog_record_not_ready","Prepare the publication catalog record before registration.");
  const submission=await state.storage.get(submissionKey(id));
  if(!submission||submission.status!=="accepted"||submission.submissionId!==current.source.submissionId)throw fail(409,"accepted_submission_changed","The accepted platform submission changed after catalog preparation.");
  const now=new Date().toISOString();
  const record={...current,status:"registered",registeredBy:String(body?.actor||"Executive").slice(0,180),registeredAt:now,updatedAt:now,history:append(current.history,"catalog-registered",body?.actor,now)};
  await state.storage.put(recordKey(id),record);
  const catalog=(await state.storage.get("canonical-publication-catalog"))||{};
  catalog[record.catalogId]=catalogSummary(record);
  await state.storage.put("canonical-publication-catalog",catalog);
  await updateRegistry(state,id,{status:"publication-registered",stage:"publication-catalog",summary:`${record.title} is registered as a canonical MMG publication asset.`,nextAction:"Maintain live URLs, identifiers, rights, pricing, and post-publication status.",checkpoint:{id:`${record.catalogId}-registered`,label:"Canonical publication registered",status:"completed",recordedAt:now}});
  return json({status:record.status,build:BUILD,publication:record});
}

async function update(state,request,id){
  await requireProject(state,id);
  const body=await request.json();
  const current=await state.storage.get(recordKey(id));
  if(!current||current.status!=="registered")throw fail(409,"registered_publication_required","Register the publication before updating its catalog record.");
  const now=new Date().toISOString();
  const next={...current,
    publicationStatus:body?.publicationStatus===undefined?current.publicationStatus:(STATUSES.has(body.publicationStatus)?body.publicationStatus:current.publicationStatus),
    liveURL:body?.liveURL===undefined?current.liveURL:validURL(body.liveURL,"Live publication URL"),
    publisherURL:body?.publisherURL===undefined?current.publisherURL:optionalURL(body.publisherURL,"Publisher URL"),
    price:body?.price===undefined?current.price:String(body.price||"").trim().slice(0,40),
    currency:body?.currency===undefined?current.currency:String(body.currency||"USD").trim().toUpperCase().slice(0,3),
    identifiers:body?.identifiers?normalizeIdentifiers({...current.identifiers,...body.identifiers}):current.identifiers,
    rights:body?.rights?{...current.rights,owner:req(body.rights.owner||current.rights.owner,"Rights owner",180),scope:req(body.rights.scope||current.rights.scope,"Rights scope",1000),territories:Array.isArray(body.rights.territories)?body.rights.territories.slice(0,30).map(v=>String(v).trim().slice(0,80)).filter(Boolean):current.rights.territories,exclusive:body.rights.exclusive===undefined?current.rights.exclusive:Boolean(body.rights.exclusive),sourceNote:body.rights.sourceNote===undefined?current.rights.sourceNote:String(body.rights.sourceNote||"").slice(0,4000)}:current.rights,
    updatedBy:String(body?.actor||"Executive").slice(0,180),updatedAt:now,history:append(current.history,"catalog-updated",body?.actor,now)
  };
  await state.storage.put(recordKey(id),next);
  const catalog=(await state.storage.get("canonical-publication-catalog"))||{};catalog[next.catalogId]=catalogSummary(next);await state.storage.put("canonical-publication-catalog",catalog);
  await updateRegistry(state,id,{status:"publication-registered",stage:"publication-catalog",summary:`Canonical publication record updated: ${next.publicationStatus}.`,nextAction:"Continue post-publication stewardship and evidence updates.",checkpoint:{id:`${next.catalogId}-update-${Date.now()}`,label:"Publication catalog updated",status:"completed",recordedAt:now}});
  return json({status:next.status,build:BUILD,publication:next});
}

async function retire(state,request,id){
  await requireProject(state,id);
  const body=await request.json();
  if(String(body?.confirmation||"").trim()!==RETIRE_CONFIRMATION)throw fail(403,"catalog_retirement_confirmation_required",`Type ${RETIRE_CONFIRMATION} to retire the publication record.`);
  const current=await state.storage.get(recordKey(id));if(!current||current.status!=="registered")throw fail(409,"registered_publication_required","Only a registered publication may be retired.");
  const now=new Date().toISOString();const record={...current,status:"retired",publicationStatus:"out-of-print",retiredBy:String(body?.actor||"Executive").slice(0,180),retiredAt:now,retirementNote:String(body?.note||"").slice(0,4000),updatedAt:now,history:append(current.history,"catalog-retired",body?.actor,now)};
  await state.storage.put(recordKey(id),record);const catalog=(await state.storage.get("canonical-publication-catalog"))||{};catalog[record.catalogId]=catalogSummary(record);await state.storage.put("canonical-publication-catalog",catalog);
  await updateRegistry(state,id,{status:"publication-retired",stage:"publication-catalog",summary:"The canonical publication record was retired while historical evidence remains preserved.",nextAction:"Retain the permanent publication record and rights evidence.",checkpoint:{id:`${record.catalogId}-retired`,label:"Publication catalog record retired",status:"completed",recordedAt:now}});
  return json({status:record.status,build:BUILD,publication:record});
}

async function downloadRecord(state,id){const record=await state.storage.get(recordKey(id));if(!record)throw fail(404,"publication_catalog_not_found","The publication catalog record was not found.");return new Response(JSON.stringify({version:BUILD,publication:record,exportedAt:new Date().toISOString()},null,2),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="${safe(record.title)}-publication-record.json"`,"Cache-Control":"private, no-store","X-Kairos-Publication-Catalog":BUILD}});}

async function requireProject(state,id){const records=(await state.storage.get("production-registry"))||{};const project=records[id];if(!project||project.projectType!=="manuscript-studio")throw fail(404,"manuscript_project_not_found","The manuscript production project was not found.");return project;}
async function updateRegistry(state,id,c){const records=(await state.storage.get("production-registry"))||{},current=records[id];if(!current)return;const list=Array.isArray(current.checkpoints)?current.checkpoints.filter(x=>x?.id!==c.checkpoint?.id):[];records[id]={...current,status:c.status,stage:c.stage,progress:100,summary:c.summary,nextAction:c.nextAction,checkpoints:c.checkpoint?[...list.slice(-49),c.checkpoint]:list,publicationCatalog:true,updatedAt:new Date().toISOString(),revision:Number(current.revision||0)+1};await state.storage.put("production-registry",records);}
function catalogSummary(r){return{catalogId:r.catalogId,projectId:r.projectId,title:r.title,author:r.author,status:r.status,publicationStatus:r.publicationStatus,platform:r.platform,liveURL:r.liveURL,identifiers:r.identifiers,rightsOwner:r.rights.owner,registeredAt:r.registeredAt,updatedAt:r.updatedAt||r.registeredAt};}
function normalizeIdentifiers(v){return{isbn:String(v?.isbn||"").replace(/[^0-9Xx]/g,"").slice(0,13)||null,asin:String(v?.asin||"").trim().slice(0,40)||null,shopifyProductId:String(v?.shopifyProductId||"").trim().slice(0,120)||null,other:String(v?.other||"").trim().slice(0,240)||null};}
function validURL(v,label){const t=String(v||"").trim().slice(0,2000);if(!t)throw fail(400,"publication_url_required",`${label} is required.`);try{const u=new URL(t);if(!["http:","https:"].includes(u.protocol))throw new Error();return u.toString();}catch{throw fail(400,"publication_url_invalid",`${label} must be a valid HTTPS or HTTP URL.`);}}
function optionalURL(v,label){const t=String(v||"").trim();return t?validURL(t,label):null;}
function validDate(v){const t=String(v||"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(t)?t:null;}
function req(v,l,m){const t=String(v||"").trim().slice(0,m);if(!t)throw fail(400,"required_field_missing",`${l} is required.`);return t;}
function event(action,actor,recordedAt){return{id:crypto.randomUUID(),action,actor:String(actor||"Executive").slice(0,180),recordedAt};}
function append(h,a,actor,t){return[...(Array.isArray(h)?h:[]).slice(-79),event(a,actor,t)];}
function recordKey(id){return`manuscript:${id}:publication-catalog`;}
function submissionKey(id){return`manuscript:${id}:platform-submission`;}
function setupKey(id){return`manuscript:${id}:setup`;}
function safe(v){return String(v||"publication").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"publication";}
function fail(status,code,message){return Object.assign(new Error(message),{status,code});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Kairos-Publication-Catalog":BUILD}});}
