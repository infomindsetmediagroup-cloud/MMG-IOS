import {httpError,inspectStagingSource,parseShopifyJson} from './kairos-compact-homepage-utils-v1.js';

const BUILD='kairos-content-only-shopify-planner-20260715-9';
const HOMEPAGE_FILE='templates/index.json';
const SECTION_FILE='sections/mmg-canonical-homepage.liquid';
const CSS_FILE='assets/mmg-canonical-homepage.css';
const JOB_TTL_SECONDS=3600;
const MAX_OBJECTIVE_CHARS=12000;
const BLOCK_TAGS=new Set(['address','article','aside','blockquote','button','div','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','li','main','nav','p','section','td','th']);
const BLOCKED_TAGS=new Set(['script','style','svg','template','noscript','code','pre']);

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
    const files=new Map((Array.isArray(evidence.files)?evidence.files:[])
      .filter(file=>file?.readable&&typeof file?.filename==='string'&&typeof file?.content==='string')
      .map(file=>[file.filename,file]));
    const templateFile=files.get(HOMEPAGE_FILE);
    if(!templateFile?.content)throw httpError(409,'homepage_source_unavailable','templates/index.json was not readable from Kairos Staging.');
    const document=parseShopifyJson(templateFile.content,'Current Kairos Staging homepage');
    const sectionFile=files.get(SECTION_FILE);
    const canonicalActive=Object.values(document.sections||{}).some(section=>String(section?.type||'')==='mmg-canonical-homepage');
    const replacements=extractExplicitReplacements(objective);

    let installationMode='inspection-only',liquidContentPatch=null;
    let applied=[],unmatched=[];
    let inventory=[];
    let beforeSignature=null,afterSignature=null,replacementSource=sectionFile?.content||'';

    if(!replacements.size){
      unmatched=[{before:'',after:'',reason:'No valid explicit replacement blocks were found. Use Replace: “source” with: “replacement”.'}];
    }else if(canonicalActive&&sectionFile?.content){
      const result=replaceVisibleGroups(sectionFile.content,replacements);
      applied=result.applied;unmatched=result.unmatched;inventory=result.inventory;replacementSource=result.value;
      beforeSignature=markupSignature(sectionFile.content);afterSignature=markupSignature(replacementSource);
      if(beforeSignature!==afterSignature)throw httpError(409,'content_only_structure_change_detected','Content-only planning changed Liquid or markup structure.');
      if(applied.length){
        installationMode='existing-liquid-visible-text';
        liquidContentPatch={
          filename:SECTION_FILE,originalSource:sectionFile.content,replacementSource,beforeSignature,afterSignature,
          visibleTextReplacementCount:applied.filter(item=>!item.alreadyPresent).length,
          verifiedAlreadyPresentCount:applied.filter(item=>item.alreadyPresent).length,
          replacements:applied,unmatched,inventory,nodeDistributionPreserved:true,styledTextNodesPreserved:true,
          literalOnly:true,fuzzyMatchingUsed:false,defaultReplacementMapUsed:false
        };
      }
    }

    const changedCount=applied.filter(item=>!item.alreadyPresent).length;
    const alreadyCount=applied.filter(item=>item.alreadyPresent).length;
    const summary=applied.length
      ?`Inspection complete: ${changedCount} exact visible-text replacement${changedCount===1?'':'s'} ready; ${alreadyCount} already present; ${unmatched.length} unmatched.`
      :`Inspection complete: no exact unique source phrases were eligible for writing; ${unmatched.length} item${unmatched.length===1?'':'s'} reported without mutation.`;
    const changes=[
      ...applied.map(item=>({filename:SECTION_FILE,purpose:item.alreadyPresent?`Verify approved text already present: “${item.after}”.`:`Replace “${item.before}” with “${item.after}”.`,changeType:item.alreadyPresent?'verify':'modify',instructions:['Use only the explicitly supplied source and replacement pair.','Preserve all Liquid and HTML tokens.','Preserve the original styled text-node distribution.','Do not infer, generate, or rewrite surrounding copy.'],expectedOutcome:item.alreadyPresent?'No write; verified approved text remains in the existing design.':'One literal content substitution inside the existing design.'})),
      ...unmatched.map(item=>({filename:SECTION_FILE,purpose:item.before?`Unmatched or ambiguous source phrase: “${item.before}”.`:item.reason,changeType:'no-change',instructions:['Do not substitute a similar phrase.','Do not use fuzzy matching.','Do not invoke a default content map.'],expectedOutcome:'No source change.'}))
    ];
    const targetFiles=[HOMEPAGE_FILE,SECTION_FILE,CSS_FILE];
    const sourceHashes=Object.fromEntries(targetFiles.map(filename=>[filename,files.get(filename)?.sha256||null]));
    const now=new Date().toISOString();
    const executable=installationMode==='existing-liquid-visible-text'&&applied.length>0;
    const result={
      actionID:crypto.randomUUID(),planID:crypto.randomUUID(),actionType:'shopify.staging.plan',requestType:'content-only',mutationScope:installationMode,
      status:executable?'ready-for-approval':'inspection-complete',readOnly:true,build:BUILD,kernel:'content-only-shopify-planner-v9-block-parser',startedAt:now,completedAt:now,objective,summary,
      plan:{summary,strategy:'Apply only explicit Replace source/with replacement blocks to one exact normalized visible-text group. Never infer copy, use fuzzy matching, load a default replacement map, or generate a homepage package.',changes,risks:executable?['Replacement copy may wrap naturally; no design mutation is authorized.']:['No executable literal text patch exists.'],acceptanceCriteria:['Only explicit replacement pairs may change.','Each source phrase must match exactly one normalized visible-text group.','Every styled text node remains present.','Liquid and HTML token signatures remain identical.','templates/index.json and the stylesheet remain unchanged.','No inferred or default content is used.','No homepage package is generated.','The live MAIN theme remains unchanged.'],rollbackPlan:executable?['Restore only the original canonical homepage Liquid section.']:['No rollback is required because no write package exists.'],installationMode,deterministicPatch:null,liquidContentPatch,canonicalPackage:null,targetTheme:stagingTheme,publishedTheme:mainTheme,sourceHashes,mutationScope:'surgical-content-only',executable,structuralMutationAuthorized:false,styleMutationAuthorized:false,productionPublishAuthorized:false,liveThemeMutationAuthorized:false,literalOnly:true,fuzzyMatchingAuthorized:false,defaultReplacementMapAuthorized:false,providerPolicy:{externalInferenceProviders:'prohibited'}},
      evidence:{sourceInspectionActionID:sourceBody.actionID||'',stagingTheme,mainTheme,suppliedFiles:targetFiles.map(filename=>({filename,exists:files.has(filename),sha256:files.get(filename)?.sha256||null,bytes:files.get(filename)?.bytes||0})),planningEngine:BUILD,externalInferenceProviderUsed:false,evidenceNotes:[...applied.map(item=>item.alreadyPresent?`Already present exactly: “${item.after}”.`:`Exact unique match: “${item.matchedText}”; styled nodes preserved: ${item.nodeCount}.`),...unmatched.map(item=>item.before?`No exact unique match: “${item.before}”.`:item.reason)],visibleTextInventory:inventory,parsedReplacementCount:replacements.size}
    };
    const jobID=crypto.randomUUID();
    const completed={jobID,status:'completed',build:BUILD,submittedAt:now,updatedAt:now,completedAt:now,summary,result};
    await caches.default.put(jobRequest(request,jobID),new Response(JSON.stringify(completed),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${JOB_TTL_SECONDS}`,'X-MMG-Runtime':BUILD}}));
    return json({jobID,status:'completed',build:BUILD,pollURL:`/api/shopify/staging/plan/jobs/${jobID}`,summary,result},202);
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:500;
    return json({status:'needs-attention',build:BUILD,summary:'Kairos could not inspect the literal content-only Shopify source.',error:{status,code:typeof error?.code==='string'?error.code:'content_only_plan_failed',message:error instanceof Error?error.message:'Content-only inspection failed.'}},status);
  }
}

function extractExplicitReplacements(objective){
  const map=new Map();
  const text=String(objective||'');
  const patterns=[
    /\breplace\s*:?\s*[“"]([\s\S]*?)[”"]\s*\bwith\s*:?\s*[“"]([\s\S]*?)[”"]/gi,
    /\bchange\s*:?\s*[“"]([\s\S]*?)[”"]\s*\bto\s*:?\s*[“"]([\s\S]*?)[”"]/gi,
    /[“"]([\s\S]*?)[”"]\s*(?:→|=>)\s*[“"]([\s\S]*?)[”"]/g
  ];
  for(const pattern of patterns){
    let match;
    while((match=pattern.exec(text))!==null){
      const before=cleanPhrase(match[1]);
      const after=cleanPhrase(match[2]);
      if(!before||!after)continue;
      const beforeNorm=normalizeVisible(before),afterNorm=normalizeVisible(after);
      if(!beforeNorm||!afterNorm||beforeNorm===afterNorm)continue;
      if(isPlaceholderPair(beforeNorm,afterNorm))continue;
      map.set(before,after);
    }
  }
  return map;
}
function cleanPhrase(value){return String(value||'').replace(/\s+/g,' ').trim();}
function isPlaceholderPair(before,after){
  const placeholders=new Set(['source','replacement','old text','new text','current text','new copy','before','after','a','b']);
  return placeholders.has(before)&&placeholders.has(after);
}

function replaceVisibleGroups(source,replacements){
  const tokens=String(source||'').split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
  const groups=buildGroups(tokens);
  const inventory=groups.map(group=>({text:group.text,normalized:group.normalized,tokenIndexes:group.textIndexes}));
  const applied=[],unmatched=[],used=new Set();
  for(const [before,after] of replacements.entries()){
    const target=normalizeVisible(before),desired=normalizeVisible(after);
    const exact=groups.map((group,index)=>({group,index})).filter(item=>!used.has(item.index)&&item.group.normalized===target);
    if(exact.length===1){
      const match=exact[0];writeGroupPreservingNodes(tokens,match.group,after);used.add(match.index);
      applied.push({requestedBefore:before,before:match.group.text,matchedText:match.group.text,after,confidence:1,unique:true,nodeCount:match.group.textIndexes.length,nodeDistributionPreserved:true,alreadyPresent:false,literalMatch:true});continue;
    }
    if(exact.length>1){unmatched.push({before,after,closest:'',confidence:1,reason:'multiple exact visible matches'});continue;}
    const already=groups.map((group,index)=>({group,index})).filter(item=>!used.has(item.index)&&item.group.normalized===desired);
    if(already.length===1){
      const match=already[0];used.add(match.index);
      applied.push({requestedBefore:before,before:match.group.text,matchedText:match.group.text,after,confidence:1,unique:true,nodeCount:match.group.textIndexes.length,nodeDistributionPreserved:true,alreadyPresent:true,literalMatch:true});continue;
    }
    unmatched.push({before,after,closest:'',confidence:0,reason:already.length>1?'replacement text appears more than once':'no exact normalized visible match'});
  }
  return{value:tokens.join(''),applied,unmatched,inventory};
}

function buildGroups(tokens){
  const groups=[];let current=[],blocked=0;
  const flush=()=>{const textIndexes=current.filter(index=>isVisibleText(tokens[index]));const text=textIndexes.map(index=>decodeEntities(tokens[index])).join(' ').replace(/\s+/g,' ').trim();if(text)groups.push({text,normalized:normalizeVisible(text),textIndexes});current=[];};
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];if(!token)continue;
    if(token.startsWith('{{')||token.startsWith('{%')){current.push(i);continue;}
    if(token.startsWith('<')){
      const close=token.match(/^<\s*\/\s*([a-z0-9:-]+)/i),open=token.match(/^<\s*([a-z0-9:-]+)/i),tag=(close?.[1]||open?.[1]||'').toLowerCase();
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
    const index=indexes[i],original=originals[i],leading=original.match(/^\s*/)?.[0]||'',trailing=original.match(/\s*$/)?.[0]||'';
    tokens[index]=`${leading}${parts[i]||''}${trailing}`;
  }
}
function distributeReplacement(replacement,weights){
  const nodeCount=weights.length;if(nodeCount<=1)return[replacement];
  const words=replacement.split(/\s+/).filter(Boolean);
  if(words.length>=nodeCount){
    const totalWeight=weights.reduce((sum,value)=>sum+value,0)||nodeCount;
    const counts=weights.map(weight=>Math.max(1,Math.floor(words.length*weight/totalWeight)));
    let assigned=counts.reduce((sum,value)=>sum+value,0);
    while(assigned>words.length){let changed=false;for(let i=counts.length-1;i>=0&&assigned>words.length;i--){if(counts[i]>1){counts[i]--;assigned--;changed=true;}}if(!changed)break;}
    while(assigned<words.length){counts[counts.length-1]++;assigned++;}
    const parts=[];let cursor=0;for(const count of counts){parts.push(words.slice(cursor,cursor+count).join(' '));cursor+=count;}return parts;
  }
  const characters=[...replacement],parts=[];let cursor=0;
  for(let i=0;i<nodeCount;i++){const remainingNodes=nodeCount-i,remainingChars=characters.length-cursor,size=i===nodeCount-1?remainingChars:Math.max(1,Math.floor(remainingChars/remainingNodes));parts.push(characters.slice(cursor,cursor+size).join(''));cursor+=size;}
  return parts;
}

function isVisibleText(token){return Boolean(token&&!token.startsWith('<')&&!token.startsWith('{{')&&!token.startsWith('{%')&&token.trim());}
function normalizeVisible(value){return decodeEntities(String(value||'')).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-').replace(/[^a-z0-9'"-]+/g,' ').replace(/\s+/g,' ').trim();}
function decodeEntities(value){return String(value||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;|&#34;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&mdash;|&#8212;/gi,'—').replace(/&ndash;|&#8211;/gi,'–').replace(/<br\s*\/?\s*>/gi,' ');}
function markupSignature(source){return(String(source||'').match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g)||[]).join('\u001f');}
function validateBoundary(stagingTheme,mainTheme){if(!stagingTheme?.gid||String(stagingTheme.role||'').toUpperCase()==='MAIN')throw httpError(409,'verified_staging_required','A verified non-live Kairos Staging theme is required.');if(!mainTheme?.gid||String(mainTheme.role||'').toUpperCase()!=='MAIN')throw httpError(409,'main_theme_verification_failed','The live MAIN theme could not be verified.');}
function jobRequest(request,jobID){return new Request(new URL(`/_kairos/standalone-plan-jobs/${jobID}`,request.url).toString(),{method:'GET'});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-MMG-Runtime':BUILD,'X-Kairos-Website-Intent':'content-only','X-Kairos-Content-Mutation':'section-aware-visible-text-literal-only','X-Kairos-Replacement-Parser':'block-and-inline-v9','X-Kairos-Content-Only-Fallback':'prohibited','X-Kairos-Fuzzy-Matching':'prohibited','X-Content-Type-Options':'nosniff'}});}
