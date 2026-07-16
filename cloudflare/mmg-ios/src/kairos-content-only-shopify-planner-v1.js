import {
  httpError,
  inspectStagingSource,
  parseShopifyJson,
} from './kairos-compact-homepage-utils-v1.js';

const BUILD='kairos-content-only-shopify-planner-20260715-5';
const HOMEPAGE_FILE='templates/index.json';
const SECTION_FILE='sections/mmg-canonical-homepage.liquid';
const CSS_FILE='assets/mmg-canonical-homepage.css';
const JOB_TTL_SECONDS=3600;
const MAX_OBJECTIVE_CHARS=12000;

const APPROVED_REPLACEMENTS=new Map([
  ['The guided path','The customer journey'],
  ['Start where you are.\nBuild what comes next.','Start where you are.\nMove toward what comes next.'],
  ['You do not need the entire future mapped out. Choose the stage that matches your work today, then move through a connected system.','Choose the stage that matches your work today, then follow a connected path from learning and planning to a finished outcome.'],
  ['Choose what you want to build','Choose your path'],
  ['One ecosystem.\nMultiple ways forward.','One ecosystem.\nA clear way forward.'],
  ['Every pathway combines education, practical tools, and production support so the next step connects to the larger body of work.','Each pathway connects practical learning, digital resources, professional support, and a clear next step.'],
  ['A connected knowledge ecosystem','Your connected knowledge journey'],
  ['Every asset should lead\nsomewhere useful.','Every step should lead\nsomewhere useful.'],
  ['MMG is designed as a connected journey—not a shelf of unrelated products.','MMG connects learning, creation, publishing, and continued growth in one guided customer journey.'],
  ['Continue through MMG','Continue your journey'],
  ['Keep moving through\nthe system.','Keep moving through\nyour journey.'],
  ['Choose your next step','Your next step'],
  ['Start with a free tool, explore the library, or bring a serious publishing project into production.','Explore a resource, continue learning, or bring a publishing project into professional production.']
]);

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/shopify/staging/plan/jobs'&&request.method==='POST')return createContentOnlyPlan(request,env);
    return json({status:'not-found',build:BUILD},404);
  }
};

async function createContentOnlyPlan(request,env){
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
    const requestedReplacements=extractExplicitReplacements(objective);
    const replacements=requestedReplacements.size?requestedReplacements:APPROVED_REPLACEMENTS;

    let installationMode='inspection-only';
    let liquidContentPatch=null;
    let packageResult;

    if(canonicalActive&&sectionFile?.content){
      const replacement=replaceExactVisibleLiquidText(sectionFile.content,replacements);
      const beforeSignature=markupSignature(sectionFile.content),afterSignature=markupSignature(replacement.value);
      if(beforeSignature!==afterSignature)throw httpError(409,'content_only_structure_change_detected','Content-only planning changed Liquid or markup structure.');
      const unmatched=[...replacements.entries()]
        .filter(([before])=>!replacement.applied.some(item=>item.requestedBefore===before))
        .map(([before,after])=>({before,after}));
      if(replacement.changed){
        installationMode='existing-liquid-visible-text';
        liquidContentPatch={
          filename:SECTION_FILE,
          originalSource:sectionFile.content,
          replacementSource:replacement.value,
          beforeSignature,
          afterSignature,
          visibleTextReplacementCount:replacement.count,
          replacements:replacement.applied,
          unmatched
        };
      }
      packageResult={
        summary:replacement.changed
          ?`Inspection complete: ${replacement.count} exact homepage text replacement${replacement.count===1?'':'s'} found; ${unmatched.length} phrase${unmatched.length===1?'':'s'} unmatched.`
          :`Inspection complete: no exact source phrases matched; ${unmatched.length} requested phrase${unmatched.length===1?'':'s'} reported as unmatched. No write package was generated.`,
        strategy:'Inspect the current staging source and match only exact visible phrases. Never generate, rebuild, redesign, or replace the homepage package in content-only mode.',
        changes:[
          ...replacement.applied.map(item=>({filename:SECTION_FILE,purpose:`Replace “${item.before}” with “${item.after}”.`,changeType:'modify',instructions:['Change this exact visible phrase only.','Leave all surrounding source byte-for-byte unchanged.'],expectedOutcome:'One surgical content substitution in the existing homepage.'})),
          ...unmatched.map(item=>({filename:SECTION_FILE,purpose:`Unmatched source phrase: “${item.before}”.`,changeType:'no-change',instructions:['Do not substitute a different phrase.','Report this item for correction.'],expectedOutcome:'No source change.'}))
        ],
        risks:replacement.changed?['Approved replacement copy may wrap naturally; no style or structure mutation is authorized.']:['No executable text patch exists until at least one exact source phrase is matched.'],
        acceptanceCriteria:['Only listed exact phrases may change.','Every unmatched visible word remains unchanged.','Liquid and HTML token signatures remain identical.','The template and stylesheet hashes remain unchanged.','No canonical homepage package is generated.','The live MAIN theme remains unchanged.'],
        rollbackPlan:replacement.changed?['Preserve and restore only the original canonical homepage Liquid section.']:['No rollback is required because Step 1 generated no writes.'],
        evidenceNotes:[
          ...replacement.applied.map(item=>`Exact match: “${item.before}” → “${item.after}”.`),
          ...unmatched.map(item=>`Unmatched: “${item.before}”.`)
        ]
      };
    }else{
      const requested=[...replacements.entries()].map(([before,after])=>({before,after}));
      packageResult={
        summary:'Inspection complete: the canonical homepage Liquid section was not active or readable. No write package was generated.',
        strategy:'Stop safely in content-only mode. Do not fall back to the deterministic homepage package or any structural retool pipeline.',
        changes:requested.map(item=>({filename:SECTION_FILE,purpose:`Unmatched source phrase: “${item.before}”.`,changeType:'no-change',instructions:['Do not generate a replacement homepage.','Report the unavailable source.'],expectedOutcome:'No source change.'})),
        risks:['The current staging homepage source must be identified before text-only writes can be prepared.'],
        acceptanceCriteria:['No files change.','No canonical homepage package is generated.','The live MAIN theme remains unchanged.'],
        rollbackPlan:['No rollback is required because Step 1 generated no writes.'],
        evidenceNotes:['Canonical homepage section unavailable; full-retool fallback prohibited.']
      };
    }

    const targetFiles=[HOMEPAGE_FILE,SECTION_FILE,CSS_FILE];
    const sourceHashes=Object.fromEntries(targetFiles.map(filename=>[filename,files.get(filename)?.sha256||null]));
    const now=new Date().toISOString();
    const executable=installationMode==='existing-liquid-visible-text'&&Boolean(liquidContentPatch?.visibleTextReplacementCount);
    const result={
      actionID:crypto.randomUUID(),planID:crypto.randomUUID(),actionType:'shopify.staging.plan',requestType:'content-only',mutationScope:installationMode,
      status:executable?'ready-for-approval':'inspection-complete',readOnly:true,build:BUILD,kernel:'content-only-shopify-planner-v5',startedAt:now,completedAt:now,objective,summary:packageResult.summary,
      plan:{summary:packageResult.summary,strategy:packageResult.strategy,changes:packageResult.changes,risks:packageResult.risks,acceptanceCriteria:packageResult.acceptanceCriteria,rollbackPlan:packageResult.rollbackPlan,installationMode,deterministicPatch:null,liquidContentPatch,canonicalPackage:null,targetTheme:stagingTheme,publishedTheme:mainTheme,sourceHashes,mutationScope:'surgical-content-only',executable,structuralMutationAuthorized:false,styleMutationAuthorized:false,productionPublishAuthorized:false,liveThemeMutationAuthorized:false,providerPolicy:{externalInferenceProviders:'prohibited'}},
      evidence:{sourceInspectionActionID:sourceBody.actionID||'',stagingTheme,mainTheme,suppliedFiles:targetFiles.map(filename=>({filename,exists:files.has(filename),sha256:files.get(filename)?.sha256||null,bytes:files.get(filename)?.bytes||0})),planningEngine:BUILD,externalInferenceProviderUsed:false,evidenceNotes:packageResult.evidenceNotes}
    };
    const jobID=crypto.randomUUID();
    const completed={jobID,status:'completed',build:BUILD,submittedAt:now,updatedAt:now,completedAt:now,summary:result.summary,result};
    await caches.default.put(jobRequest(request,jobID),new Response(JSON.stringify(completed),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${JOB_TTL_SECONDS}`,'X-MMG-Runtime':BUILD}}));
    return json({jobID,status:'completed',build:BUILD,pollURL:`/api/shopify/staging/plan/jobs/${jobID}`,summary:result.summary,result},202);
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:500;
    return json({status:'needs-attention',build:BUILD,summary:'Kairos could not inspect the content-only Shopify source.',error:{status,code:typeof error?.code==='string'?error.code:'content_only_plan_failed',message:error instanceof Error?error.message:'Content-only inspection failed.'}},status);
  }
}

function extractExplicitReplacements(objective){
  const replacements=new Map();
  const patterns=[
    /replace\s+[“"]([^”"]+)[”"]\s+with\s+[“"]([^”"]+)[”"]/gi,
    /change\s+[“"]([^”"]+)[”"]\s+to\s+[“"]([^”"]+)[”"]/gi,
    /[“"]([^”"]+)[”"]\s*(?:→|=>)\s*[“"]([^”"]+)[”"]/g
  ];
  for(const pattern of patterns){
    let match;
    while((match=pattern.exec(objective))!==null){
      const before=match[1].trim(),after=match[2].trim();
      if(before&&after&&before!==after)replacements.set(before,after);
    }
  }
  return replacements;
}

function replaceExactVisibleLiquidText(source,replacements){
  const tokens=String(source||'').split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
  const blocked=[];let count=0,changed=false;const applied=[];
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];if(!token)continue;
    if(token.startsWith('{{')||token.startsWith('{%'))continue;
    if(token.startsWith('<')){updateBlockedStack(blocked,token);continue;}
    if(blocked.length)continue;
    const leading=token.match(/^\s*/)?.[0]||'',trailing=token.match(/\s*$/)?.[0]||'';
    const core=token.slice(leading.length,token.length-trailing.length);
    if(!core)continue;
    const exact=replacements.get(core);
    if(!exact)continue;
    tokens[i]=`${leading}${exact}${trailing}`;
    applied.push({requestedBefore:core,before:core,after:exact});count++;changed=true;
  }
  return{changed,count,applied,value:tokens.join('')};
}

function updateBlockedStack(stack,token){
  const close=token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);if(close){const tag=close[1].toLowerCase(),last=stack.lastIndexOf(tag);if(last!==-1)stack.splice(last,1);return;}
  const open=token.match(/^<\s*([a-z0-9:-]+)/i);if(!open||/\/\s*>$/.test(token))return;
  const tag=open[1].toLowerCase();if(['script','style','svg','template','noscript','code','pre'].includes(tag))stack.push(tag);
}
function markupSignature(source){return(String(source||'').match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g)||[]).join('\u001f');}
function validateBoundary(stagingTheme,mainTheme){
  if(!stagingTheme?.gid||String(stagingTheme.role||'').toUpperCase()==='MAIN')throw httpError(409,'verified_staging_required','A verified non-live Kairos Staging theme is required.');
  if(!mainTheme?.gid||String(mainTheme.role||'').toUpperCase()!=='MAIN')throw httpError(409,'main_theme_verification_failed','The live MAIN theme could not be verified.');
}
function jobRequest(request,jobID){return new Request(new URL(`/_kairos/standalone-plan-jobs/${jobID}`,request.url).toString(),{method:'GET'});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-MMG-Runtime':BUILD,'X-Kairos-Website-Intent':'content-only','X-Kairos-Content-Mutation':'surgical-exact-match','X-Kairos-Content-Only-Fallback':'prohibited','X-Content-Type-Options':'nosniff'}});}
