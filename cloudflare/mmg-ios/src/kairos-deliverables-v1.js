import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-deliverables-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const STATUSES = new Set(["draft", "qa", "approval", "ready", "delivered", "superseded"]);

export async function createDeliverable(request, payload = {}) {
  const title = clean(payload.title, 220);
  const customer = clean(payload.customer, 220);
  const project = clean(payload.project, 220);
  if (!title) throw new Error("Enter a deliverable name.");
  if (!customer) throw new Error("Enter the customer or recipient.");
  if (!project) throw new Error("Enter the related project.");

  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Deliverable · ${title}`,
    objective: `Prepare, verify, approve, and deliver ${title} for ${customer} under project ${project}.`,
    center: "customers",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Deliverables",
    source: "customers/deliverables",
    tasks: [
      { title: "Confirm deliverable scope", description: "Verify the recipient, project, version, required files, format, and acceptance criteria." },
      { title: "Assemble delivery package", description: "Collect approved final files, documentation, licenses, and customer-facing instructions." },
      { title: "Run final quality assurance", description: "Verify file integrity, naming, dimensions, links, accessibility, and completeness." },
      { title: "Approve release package", description: "Capture final approval, release evidence, and any restrictions before delivery." },
      { title: "Deliver and record receipt", description: "Release through the approved channel and preserve delivery confirmation and version history." },
    ],
  });

  const deliverable = {
    id: `deliverable-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    customer,
    project,
    status: STATUSES.has(payload.status) ? payload.status : "draft",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    version: clean(payload.version || "v1", 120),
    description: clean(payload.description, 3000),
    files: clean(payload.files, 5000),
    format: clean(payload.format, 1600),
    acceptanceCriteria: clean(payload.acceptanceCriteria, 3000),
    deliveryChannel: clean(payload.deliveryChannel, 1200),
    instructions: clean(payload.instructions, 3000),
    restrictions: clean(payload.restrictions, 3000),
    approvalEvidence: clean(payload.approvalEvidence, 3000),
    receiptEvidence: clean(payload.receiptEvidence, 3000),
    deliveryBoundary: {
      finalApprovalRequired: true,
      internalSourceFilesHidden: true,
      editableWorkingFilesHidden: true,
      customerReceivesApprovedPackageOnly: true,
      deliveryAutomatic: false,
      externalPublicationAutomatic: false,
      versionHistoryPreserved: true,
    },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then confirm deliverable scope." : "Open the workflow and confirm deliverable scope.",
  };

  await caches.default.put(deliverableRequest(request, deliverable.id), stored(deliverable));
  await caches.default.put(latestRequest(request), stored(deliverable));
  return { deliverable, workflow };
}

export async function updateDeliverable(request, deliverableID, payload = {}) {
  const current = await readDeliverable(request, deliverableID);
  if (!current) throw new Error("Deliverable not found.");
  const deliverable = current.deliverable;
  if (payload.status && STATUSES.has(payload.status)) deliverable.status = payload.status;
  for (const field of ["version", "description", "files", "format", "acceptanceCriteria", "deliveryChannel", "instructions", "restrictions", "approvalEvidence", "receiptEvidence"]) {
    if (payload[field] !== undefined) deliverable[field] = clean(payload[field], field === "version" ? 120 : 5000);
  }
  deliverable.updatedAt = new Date().toISOString();
  await caches.default.put(deliverableRequest(request, deliverable.id), stored(deliverable));
  await caches.default.put(latestRequest(request), stored(deliverable));
  return { deliverable, workflow: await readWorkflow(request, deliverable.workflowID) };
}

export async function readDeliverable(request, deliverableID) {
  const response = await caches.default.match(deliverableRequest(request, deliverableID));
  if (!response) return null;
  try {
    const deliverable = await response.json();
    return { deliverable, workflow: await readWorkflow(request, deliverable.workflowID) };
  } catch { return null; }
}

export async function readLatestDeliverable(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try {
    const deliverable = await response.json();
    return { deliverable, workflow: await readWorkflow(request, deliverable.workflowID) };
  } catch { return null; }
}

function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function deliverableRequest(request, id) { return new Request(new URL(`/_kairos/deliverables/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/deliverables/latest", request.url).toString(), { method: "GET" }); }
