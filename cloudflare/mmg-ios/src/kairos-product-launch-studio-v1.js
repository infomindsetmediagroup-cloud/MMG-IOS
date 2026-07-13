import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-product-launch-studio-20260713-1";
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
    title: `Product Launch · ${title}`,
    objective,
    center: "business",
    priority: payload.priority || "high",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Product Launch Studio",
    source: "business/product-launch",
    tasks: [
      { title: "Lock launch strategy", description: "Confirm product, audience, outcome, positioning, launch target, and commercial constraints." },
      { title: "Build offer and product package", description: "Prepare the offer, product details, pricing inputs, fulfillment model, and required production assets." },
      { title: "Prepare commerce and campaign assets", description: "Assemble product copy, media, SEO, channel assets, campaign messaging, and launch handoffs." },
      { title: "Run launch readiness review", description: "Verify product state, customer path, pricing approval, inventory or delivery readiness, analytics, and rollback evidence." },
      { title: "Approve and execute release", description: "Require executive approval before any customer-facing publication, campaign activation, or irreversible release action." },
    ],
  });

  const project = {
    id: `launch-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    objective,
    productType: type,
    status: "strategy-ready",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    strategy: {
      audience: clean(payload.audience, 2000),
      problem: clean(payload.problem, 2000),
      promise: clean(payload.promise, 2000),
      positioning: clean(payload.positioning, 3000),
      price: clean(payload.price, 300),
      delivery: clean(payload.delivery, 2000),
      channels: clean(payload.channels, 2000),
      launchDate: clean(payload.launchDate, 120),
      successMetric: clean(payload.successMetric, 1200),
      dependencies: clean(payload.dependencies, 3000),
    },
    releaseBoundary: {
      pricingApprovalRequired: true,
      customerFacingPublicationRequiresApproval: true,
      campaignActivationRequiresApproval: true,
      destructiveActionAutomatic: false,
      externalPublicationAutomatic: false,
      rollbackEvidenceRequired: true,
    },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then lock the launch strategy." : "Open the workflow and lock the launch strategy.",
  };

  await caches.default.put(projectRequest(request, project.id), stored(project));
  await caches.default.put(latestRequest(request), stored(project));
  return { project, workflow };
}

export async function readLaunchProject(request, projectID) {
  if (!projectID) return null;
  const response = await caches.default.match(projectRequest(request, projectID));
  if (!response) return null;
  try {
    const project = await response.json();
    return { project, workflow: await readWorkflow(request, project.workflowID) };
  } catch { return null; }
}

export async function readLatestLaunchProject(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try {
    const project = await response.json();
    return { project, workflow: await readWorkflow(request, project.workflowID) };
  } catch { return null; }
}

function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function projectRequest(request, id) { return new Request(new URL(`/_kairos/product-launch/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/product-launch/latest", request.url).toString(), { method: "GET" }); }
