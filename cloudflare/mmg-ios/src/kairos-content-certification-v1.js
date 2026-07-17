import { readWorkflow } from "./kairos-workflow-runtime-v1.js";
import { readCreativeProject } from "./kairos-creative-studio-v1.js";
import { readPublishingProject } from "./kairos-publishing-studio-v1.js";
import { readSocialPackage } from "./kairos-social-production-v1.js";

const BUILD="kairos-content-certification-20260714-1";
const CACHE_SECONDS=60*60*24*90;

export async function certifyManuscriptManufacturing(request,payload={}){
  const title=clean(payload.title,240),sourceReference=clean(payload.sourceReference,600),editorialEvidence=clean(payload.editorialEvidence,6000),manufacturingEvidence=clean(payload.manufacturingEvidence,6000),approvalEvidence=clean(payload.approvalEvidence,4000),actor=clean(payload.actor||"Executive approval",180);
  if(!title)throw new Error("Manuscript title is required.");
  if(!sourceReference)throw new Error("Manuscript source reference is required.");
  if(editorialEvidence.length<20)throw new Error("Editorial verification evidence is required.");
  if(manufacturingEvidence.length<20)throw new Error("Manufacturing verification evidence is required.");
  if(approvalEvidence.length<10)throw new Error("Approval evidence is required.");
  const checks={editorialComplete:payload.editorialComplete===true,rightsVerified:payload.rightsVerified===true,formattingVerified:payload.formattingVerified===true,proofReviewed:payload.proofReviewed===true,sourceFilesInternal:payload.sourceFilesInternal===true};
  if(Object.values(checks).some(v=>v!==true))throw new Error("Every manuscript manufacturing check must be verified.");
  const now=new Date().toISOString();
  const record={id:`manuscript-cert-${crypto.randomUUID()}`,build:BUILD,status:"manufacturing-certified",title,sourceReference,version:clean(payload.version||"v1",120),formats:list(payload.formats,12),editorialEvidence,manufacturingEvidence,approvalEvidence,actor,checks,certifiedAt:now,governance:{inventedEvidence:false,rightsAssumed:false,sourceFilesReleased:false,platformSubmissionAutomatic:false,publicationAutomatic:false,finalReleaseRequiresApproval:true}};
  await persist(request,"manuscripts",record.id,record);return{record};
}

export async function certifyCreativeAsset(request,projectID,payload={}){
  const current=await readCreativeProject(request,projectID);if(!current)throw new Error("Creative project was not found.");
  const{project,workflow}=current;await requireApproval(workflow,"Creative certification");
  const qaEvidence=clean(payload.qaEvidence,5000),approvalEvidence=clean(payload.approvalEvidence,4000),assetReference=clean(payload.assetReference,1200);
  if(qaEvidence.length<20||approvalEvidence.length<10||!assetReference)throw new Error("Creative QA, approval evidence, and final asset reference are required.");
  const checks={brandVerified:payload.brandVerified===true,dimensionsVerified:payload.dimensionsVerified===true,copyVerified:payload.copyVerified===true,accessibilityVerified:payload.accessibilityVerified===true,editableFilesInternal:payload.editableFilesInternal===true};
  if(Object.values(checks).some(v=>v!==true))throw new Error("Every creative certification check must be verified.");
  const now=new Date().toISOString();project.status="final-asset-certified";project.updatedAt=now;project.certification={certifiedAt:now,actor:clean(payload.actor||"Executive approval",180),assetReference,qaEvidence,approvalEvidence,checks,externalPublicationAutomatic:false,editableSourceReleaseAutomatic:false,inventedEvidence:false};project.nextAction="Use the certified final asset in an approved publishing or campaign package.";
  await persistKnown(request,`/_kairos/creative-studio/${encodeURIComponent(project.id)}`,"/_kairos/creative-studio/latest",project);return{project,workflow};
}

export async function certifyPublishingRelease(request,projectID,payload={}){
  const current=await readPublishingProject(request,projectID);if(!current)throw new Error("Publishing project was not found.");
  const{project,workflow}=current;await requireApproval(workflow,"Publishing release certification");
  const manuscriptCertificationID=clean(payload.manuscriptCertificationID,220),creativeCertificationReference=clean(payload.creativeCertificationReference,1200),releaseEvidence=clean(payload.releaseEvidence,6000),rollbackEvidence=clean(payload.rollbackEvidence,3000);
  if(!manuscriptCertificationID)throw new Error("Certified manuscript reference is required.");
  if(!creativeCertificationReference)throw new Error("Certified creative asset reference is required.");
  if(releaseEvidence.length<20||rollbackEvidence.length<10)throw new Error("Release and rollback evidence are required.");
  const checks={metadataVerified:payload.metadataVerified===true,pricingApproved:payload.pricingApproved===true,rightsVerified:payload.rightsVerified===true,filesVerified:payload.filesVerified===true,customerPathVerified:payload.customerPathVerified===true};
  if(Object.values(checks).some(v=>v!==true))throw new Error("Every publishing release check must be verified.");
  const now=new Date().toISOString();project.status="release-package-certified";project.updatedAt=now;project.releaseCertification={certifiedAt:now,actor:clean(payload.actor||"Executive approval",180),manuscriptCertificationID,creativeCertificationReference,releaseEvidence,rollbackEvidence,checks,platformSubmissionAutomatic:false,liveStorePublicationAutomatic:false,pricingChangeAutomatic:false,inventedEvidence:false};project.nextAction="Release only through an authorized publication control with a preserved receipt.";
  await persistKnown(request,`/_kairos/publishing-studio/${encodeURIComponent(project.id)}`,"/_kairos/publishing-studio/latest",project);return{project,workflow};
}

export async function recordSocialPublicationReceipt(request,packageID,payload={}){
  const socialPackage=await readSocialPackage(request,packageID);if(!socialPackage)throw new Error("Social package was not found.");
  if(socialPackage.approval?.state!=="approved")throw new Error("Social publication requires an approved package.");
  const connector=clean(payload.connector,240),platform=clean(payload.platform,120),publicationReference=clean(payload.publicationReference,1200),receiptEvidence=clean(payload.receiptEvidence,5000);
  if(!connector||!platform||!publicationReference||receiptEvidence.length<20)throw new Error("Connector, platform, publication reference, and receipt evidence are required.");
  if(payload.externalPublishingConfirmed!==true)throw new Error("External publication confirmation is required.");
  const now=new Date().toISOString();const updated={...socialPackage,status:"publication-receipted",publication:{...socialPackage.publication,connectorAvailable:true,externalPublishingPerformed:true,publicationStatus:"verified-published",platform,connector,publicationReference,receiptEvidence,publishedAt:now},safeguards:{...socialPackage.safeguards,receiptVerified:true,automaticDeletion:false,automaticRepublication:false,performanceClaimsAutomatic:false}};
  await persistKnown(request,`/_kairos/social-production/${encodeURIComponent(updated.id)}`,"/_kairos/social-production/latest",updated);return{socialPackage:updated};
}

export async function readContentCertification(request,type,id){return readStored(request,`/_kairos/content-certifications/${type}/${encodeURIComponent(id)}`)}
async function requireApproval(workflow,label){if(workflow?.approvalRequired&&workflow.approvalStatus!=="approved")throw new Error(`${label} requires an approved workflow.`)}
async function persist(request,type,id,value){await caches.default.put(new Request(new URL(`/_kairos/content-certifications/${type}/${encodeURIComponent(id)}`,request.url).toString()),stored(value));await caches.default.put(new Request(new URL(`/_kairos/content-certifications/${type}/latest`,request.url).toString()),stored(value))}
async function persistKnown(request,itemPath,latestPath,value){await caches.default.put(new Request(new URL(itemPath,request.url).toString()),stored(value));await caches.default.put(new Request(new URL(latestPath,request.url).toString()),stored(value))}
async function readStored(request,path){const response=await caches.default.match(new Request(new URL(path,request.url).toString()));if(!response)return null;try{return await response.json()}catch{return null}}
function stored(value){return new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":`public, max-age=${CACHE_SECONDS}`}})}
function clean(value,max){return String(value??"").trim().slice(0,max)}
function list(value,max){const source=Array.isArray(value)?value:String(value??"").split(",");return source.map(v=>clean(v,180)).filter(Boolean).slice(0,max)}
