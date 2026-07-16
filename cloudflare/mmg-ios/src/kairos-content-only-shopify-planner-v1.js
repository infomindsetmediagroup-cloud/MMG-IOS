import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
} from './kairos-compact-homepage-utils-v1.js';
import { buildDeterministicHomepagePackage } from './kairos-deterministic-homepage-v1.js';

const BUILD='kairos-content-only-shopify-planner-20260715-3';
const HOMEPAGE_FILE='templates/index.json';
const SECTION_FILE='sections/mmg-canonical-homepage.liquid';
const CSS_FILE='assets/mmg-canonical-homepage.css';
const JOB_TTL_SECONDS=3600;
const MAX_OBJECTIVE_CHARS=12000;

const COPY=[
  'Mindset Media Group × Kairos','Your knowledge has value.','Learn it. Build it. Publish it. Keep moving forward.',
  'Mindset Media Group connects practical learning, publishing support, creator resources, and guided execution in one knowledge ecosystem.',
  'Find your path','Start with free resources','Practical guidance','Professional production','Clear next steps',
  'The customer journey','Start where you are. Build what comes next.','Choose the stage that matches your work today, then move through a connected path from learning to finished outcomes.',
  'Learn','Build','Publish','Grow','Discover useful knowledge and practical resources.','Turn ideas and experience into organized work.','Move finished assets through professional production.','Strengthen what works through consistent execution.',
  'Choose what you want to build','One ecosystem. Multiple ways forward.','Every path connects education, digital products, professional services, and a clear next step.',
  'Books + Publishing','Turn expertise into a finished publication.','Practical AI','Use AI with purpose and judgment.','Creator Growth','Build a repeatable publishing practice.','Business Systems','Package knowledge into useful assets.',
  'Continue Your Journey','Every asset should lead somewhere useful.','Explore the next resource, service, or learning path that moves your work forward.',
  'We’re not gatekeepers. We’re door openers.','Knowledge grows when it’s shared. Opportunity grows when doors are opened.'
];

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
      const replacement=replaceVisibleLiquidText(sectionFile.content);
      if(!replacement.changed)throw httpError(409,'content_only_visible_text_unavailable','The canonical homepage section contains no replaceable visible customer-facing text.');
      const beforeSignature=markupSignature(sectionFile.content),afterSignature=markupSignature(replacement.value);
      if(beforeSignature!==afterSignature)throw httpError(409,'content_only_structure_change_detected','Content-only planning changed Liquid or markup structure.');
      installationMode='existing-liquid-visible-text';
      liquidContentPatch={filename:SECTION_FILE,originalSource:sectionFile.content,replacementSource:replacement.value,beforeSignature,afterSignature,visibleTextReplacementCount:replacement.count};
      packageResult={
        summary:'Replace only the visible homepage copy inside the existing canonical Liquid section.',
        strategy:'Preserve the current homepage design exactly. Keep every Liquid expression, tag, attribute, class, link, image, card, pill, color, stylesheet, template, section, and responsive behavior unchanged.',
        changes:[{filename:SECTION_FILE,purpose:'Replace visible customer-facing words only.',changeType:'modify',instructions:['Write only the existing canonical homepage Liquid section.','Preserve the complete markup/Liquid token signature.','Do not write templates/index.json or assets/mmg-canonical-homepage.css.'],expectedOutcome:'The same homepage design with updated knowledge-ecosystem and customer-journey copy.'}],
        risks:['Different copy lengths may create natural line wrapping; no styling or structure change is authorized.'],
        acceptanceCriteria:['Liquid and HTML token signatures remain identical.','The template and stylesheet hashes remain unchanged.','Only visible text nodes change.','Shopify read-back exactly matches the approved section source.','The live MAIN theme remains unchanged.'],
        rollbackPlan:['Preserve and restore only the original canonical homepage Liquid section.'],
        evidenceNotes:[`${replacement.count} visible text nodes identified in the active canonical homepage section.`]
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
    const result={actionID:crypto.randomUUID(),planID:crypto.randomUUID(),actionType:'shopify.staging.plan',requestType:'content-only',mutationScope:installationMode,status:'ready-for-approval',readOnly:true,build:BUILD,kernel:'content-only-shopify-planner-v3',startedAt:now,completedAt:now,objective,summary:packageResult.summary,plan:{summary:packageResult.summary,strategy:packageResult.strategy,changes:packageResult.changes,risks:packageResult.risks,acceptanceCriteria:packageResult.acceptanceCriteria,rollbackPlan:packageResult.rollbackPlan,installationMode,deterministicPatch:installationMode==='existing-text-settings'?packageResult.patch:null,liquidContentPatch,canonicalPackage:null,targetTheme:stagingTheme,publishedTheme:mainTheme,sourceHashes,mutationScope:'content-only',structuralMutationAuthorized:false,styleMutationAuthorized:false,productionPublishAuthorized:false,liveThemeMutationAuthorized:false,providerPolicy:{externalInferenceProviders:'prohibited'}},evidence:{sourceInspectionActionID:sourceBody.actionID||'',stagingTheme,mainTheme,suppliedFiles:targetFiles.map(filename=>({filename,exists:files.has(filename),sha256:files.get(filename)?.sha256||null,bytes:files.get(filename)?.bytes||0})),planningEngine:BUILD,externalInferenceProviderUsed:false,evidenceNotes:packageResult.evidenceNotes}};
    const jobID=crypto.randomUUID();
    const completed={jobID,status:'completed',build:BUILD,submittedAt:now,updatedAt:now,completedAt:now,summary:result.summary,result};
    await caches.default.put(jobRequest(request,jobID),new Response(JSON.stringify(completed),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${JOB_TTL_SECONDS}`,'X-MMG-Runtime':BUILD}}));
    return json({jobID,status:'completed',build:BUILD,pollURL:`/api/shopify/staging/plan/jobs/${jobID}`,summary:result.summary,result},202);
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:500;
    return json({status:'needs-attention',build:BUILD,summary:'Kairos could not prepare the content-only Shopify plan.',error:{status,code:typeof error?.code==='string'?error.code:'content_only_plan_failed',message:error instanceof Error?error.message:'Content-only planning failed.'}},status);
  }
}

function replaceVisibleLiquidText(source){
  const tokens=String(source||'').split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
  const blocked=[];let count=0,changed=false,copyIndex=0;
  for(let i=0;i<tokens.length&&copyIndex<COPY.length;i++){
    const token=tokens[i];if(!token)continue;
    if(token.startsWith('{{')||token.startsWith('{%'))continue;
    if(token.startsWith('<')){updateBlockedStack(blocked,token);continue;}
    if(blocked.length)continue;
    const text=token.trim();
    if(!isVisibleText(text))continue;
    const leading=token.match(/^\s*/)?.[0]||'',trailing=token.match(/\s*$/)?.[0]||'';
    const replacement=COPY[copyIndex++];
    tokens[i]=`${leading}${replacement}${trailing}`;count++;changed=true;
  }
  return{changed,count,value:tokens.join('')};
}
function isVisibleText(text){
  if(!text||text.length<2||text.length>2000||!/[a-z]/i.test(text))return false;
  if(/^(&[a-z0-9#]+;|[\s\W])+$/i.test(text)||/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(text))return false;
  if(/\b(var|const|let|function|return|display|position|background|color|padding|margin)\s*[:=(]/i.test(text))return false;
  return true;
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
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-MMG-Runtime':BUILD,'X-Kairos-Website-Intent':'content-only','X-Content-Type-Options':'nosniff'}});}
