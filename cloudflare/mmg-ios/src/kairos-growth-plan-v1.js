import { createWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-growth-plan-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;

export async function createGrowthPlan(request, payload = {}) {
  const objective = clean(payload.objective, 3000);
  if (!objective) throw new Error("Enter a measurable growth objective.");
  const now = new Date().toISOString();
  const plan = {
    id: `growth-plan-${crypto.randomUUID()}`,
    build: BUILD,
    status: "plan-ready",
    objective,
    horizon: clean(payload.horizon || "90 days", 120),
    baseline: clean(payload.baseline, 2000),
    target: clean(payload.target, 1000),
    audience: clean(payload.audience, 1500),
    channels: list(payload.channels),
    constraints: clean(payload.constraints, 3000),
    successMetrics: list(payload.successMetrics),
    createdAt: now,
    updatedAt: now,
    strategy: {
      northStar: clean(payload.northStar || objective, 1500),
      pillars: buildPillars(payload),
      reviewCadence: clean(payload.reviewCadence || "weekly", 120),
      experimentLimit: 3,
    },
    safeguards: {
      inventedBaseline: false,
      guaranteedOutcome: false,
      externalSpendAutomatic: false,
      externalPublicationAutomatic: false,
      pricingChangeAutomatic: false,
      approvalRequiredForMaterialChange: true,
    },
  };

  const workflow = await createWorkflow(request, {
    title: `Growth Plan · ${plan.horizon}`,
    objective,
    center: "business",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Growth Plan",
    source: "business/growth-plan",
    tasks: [
      { title: "Confirm baseline and target", description: "Verify the current state, target outcome, measurement source, and planning horizon." },
      { title: "Lock growth strategy", description: "Choose the smallest coherent set of channels, offers, and audience priorities." },
      { title: "Prepare experiments", description: "Define no more than three measurable experiments with owners, dates, and stop conditions." },
      { title: "Execute and measure", description: "Run approved work and record authoritative performance evidence." },
      { title: "Review, learn, and compound", description: "Keep, revise, or stop each action and preserve reusable knowledge." },
    ],
  });

  plan.workflowID = workflow.id;
  plan.nextAction = workflow.approvalRequired ? "Approve the workflow, then confirm baseline evidence." : "Open the workflow and confirm baseline evidence.";
  await caches.default.put(planRequest(request, plan.id), stored(plan));
  await caches.default.put(latestRequest(request), stored(plan));
  return { plan, workflow };
}

export async function readGrowthPlan(request, planID) {
  const response = await caches.default.match(planRequest(request, planID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

export async function readLatestGrowthPlan(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

function buildPillars(payload) {
  const supplied = list(payload.pillars);
  if (supplied.length) return supplied.slice(0, 5).map((name, index) => ({ id: `pillar-${index + 1}`, name, status: "planned" }));
  return [
    { id: "pillar-1", name: "Audience growth", status: "planned" },
    { id: "pillar-2", name: "Conversion improvement", status: "planned" },
    { id: "pillar-3", name: "Product and offer expansion", status: "planned" },
  ];
}
function list(value) { return Array.isArray(value) ? value.map(item => clean(item, 300)).filter(Boolean).slice(0, 20) : String(value || "").split(/\n|,/).map(item => clean(item, 300)).filter(Boolean).slice(0, 20); }
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function planRequest(request, id) { return new Request(new URL(`/_kairos/growth-plan/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/growth-plan/latest", request.url).toString(), { method: "GET" }); }
