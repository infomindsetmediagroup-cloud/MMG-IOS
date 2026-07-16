import {hashText,httpError,inspectStagingSource,writeThemeFile} from './kairos-compact-homepage-utils-v1.js';

const BUILD='kairos-liquid-content-only-executor-20260715-3';
const SECTION_FILE='sections/mmg-canonical-homepage.liquid';
const TEMPLATE_FILE='templates/index.json';
const CSS_FILE='assets/mmg-canonical-homepage.css';

export default{async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/shopify/staging/execute/jobs'&&request.method==='POST')return executeLiquidContentPlan(request,env);
  return json({status:'not-found',build:BUILD},404);
}};

async function executeLiquidContentPlan(request,env){
  const startedAt=new Date().toISOString();
  try{
    const payload=await request.json();
    const planEnvelope=payload?.plan;
    const approval=payload?.approval;
    validateApproval(planEnvelope,approval);
    const plan=planEnvelope?.plan||{};
    if(plan.installationMode!=='existing-liquid-visible-text')throw httpError(409,'liquid_content_mode_invalid','The approved content-only Liquid mode is missing.');
    const patch=plan.liquidContentPatch;
    if(!patch||patch.filename!==SECTION_FILE||typeof patch.replacementSource!=='string')throw httpError(409,'liquid_content_patch_missing','The approved Liquid text replacement package is missing.');
    if(patch.nodeDistributionPreserved!==true||!Array.isArray(patch.replacements)||patch.replacements.some(item=>item?.nodeDistributionPreserved!==true))throw httpError(409,'styled_text_node_distribution_missing','The content-only package does not prove styled text-node preservation.');
    if(markupSignature(patch.originalSource)!==patch.beforeSignature||markupSignature(patch.replacementSource)!==patch.afterSignature||patch.beforeSignature!==patch.afterSignature)throw httpError(409,'liquid_markup_signature_mismatch','The approved content-only package changed Liquid or markup structure.');

    const sourceBody=await inspectStagingSource(null,request,env,BUILD,[TEMPLATE_FILE,SECTION_FILE,CSS_FILE]);
    const evidence=sourceBody?.evidence||{};
    const stagingTheme=evidence.stagingTheme,mainTheme=evidence.mainTheme;
    validateBoundary(stagingTheme,mainTheme);
    const files=new Map((Array.isArray(evidence.files)?evidence.files:[]).map(file=>[file.filename,file]));
    const section=files.get(SECTION_FILE),template=files.get(TEMPLATE_FILE),css=files.get(CSS_FILE);
    if(!section?.readable||typeof section.content!=='string')throw httpError(409,'canonical_section_unavailable','The canonical homepage Liquid section was not readable from Kairos Staging.');
    if(approval?.targetThemeID!==stagingTheme.gid||plan?.targetTheme?.gid!==stagingTheme.gid)throw httpError(409,'staging_theme_changed','The approved staging target no longer matches Kairos Staging.');
    for(const filename of[TEMPLATE_FILE,SECTION_FILE,CSS_FILE]){
      const actual=files.get(filename)?.sha256||null;
      if(plan.sourceHashes?.[filename]!==actual||approval?.sourceHashes?.[filename]!==actual)throw httpError(409,'source_hash_mismatch',`${filename} changed after approval. Generate a new content-only proposal.`);
    }
    if(section.content!==patch.originalSource)throw httpError(409,'liquid_source_changed','The canonical homepage Liquid source changed after approval.');
    if(markupSignature(section.content)!==markupSignature(patch.replacementSource))throw httpError(409,'liquid_structure_changed','The proposed content update no longer matches the current Liquid structure.');

    const beforeSha256=section.sha256||await hashText(section.content);
    const expectedSha256=await hashText(patch.replacementSource);
    if(beforeSha256===expectedSha256)return completeNoWrite(request,{startedAt,planEnvelope,patch,stagingTheme,mainTheme,sourceBody,section,template,css,beforeSha256,expectedSha256});

    const write=await writeThemeFile(env,stagingTheme.gid,SECTION_FILE,patch.replacementSource);
    const verifyBody=await inspectStagingSource(null,request,env,BUILD,[TEMPLATE_FILE,SECTION_FILE,CSS_FILE]);
    const verifyFiles=new Map((Array.isArray(verifyBody?.evidence?.files)?verifyBody.evidence.files:[]).map(file=>[file.filename,file]));
    const readBack=verifyFiles.get(SECTION_FILE);
    if(!readBack?.readable||typeof readBack.content!=='string')throw httpError(502,'liquid_readback_missing','Shopify returned no Liquid source after the staging write.');
    const actualSha256=readBack.sha256||await hashText(readBack.content);
    if(readBack.content!==patch.replacementSource||actualSha256!==expectedSha256)throw httpError(502,'liquid_readback_mismatch','Shopify read-back did not match the approved content-only Liquid source.');
    if(markupSignature(readBack.content)!==patch.beforeSignature)throw httpError(502,'liquid_readback_structure_mismatch','Shopify read-back changed Liquid or markup structure.');
    if(verifyFiles.get(TEMPLATE_FILE)?.sha256!==template?.sha256||verifyFiles.get(CSS_FILE)?.sha256!==css?.sha256)throw httpError(502,'non_content_file_changed','The template or stylesheet changed during a content-only write.');
    validateBoundary(verifyBody?.evidence?.stagingTheme,verifyBody?.evidence?.mainTheme);
    if(verifyBody?.evidence?.mainTheme?.gid!==mainTheme.gid)throw httpError(502,'main_theme_changed_during_staging_write','The live MAIN theme did not remain unchanged.');

    return complete(request,{startedAt,planEnvelope,patch,stagingTheme,mainTheme,beforeSha256,actualSha256,expectedSha256,sourceActionID:sourceBody.actionID,verifyActionID:verifyBody.actionID,write,section,noWrite:false});
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:500;
    return json({status:'needs-attention',build:BUILD,summary:'Kairos could not complete the node-preserving content-only staging execution.',error:{status,code:error?.code||'liquid_content_execution_failed',message:error instanceof Error?error.message:'Liquid content execution failed.'}},status);
  }
}

async function completeNoWrite(request,ctx){
  return complete(request,{...ctx,actualSha256:ctx.beforeSha256,sourceActionID:ctx.sourceBody.actionID,verifyActionID:ctx.sourceBody.actionID,write:null,noWrite:true});
}

async function complete(request,ctx){
  const completedAt=new Date().toISOString();
  const result={
    actionID:crypto.randomUUID(),actionType:'shopify.staging.execute',status:'completed',build:BUILD,kernel:'liquid-content-only-v3',completedAt,
    summary:ctx.noWrite?'Approved homepage content was already present on Kairos Staging; Kairos verified the unchanged structure and continued to preview.':'Kairos replaced and verified only the visible homepage copy on Kairos Staging while preserving every styled text node.',
    objective:ctx.planEnvelope.objective,
    execution:{operation:ctx.noWrite?'verifiedNoWrite':'themeFileUpsert',engine:'liquid-content-only-v3',targetTheme:ctx.stagingTheme,publishedTheme:ctx.mainTheme,publishedThemeChanged:false,productionPublishAuthorized:false,filesWritten:ctx.noWrite?[]:[{filename:SECTION_FILE,beforeSha256:ctx.beforeSha256,afterSha256:ctx.actualSha256}],contentOnly:true,structurePreserved:true,nodeDistributionPreserved:true,templateUnchanged:true,stylesheetUnchanged:true,idempotent:ctx.noWrite},
    verification:[{filename:SECTION_FILE,expectedSha256:ctx.expectedSha256,actualSha256:ctx.actualSha256,matched:true,markupSignatureMatched:true,structurePreserved:true,nodeDistributionPreserved:true,idempotent:ctx.noWrite},{filename:TEMPLATE_FILE,matched:true,unchanged:true},{filename:CSS_FILE,matched:true,unchanged:true}],
    evidence:{credentialPath:ctx.write?.credentialPath||'read-only-verification',mutationResult:ctx.write?.mutationResult||null,sourceInspectionActionID:ctx.sourceActionID,readBackInspectionActionID:ctx.verifyActionID,visibleTextReplacementCount:ctx.patch.visibleTextReplacementCount||0,nodeDistributionPreserved:true,idempotent:ctx.noWrite},
    rollback:{required:false,authorized:false,targetThemeID:ctx.stagingTheme.gid,files:[{filename:SECTION_FILE,existed:true,sha256:ctx.beforeSha256,content:ctx.section.content}],instruction:'Rollback restores only the original canonical homepage Liquid section.'}
  };
  const jobID=crypto.randomUUID();
  const completed={jobID,status:'completed',build:BUILD,submittedAt:ctx.startedAt,updatedAt:completedAt,completedAt,summary:result.summary,result};
  await caches.default.put(jobRequest(request,jobID),new Response(JSON.stringify(completed),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=3600','X-MMG-Runtime':BUILD}}));
  return json({jobID,status:'completed',build:BUILD,pollURL:`/api/shopify/staging/execute/jobs/${jobID}`,summary:result.summary,result},202);
}

function validateApproval(planEnvelope,approval){if(!planEnvelope?.planID||approval?.status!=='approved'||approval?.planID!==planEnvelope.planID)throw httpError(403,'approval_required','Approve the exact content-only proposal before building the preview.');if(!approval?.targetThemeID||!approval?.sourceHashes)throw httpError(409,'approval_evidence_missing','The approved staging target and source hashes are required.');}
function validateBoundary(stagingTheme,mainTheme){if(!stagingTheme?.gid||String(stagingTheme.role||'').toUpperCase()==='MAIN')throw httpError(409,'verified_staging_required','A verified non-live Kairos Staging theme is required.');if(!mainTheme?.gid||String(mainTheme.role||'').toUpperCase()!=='MAIN')throw httpError(409,'main_theme_verification_failed','The live MAIN theme could not be verified.');}
function markupSignature(source){return(String(source||'').match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g)||[]).join('\u001f');}
function jobRequest(request,jobID){return new Request(new URL(`/_kairos/standalone-execution-jobs/${jobID}`,request.url).toString(),{method:'GET'});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-MMG-Runtime':BUILD,'X-Kairos-Website-Intent':'content-only','X-Kairos-Node-Distribution-Preserved':'true','X-Kairos-Idempotent-Execution':'supported','X-Content-Type-Options':'nosniff'}});}
