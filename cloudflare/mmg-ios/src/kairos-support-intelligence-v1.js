import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-support-intelligence-20260714-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const ROOT_CAUSES = new Set(["access", "delivery", "billing", "expectation", "product-quality", "communication", "technical", "policy", "other"]);
const OUTCOMES = new Set(["resolved", "partially-resolved", "escalated", "unresolved"]);

export async function createSupportCase(request, payload = {}) {
  const customer = clean(payload.customer, 180);
  const topic = clean(payload.topic, 220);
  const issue = clean(payload.issue, 3000);
  const desiredResolution = clean(payload.desiredResolution, 3000);
  if (!topic) throw new Error("Enter the support topic.");
  if (!issue) throw new Error("Describe the customer need.");
  if (!desiredResolution) throw new Error("Define the successful resolution.");
  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Support Resolution · ${customer || "Customer"} · ${topic}`,
    objective: `Resolve the customer need: ${issue}. Desired resolution: ${desiredResolution}`,
    center: "customers",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Support Intelligence",
    source: "customers/support-intelligence",
    tasks: [
      { title: "Confirm customer need", description: "Verify the reported issue, customer impact, urgency, account or project context, and available evidence." },
      { title: "Select safe resolution path", description: "Choose the least disruptive approved resolution and identify any policy, refund, privacy, or executive approval requirements." },
      { title: "Execute and communicate", description: "Complete authorized support work and keep the customer informed with accurate status and expectations." },
      { title: "Verify resolution", description: "Record the actual outcome, supporting evidence, customer confirmation when available, and any remaining risk." },
      { title: "Convert learning into prevention", description: "Classify root cause and preserve a journey, onboarding, product, policy, or delivery improvement recommendation." },
    ],
  });
  const supportCase = {
    id: `support-${crypto.randomUUID()}`,
    build: BUILD,
    status: "support-case-ready",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    customer,
    topic,
    issue,
    desiredResolution,
    journeyReference: clean(payload.journeyReference, 220),
    projectReference: clean(payload.projectReference, 220),
    communicationCommitment: clean(payload.communicationCommitment, 1800),
    evidence: clean(payload.evidence, 4000),
    resolution: null,
    governance: {
      customerCommunicationAutomatic: false,
      refundAutomatic: false,
      policyExceptionAutomatic: false,
      personalProfilingAutomatic: false,
      unsupportedIdentityInference: false,
      verifiedResolutionEvidenceRequired: true,
      journeyMutationAutomatic: false,
    },
    nextAction: workflow.approvalRequired ? "Approve the support workflow, then confirm the customer need." : "Open the workflow and confirm the customer need.",
  };
  await persist(request, supportCase);
  return { supportCase, workflow };
}

export async function resolveSupportCase(request, caseID, payload = {}) {
  const current = await readSupportCase(request, caseID);
  if (!current) throw new Error("Support case was not found.");
  const { supportCase, workflow } = current;
  if (workflow?.approvalRequired && workflow.approvalStatus !== "approved") throw new Error("Support resolution requires an approved workflow.");
  const evidence = clean(payload.evidence, 5000);
  const actualResolution = clean(payload.actualResolution, 3000);
  if (evidence.length < 20) throw new Error("Verified resolution evidence is required.");
  if (!actualResolution) throw new Error("Record the actual customer resolution.");
  const rootCause = ROOT_CAUSES.has(payload.rootCause) ? payload.rootCause : "other";
  const outcome = OUTCOMES.has(payload.outcome) ? payload.outcome : "resolved";
  const now = new Date().toISOString();
  supportCase.status = outcome === "resolved" ? "resolved-and-learned" : "resolution-recorded";
  supportCase.updatedAt = now;
  supportCase.resolution = {
    resolvedAt: now,
    outcome,
    actualResolution,
    evidence,
    rootCause,
    customerConfirmed: payload.customerConfirmed === true,
    remainingRisk: clean(payload.remainingRisk, 1800),
    journeyImprovement: clean(payload.journeyImprovement, 3000),
    preventionAction: clean(payload.preventionAction, 3000),
    inventedEvidence: false,
    automaticJourneyMutation: false,
  };
  supportCase.nextAction = supportCase.resolution.journeyImprovement ? "Send the verified support learning to Customer Journey for approval." : "Preserve the resolution evidence and close the support workflow.";
  await persist(request, supportCase);
  return { supportCase, workflow };
}

export async function readSupportCase(request, caseID) {
  const response = await caches.default.match(caseRequest(request, caseID));
  if (!response) return null;
  try { const supportCase = await response.json(); return { supportCase, workflow: await readWorkflow(request, supportCase.workflowID) }; } catch { return null; }
}
export async function readLatestSupportCase(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { const supportCase = await response.json(); return { supportCase, workflow: await readWorkflow(request, supportCase.workflowID) }; } catch { return null; }
}
async function persist(request, supportCase) { await caches.default.put(caseRequest(request, supportCase.id), stored(supportCase)); await caches.default.put(latestRequest(request), stored(supportCase)); }
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function caseRequest(request, id) { return new Request(new URL(`/_kairos/support-intelligence/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/support-intelligence/latest", request.url).toString(), { method: "GET" }); }
