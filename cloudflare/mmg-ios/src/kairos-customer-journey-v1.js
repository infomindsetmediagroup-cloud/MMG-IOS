import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-customer-journey-20260714-2";
const CACHE_SECONDS = 60 * 60 * 24 * 30;

export async function createJourney(request, payload = {}) {
  const title = clean(payload.title, 180);
  const objective = clean(payload.objective, 3000);
  if (!title) throw new Error("Enter a customer journey name.");
  if (!objective) throw new Error("Define the finished customer experience objective.");
  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Customer Journey · ${title}`,
    objective,
    center: "customers",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Customer Journeys",
    source: "customers/customer-journeys",
    tasks: [
      { title: "Define journey and customer state", description: "Confirm the customer segment, entry condition, desired outcome, evidence, and constraints." },
      { title: "Map touchpoints and handoffs", description: "Document every approved touchpoint, transition, owner, channel, and dependency." },
      { title: "Identify friction and failure points", description: "Record supported gaps, delays, confusion, abandonment risks, and recovery paths." },
      { title: "Design the improved journey", description: "Specify the future-state sequence, messages, service standards, and measurable success criteria." },
      { title: "Approve and measure the journey", description: "Approve customer-facing changes, execute through authorized systems, and compare verified results." },
    ],
  });
  const journey = {
    id: `journey-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    objective,
    status: "journey-map-ready",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    customerSegment: clean(payload.customerSegment, 1800),
    entryPoint: clean(payload.entryPoint, 1200),
    desiredOutcome: clean(payload.desiredOutcome, 1800),
    currentState: clean(payload.currentState, 4000),
    touchpoints: clean(payload.touchpoints, 5000),
    friction: clean(payload.friction, 4000),
    futureState: clean(payload.futureState, 5000),
    owners: clean(payload.owners, 1800),
    serviceStandards: clean(payload.serviceStandards, 2400),
    successMetrics: clean(payload.successMetrics, 2400),
    constraints: clean(payload.constraints, 2400),
    supportLearning: [],
    governance: {
      customerFacingChangesRequireApproval: true,
      automatedMessagingRequiresApproval: true,
      personalProfilingAutomatic: false,
      externalPublicationAutomatic: false,
      unsupportedIdentityInference: false,
      verifiedSupportEvidenceRequired: true,
      supportLearningAutomaticApplication: false,
    },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then define the customer state." : "Open the workflow and define the customer state.",
  };
  await persistJourney(request, journey);
  return { journey, workflow };
}

export async function applySupportLearning(request, journeyID, payload = {}) {
  const current = await readJourney(request, journeyID);
  if (!current) throw new Error("Customer journey was not found.");
  const { journey, workflow } = current;
  if (workflow?.approvalRequired && workflow.approvalStatus !== "approved") throw new Error("Applying support learning requires an approved journey workflow.");
  const evidence = clean(payload.evidence, 5000);
  const improvement = clean(payload.improvement, 3000);
  const supportCaseID = clean(payload.supportCaseID, 220);
  if (evidence.length < 20) throw new Error("Verified support evidence is required.");
  if (!improvement) throw new Error("Define the customer-journey improvement.");
  if (!supportCaseID) throw new Error("Support case reference is required.");
  const now = new Date().toISOString();
  const learning = {
    id: `journey-learning-${crypto.randomUUID()}`,
    supportCaseID,
    evidence,
    improvement,
    rootCause: clean(payload.rootCause, 120),
    preventionAction: clean(payload.preventionAction, 3000),
    approvedBy: clean(payload.approvedBy || "Executive approval", 180),
    appliedAt: now,
    inventedEvidence: false,
    automaticCustomerFacingChange: false,
  };
  journey.supportLearning = Array.isArray(journey.supportLearning) ? journey.supportLearning : [];
  journey.supportLearning.unshift(learning);
  journey.supportLearning = journey.supportLearning.slice(0, 100);
  journey.updatedAt = now;
  journey.status = "support-learning-applied";
  journey.nextAction = "Review the approved learning and update the journey through authorized customer-experience work.";
  await persistJourney(request, journey);
  return { journey, workflow, learning };
}

export async function readJourney(request, journeyID) {
  const response = await caches.default.match(journeyRequest(request, journeyID));
  if (!response) return null;
  try { const journey = await response.json(); return { journey, workflow: await readWorkflow(request, journey.workflowID) }; } catch { return null; }
}
export async function readLatestJourney(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { const journey = await response.json(); return { journey, workflow: await readWorkflow(request, journey.workflowID) }; } catch { return null; }
}
async function persistJourney(request, journey){await caches.default.put(journeyRequest(request,journey.id),stored(journey));await caches.default.put(latestRequest(request),stored(journey))}
function clean(value,max){return String(value??"").trim().slice(0,max)}
function stored(value){return new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":`public, max-age=${CACHE_SECONDS}`}})}
function journeyRequest(request,id){return new Request(new URL(`/_kairos/customer-journeys/${encodeURIComponent(id)}`,request.url).toString(),{method:"GET"})}
function latestRequest(request){return new Request(new URL("/_kairos/customer-journeys/latest",request.url).toString(),{method:"GET"})}
