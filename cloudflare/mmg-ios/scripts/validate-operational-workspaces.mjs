import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const workerRoot=resolve(here,"..");
const repoRoot=resolve(workerRoot,"../..");
const entryPath=join(workerRoot,"src/kairos-production-entry-v2.js");
const indexPath=join(repoRoot,"web/kairos-dashboard/index.html");
assert.ok(existsSync(entryPath),`Canonical entry missing: ${entryPath}`);
assert.ok(existsSync(indexPath),`Command Center index missing: ${indexPath}`);
const entry=readFileSync(entryPath,"utf8");
const index=readFileSync(indexPath,"utf8");

const workspaces=[
["Creative Studio","kairos-creative-studio-v1.js","creative-studio.js","creative-studio.css",'[data-child="creative-studio"]',["/api/creative-studio/projects","/api/creative-studio/latest"],["createCreativeProject","intermediateAssetsStayInWorkspace: true","finalDeliverableRequiresApproval: true"],["data-creative-form","data-open-my-work"]],
["Publishing Studio","kairos-publishing-studio-v1.js","publishing-studio.js","publishing-studio.css",'[data-child="publishing-studio"]',["/api/publishing-studio/projects","/api/publishing-studio/latest"],["createPublishingProject","draftFilesStayInternal: true","finalReleaseRequiresApproval: true"],["data-publishing-form","data-open-manuscript","data-open-my-work"]],
["Product Launch Studio","kairos-product-launch-studio-v1.js","product-launch-studio.js","product-launch-studio.css",'[data-child="product-launch"]',["/api/product-launch/projects","/api/product-launch/latest"],["createLaunchProject","pricingApprovalRequired: true","rollbackEvidenceRequired: true"],["data-launch-studio-form","data-open-my-work"]],
["Revenue Intelligence","kairos-revenue-intelligence-v1.js","revenue-intelligence.js","revenue-intelligence.css",'[data-child="revenue-intelligence"]',["/api/revenue-intelligence/reviews","/api/revenue-intelligence/latest"],["runRevenueReview","inventedData: false","extrapolationPerformed: false"],["data-revenue-form","data-build-growth","data-refine-offer"]],
["Growth Plan","kairos-growth-plan-v1.js","growth-plan.js","growth-plan.css",'[data-child="growth-plan"]',["/api/growth-plans","/api/growth-plans/latest"],["createGrowthPlan","inventedBaseline: false","guaranteedOutcome: false"],["data-growth-form","data-build-campaign","data-open-my-work"]],
["Offer Builder","kairos-offer-builder-v1.js","offer-builder.js","offer-builder.css",'[data-child="offer-builder"]',["/api/offers","/api/offers/latest"],["createOffer","pricingRequiresApproval: true","automaticDiscounting: false"],["data-offer-form","data-send-to-launch","data-open-my-work"]],
["Campaign Operations","kairos-campaign-operations-v1.js","campaign-operations.js","campaign-operations.css",'[data-child="campaign-operations"]',["/api/campaigns","/api/campaigns/latest"],["createCampaign","externalPublicationAutomatic: false","paidSpendAutomatic: false"],["data-campaign-form","data-open-my-work"]],
["Visitor Activity","kairos-visitor-activity-v1.js","visitor-activity.js","visitor-activity.css",'[data-child="visitor-activity"]',["/api/visitor-activity/reviews","/api/visitor-activity/latest"],["runVisitorReview","aggregateEvidenceOnly: true","individualVisitorIdentification: false"],["data-visitor-form"]],
["Customer Journeys","kairos-customer-journey-v1.js","customer-journeys.js","customer-journeys.css",'[data-child="customer-journey"]',["/api/customer-journeys","/api/customer-journeys/latest"],["createJourney","customerFacingChangesRequireApproval: true","personalProfilingAutomatic: false"],["data-journey-form","data-open-my-work"]],
["Customer Portal","kairos-customer-portal-v1.js","customer-portal.js","customer-portal.css",'[data-child="customer-portal"]',["/api/customer-projects","/api/customer-projects/latest"],["createCustomerProject","customerCanViewOwnProjectOnly: true","internalSourceFilesHidden: true"],["data-customer-project-form","kairos:deliverables:open"]],
["Deliverables","kairos-deliverables-v1.js","deliverables.js","deliverables.css",'[data-child="deliverables"]',["/api/deliverables","/api/deliverables/latest"],["createDeliverable","finalApprovalRequired: true","deliveryAutomatic: false"],["data-deliverable-form","projectReference"]],
];

const verified=[];
for(const [name,runtimeFile,uiFile,cssFile,child,routes,runtimeMarkers,uiMarkers] of workspaces){
 const runtimePath=join(workerRoot,"src",runtimeFile),uiPath=join(repoRoot,"web/kairos-dashboard/scripts",uiFile),cssPath=join(repoRoot,"web/kairos-dashboard/styles",cssFile);
 for(const file of[runtimePath,uiPath,cssPath])assert.ok(existsSync(file),`${name} production file missing: ${file}`);
 const runtime=readFileSync(runtimePath,"utf8"),ui=readFileSync(uiPath,"utf8"),css=readFileSync(cssPath,"utf8");
 assert.ok(ui.includes(child),`${name} child-card integration is missing.`);
 for(const marker of uiMarkers)assert.ok(ui.includes(marker),`${name} structural UI marker missing: ${marker}`);
 for(const marker of runtimeMarkers)assert.ok(runtime.includes(marker),`${name} runtime governance marker missing: ${marker}`);
 for(const route of routes)assert.ok(entry.includes(route),`${name} route missing: ${route}`);
 assert.ok(index.includes(`scripts/${uiFile}`),`${name} script is not loaded by the Command Center.`);
 assert.ok(index.includes(`styles/${cssFile}`),`${name} stylesheet is not loaded by the Command Center.`);
 assert.ok(!css.includes("position:fixed"),`${name} must not introduce floating controls.`);
 verified.push(name);
}
console.log(JSON.stringify({status:"ready",validator:"kairos-operational-workspaces-20260714-2",workspacesVerified:verified.length,workspaces:verified,validationModel:"structural-contracts-not-display-copy",routesVerified:true,governanceBoundariesVerified:true,commandCenterAssetsVerified:true,floatingControls:0},null,2));
