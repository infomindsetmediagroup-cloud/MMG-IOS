import {httpError,inspectStagingSource,parseShopifyJson} from './kairos-compact-homepage-utils-v1.js';

const BUILD='kairos-content-only-shopify-planner-20260715-7';
const HOMEPAGE_FILE='templates/index.json';
const SECTION_FILE='sections/mmg-canonical-homepage.liquid';
const CSS_FILE='assets/mmg-canonical-homepage.css';
const JOB_TTL_SECONDS=3600;
const MAX_OBJECTIVE_CHARS=12000;
const BLOCK_TAGS=new Set(['address','article','aside','blockquote','button','div','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','li','main','nav','p','section','td','th']);
const BLOCKED_TAGS=new Set(['script','style','svg','template','noscript','code','pre']);

const APPROVED_REPLACEMENTS=new Map([
  ['The guided path','The customer journey'],
  ['Start where you are. Build what comes next.','Start where you are. Move toward what comes next.'],
  ['You do not need the entire future mapped out. Choose the stage that matches your work today, then move through a connected system.','Choose the stage that matches your work today, then follow a connected path from learning and planning to a finished outcome.'],
  ['Choose what you want to build','Choose your path'],
  ['One ecosystem. Multiple ways forward.','One ecosystem. A clear way forward.'],
  ['Every pathway combines education, practical tools, and production support so the next step connects to the larger body of work.','Each pathway connects practical learning, digital resources, professional support, and a clear next step.'],
  ['A connected knowledge ecosystem','Your connected knowledge journey'],
  ['Every asset should lead somewhere useful.','Every step should lead somewhere useful.'],
  ['MMG is designed as a connected journey—not a shelf of unrelated products.','MMG connects learning, creation, publishing, and continued growth in one guided customer journey.'],
  ['Continue through MMG','Continue your journey'],
  ['Keep moving through the system.','Keep moving through your journey.'],
  ['Choose your next step','Your next step'],
  ['Start with a free tool, explore the library, or bring a serious publishing project into production.','Explore a resource, continue learning, or bring a publishing project into professional production.']
]);

export default{async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/shopify/staging/plan/jobs'&&request.method==='POST')return createPlan(request,env);
  return json({status:'not-found',build:BUILD},404);
}};

async function createPlan(request,env){
  try{
    const payload=await request.json();
    const objective=String(payload?.objective||'').trim();
    if(objective.length<8)throw httpError(400,'objective_required','Enter a specific website objective before starting the job.');
    if(objective.length>MAX_OBJECTIVE_CHARS)throw httpError(413,'objective_too_long',`Website objective exceeds ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.`);

    const sourceBody=await inspectStagingSource(null,request,env,BUILD,[HOMEPAGE_FILE,SECTION_FILE,CSS_FILE]);
    const evidence=sourceBody?.evidence||{};
    const stagingTheme=evidence.stagingTheme,mainTheme=evidence.mainTheme;
    validateBoundary(stagingTheme,mainTheme);
    const files=new Map((Array.isArray(evidence.files)?evidence.files:[]).filter(file=>file?.readable&&typeof file?.filename==='string'&&typeof file?.content==='string').map(file=>[file.filename,file]));
    const templateFile=files.get(HOMEPAGE_FILE);
    if(!templateFile?.content)throw httpError(409,'homepage_source_unavailable','templates/index.json was not readable from Kairos Staging.');
    const document=parseShopifyJson(templateFile.content,'Current Kairos Staging homepage');
    const sectionFile=files.get(SECTION_FILE);
    const canonicalActive=Object.values(document.sections||{}).some(section=>String(section?.type||'')==='mmg-canonical-homepage');
    const requested=extractExplicitReplacements(objective);
    const replacements=requested.size?requested:APPROVED_REPLACEMENTS;

    let installationMode='inspection-only',liquidContentPatch=null;
    let applied=[],unmatched=[...replacements.entries()].map(([before,after])=>({before,after,reason:'source unavailable'}));
    let inventory=[];
    let beforeSignature=null,afterSignature=null,replacementSource=sectionFile?.content||'';

    if(canonicalActive&&sectionFile?.content){
      const result=replaceVisibleGroups(sectionFile.content,replacements);
      applied=result.applied;unmatched=result.unmatched;inventory=result.inventory;
      replacementSource=result.value;
      beforeSignature=markupSignature(sectionFile.content);afterSignature=markupSignature(replacementSource);
      if(beforeSignature!==afterSignature)throw httpError(409,'content_only_structure_change_detected','Content-only planning changed Liquid or markup structure.');
      if(applied.length){
        installationMode='existing-liquid-visible-text';
        liquidContentPatch={filename:SECTION_FILE,originalSource:sectionFile.content,replacementSource,beforeSignature,afterSignature,visibleTextReplacementCount:applied.length,replacements:applied,unmatched,inventory,nodeDistributionPreserved:true};
      }
    }

    const summary=applied.length
      ?`Inspection complete: ${applied.length} safe visible-text replacement${applied.length===1?'':'s'} found; ${unmatched.length} phrase${unmatched.length===1?'':'s'} unmatched.`
      :`Inspection complete: no uniquely matching visible source phrases were found; ${unmatched.length} requested phrase${unmatched.length===1?'':'s'} reported as unmatched. No write package was generated.`;
    const changes=[
      ...applied.map(item=>({filename:SECTION_FILE,purpose:`Replace “${item.before}” with “${item.after}”.`,changeType:'modify',instructions:['Change only this uniquely matched visible-text group.','Preserve all Liquid and HTML tokens.','Preserve the original styled text-node distribution.'],expectedOutcome:'One surgical content substitution using the existing styles, spans, cards, and pills.'})),
      ...unmatched.map(item=>({filename:SECTION_FILE,purpose:`Unmatched source phrase: “${item.before}”.`,changeType:'no-change',instructions:['Do not substitute a different phrase.','Report the closest visible source candidates.'],expectedOutcome:'No source change.'}))
    ];
    const targetFiles=[HOMEPAGE_FILE,SECTION_FILE,CSS_FILE];
    const sourceHashes=Object.fromEntries(targetFiles.map(filename=>[filename,files.get(filename)?.sha256||null]));
    const now=new Date().toISOString();
    const executable=installationMode==='existing-liquid-visible-text'&&applied.length>0;
    const result={actionID:crypto.randomUUID(),planID:crypto.randomUUID(),actionType:'shopify.staging.plan',requestType:'content-only',mutationScope:installationMode,status:executable?'ready-for-approval':'inspection-complete',readOnly:true,build:BUILD,kernel:'content-only-shopify-planner-v7',startedAt:now,completedAt:now,objective,summary,plan:{summary,strategy:'Build a read-only inventory of complete rendered text groups from the current staging Liquid, then replace only one uniquely matched group per requested phrase while preserving every existing styled text node. Never generate a homepage package.',changes,risks:executable?['Replacement copy may wrap naturally; no design mutation is authorized.']:['No executable text patch exists until a unique visible source match is found.'],acceptanceCriteria:['Only uniquely matched visible-text groups may change.','Every original non-empty styled text node remains non-empty when the replacement has enough words.','Liquid and HTML token signatures remain identical.','templates/index.json and the stylesheet remain unchanged.','No homepage package is generated.','The live MAIN theme remains unchanged.'],rollbackPlan:executable?['Restore only the original canonical homepage Liquid section.']:['No rollback is required because Step 1 generated no writes.'],installationMode,deterministicPatch:null,liquidContentPatch,canonicalPackage:null,targetTheme:stagingTheme,publishedTheme:mainTheme,sourceHashes,mutationScope:'surgical-content-only',executable,structuralMutationAuthorized:false,styleMutationAuthorized:false,productionPublishAuthorized:false,liveThemeMutationAuthorized:false,providerPolicy:{externalInferenceProviders:'prohibited'}},evidence:{sourceInspectionActionID:sourceBody.actionID||'',stagingTheme,mainTheme,suppliedFiles:targetFiles.map(filename=>({filename,exists:files.has(filename),sha256:files.get(filename)?.sha256||null,bytes:files.get(filename)?.bytes||0})),planningEngine:BUILD,externalInferenceProviderUsed:false,evidenceNotes:[...applied.map(item=>`Unique visible match (${item.confidence.toFixed(2)}): “${item.matchedText}”; styled nodes preserved: ${item.nodeCount}.`),...unmatched.map(item=>`Unmatched: “${item.before}”. Closest: ${item.closest||'none'}.`)],visibleTextInventory:inventory}};
    const jobID=crypto.randomUUID();
    const completed={jobID,status:'completed',build:BUILD,submittedAt:now,updatedAt:now,completedAt:now,summary,result};
    await caches.default.put(jobRequest(request,jobID),new Response(JSON.stringify(completed),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${JOB_TTL_SECONDS}`,'X-MMG-Runtime':BUILD}}));
    return json({jobID,status:'completed',build:BUILD,pollURL:`/api/shopify/staging/plan/jobs/${jobID}`,summary,result},202);
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:500;
    return json({status:'needs-attention',build:BUILD,summary:'Kairos could not inspect the content-only Shopify source.',error:{status,code:typeof error?.code==='string'?error.code:'content_only_plan_failed',message:error instanceof Error?error.message:'Content-only inspection failed.'}},status);
  }
}

function extractExplicitReplacements(objective){
  const map=new Map();
  const patterns=[/replace\s+[“"]([^”"]+)[”"]\s+with\s+[“"]([^”"]+)[”"]/gi,/change\s+[“"]([^”"]+)[”"]\s+to\s+[“"]([^”"]+)[”"]/gi,/[“"]([^”"]+)[”"]\s*(?:→|=>)\s*[“"]([^”"]+)[”"]/g];
  for(const pattern of patterns){let match;while((match=pattern.exec(objective))!==null){const before=match[1].trim(),after=match[2].trim();if(before&&after&&before!==after)map.set(before,after);}}
  return map;
}

function replaceVisibleGroups(source,replacements){
  const tokens=String(source||'').split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
  const groups=buildGroups(tokens);
  const inventory=groups.map(group=>({text:group.text,normalized:group.normalized,tokenIndexes:group.textIndexes}));
  const applied=[],unmatched=[];const used=new Set();
  for(const [before,after] of replacements.entries()){
    const target=normalizeVisible(before);
    const ranked=groups.map((group,index)=>({group,index,score:similarity(target,group.normalized)})).filter(item=>!used.has(item.index)).sort((a,b)=>b.score-a.score);
    const best=ranked[0],second=ranked[1];
    const unique=best&&best.score>=0.72&&(!second||best.score-second.score>=0.08);
    if(!unique){unmatched.push({before,after,closest:best?.group?.text||'',confidence:best?.score||0,reason:'no unique visible match'});continue;}
    writeGroupPreservingNodes(tokens,best.group,after);
    used.add(best.index);
    applied.push({requestedBefore:before,before:best.group.text,matchedText:best.group.text,after,confidence:best.score,unique:true,nodeCount:best.group.textIndexes.length,nodeDistributionPreserved:true});
  }
  return{value:tokens.join(''),applied,unmatched,inventory};
}

function buildGroups(tokens){
  const groups=[];let current=[];let blocked=0;
  const flush=()=>{const textIndexes=current.filter(index=>isVisibleText(tokens[index]));const text=textIndexes.map(index=>decodeEntities(tokens[index])).join(' ').replace(/\s+/g,' ').trim();if(text)groups.push({text,normalized:normalizeVisible(text),textIndexes});current=[];};
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];if(!token)continue;
    if(token.startsWith('{{')||token.startsWith('{%')){current.push(i);continue;}
    if(token.startsWith('<')){
      const close=token.match(/^<\s*\/\s*([a-z0-9:-]+)/i),open=token.match(/^<\s*([a-z0-9:-]+)/i);
      const tag=(close?.[1]||open?.[1]||'').toLowerCase();
      if(close&&BLOCKED_TAGS.has(tag))blocked=Math.max(0,blocked-1);
      if(blocked===0&&BLOCK_TAGS.has(tag))flush();
      current.push(i);
      if(open&&!close&&!/\/\s*>$/.test(token)&&BLOCKED_TAGS.has(tag))blocked++;
      if(blocked===0&&close&&BLOCK_TAGS.has(tag))flush();
      continue;
    }
    if(blocked===0)current.push(i);
  }
  flush();return groups;
}

function writeGroupPreservingNodes(tokens,group,replacement){
  const indexes=group.textIndexes;if(!indexes.length)return;
  const originals=indexes.map(index=>tokens[index]);
  const weights=originals.map(token=>Math.max(1,normalizeVisible(token).split(' ').filter(Boolean).length));
  const parts=distributeReplacement(String(replacement||'').trim(),weights);
  for(let i=0;i<indexes.length;i++){
    const index=indexes[i],original=originals[i];
    const leading=original.match(/^\s*/)?.[0]||'',trailing=original.match(/\s*$/)?.[0]||'';
    tokens[index]=`${leading}${parts[i]||''}${trailing}`;
  }
}

function distributeReplacement(replacement,weights){
  const nodeCount=weights.length;
  if(nodeCount<=1)return[replacement];
  const words=replacement.split(/\s+/).filter(Boolean);
  if(words.length>=nodeCount){
    const totalWeight=weights.reduce((sum,value)=>sum+value,0)||nodeCount;
    const counts=weights.map(weight=>Math.max(1,Math.floor(words.length*weight/totalWeight)));
    let assigned=counts.reduce((sum,value)=>sum+value,0);
    while(assigned>words.length){
      let changed=false;
      for(let i=counts.length-1;i>=0&&assigned>words.length;i--)if(counts[i]>1){counts[i]--;assigned--;changed=true;}
      if(!changed)break;
    }
    while(assigned<words.length){counts[counts.length-1]++;assigned++;}
    const parts=[];let cursor=0;
    for(const count of counts){parts.push(words.slice(cursor,cursor+count).join(' '));cursor+=count;}
    return parts;
  }
  const characters=[...replacement];
  const parts=[];let cursor=0;
  for(let i=0;i<nodeCount;i++){
    const remainingNodes=nodeCount-i;
    const remainingChars=characters.length-cursor;
    const size=i===nodeCount-1?remainingChars:Math.max(1,Math.floor(remainingChars/remainingNodes));
    parts.push(characters.slice(cursor,cursor+size).join(''));
    cursor+=size;
  }
  return parts;
}

function isVisibleText(token){return Boolean(token&&!token.startsWith('<')&&!token.startsWith('{{')&&!token.startsWith('{%')&&token.trim());}
function normalizeVisible(value){return decodeEntities(String(value||'')).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-').replace(/[^a-z0-9'"-]+/g,' ').replace(/\s+/g,' ').trim();}
function decodeEntities(value){return String(value||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;|&#34;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&mdash;|&#8212;/gi,'—').replace(/&ndash;|&#8211;/gi,'–').replace(/<br\s*\/?\s*>/gi,' ');}
function similarity(a,b){if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return Math.min(a.length,b.length)/Math.max(a.length,b.length)*0.95;const A=new Set(a.split(' ')),B=new Set(b.split(' '));let intersection=0;for(const word of A)if(B.has(word))intersection++;const union=new Set([...A,...B]).size||1;const jaccard=intersection/union;const length=Math.min(a.length,b.length)/Math.max(a.length,b.length);return jaccard*0.8+length*0.2;}
function markupSignature(source){return(String(source||'').match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g)||[]).join('\u001f');}
function validateBoundary(stagingTheme,mainTheme){if(!stagingTheme?.gid||String(stagingTheme.role||'').toUpperCase()==='MAIN')throw httpError(409,'verified_staging_required','A verified non-live Kairos Staging theme is required.');if(!mainTheme?.gid||String(mainTheme.role||'').toUpperCase()!=='MAIN')throw httpError(409,'main_theme_verification_failed','The live MAIN theme could not be verified.');}
function jobRequest(request,jobID){return new Request(new URL(`/_kairos/standalone-plan-jobs/${jobID}`,request.url).toString(),{method:'GET'});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-MMG-Runtime':BUILD,'X-Kairos-Website-Intent':'content-only','X-Kairos-Content-Mutation':'section-aware-node-preserving-text','X-Kairos-Content-Only-Fallback':'prohibited','X-Content-Type-Options':'nosniff'}});}
