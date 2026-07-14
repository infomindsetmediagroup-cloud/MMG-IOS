import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

assert.ok(existsSync(entryPath), `Canonical entry missing: ${entryPath}`);
assert.ok(existsSync(indexPath), `Command Center index missing: ${indexPath}`);

const entry = readFileSync(entryPath, "utf8");
const index = readFileSync(indexPath, "utf8");

const workspaces = [
  {
    name: "Creative Studio",
    runtime: "kairos-creative-studio-v1.js",
    ui: "creative-studio.js",
    css: "creative-studio.css",
    child: '[data-child="creative-studio"]',
    routes: ["/api/creative-studio/projects", "/api/creative-studio/latest"],
    runtimeMarkers: ["createCreativeProject", "intermediateAssetsStayInWorkspace: true", "finalDeliverableRequiresApproval: true"],
    uiMarkers: ["data-creative-form", "data-open-my-work"],
  },
  {
    name: "Publishing Studio",
    runtime: "kairos-publishing-studio-v1.js",
    ui: "publishing-studio.js",
    css: "publishing-studio.css",
    child: '[data-child="publishing-studio"]',
    routes: ["/api/publishing-studio/projects", "/api/publishing-studio/latest"],
    runtimeMarkers: ["createPublishingProject", "draftFilesStayInternal: true", "finalReleaseRequiresApproval: true"],
    uiMarkers: ["data-publishing-form", "data-open-manuscript", "data-open-my-work"],
  },
  {
    name: "Product Launch Studio",
    runtime: "kairos-product-launch-studio-v1.js",
    ui: "product-launch-studio.js",
    css: "product-launch-studio.css",
    child: '[data-child="product-launch"]',
    routes: ["/api/product-launch/projects", "/api/product-launch/latest"],
    runtimeMarkers: ["createLaunchProject", "pricingApprovalRequired: true", "rollbackEvidenceRequired: true"],
    uiMarkers: ["data-launch-studio-form", "data-open-my-work"],
  },
  {
    name: "Revenue Intelligence",
    runtime: "kairos-revenue-intelligence-v1.js",
    ui: "revenue-intelligence.js",
    css: "revenue-intelligence.css",
    child: '[data-child="revenue-intelligence"]',
    routes: ["/api/revenue-intelligence/reviews", "/api/revenue-intelligence/latest"],
    runtimeMarkers: ["runRevenueReview", "inventedData: false", "extrapolationPerformed: false"],
    uiMarkers: ["data-revenue-form", "data-build-growth", "data-refine-offer"],
  },
  {
    name: "Growth Plan",
    runtime: "kairos-growth-plan-v1.js",
    ui: "growth-plan.js",
    css: "growth-plan.css",
    child: '[data-child="growth-plan"]',
    routes: ["/api/growth-plans", "/api/growth-plans/latest"],
    runtimeMarkers: ["createGrowthPlan", "inventedBaseline: false", "guaranteedOutcome: false"],
    uiMarkers: ["data-growth-form", "data-build-campaign", "data-open-my-work"],
  },
  {
    name: "Offer Builder",
    runtime: "kairos-offer-builder-v1.js",
    ui: "offer-builder.js",
    css: "offer-builder.css",
    child: '[data-child="offer-builder"]',
    routes: ["/api/offers", "/api/offers/latest"],
    runtimeMarkers: ["createOffer", "pricingRequiresApproval: true", "automaticDiscounting: false"],
    uiMarkers: ["data-offer-form", "data-send-to-launch", "data-open-my-work"],
  },
  {
    name: "Campaign Operations",
    runtime: "kairos-campaign-operations-v1.js",
    ui: "campaign-operations.js",
    css: "campaign-operations.css",
    child: '[data-child="campaign-operations"]',
    routes: ["/api/campaigns", "/api/campaigns/latest"],
    runtimeMarkers: ["createCampaign", "externalPublicationAutomatic: false", "paidSpendAutomatic: false"],
    uiMarkers: ["data-campaign-form", "data-open-my-work"],
  },
  {
    name: "Visitor Activity",
    runtime: "kairos-visitor-activity-v1.js",
    ui: "visitor-activity.js",
    css: "visitor-activity.css",
    child: '[data-child="visitor-activity"]',
    routes: ["/api/visitor-activity/reviews", "/api/visitor-activity/latest"],
    runtimeMarkers: ["runVisitorReview", "aggregateEvidenceOnly: true", "individualVisitorIdentification: false"],
    uiMarkers: ["data-visitor-form"],
  },
  {
    name: "Customer Journeys",
    runtime: "kairos-customer-journey-v1.js",
    ui: "customer-journeys.js",
    css: "customer-journeys.css",
    child: '[data-child="customer-journeys"]',
    routes: ["/api/customer-journeys", "/api/customer-journeys/latest"],
    runtimeMarkers: ["createJourney", "customerFacingChangesRequireApproval: true", "personalProfilingAutomatic: false"],
    uiMarkers: ["data-journey-form", "data-open-my-work"],
  },
  {
    name: "Customer Portal",
    runtime: "kairos-customer-portal-v1.js",
    ui: "customer-portal.js",
    css: "customer-portal.css",
    child: '[data-child="customer-portal"]',
    routes: ["/api/customer-projects", "/api/customer-projects/latest"],
    runtimeMarkers: ["createCustomerProject", "customerCanViewOwnProjectOnly: true", "internalSourceFilesHidden: true"],
    uiMarkers: ["data-customer-project-form", "kairos:deliverables:open"],
  },
  {
    name: "Deliverables",
    runtime: "kairos-deliverables-v1.js",
    ui: "deliverables.js",
    css: "deliverables.css",
    child: '[data-child="deliverables"]',
    routes: ["/api/deliverables", "/api/deliverables/latest"],
    runtimeMarkers: ["createDeliverable", "finalApprovalRequired: true", "deliveryAutomatic: false"],
    uiMarkers: ["data-deliverable-form", "projectReference"],
  },
];

const verified = [];
for (const workspace of workspaces) {
  const runtimePath = join(workerRoot, "src", workspace.runtime);
  const uiPath = join(repoRoot, "web/kairos-dashboard/scripts", workspace.ui);
  const cssPath = join(repoRoot, "web/kairos-dashboard/styles", workspace.css);

  for (const file of [runtimePath, uiPath, cssPath]) {
    assert.ok(existsSync(file), `${workspace.name} production file missing: ${file}`);
  }

  const runtime = readFileSync(runtimePath, "utf8");
  const ui = readFileSync(uiPath, "utf8");
  const css = readFileSync(cssPath, "utf8");

  assert.ok(ui.includes(workspace.child), `${workspace.name} child-card integration is missing.`);
  for (const marker of workspace.uiMarkers) {
    assert.ok(ui.includes(marker), `${workspace.name} structural UI marker missing: ${marker}`);
  }
  for (const marker of workspace.runtimeMarkers) {
    assert.ok(runtime.includes(marker), `${workspace.name} runtime governance marker missing: ${marker}`);
  }
  for (const route of workspace.routes) {
    assert.ok(entry.includes(route), `${workspace.name} route missing: ${route}`);
  }

  assert.ok(index.includes(`scripts/${workspace.ui}`), `${workspace.name} script is not loaded by the Command Center.`);
  assert.ok(index.includes(`styles/${workspace.css}`), `${workspace.name} stylesheet is not loaded by the Command Center.`);
  assert.ok(!css.includes("position:fixed"), `${workspace.name} must not introduce floating controls.`);

  verified.push(workspace.name);
}

console.log(JSON.stringify({
  status: "ready",
  validator: "kairos-operational-workspaces-20260714-1",
  workspacesVerified: verified.length,
  workspaces: verified,
  validationModel: "structural-contracts-not-display-copy",
  routesVerified: true,
  governanceBoundariesVerified: true,
  commandCenterAssetsVerified: true,
  floatingControls: 0,
}, null, 2));
