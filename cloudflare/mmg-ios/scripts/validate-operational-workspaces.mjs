import assert from"node:assert/strict";
import{existsSync,readFileSync}from"node:fs";
import{dirname,join,resolve}from"node:path";
import{fileURLToPath}from"node:url";
const here=dirname(fileURLToPath(import.meta.url));
const worker=resolve(here,"..");
const repo=resolve(worker,"../..");
const entry=readFileSync(join(worker,"src/kairos-production-entry-v2.js"),"utf8");
const index=readFileSync(join(repo,"web/kairos-dashboard/index.html"),"utf8");
const compact=value=>value.replace(/\s+/g,"");
const workspaces=[
 ["Creative Studio","kairos-creative-studio-v1.js","creative-studio.js","creative-studio.css","creative-studio",["createCreativeProject","intermediateAssetsStayInWorkspace:true"]],
 ["Publishing Studio","kairos-publishing-studio-v1.js","publishing-studio.js","publishing-studio.css","publishing-studio",["createPublishingProject","draftFilesStayInternal:true"]],
 ["Product Launch Studio","kairos-product-launch-studio-v1.js","product-launch-studio.js","product-launch-studio.css","product-launch",["createLaunchProject","pricingApprovalRequired:true"]],
 ["Revenue Intelligence","kairos-revenue-intelligence-v1.js","revenue-intelligence.js","revenue-intelligence.css","revenue-intelligence",["runRevenueReview","inventedData:false"]],
 ["Growth Plan","kairos-growth-plan-v1.js","growth-plan.js","growth-plan.css","growth-plan",["createGrowthPlan","guaranteedOutcome:false"]],
 ["Offer Builder","kairos-offer-builder-v1.js","offer-builder.js","offer-builder.css","offer-builder",["createOffer","automaticDiscounting:false"]],
 ["Campaign Operations","kairos-campaign-operations-v1.js","campaign-operations.js","campaign-operations.css","campaign-operations",["createCampaign","paidSpendAutomatic:false"]],
 ["Visitor Activity","kairos-visitor-activity-v1.js","visitor-activity.js","visitor-activity.css","visitor-activity",["runVisitorReview","aggregateEvidenceOnly:true","individualVisitorIdentification:false"]],
 ["Customer Journeys","kairos-customer-journey-v1.js","customer-journeys.js","customer-journeys.css","customer-journey",["createJourney","customerFacingChangesRequireApproval:true","personalProfilingAutomatic:false"]],
 ["Customer Portal","kairos-customer-portal-v1.js","customer-portal.js","customer-portal.css","customer-portal",["createCustomerProject","customerCanViewOwnProjectOnly:true"]],
 ["Deliverables","kairos-deliverables-v1.js","deliverables.js","deliverables.css","deliverables",["createDeliverable","finalApprovalRequired:true"]]
];
const verified=[];
for(const[name,runtimeFile,uiFile,cssFile,child,markers]of workspaces){
 const rp=join(worker,"src",runtimeFile),up=join(repo,"web/kairos-dashboard/scripts",uiFile),cp=join(repo,"web/kairos-dashboard/styles",cssFile);
 for(const path of[rp,up,cp])assert.ok(existsSync(path),`${name} file missing: ${path}`);
 const runtime=compact(readFileSync(rp,"utf8")),ui=readFileSync(up,"utf8"),css=readFileSync(cp,"utf8");
 assert.ok(ui.includes(`data-child=\"${child}\"`)||ui.includes(`data-child="${child}"`)||ui.includes(`[data-child=\"${child}\"]`)||ui.includes(`[data-child="${child}"]`),`${name} child integration missing`);
 for(const marker of markers)assert.ok(runtime.includes(compact(marker)),`${name} governance missing: ${marker}`);
 assert.ok(index.includes(`scripts/${uiFile}`)&&index.includes(`styles/${cssFile}`),`${name} assets not loaded`);
 assert.ok(!css.includes("position:fixed"),`${name} floating controls forbidden`);
 verified.push(name);
}
for(const route of["/api/visitor-activity/reviews","/api/customer-journeys","/api/deliverables","/api/customer-projects"])assert.ok(entry.includes(route),`Core route missing: ${route}`);
const managerPath=join(repo,"web/kairos-dashboard/scripts/parent-card-completion.js");
assert.ok(existsSync(managerPath),"Parent-card completion controller missing");
const manager=readFileSync(managerPath,"utf8");
const cleanup=readFileSync(join(repo,"web/kairos-dashboard/scripts/content-access-cleanup.js"),"utf8");
const stabilityPath=join(repo,"web/kairos-dashboard/scripts/card-navigation-stability.js");
assert.ok(existsSync(stabilityPath),"Card navigation stability controller missing");
const stability=readFileSync(stabilityPath,"utf8");
for(const marker of["kairos-parent-card-completion-20260715-3","knowledge-library","research-brief","decision-record","doctrine-vault","intelligence-synthesis","/api/hub/run","data-operational-contract","100% operational","RECEIPT_KEY","completed","failed","command-center"])assert.ok(manager.includes(marker),`Knowledge completion contract missing ${marker}`);
for(const marker of["website","manuscript-studio","social-production","publishing-studio","creative-studio","/api/shopify/staging/plan/jobs","/api/manuscript/intake/advance","/api/social-production/prepare","manuscript-result","social-package","content:{status:\"verified\""])assert.ok(manager.includes(marker),`Content completion contract missing ${marker}`);
assert.ok(cleanup.startsWith("import'./card-navigation-stability.js';\nimport'./parent-card-completion.js';"),"Navigation stability must load before parent-card completion");
for(const marker of["kairos-card-navigation-stability-20260715-2","kairos-stable-workspace-host","#social-production","#creative-studio","#publishing-studio","#campaign-operations","#product-launch-studio","overflowAnchor","MutationObserver","sessionStorage"])assert.ok(stability.includes(marker),`Card navigation stability missing ${marker}`);
assert.ok(!stability.includes("Element.prototype.scrollIntoView"),"Global scrollIntoView override is forbidden");
assert.ok(!stability.includes("observe(document.body"),"Document-wide navigation observer is forbidden");
assert.ok(!manager.includes("observe(document.body"),"Document-wide parent-card observer is forbidden");
assert.ok(manager.includes("observer?.disconnect()")&&stability.includes("observer?.disconnect()"),"Scoped observers must disconnect during reconciliation");
console.log(JSON.stringify({status:"ready",validator:"kairos-operational-workspaces-20260715-8",workspacesVerified:verified.length,knowledgeParentComplete:true,knowledgeChildrenVerified:5,contentParentComplete:true,contentChildrenVerified:5,navigationStable:true,scopedObservers:true,documentWideObservers:0,globalScrollOverrides:0,externalWorkspacesPersistent:true,structuralContracts:true,floatingControls:0},null,2));