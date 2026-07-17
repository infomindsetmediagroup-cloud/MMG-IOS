import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-campaign-operations-20260714-2";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const CHANNELS = new Set(["owned-social", "email", "website", "shopify", "organic-search", "partnership", "paid-media", "multi-channel"]);
const DECISIONS = new Set(["keep", "revise", "stop"]);

export async function createCampaign(request, payload = {}) {
  const title = clean(payload.title, 180);
  const objective = clean(payload.objective, 3000);
  if (!title) throw new Error("Enter a campaign name.");
  if (!objective) throw new Error("Define the campaign objective.");

  const now = new Date().toISOString();
  const channel = CHANNELS.has(payload.channel) ? payload.channel : "multi-channel";
  const workflow = await createWorkflow(request, {
    title: `Campaign Operations · ${title}`,
    objective,
    center: "business",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Campaign Operations",
    source: "business/campaign-operations",
    tasks: [
      { title: "Lock campaign objective", description: "Confirm the audience, offer, message, target action, timing, and measurable success criteria." },
      { title: "Assemble campaign assets", description: "Prepare approved copy, creative, landing destinations, tracking requirements, and channel-specific deliverables." },
      { title: "Verify launch readiness", description: "Check links, claims, pricing, permissions, scheduling, analytics, and rollback requirements." },
      { title: "Execute approved campaign", description: "Release only approved actions through connected and authorized channels." },
      { title: "Measure and close campaign", description: "Capture verified results, compare against the approved baseline, and preserve lessons for reuse." },
    ],
  });

  const campaign = {
    id: `campaign-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    objective,
    channel,
    status: "campaign-brief-ready",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    audience: clean(payload.audience, 1800),
    offer: clean(payload.offer, 1800),
    message: clean(payload.message, 2400),
    callToAction: clean(payload.callToAction, 600),
    startDate: clean(payload.startDate, 120),
    endDate: clean(payload.endDate, 120),
    budget: clean(payload.budget, 600),
    baseline: clean(payload.baseline, 1800),
    successMetric: clean(payload.successMetric, 1200),
    assets: clean(payload.assets, 4000),
    destinations: clean(payload.destinations, 2400),
    dependencies: clean(payload.dependencies, 2400),
    constraints: clean(payload.constraints, 2400),
    growthReference: clean(payload.growthReference, 180),
    closeout: null,
    governance: {
      externalPublicationAutomatic: false,
      paidSpendAutomatic: false,
      pricingChangesAutomatic: false,
      claimsRequireApproval: true,
      launchRequiresApproval: true,
      rollbackEvidenceRequired: true,
      verifiedCloseoutEvidenceRequired: true,
      automaticPerformanceClaims: false,
    },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then lock the campaign objective." : "Open the workflow and lock the campaign objective.",
  };

  await persistCampaign(request, campaign);
  return { campaign, workflow };
}

export async function closeCampaign(request, campaignID, payload = {}) {
  const current = await readCampaign(request, campaignID);
  if (!current) throw new Error("Campaign was not found.");
  const { campaign, workflow } = current;
  if (workflow?.approvalRequired && workflow.approvalStatus !== "approved") throw new Error("Campaign closeout requires an approved workflow.");
  const evidence = clean(payload.evidence, 5000);
  const actualResult = clean(payload.actualResult, 1800);
  const decision = DECISIONS.has(payload.decision) ? payload.decision : "revise";
  if (evidence.length < 20) throw new Error("Verified closeout evidence is required.");
  if (!actualResult) throw new Error("Record the verified campaign result.");
  const now = new Date().toISOString();
  campaign.status = "measured-and-closed";
  campaign.updatedAt = now;
  campaign.closeout = {
    recordedAt: now,
    actualResult,
    evidence,
    decision,
    lesson: clean(payload.lesson, 2400),
    nextExperiment: clean(payload.nextExperiment, 2400),
    source: clean(payload.source || "verified campaign evidence", 500),
    inventedData: false,
    extrapolationPerformed: false,
  };
  campaign.nextAction = decision === "stop" ? "Preserve the lesson and stop this campaign pattern." : "Send verified evidence into the next Growth Plan experiment.";
  await persistCampaign(request, campaign);
  return { campaign, workflow };
}

export async function readCampaign(request, campaignID) {
  const response = await caches.default.match(campaignRequest(request, campaignID));
  if (!response) return null;
  try {
    const campaign = await response.json();
    return { campaign, workflow: await readWorkflow(request, campaign.workflowID) };
  } catch { return null; }
}

export async function readLatestCampaign(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try {
    const campaign = await response.json();
    return { campaign, workflow: await readWorkflow(request, campaign.workflowID) };
  } catch { return null; }
}

async function persistCampaign(request, campaign) {
  await caches.default.put(campaignRequest(request, campaign.id), stored(campaign));
  await caches.default.put(latestRequest(request), stored(campaign));
}
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function campaignRequest(request, id) { return new Request(new URL(`/_kairos/campaigns/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/campaigns/latest", request.url).toString(), { method: "GET" }); }
