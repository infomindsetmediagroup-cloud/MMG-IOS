export const KAIROS_MANUSCRIPT_GENERATION_BUILD = "kairos-manuscript-generation-job-20260725-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const TARGET_WORDS = 25500;
const MAX_STEPS = 32;
const CHUNK_BYTES = 96 * 1024;
const JOB_INDEX_KEY = "manuscript-generation:index";

export async function handleManuscriptGeneration(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/generation-job$/i);
  if (!match) return null;
  if (!env?.KAIROS_PROJECTS) return json({ status:"failed", error:{ code:"generation_storage_unavailable", message:"Kairos project storage is unavailable." } },503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  return stub.fetch(new Request(`https://kairos.internal/registry/manuscripts/${match[1]}/generation-job`,request));
}

export async function handleManuscriptGenerationObjectRequest(state, env, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/generation-job$/i);
  if (!match) return null;
  const projectId=match[1];
  try {
    if(request.method==="GET") return readJob(state,projectId);
    if(request.method==="POST") return startJob(state,env,projectId);
    if(request.method==="DELETE") return cancelJob(state,projectId);
    return json({status:"failed",error:{code:"generation_method_not_allowed",message:"This generation-job method is not allowed."}},405);
  } catch(error) {
    return json({status:"failed",build:KAIROS_MANUSCRIPT_GENERATION_BUILD,error:{code:error?.code||"generation_job_failed",message:error?.message||"Backend manuscript generation failed."}},Number(error?.status||500));
  }
}

export async function resumeManuscriptGenerationAlarm(state,env) {
  const index=Array.from(new Set(await state.storage.get(JOB_INDEX_KEY)||[]));
  const projectId=index[0];
  if(!projectId) return false;
  const job=await state.storage.get(jobKey(projectId));
  if(!job||!["queued","running"].includes(job.status)) {
    await state.storage.put(JOB_INDEX_KEY,index.slice(1));
    if(index.length>1) await state.storage.setAlarm(Date.now()+1000);
    return true;
  }
  await runOneStep(state,env,projectId,job);
  const updated=await state.storage.get(jobKey(projectId));
  const remaining=updated?.status==="running"?[projectId,...index.slice(1)]:index.slice(1);
  await state.storage.put(JOB_INDEX_KEY,remaining);
  if(remaining.length) await state.storage.setAlarm(Date.now()+1500);
  return true;
}

async function startJob(state,env,projectId) {
  const provider=providerConfig(env);
  if(provider.provider==="deterministic") throw fail(503,"generation_provider_required","Backend manuscript generation requires a configured Ollama or OpenAI-compatible model endpoint. Kairos will not fall back to the iPhone runtime.");
  const metadata=await state.storage.get(`manuscript:${projectId}:metadata`);
  if(!metadata) throw fail(409,"generation_source_required","Store the authoritative manuscript before starting production.");
  const existing=await state.storage.get(jobKey(projectId));
  if(existing&&["queued","running","completed"].includes(existing.status)) return json({status:existing.status,build:KAIROS_MANUSCRIPT_GENERATION_BUILD,projectId,job:existing},existing.status==="completed"?200:202);
  const sourceBytes=await getChunks(state,`manuscript:${projectId}:text:`,Number(metadata.textChunks||0),Number(metadata.textBytes||0));
  const source=new TextDecoder().decode(sourceBytes).trim();
  if(source.length<500) throw fail(400,"generation_source_incomplete","The authoritative manuscript is too short for backend generation.");
  const sections=splitSections(source);
  const now=new Date().toISOString();
  const job={build:KAIROS_MANUSCRIPT_GENERATION_BUILD,projectId,status:"queued",provider:provider.provider,model:provider.model,step:0,maxSteps:MAX_STEPS,targetWords:TARGET_WORDS,sourceWords:countWords(source),generatedWords:0,totalWords:countWords(source),sourceChecksum:metadata.checksum||null,sections,createdAt:now,updatedAt:now,error:null};
  await state.storage.put(jobKey(projectId),job);
  const index=Array.from(new Set([...(await state.storage.get(JOB_INDEX_KEY)||[]),projectId]));
  await state.storage.put(JOB_INDEX_KEY,index);
  await state.storage.setAlarm(Date.now()+500);
  return json({status:"queued",build:KAIROS_MANUSCRIPT_GENERATION_BUILD,projectId,job},202);
}

async function runOneStep(state,env,projectId,job) {
  const provider=providerConfig(env);
  if(provider.provider==="deterministic") return failJob(state,projectId,job,"generation_provider_missing","The configured backend model provider is unavailable.");
  const metadata=await state.storage.get(`manuscript:${projectId}:metadata`);
  if(!metadata) return failJob(state,projectId,job,"generation_source_missing","The authoritative manuscript metadata disappeared.");
  if(job.sourceChecksum&&metadata.checksum&&String(job.sourceChecksum)!==String(metadata.checksum)) return failJob(state,projectId,job,"generation_source_changed","The authoritative manuscript changed after the job began.");
  if(job.totalWords>=job.targetWords||job.step>=job.maxSteps) return completeJob(state,projectId,job,metadata);
  const section=job.sections[job.step%job.sections.length];
  const cycle=Math.floor(job.step/job.sections.length)+1;
  const running={...job,status:"running",phase:`Writing section ${job.step+1} of up to ${job.maxSteps}`,updatedAt:new Date().toISOString(),error:null};
  await state.storage.put(jobKey(projectId),running);
  try {
    const text=cleanOutput(await generate(provider,buildPrompt(section,cycle,job.step)));
    const words=countWords(text);
    if(words<250) throw new Error("The backend model returned an incomplete section.");
    await state.storage.put(outputKey(projectId,job.step),`# Backend Expansion ${job.step+1}: ${section.title}\n\n${text}`);
    await state.storage.put(jobKey(projectId),{...running,step:job.step+1,generatedWords:job.generatedWords+words,totalWords:job.totalWords+words,phase:"Section stored and verified",updatedAt:new Date().toISOString()});
  } catch(error) {
    const attempts=Number(job.attempts||0)+1;
    if(attempts<3) await state.storage.put(jobKey(projectId),{...running,attempts,error:{code:"generation_step_retry",message:String(error?.message||error)},updatedAt:new Date().toISOString()});
    else await failJob(state,projectId,running,"generation_step_failed",String(error?.message||error));
  }
}

async function completeJob(state,projectId,job,metadata) {
  const sourceBytes=await getChunks(state,`manuscript:${projectId}:text:`,Number(metadata.textChunks||0),Number(metadata.textBytes||0));
  const source=new TextDecoder().decode(sourceBytes).trim();
  const generated=[];
  for(let index=0;index<job.step;index+=1){const value=await state.storage.get(outputKey(projectId,index));if(value)generated.push(String(value));}
  const manuscript=`${source}\n\n# Expanded Digital Asset Edition\n\n${generated.join("\n\n")}`.trim();
  const bytes=new TextEncoder().encode(manuscript);
  const backup=await state.storage.get(`manuscript:${projectId}:original-text:metadata`);
  if(!backup){const chunks=await putChunks(state,`manuscript:${projectId}:original-text:`,sourceBytes);await state.storage.put(`manuscript:${projectId}:original-text:metadata`,{chunks,byteSize:sourceBytes.length,wordCount:countWords(source),sha256:await digestHex(sourceBytes),backedUpAt:new Date().toISOString()});}
  await removeChunks(state,`manuscript:${projectId}:text:`,Number(metadata.textChunks||0));
  const textChunks=await putChunks(state,`manuscript:${projectId}:text:`,bytes);
  const now=new Date().toISOString();
  const inference={build:KAIROS_MANUSCRIPT_GENERATION_BUILD,provider:`backend-${job.provider}`,model:job.model,sourceChecksum:metadata.checksum||null,outputSha256:await digestHex(bytes),wordCount:countWords(manuscript),characterCount:manuscript.length,generatedAt:now,noCost:job.provider!=="openai",externalPaidAPIUsed:job.provider==="openai-compatible",cloudflareNeuronsUsed:0};
  await state.storage.put(`manuscript:${projectId}:metadata`,{...metadata,textChunks,textBytes:bytes.length,wordCount:inference.wordCount,updatedAt:now,localInference:inference});
  await state.storage.put(`manuscript:${projectId}:local-inference`,inference);
  await state.storage.put(jobKey(projectId),{...job,status:"completed",phase:"Backend manuscript complete",totalWords:inference.wordCount,completedAt:now,updatedAt:now,inference,error:null});
}

async function readJob(state,projectId){const job=await state.storage.get(jobKey(projectId));return job?json({status:job.status,build:KAIROS_MANUSCRIPT_GENERATION_BUILD,projectId,job}):json({status:"not-found",error:{code:"generation_job_not_found",message:"No backend manuscript generation job exists for this project."}},404);}
async function cancelJob(state,projectId){const job=await state.storage.get(jobKey(projectId));if(!job)return readJob(state,projectId);const updated={...job,status:"cancelled",updatedAt:new Date().toISOString()};await state.storage.put(jobKey(projectId),updated);return json({status:"cancelled",projectId,job:updated});}
async function failJob(state,projectId,job,code,message){await state.storage.put(jobKey(projectId),{...job,status:"failed",phase:"Generation stopped",error:{code,message},updatedAt:new Date().toISOString()});}

function providerConfig(env){const provider=String(env?.KAIROS_MODEL_PROVIDER||"deterministic").toLowerCase();return{provider,endpoint:String(env?.KAIROS_MODEL_ENDPOINT||"").replace(/\/$/,""),model:String(env?.KAIROS_MODEL_NAME||"qwen2.5:7b-instruct"),token:String(env?.KAIROS_MODEL_AUTH_TOKEN||"")};}
async function generate(config,prompt){if(!config.endpoint)throw new Error("KAIROS_MODEL_ENDPOINT is not configured.");const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);try{if(config.provider==="ollama"){const response=await fetch(`${config.endpoint}/api/generate`,{method:"POST",headers:headers(config),body:JSON.stringify({model:config.model,stream:false,prompt,options:{temperature:0.35}}),signal:controller.signal});const body=await requireJSON(response);return body.response||"";}if(config.provider==="openai-compatible"){const response=await fetch(`${config.endpoint}/v1/chat/completions`,{method:"POST",headers:headers(config),body:JSON.stringify({model:config.model,temperature:0.35,messages:[{role:"system",content:"You are Kairos, the source-grounded editorial engine for Mindset Media Group. Return only polished customer-facing manuscript content. Never invent facts, citations, statistics, guarantees, private URLs, people, products, or events."},{role:"user",content:prompt}]}),signal:controller.signal});const body=await requireJSON(response);return body?.choices?.[0]?.message?.content||"";}throw new Error(`Unsupported backend model provider: ${config.provider}`);}finally{clearTimeout(timeout);}}
function headers(config){const value={"Content-Type":"application/json","Accept":"application/json","X-Kairos-Client":KAIROS_MANUSCRIPT_GENERATION_BUILD};if(config.token)value.Authorization=`Bearer ${config.token}`;return value;}
async function requireJSON(response){const text=await response.text();if(!response.ok)throw new Error(`Backend model returned HTTP ${response.status}.`);try{return JSON.parse(text);}catch{throw new Error("Backend model returned unreadable output.");}}
function splitSections(text){const blocks=String(text).replace(/\r\n?/g,"\n").split(/(?=^(?:#{1,3}\s+|Chapter\s+\d+|Introduction\b|Conclusion\b))/gim).map(v=>v.trim()).filter(Boolean);return(blocks.length?blocks:String(text).split(/\n{2,}/).filter(Boolean)).slice(0,24).map((content,index)=>({title:(content.split("\n").find(Boolean)||`Section ${index+1}`).replace(/^#{1,3}\s+/,"").slice(0,120),content:content.slice(0,7000)}));}
function buildPrompt(section,cycle,step){const focus=["core principle, practical workflow, and decision rules","worked example, diagnostic method, and common failure patterns","implementation workbook, checklist, and measurable completion standard","advanced application, quality control, and repeatable operating procedure"][(cycle-1)%4];return`SOURCE SECTION TITLE: ${section.title}\nEXPANSION PASS: ${cycle}\nFOCUS: ${focus}\n\nSOURCE MATERIAL:\n${section.content}\n\nWrite 850 to 1150 words of new, non-repetitive customer-facing instructional content grounded strictly in the source. Use clear Markdown subheadings. Preserve terminology and practical intent. Do not add unsupported facts. This is expansion unit ${step+1}; return only finished content.`;}
function cleanOutput(value){return String(value||"").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/^```(?:markdown|md)?\s*/i,"").replace(/\s*```$/i,"").replace(/\n{4,}/g,"\n\n\n").trim();}
function jobKey(id){return`manuscript:${id}:generation-job`;}function outputKey(id,step){return`manuscript:${id}:generation-output:${step}`;}
async function putChunks(state,prefix,bytes){const count=Math.ceil(bytes.length/CHUNK_BYTES);for(let i=0;i<count;i+=1)await state.storage.put(`${prefix}${i}`,bytes.slice(i*CHUNK_BYTES,Math.min(bytes.length,(i+1)*CHUNK_BYTES)));return count;}
async function getChunks(state,prefix,count,expectedLength){const output=new Uint8Array(expectedLength);let offset=0;for(let i=0;i<Number(count||0);i+=1){const value=await state.storage.get(`${prefix}${i}`);if(!value)throw fail(502,"generation_chunk_missing","A manuscript text chunk is missing.");const chunk=value instanceof Uint8Array?value:new Uint8Array(value);output.set(chunk,offset);offset+=chunk.length;}if(offset!==expectedLength)throw fail(502,"generation_length_mismatch","The manuscript text failed integrity verification.");return output;}
async function removeChunks(state,prefix,count){for(let i=0;i<Number(count||0);i+=1)await state.storage.delete(`${prefix}${i}`);}
function countWords(value){return(String(value||"").match(/\b[\p{L}\p{N}’'-]+\b/gu)||[]).length;}async function digestHex(bytes){const digest=await crypto.subtle.digest("SHA-256",bytes);return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function fail(status,code,message){return Object.assign(new Error(message),{status,code});}function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Kairos-Manuscript-Generation":KAIROS_MANUSCRIPT_GENERATION_BUILD}});}
