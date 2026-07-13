const BUILD = "kairos-manuscript-delivery-20260713-1";
const RELEASE_CONFIRMATION = "RELEASE CUSTOMER DELIVERABLES";
const COMPLETE_CONFIRMATION = "COMPLETE CUSTOMER PROJECT";
const WITHDRAW_CONFIRMATION = "WITHDRAW CUSTOMER DELIVERY";

export async function handleManuscriptDeliveryObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/delivery(?:\/(prepare|release|decision|complete|withdraw))?$/i);
  if (!match) return null;
  const projectId = match[1];
  const action = match[2] || "status";
  try {
    if (action === "status" && request.method === "GET") return readStatus(state, projectId);
    if (action === "prepare" && request.method === "POST") return prepare(state, request, projectId);
    if (action === "release" && request.method === "POST") return release(state, request, projectId);
    if (action === "decision" && request.method === "POST") return decision(state, request, projectId);
    if (action === "complete" && request.method === "POST") return complete(state, request, projectId);
    if (action === "withdraw" && request.method === "POST") return withdraw(state, request, projectId);
    return json({ status: "not-found", error: { code: "delivery_route_not_found", message: "Customer delivery route not found." } }, 404);
  } catch (error) {
    return json({ status: "failed", build: BUILD, error: { code: error?.code || "delivery_failed", message: error instanceof Error ? error.message : "Customer delivery failed." } }, Number(error?.status || 500));
  }
}

async function readStatus(state, projectId) {
  await requireProject(state, projectId);
  const delivery = await state.storage.get(deliveryKey(projectId));
  return json({ status: delivery?.status || "not-prepared", build: BUILD, delivery: delivery || null });
}

async function prepare(state, request, projectId) {
  const project = await requireProject(state, projectId);
  const manufacturing = await state.storage.get(manufacturingKey(projectId));
  if (!manufacturing || manufacturing.status !== "manufactured-and-verified" || !manufacturing.verification?.passed) {
    throw fail(409, "verified_manufacturing_required", "Complete and verify the manufacturing package before preparing customer delivery.");
  }
  const body = await request.json().catch(() => ({}));
  const customerName = required(body?.customerName, "Customer name", 180);
  const customerEmail = optionalEmail(body?.customerEmail);
  const note = String(body?.note || "Your approved publishing deliverables are ready for review.").trim().slice(0, 4000);
  const now = new Date().toISOString();
  const delivery = {
    projectId,
    deliveryId: `delivery-${crypto.randomUUID()}`,
    releaseId: manufacturing.releaseId,
    status: "awaiting-delivery-approval",
    customerName,
    customerEmail,
    title: manufacturing.title || project.title,
    note,
    package: {
      artifactCount: manufacturing.artifacts.length,
      verificationPassed: true,
      manufacturingReleaseId: manufacturing.releaseId,
      artifacts: manufacturing.artifacts.map(item => ({ name: item.name, bytes: item.bytes, sha256: item.sha256, contentType: item.contentType, downloadURL: item.downloadURL })),
      primaryDownload: manufacturing.artifacts.find(item => item.name === "final-manufacturing-package.zip")?.downloadURL || null,
    },
    confirmationRequired: RELEASE_CONFIRMATION,
    completionConfirmation: COMPLETE_CONFIRMATION,
    withdrawalConfirmation: WITHDRAW_CONFIRMATION,
    preparedBy: String(body?.actor || "Executive").slice(0, 180),
    preparedAt: now,
    releasedAt: null,
    decision: null,
    completedAt: null,
    history: [{ id: crypto.randomUUID(), action: "delivery-prepared", actor: String(body?.actor || "Executive").slice(0, 180), recordedAt: now }],
    build: BUILD,
  };
  await state.storage.put(deliveryKey(projectId), delivery);
  await updateRegistry(state, projectId, { status: "awaiting-delivery-approval", stage: "customer-delivery-approval", progress: 98, summary: "The verified manufacturing package is ready for controlled customer delivery.", nextAction: `Type ${RELEASE_CONFIRMATION} to release the deliverables.`, checkpoint: { id: delivery.deliveryId, label: "Customer delivery prepared", status: "completed", recordedAt: now } });
  return json({ status: delivery.status, build: BUILD, delivery }, 201);
}

async function release(state, request, projectId) {
  await requireProject(state, projectId);
  const body = await request.json();
  if (String(body?.confirmation || "").trim() !== RELEASE_CONFIRMATION) throw fail(403, "delivery_confirmation_required", `Type ${RELEASE_CONFIRMATION} to authorize customer delivery.`);
  const current = await state.storage.get(deliveryKey(projectId));
  if (!current || current.status !== "awaiting-delivery-approval") throw fail(409, "delivery_state_invalid", "Prepare the customer delivery before release.");
  const manufacturing = await state.storage.get(manufacturingKey(projectId));
  if (!manufacturing || manufacturing.status !== "manufactured-and-verified" || manufacturing.releaseId !== current.releaseId || !manufacturing.verification?.passed) throw fail(409, "manufacturing_release_changed", "The verified manufacturing release changed after delivery preparation.");
  const now = new Date().toISOString();
  const delivery = { ...current, status: "released-for-customer-review", releasedBy: String(body?.actor || "Executive").slice(0, 180), releasedAt: now, updatedAt: now, history: append(current.history, "delivery-released", body?.actor, now) };
  await state.storage.put(deliveryKey(projectId), delivery);
  await updateRegistry(state, projectId, { status: "released-for-customer-review", stage: "customer-delivery", progress: 99, summary: "The verified final deliverables were released for customer review.", nextAction: "Record customer acceptance or a revision request.", checkpoint: { id: `${delivery.deliveryId}-released`, label: "Final deliverables released to customer review", status: "completed", recordedAt: now } });
  return json({ status: delivery.status, build: BUILD, delivery });
}

async function decision(state, request, projectId) {
  await requireProject(state, projectId);
  const body = await request.json();
  const value = body?.decision === "accepted" ? "accepted" : body?.decision === "revision-requested" ? "revision-requested" : null;
  if (!value) throw fail(400, "delivery_decision_invalid", "Decision must be accepted or revision-requested.");
  const current = await state.storage.get(deliveryKey(projectId));
  if (!current || current.status !== "released-for-customer-review") throw fail(409, "delivery_not_released", "Release the deliverables before recording the customer decision.");
  const now = new Date().toISOString();
  const decision = { decision: value, note: String(body?.note || "").slice(0, 4000), actor: String(body?.actor || "Executive").slice(0, 180), recordedAt: now };
  const delivery = { ...current, status: value === "accepted" ? "customer-accepted" : "customer-revision-requested", decision, updatedAt: now, history: append(current.history, value, body?.actor, now) };
  await state.storage.put(deliveryKey(projectId), delivery);
  await updateRegistry(state, projectId, value === "accepted"
    ? { status: "customer-accepted", stage: "project-completion", progress: 100, summary: "Customer acceptance was recorded for the final deliverables.", nextAction: `Type ${COMPLETE_CONFIRMATION} to close the project.`, checkpoint: { id: `${delivery.deliveryId}-accepted`, label: "Customer accepted final deliverables", status: "completed", recordedAt: now } }
    : { status: "customer-revision-requested", stage: "revision-control", progress: 96, summary: "A customer revision request was recorded after final delivery.", nextAction: "Return to editorial production, create a new approved version, and manufacture a new release.", checkpoint: { id: `${delivery.deliveryId}-revision`, label: "Customer requested post-delivery revision", status: "completed", recordedAt: now } });
  return json({ status: delivery.status, build: BUILD, delivery });
}

async function complete(state, request, projectId) {
  await requireProject(state, projectId);
  const body = await request.json();
  if (String(body?.confirmation || "").trim() !== COMPLETE_CONFIRMATION) throw fail(403, "completion_confirmation_required", `Type ${COMPLETE_CONFIRMATION} to close the customer project.`);
  const current = await state.storage.get(deliveryKey(projectId));
  if (!current || current.status !== "customer-accepted") throw fail(409, "customer_acceptance_required", "Customer acceptance is required before project completion.");
  const now = new Date().toISOString();
  const completion = { completedBy: String(body?.actor || "Executive").slice(0, 180), completedAt: now, closureNote: String(body?.note || "Final deliverables accepted and project completed.").slice(0, 4000) };
  const delivery = { ...current, status: "completed", completion, completedAt: now, updatedAt: now, history: append(current.history, "project-completed", body?.actor, now) };
  await state.storage.put(deliveryKey(projectId), delivery);
  await updateRegistry(state, projectId, { status: "completed", stage: "completed", progress: 100, summary: "The publishing project is complete with verified delivery and recorded customer acceptance.", nextAction: "Retain the permanent release evidence or archive the project from the Production Registry.", checkpoint: { id: "project-completed", label: "Customer project completed", status: "completed", recordedAt: now } });
  return json({ status: delivery.status, build: BUILD, delivery });
}

async function withdraw(state, request, projectId) {
  await requireProject(state, projectId);
  const body = await request.json();
  if (String(body?.confirmation || "").trim() !== WITHDRAW_CONFIRMATION) throw fail(403, "withdrawal_confirmation_required", `Type ${WITHDRAW_CONFIRMATION} to withdraw customer delivery.`);
  const current = await state.storage.get(deliveryKey(projectId));
  if (!current || !["awaiting-delivery-approval", "released-for-customer-review"].includes(current.status)) throw fail(409, "delivery_withdrawal_invalid", "Only a prepared or released delivery may be withdrawn.");
  const now = new Date().toISOString();
  const delivery = { ...current, status: "withdrawn", withdrawnBy: String(body?.actor || "Executive").slice(0, 180), withdrawnAt: now, withdrawalNote: String(body?.note || "").slice(0, 4000), updatedAt: now, history: append(current.history, "delivery-withdrawn", body?.actor, now) };
  await state.storage.put(deliveryKey(projectId), delivery);
  await updateRegistry(state, projectId, { status: "manufactured-and-verified", stage: "delivery-package", progress: 100, summary: "Customer delivery was withdrawn; the verified manufacturing package remains intact.", nextAction: "Prepare a new customer delivery release when authorized.", checkpoint: { id: `${delivery.deliveryId}-withdrawn`, label: "Customer delivery withdrawn", status: "completed", recordedAt: now } });
  return json({ status: delivery.status, build: BUILD, delivery });
}

async function requireProject(state, projectId) {
  const records = (await state.storage.get("production-registry")) || {};
  const project = records[projectId];
  if (!project || project.projectType !== "manuscript-studio") throw fail(404, "manuscript_project_not_found", "The manuscript production project was not found.");
  return project;
}

async function updateRegistry(state, projectId, change) {
  const records = (await state.storage.get("production-registry")) || {};
  const current = records[projectId];
  if (!current) return;
  const list = Array.isArray(current.checkpoints) ? current.checkpoints.filter(item => item?.id !== change.checkpoint?.id) : [];
  records[projectId] = { ...current, status: change.status, stage: change.stage, progress: change.progress, summary: change.summary, nextAction: change.nextAction, checkpoints: change.checkpoint ? [...list.slice(-39), change.checkpoint] : list, deliveryRelease: true, updatedAt: new Date().toISOString(), revision: Number(current.revision || 0) + 1 };
  await state.storage.put("production-registry", records);
}

function append(history, action, actor, recordedAt) { return [...(Array.isArray(history) ? history : []).slice(-49), { id: crypto.randomUUID(), action, actor: String(actor || "Executive").slice(0, 180), recordedAt }]; }
function required(value, label, max) { const text = String(value || "").trim().slice(0, max); if (!text) throw fail(400, "required_field_missing", `${label} is required.`); return text; }
function optionalEmail(value) { const text = String(value || "").trim().slice(0, 254); if (!text) return null; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw fail(400, "customer_email_invalid", "Enter a valid customer email address or leave it blank."); return text; }
function deliveryKey(id) { return `manuscript:${id}:delivery`; }
function manufacturingKey(id) { return `manuscript:${id}:manufacturing`; }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Delivery": BUILD } }); }
