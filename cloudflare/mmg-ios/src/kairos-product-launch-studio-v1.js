import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-product-launch-studio-20260714-2";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const PRODUCT_TYPES = new Set(["physical-product", "digital-download", "book", "service", "subscription", "merchandise", "bundle", "custom"]);

export async function createLaunchProject(request, payload = {}) {
  const title = clean(payload.title, 180);
  const objective = clean(payload.objective, 4000);
  if (!title) throw new Error("Enter the product or offer name.");
  if (!objective) throw new Error("Describe the finished launch outcome.");
  const type = PRODUCT_TYPES.has(payload.productType) ? payload.productType : "custom";
  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Product Launch · ${title}`, objective, center: "business", priority: payload.priority || "high",
    approvalRequired: Boolean(payload.approvalRequired), owner: "Product Launch Studio", source: "business/product-launch",
    tasks: [
      { title: "Lock launch strategy", description: "Confirm product, audience, outcome, positioning, launch target, and commercial constraints." },
      { title: "Build offer and product package", description: "Prepare the offer, product details, pricing inputs, fulfillment model, and required production assets." },
      { title: "Prepare commerce and campaign assets", description: "Assemble product copy, media, SEO, channel assets, campaign messaging, and launch handoffs." },
      { title: "Run launch readiness review", description: "Verify product state, customer path, pricing approval, inventory or delivery readiness, analytics, and rollback evidence." },
      { title: "Approve and execute release", description: "Require executive approval before any customer-facing publication, campaign activation, or irreversible release action." },
    ],
  });
  const project = {
    id: `launch-${crypto.randomUUID()}`, build: BUILD, title, objective, productType: type, status: "strategy-ready", workflowID: workflow.id,
    createdAt: now, updatedAt: now, offerReference: clean(payload.offerReference, 180), offerCertificationEvidence: clean(payload.offerCertificationEvidence, 5000),
    strategy: { audience: clean(payload.audience, 2000), problem: clean(payload.problem, 2000), promise: clean(payload.promise, 2000), positioning: clean(payload.positioning, 3000), price: clean(payload.price, 300), delivery: clean(payload.delivery, 2000), channels: clean(payload.channels, 2000), launchDate: clean(payload.launchDate, 120), successMetric: clean(payload.successMetric, 1200), dependencies: clean(payload.dependencies, 3000) },
    readinessCertification: null,
    releaseBoundary: { pricingApprovalRequired: true, customerFacingPublicationRequiresApproval: true, campaignActivationRequiresApproval: true, destructiveActionAutomatic: false, externalPublicationAutomatic: false, rollbackEvidenceRequired: true },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then lock the launch strategy." : "Open the workflow and lock the launch strategy.",
  };
  await persistProject(request, project);
  return { project, workflow };
}

export async function certifyLaunchReadiness(request, projectID, payload = {}) {
  const current = await readLaunchProject(request, projectID);
  if (!current) throw new Error("Launch project was not found.");
  const { project, workflow } = current;
  if (workflow?.approvalRequired && workflow.approvalStatus !== "approved") throw new Error("Launch readiness certification requires an approved workflow.");
  const evidence = clean(payload.evidence, 6000);
  const rollbackEvidence = clean(payload.rollbackEvidence, 3000);
  if (evidence.length < 20) throw new Error("Launch readiness evidence is required.");
  if (rollbackEvidence.length < 10) throw new Error("Rollback evidence is required.");
  for (const [label, value] of [["audience", project.strategy.audience], ["promise", project.strategy.promise], ["price", project.strategy.price], ["delivery", project.strategy.delivery], ["success metric", project.strategy.successMetric]]) {
    if (!clean(value, 20)) throw new Error(`Complete the ${label} before launch certification.`);
  }
  const checks = {
    offerCertified: payload.offerCertified === true,
    pricingApproved: payload.pricingApproved === true,
    customerPathVerified: payload.customerPathVerified === true,
    deliveryVerified: payload.deliveryVerified === true,
    analyticsVerified: payload.analyticsVerified === true,
    campaignAssetsVerified: payload.campaignAssetsVerified === true,
  };
  if (Object.values(checks).some(value => value !== true)) throw new Error("Every launch readiness check must be verified.");
  const now = new Date().toISOString();
  project.status = "launch-certified";
  project.updatedAt = now;
  project.readinessCertification = { certifiedAt: now, actor: clean(payload.actor || "Executive approval", 180), evidence, rollbackEvidence, checks, externalPublicationAutomatic: false, campaignActivationAutomatic: false, irreversibleActionAutomatic: false };
  project.nextAction = "Release remains approval-gated; execute only through authorized production controls.";
  await persistProject(request, project);
  return { project, workflow };
}

export async function readLaunchProject(request, projectID) {
  if (!projectID) return null;
  const response = await caches.default.match(projectRequest(request, projectID));
  if (!response) return null;
  try { const project = await response.json(); return { project, workflow: await readWorkflow(request, project.workflowID) }; } catch { return null; }
}
export async function readLatestLaunchProject(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { const project = await response.json(); return { project, workflow: await readWorkflow(request, project.workflowID) }; } catch { return null; }
}
async function persistProject(request, project) { await caches.default.put(projectRequest(request, project.id), stored(project)); await caches.default.put(latestRequest(request), stored(project)); }
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function projectRequest(request, id) { return new Request(new URL(`/_kairos/product-launch/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/product-launch/latest", request.url).toString(), { method: "GET" }); }
