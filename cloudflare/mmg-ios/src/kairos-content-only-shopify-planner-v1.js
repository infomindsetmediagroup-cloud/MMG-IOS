import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
} from './kairos-compact-homepage-utils-v1.js';
import { buildDeterministicHomepagePackage } from './kairos-deterministic-homepage-v1.js';

const BUILD='kairos-content-only-shopify-planner-20260715-4';
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
    const files=new Map((Array.isArray(evidence.files)?evidence.files:[]).filter(file=>file?.readable&&typeof file?.filename==='string'&&typeof file?.content==='string').map(file=>[file.filename,file]));
    const templateFile=files.get(HOMEPAGE_FILE);
    if(!templateFile?.content)throw httpError(409,'homepage_source_unavailable','templates/index.json was not readable from Kairos Staging.');
    const document=parseShopifyJson(templateFile.content,'Current Kairos Staging homepage');

    const sectionFile=files.get(SECTION_FILE);
    const canonicalActive=Object.values(document.sections||{}).some(section=>String(section?.type||'')==='mmg-canonical-homepage');
    let packageResult;
    let installationMode='existing-text-settings';
    let liquidContentPatch=null;

    if(canonicalActive&&sectionFile?.content){
      const requestedReplacements=extractExplicitReplacements(objective);
      const replacements=requestedReplacements.size?requestedReplacements:APPROVED_REPLACEMENTS;
      const replacement=replaceExactVisibleLiquidText(sectionFile.content,replacements);
      if(!replacement.changed)throw httpError(409,'content_only_exact_text_unavailable','No approved source phrases matched the current homepage. Kairos stopped without changing unrelated text.');
      const beforeSignature=markupSignature(sectionFile.content),afterSignature=markupSignature(replacement.value);
      if(beforeSignature!==afterSignature)throw httpError(409,'content_only_structure_change_detected','Content-only planning changed Liquid or markup structure.');
      installationMode='existing-liquid-visible-text';
      liquidContentPatch={filename:SECTION_FILE,originalSource:sectionFile.content,replacementSource:replacement.value,beforeSignature,afterSignature,visibleTextReplacementCount:replacement.count,replacements:replacement.applied};
      packageResult={
        summary:`Prepare ${replacement.count} exact homepage text replacement${replacement.count===1?'':'s'} without changing any other content or design.`,
        strategy:'Match approved existing phrases exactly and replace only those phrases. Leave every unmatched word, Liquid expression, tag, attribute, class, link, image, card, pill, color, stylesheet, template, section, and responsive behavior unchanged.',
        changes:replacement.applied.map(item=>({filename:SECTION_FILE,purpose:`Replace “${item.before}” with “${item.after}”.`,changeType:'modify',instructions:['Change this exact visible phrase only.','Leave all surrounding source byte-for-byte unchanged.'],expectedOutcome:'One surgical content substitution in the existing homepage.'})),
        risks:['Approved replacement copy may wrap naturally; no style or structure mutation is authorized.'],
        acceptanceCriteria:['Only the listed exact phrases change.','Every unmatched visible word remains unchanged.','Liquid and HTML token signatures remain identical.','The template and stylesheet hashes remain unchanged.','Shopify read-back exactly matches the approved section source.','The live MAIN theme remains unchanged.'],
        rollbackPlan:['Preserve and restore only the original canonical homepage Liquid section.'],
        evidenceNotes:replacement.applied.map(item=>`Exact match: “${item.before}” → “${item.after}”.`)
      };
    }else{
      try{packageResult=buildDeterministicHomepagePackage(document,objective);}catch(error){
        if(error?.code==='canonical_homepage_package_required')throw httpError(409,'content_only_fields_unavailable','No safe existing text source was available for a content-only update.');
        throw error;
      }
      validateContentOnlyPatch(packageResult.patch);
    }

    const targetFiles=installationMode==='existing-liquid-visible-text'?[HOMEPAGE_FILE,SECTION_FILE,CSS_FILE]:[HOMEPAGE_FILE];
    const sourceHashes=Object.fromEntries(targetFiles.map(filename=>[filename,files.get(filename)?.sha256||null]));
    const now=new Date().toISOString();
    const result={actionID:crypto.randomUUID(),planID:crypto.randomUUID(),actionType:'shopify.staging.plan',requestType:'content-only',mutationScope:installationMode,status:'ready-for-approval',readOnly:true,build:BUILD,kernel:'content-only-shopify-planner-v4',startedAt:now,completedAt:now,objective,summary:packageResult.summary,plan:{summary:packageResult.summary,strategy:packageResult.strategy,changes:packageResult.changes,risks:packageResult.risks,acceptanceCriteria:packageResult.acceptanceCriteria,rollbackPlan:packageResult.rollbackPlan,installationMode,deterministicPatch:installationMode==='existing-text-settings'?packageResult.patch:null,liquidContentPatch,canonicalPackage:null,targetTheme:stagingTheme,publishedTheme:mainTheme,sourceHashes,mutationScope:'surgical-content-only',structuralMutationAuthorized:false,styleMutationAuthorized:false,productionPublishAuthorized:false,liveThemeMutationAuthorized:false,providerPolicy:{externalInferenceProviders:'prohibited'}},evidence:{sourceInspectionActionID:sourceBody.actionID||'',stagingTheme,mainTheme,suppliedFiles:targetFiles.map(filename=>({filename,exists:files.has(filename),sha256:files.get(filename)?.sha256||null,bytes:files.get(filename)?.bytes||0})),planningEngine:BUILD,externalInferenceProviderUsed:false,evidenceNotes:packageResult.evidenceNotes}};
    const jobID=crypto.randomUUID();
    const completed={jobID,status:'completed',build:BUILD,submittedAt:now,updatedAt:now,completedAt:now,summary:result.summary,result};
    await caches.default.put(jobRequest(request,jobID),new Response(JSON.stringify(completed),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${JOB_TTL_SECONDS}`,'X-MMG-Runtime':BUILD}}));
    return json({jobID,status:'completed',build:BUILD,pollURL:`/api/shopify/staging/plan/jobs/${jobID}`,summary:result.summary,result},202);
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:500;
    return json({status:'needs-attention',build:BUILD,summary:'Kairos could not prepare the surgical content-only Shopify plan.',error:{status,code:typeof error?.code==='string'?error.code:'content_only_plan_failed',message:error instanceof Error?error.message:'Content-only planning failed.'}},status);
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
    const normalized=core.replace(/<br\s*\/?\s*>/gi,'\n');
    const exact=replacements.get(core)||replacements.get(normalized);
    if(!exact)continue;
    tokens[i]=`${leading}${exact}${trailing}`;
    applied.push({before:core,after:exact});count++;changed=true;
  }
  return{changed,count,applied,value:tokens.join('')};
}

function updateBlockedStack(stack,token){
  const close=token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);if(close){const tag=close[1].toLowerCase(),last=stack.lastIndexOf(tag);if(last!==-1)stack.splice(last,1);return;}
  const open=token.match(/^<\s*([a-z0-9:-]+)/i);if(!open||/\/\s*>$/.test(token))return;
  const tag=open[1].toLowerCase();if(['script','style','svg','template','noscript','code','pre'].includes(tag))stack.push(tag);
}
function markupSignature(source){return(String(source||'').match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g)||[]).join('\u001f');}
function validateContentOnlyPatch(patch){
  const operations=Array.isArray(patch?.operations)?patch.operations:[];
  if(!operations.length)throw httpError(409,'content_only_patch_empty','No safe customer-facing text fields were found to update.');
  for(const operation of operations){
    if(!operation||!['section','block'].includes(operation.scope))throw httpError(409,'content_only_scope_invalid','Content-only planning produced an unsupported mutation scope.');
    if(!operation.sectionId||!operation.key||typeof operation.valueJson!=='string')throw httpError(409,'content_only_operation_invalid','Content-only planning produced an incomplete text replacement.');
    const key=String(operation.key).toLowerCase();
    if(/(color|scheme|font|size|spacing|padding|margin|layout|style|image|video|icon|border|shadow|animation|columns?|rows?|width|height|position|alignment|css|class|template|section|block|type|order)/.test(key))throw httpError(409,'content_only_style_mutation_blocked',`Content-only mode blocked a non-text setting: ${operation.key}`);
  }
}
function validateBoundary(stagingTheme,mainTheme){
  if(!stagingTheme?.gid||String(stagingTheme.role||'').toUpperCase()==='MAIN')throw httpError(409,'verified_staging_required','A verified non-live Kairos Staging theme is required.');
  if(!mainTheme?.gid||String(mainTheme.role||'').toUpperCase()!=='MAIN')throw httpError(409,'main_theme_verification_failed','The live MAIN theme could not be verified.');
}
function jobRequest(request,jobID){return new Request(new URL(`/_kairos/standalone-plan-jobs/${jobID}`,request.url).toString(),{method:'GET'});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-MMG-Runtime':BUILD,'X-Kairos-Website-Intent':'content-only','X-Kairos-Content-Mutation':'surgical-exact-match','X-Content-Type-Options':'nosniff'}});}
