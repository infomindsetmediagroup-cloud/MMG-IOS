import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-customer-portal-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const STAGES = ["purchased", "intake", "uploads", "production", "proofs", "final-qa", "delivered"];

export async function createCustomerProject(request, payload = {}) {
  const customer = clean(payload.customer, 220);
  const title = clean(payload.title, 220);
  const objective = clean(payload.objective, 3000);
  if (!customer) throw new Error("Enter the customer or client name.");
  if (!title) throw new Error("Enter the customer project name.");
  if (!objective) throw new Error("Define the finished customer outcome.");

  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Customer Portal · ${title}`,
    objective,
    center: "customers",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Customer Portal",
    source: "customers/customer-portal",
    tasks: [
      { title: "Complete project intake", description: "Confirm scope, customer requirements, source materials, deadlines, and acceptance criteria." },
      { title: "Collect required uploads", description: "Receive and verify manuscripts, artwork, references, brand assets, and supporting files." },
      { title: "Advance production work", description: "Coordinate approved internal production tasks and preserve visible project progress." },
      { title: "Issue and resolve proof review", description: "Deliver proof materials, capture customer feedback, and record approved corrections." },
      { title: "Complete final QA and delivery", description: "Verify final files, approval evidence, delivery package, and customer receipt." },
    ],
  });

  const project = {
    id: `customer-project-${crypto.randomUUID()}`,
    build: BUILD,
    customer,
    title,
    objective,
    status: "intake-ready",
    stage: "purchased",
    stages: STAGES,
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    contact: clean(payload.contact, 600),
    orderReference: clean(payload.orderReference, 300),
    scope: clean(payload.scope, 4000),
    requirements: clean(payload.requirements, 4000),
    uploadsNeeded: clean(payload.uploadsNeeded, 3000),
    dueDate: clean(payload.dueDate, 160),
    communicationNotes: clean(payload.communicationNotes, 3000),
    acceptanceCriteria: clean(payload.acceptanceCriteria, 3000),
    deliveryFormat: clean(payload.deliveryFormat, 2000),
    portalBoundary: {
      customerCanViewOwnProjectOnly: true,
      internalSourceFilesHidden: true,
      editableProductionFilesHidden: true,
      proofsRequireCustomerAction: true,
      finalDeliveryRequiresApproval: true,
      externalPublicationAutomatic: false,
    },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then complete project intake." : "Open the workflow and complete project intake.",
  };

  await caches.default.put(projectRequest(request, project.id), stored(project));
  await caches.default.put(latestRequest(request), stored(project));
  return { project, workflow };
}

export async function updateCustomerProject(request, projectID, payload = {}) {
  const current = await readCustomerProject(request, projectID);
  if (!current) throw new Error("Customer project not found.");
  const project = current.project;
  if (payload.stage && STAGES.includes(payload.stage)) project.stage = payload.stage;
  for (const field of ["contact", "orderReference", "scope", "requirements", "uploadsNeeded", "dueDate", "communicationNotes", "acceptanceCriteria", "deliveryFormat"]) {
    if (payload[field] !== undefined) project[field] = clean(payload[field], field === "contact" || field === "orderReference" || field === "dueDate" ? 600 : 4000);
  }
  project.status = project.stage === "delivered" ? "delivered" : `${project.stage}-active`;
  project.updatedAt = new Date().toISOString();
  await caches.default.put(projectRequest(request, project.id), stored(project));
  await caches.default.put(latestRequest(request), stored(project));
  return { project, workflow: await readWorkflow(request, project.workflowID) };
}

export async function readCustomerProject(request, projectID) {
  const response = await caches.default.match(projectRequest(request, projectID));
  if (!response) return null;
  try {
    const project = await response.json();
    return { project, workflow: await readWorkflow(request, project.workflowID) };
  } catch { return null; }
}

export async function readLatestCustomerProject(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try {
    const project = await response.json();
    return { project, workflow: await readWorkflow(request, project.workflowID) };
  } catch { return null; }
}

function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function projectRequest(request, id) { return new Request(new URL(`/_kairos/customer-projects/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/customer-projects/latest", request.url).toString(), { method: "GET" }); }
