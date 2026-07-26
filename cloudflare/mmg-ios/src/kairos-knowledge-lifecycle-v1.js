export const KAIROS_KNOWLEDGE_LIFECYCLE_BUILD = "kairos-knowledge-lifecycle-20260725-1";

const ROOT = "/registry/kairos-knowledge";
const INDEX_KEY = "kairos-knowledge:index";
const DRAFT_INDEX_KEY = "kairos-knowledge:drafts:index";
const HISTORY_LIMIT = 25;
const RECORD_LIMIT = 500;

export async function handleKairosKnowledgeLifecycleObjectRequest(state, request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ROOT)) return null;
  const parts = url.pathname.slice(ROOT.length).split("/").filter(Boolean);
  if (parts[0] !== "lifecycle") return null;

  try {
    if (request.method === "POST" && parts.length === 2 && parts[1] === "drafts") {
      return createDraft(state, await readJSON(request));
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "approve") {
      return approveDraft(state, decode(parts[2]), await readJSON(request));
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "retire") {
      return retireRecord(state, decode(parts[2]), await readJSON(request));
    }
    if (request.method === "GET" && parts.length === 3 && parts[1] === "history") {
      return readHistory(state, decode(parts[2]));
    }
    return json({ error: { code: "KNOWLEDGE_LIFECYCLE_METHOD_NOT_ALLOWED", message: "This Knowledge Vault lifecycle operation is not allowed." } }, 405);
  } catch (error) {
    return json({
      error: {
        code: error?.code || "KNOWLEDGE_LIFECYCLE_FAILED",
        message: error?.message || "Knowledge Vault lifecycle operation failed.",
      },
    }, Number(error?.status || 500));
  }
}

async function createDraft(state, input) {
  requireConfirmation(input, "CREATE KNOWLEDGE DRAFT");
  const now = new Date().toISOString();
  const draftId = cleanId(input.draftId) || `knowledge-draft-${crypto.randomUUID()}`;
  const baseId = cleanId(input.recordId || input.id) || `knowledge-${crypto.randomUUID()}`;
  const draft = {
    draftId,
    recordId: baseId,
    status: "draft",
    title: required(input.title, 240, "title"),
    department: required(input.department, 120, "department").toLowerCase(),
    authority: clean(input.authority, 80) || "operational",
    visibility: normalizeVisibility(input.visibility),
    tags: normalizeTags(input.tags),
    content: required(input.content, 24000, "content"),
    source: required(input.source, 500, "source"),
    sourceChecksum: clean(input.sourceChecksum, 160) || null,
    proposedBy: clean(input.proposedBy, 160) || "kairos-owner",
    proposedAt: now,
    updatedAt: now,
  };
  await state.storage.put(draftKey(draftId), draft);
  await appendIndex(state, DRAFT_INDEX_KEY, draftId, RECORD_LIMIT);
  await appendHistory(state, baseId, { event: "draft_created", draftId, actor: draft.proposedBy, timestamp: now });
  return json({ status: "draft", build: KAIROS_KNOWLEDGE_LIFECYCLE_BUILD, draft }, 201);
}

async function approveDraft(state, draftId, input) {
  requireConfirmation(input, "APPROVE KNOWLEDGE RECORD");
  const draft = await state.storage.get(draftKey(draftId));
  if (!draft) throw fail(404, "KNOWLEDGE_DRAFT_NOT_FOUND", "The Knowledge Vault draft was not found.");
  const existing = await state.storage.get(recordKey(draft.recordId));
  const now = new Date().toISOString();
  const version = Number(existing?.version || 0) + 1;
  const record = {
    id: draft.recordId,
    version,
    status: "active",
    title: draft.title,
    department: draft.department,
    authority: draft.authority,
    visibility: draft.visibility,
    tags: draft.tags,
    content: draft.content,
    source: draft.source,
    sourceChecksum: draft.sourceChecksum,
    approvedBy: clean(input.approvedBy, 160) || "kairos-owner",
    approvedAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    previousVersion: existing?.version || null,
  };
  if (existing) await state.storage.put(versionKey(record.id, existing.version), existing);
  await state.storage.put(recordKey(record.id), record);
  await appendIndex(state, INDEX_KEY, record.id, RECORD_LIMIT);
  await state.storage.delete(draftKey(draftId));
  await removeFromIndex(state, DRAFT_INDEX_KEY, draftId);
  await appendHistory(state, record.id, { event: "record_approved", version, draftId, actor: record.approvedBy, timestamp: now });
  return json({ status: "active", build: KAIROS_KNOWLEDGE_LIFECYCLE_BUILD, record });
}

async function retireRecord(state, recordId, input) {
  requireConfirmation(input, "RETIRE KNOWLEDGE RECORD");
  const record = await state.storage.get(recordKey(recordId));
  if (!record) throw fail(404, "KNOWLEDGE_RECORD_NOT_FOUND", "The Knowledge Vault record was not found.");
  const now = new Date().toISOString();
  const retired = {
    ...record,
    status: "retired",
    retiredBy: clean(input.retiredBy, 160) || "kairos-owner",
    retiredReason: required(input.reason, 1000, "reason"),
    retiredAt: now,
    updatedAt: now,
  };
  await state.storage.put(recordKey(recordId), retired);
  await appendHistory(state, recordId, { event: "record_retired", version: record.version, actor: retired.retiredBy, reason: retired.retiredReason, timestamp: now });
  return json({ status: "retired", build: KAIROS_KNOWLEDGE_LIFECYCLE_BUILD, record: retired });
}

async function readHistory(state, recordId) {
  const history = await state.storage.get(historyKey(recordId));
  return json({ build: KAIROS_KNOWLEDGE_LIFECYCLE_BUILD, recordId, history: Array.isArray(history) ? history : [] });
}

async function appendHistory(state, recordId, event) {
  const current = await state.storage.get(historyKey(recordId));
  const history = [...(Array.isArray(current) ? current : []), event].slice(-HISTORY_LIMIT);
  await state.storage.put(historyKey(recordId), history);
}

async function appendIndex(state, key, value, maximum) {
  const current = await state.storage.get(key);
  const next = [...new Set([...(Array.isArray(current) ? current : []), value])].slice(-maximum);
  await state.storage.put(key, next);
}

async function removeFromIndex(state, key, value) {
  const current = await state.storage.get(key);
  if (!Array.isArray(current)) return;
  await state.storage.put(key, current.filter((item) => item !== value));
}

function requireConfirmation(input, expected) {
  if (String(input?.confirmation || "") !== expected) throw fail(403, "KNOWLEDGE_CONFIRMATION_REQUIRED", `confirmation must equal ${expected}.`);
}
function normalizeVisibility(value) {
  const visibility = clean(value, 80).toLowerCase() || "internal-model";
  if (!["internal-model", "public", "private-internal"].includes(visibility)) throw fail(400, "KNOWLEDGE_VISIBILITY_INVALID", "visibility must be internal-model, public, or private-internal.");
  return visibility;
}
function normalizeTags(value) {
  const tags = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(tags.map((item) => clean(item, 80).toLowerCase()).filter(Boolean))].slice(0, 24);
}
function required(value, maximum, field) {
  const output = clean(value, maximum);
  if (!output) throw fail(400, "KNOWLEDGE_FIELD_REQUIRED", `${field} is required.`);
  return output;
}
function cleanId(value) { const output = clean(value, 160).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""); return output || ""; }
function clean(value, maximum) { return String(value || "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maximum); }
function decode(value) { try { return decodeURIComponent(value); } catch { return value; } }
function recordKey(id) { return `kairos-knowledge:record:${id}`; }
function draftKey(id) { return `kairos-knowledge:draft:${id}`; }
function versionKey(id, version) { return `kairos-knowledge:version:${id}:${version}`; }
function historyKey(id) { return `kairos-knowledge:history:${id}`; }
async function readJSON(request) { const body = await request.json().catch(() => null); if (!body) throw fail(400, "KNOWLEDGE_INVALID_JSON", "The request body must contain valid JSON."); return body; }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
