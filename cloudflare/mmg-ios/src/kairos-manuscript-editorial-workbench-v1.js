const BUILD = "kairos-manuscript-editorial-workbench-20260713-1";
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const TEXT_CHUNK_BYTES = 96 * 1024;

export async function handleManuscriptEditorialObjectRequest(state, request) {
  const url = new URL(request.url);
  const base = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/editorial(?:\/(versions|review|decision|finalize))?(?:\/([a-z0-9-]{8,}))?$/i);
  if (!base) return null;
  const projectId = base[1];
  const action = base[2] || "status";
  const versionId = base[3] || null;

  try {
    if (action === "status" && request.method === "GET") return readWorkbench(state, projectId);
    if (action === "versions" && request.method === "POST") return createVersion(state, request, projectId);
    if (action === "versions" && request.method === "GET" && versionId) return readVersionText(state, projectId, versionId);
    if (action === "review" && request.method === "POST") return createCustomerReview(state, request, projectId);
    if (action === "decision" && request.method === "POST") return recordDecision(state, request, projectId);
    if (action === "finalize" && request.method === "POST") return finalizeEditorial(state, request, projectId);
    return json({ status: "not-found", error: { code: "editorial_route_not_found", message: "Editorial workbench route not found." } }, 404);
  } catch (error) {
    return json({ status: "failed", build: BUILD, error: { code: error?.code || "editorial_workbench_failed", message: error instanceof Error ? error.message : "Editorial workbench failed." } }, Number(error?.status || 500));
  }
}

async function readWorkbench(state, projectId) {
  const project = await requireProject(state, projectId);
  const editorial = (await state.storage.get(editorialKey(projectId))) || initialEditorial(projectId);
  return json({ status: "ready", build: BUILD, project, editorial: publicEditorial(editorial) });
}

async function createVersion(state, request, projectId) {
  const project = await requireProject(state, projectId);
  const body = await request.json();
  const text = String(body?.manuscript || "");
  if (text.trim().length < 50) throw fail(400, "editorial_text_required", "Provide at least 50 characters for the editorial version.");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_TEXT_BYTES) throw fail(413, "editorial_text_too_large", "Editorial versions must be 2 MB or smaller.");

  const editorial = (await state.storage.get(editorialKey(projectId))) || initialEditorial(projectId);
  const versionId = `ver-${crypto.randomUUID()}`;
  const sequence = Number(editorial.versions?.length || 0) + 1;
  const passType = ["structural", "copyedit", "proofread", "customer-revision", "final"].includes(body?.passType) ? body.passType : "copyedit";
  const chunks = await putChunks(state, versionPrefix(projectId, versionId), bytes);
  const now = new Date().toISOString();
  const version = {
    versionId,
    sequence,
    label: String(body?.label || `Editorial Version ${sequence}`).slice(0, 180),
    passType,
    notes: String(body?.notes || "").slice(0, 4000),
    actor: String(body?.actor || "MMG Editorial Production").slice(0, 180),
    status: "working-version",
    wordCount: (text.match(/\b[\w’'-]+\b/g) || []).length,
    characterCount: text.length,
    checksum: await sha256(text),
    chunks,
    bytes: bytes.length,
    createdAt: now,
  };
  editorial.versions = [...(editorial.versions || []), version];
  editorial.currentVersionId = versionId;
  editorial.status = "editorial-in-progress";
  editorial.stage = passType;
  editorial.updatedAt = now;
  editorial.history = appendHistory(editorial.history, `${version.label} created`, now, version.actor);
  await state.storage.put(editorialKey(projectId), editorial);
  await updateRegistry(state, project, { status: "editorial-in-progress", stage: passType, progress: progressForPass(passType), summary: `${version.label} is the active editorial version.`, nextAction: "Complete the editorial pass and prepare customer review.", checkpoint: { id: versionId, label: `${version.label} stored`, status: "completed", recordedAt: now } });
  return json({ status: "version-created", build: BUILD, version: publicVersion(version), editorial: publicEditorial(editorial) }, 201);
}

async function readVersionText(state, projectId, versionId) {
  const editorial = (await state.storage.get(editorialKey(projectId))) || initialEditorial(projectId);
  const version = (editorial.versions || []).find(item => item.versionId === versionId);
  if (!version) throw fail(404, "editorial_version_not_found", "The editorial version was not found.");
  const bytes = await getChunks(state, versionPrefix(projectId, versionId), version.chunks, version.bytes);
  return json({ status: "ready", build: BUILD, version: publicVersion(version), manuscript: new TextDecoder().decode(bytes) });
}

async function createCustomerReview(state, request, projectId) {
  const project = await requireProject(state, projectId);
  const body = await request.json();
  const editorial = (await state.storage.get(editorialKey(projectId))) || initialEditorial(projectId);
  const versionId = String(body?.versionId || editorial.currentVersionId || "");
  const version = (editorial.versions || []).find(item => item.versionId === versionId);
  if (!version) throw fail(409, "editorial_version_required", "Create an editorial version before preparing customer review.");
  const now = new Date().toISOString();
  const review = {
    reviewId: `review-${crypto.randomUUID()}`,
    versionId,
    status: "awaiting-customer-review",
    note: String(body?.note || "Editorial version ready for customer review.").slice(0, 4000),
    createdAt: now,
    decidedAt: null,
    decision: null,
  };
  editorial.review = review;
  editorial.status = "awaiting-customer-review";
  editorial.stage = "customer-review";
  editorial.updatedAt = now;
  editorial.history = appendHistory(editorial.history, "Customer review prepared", now, String(body?.actor || "MMG Editorial Production"));
  await state.storage.put(editorialKey(projectId), editorial);
  await updateRegistry(state, project, { status: "awaiting-customer-review", stage: "customer-review", progress: 70, summary: "The first editorial proof is ready for customer review.", nextAction: "Record the customer approval or revision request.", checkpoint: { id: review.reviewId, label: "Customer review prepared", status: "completed", recordedAt: now } });
  return json({ status: "review-prepared", build: BUILD, review, editorial: publicEditorial(editorial) });
}

async function recordDecision(state, request, projectId) {
  const project = await requireProject(state, projectId);
  const body = await request.json();
  const decision = body?.decision === "approved" ? "approved" : body?.decision === "revision-requested" ? "revision-requested" : null;
  if (!decision) throw fail(400, "editorial_decision_invalid", "Decision must be approved or revision-requested.");
  const editorial = (await state.storage.get(editorialKey(projectId))) || initialEditorial(projectId);
  if (!editorial.review) throw fail(409, "editorial_review_missing", "Prepare a customer review before recording a decision.");
  const now = new Date().toISOString();
  editorial.review = { ...editorial.review, status: decision, decision, note: String(body?.note || editorial.review.note || "").slice(0, 4000), decidedAt: now };
  editorial.status = decision === "approved" ? "customer-approved" : "revision-requested";
  editorial.stage = decision === "approved" ? "proofread" : "customer-revision";
  editorial.updatedAt = now;
  editorial.history = appendHistory(editorial.history, decision === "approved" ? "Customer approved editorial proof" : "Customer requested editorial revision", now, String(body?.actor || "Executive"));
  await state.storage.put(editorialKey(projectId), editorial);
  await updateRegistry(state, project, decision === "approved"
    ? { status: "customer-approved", stage: "proofread", progress: 82, summary: "Customer approved the editorial proof.", nextAction: "Complete final proofread and manufacturing handoff.", checkpoint: { id: editorial.review.reviewId, label: "Customer editorial approval", status: "completed", recordedAt: now } }
    : { status: "revision-requested", stage: "customer-revision", progress: 68, summary: "Customer revision request recorded.", nextAction: "Create a revised editorial version and prepare a new review.", checkpoint: { id: `${editorial.review.reviewId}-revision`, label: "Customer revision request recorded", status: "completed", recordedAt: now } });
  return json({ status: editorial.status, build: BUILD, review: editorial.review, editorial: publicEditorial(editorial) });
}

async function finalizeEditorial(state, request, projectId) {
  const project = await requireProject(state, projectId);
  const body = await request.json();
  const editorial = (await state.storage.get(editorialKey(projectId))) || initialEditorial(projectId);
  if (editorial.review?.decision !== "approved") throw fail(409, "customer_approval_required", "Customer approval is required before final manufacturing handoff.");
  const versionId = String(body?.versionId || editorial.currentVersionId || "");
  const version = (editorial.versions || []).find(item => item.versionId === versionId);
  if (!version) throw fail(409, "final_version_required", "Select a final editorial version before manufacturing handoff.");
  const now = new Date().toISOString();
  editorial.finalVersionId = versionId;
  editorial.status = "ready-for-manufacturing";
  editorial.stage = "manufacturing-handoff";
  editorial.updatedAt = now;
  editorial.history = appendHistory(editorial.history, "Editorial production completed", now, String(body?.actor || "MMG Editorial Production"));
  await state.storage.put(editorialKey(projectId), editorial);
  await updateRegistry(state, project, { status: "ready-for-manufacturing", stage: "manufacturing-handoff", progress: 90, summary: "Editorial production is complete and the approved manuscript is ready for manufacturing.", nextAction: "Generate final DOCX, PDF, EPUB, KDP interior, and delivery package.", checkpoint: { id: "editorial-complete", label: "Editorial production completed", status: "completed", recordedAt: now } });
  return json({ status: "ready-for-manufacturing", build: BUILD, finalVersion: publicVersion(version), editorial: publicEditorial(editorial), nextAction: "Generate final publishing deliverables." });
}

async function requireProject(state, projectId) {
  const records = (await state.storage.get("production-registry")) || {};
  const project = records[projectId];
  if (!project || project.projectType !== "manuscript-studio") throw fail(404, "manuscript_project_not_found", "The manuscript production project was not found.");
  return project;
}

async function updateRegistry(state, project, change) {
  const records = (await state.storage.get("production-registry")) || {};
  const current = records[project.projectId] || project;
  const checkpoints = Array.isArray(current.checkpoints) ? current.checkpoints.filter(item => item?.id !== change.checkpoint?.id) : [];
  records[project.projectId] = {
    ...current,
    status: change.status,
    stage: change.stage,
    progress: change.progress,
    summary: change.summary,
    nextAction: change.nextAction,
    checkpoints: change.checkpoint ? [...checkpoints.slice(-29), change.checkpoint] : checkpoints,
    updatedAt: new Date().toISOString(),
    revision: Number(current.revision || 0) + 1,
  };
  await state.storage.put("production-registry", records);
}

function initialEditorial(projectId) {
  const now = new Date().toISOString();
  return { projectId, status: "not-started", stage: "editorial-intake", currentVersionId: null, finalVersionId: null, versions: [], review: null, history: [], createdAt: now, updatedAt: now };
}
function publicEditorial(editorial) { return { ...editorial, versions: (editorial.versions || []).map(publicVersion) }; }
function publicVersion(version) { const { chunks, bytes, ...value } = version; return value; }
function editorialKey(id) { return `manuscript:${id}:editorial`; }
function versionPrefix(projectId, versionId) { return `manuscript:${projectId}:editorial:${versionId}:`; }
async function putChunks(state, prefix, bytes) { const count = Math.ceil(bytes.length / TEXT_CHUNK_BYTES); for (let i = 0; i < count; i += 1) await state.storage.put(`${prefix}${i}`, bytes.slice(i * TEXT_CHUNK_BYTES, Math.min(bytes.length, (i + 1) * TEXT_CHUNK_BYTES))); return count; }
async function getChunks(state, prefix, count, expectedLength) { const output = new Uint8Array(expectedLength); let offset = 0; for (let i = 0; i < Number(count || 0); i += 1) { const value = await state.storage.get(`${prefix}${i}`); if (!value) throw fail(502, "editorial_chunk_missing", "A stored editorial version chunk is missing."); const chunk = value instanceof Uint8Array ? value : new Uint8Array(value); output.set(chunk, offset); offset += chunk.length; } if (offset !== expectedLength) throw fail(502, "editorial_length_mismatch", "The stored editorial version failed integrity verification."); return output; }
function appendHistory(history, label, recordedAt, actor) { return [...(Array.isArray(history) ? history : []).slice(-49), { id: crypto.randomUUID(), label, recordedAt, actor }]; }
function progressForPass(pass) { return ({ structural: 45, copyedit: 55, proofread: 78, "customer-revision": 68, final: 88 })[pass] || 55; }
async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Editorial-Workbench": BUILD } }); }
