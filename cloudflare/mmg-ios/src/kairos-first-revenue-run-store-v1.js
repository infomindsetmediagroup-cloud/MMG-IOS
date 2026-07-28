import { createFirstRevenueRun, validateRevenueRunProgress, KAIROS_FIRST_REVENUE_RUN_BUILD } from "./kairos-first-revenue-run-v1.js";

export const KAIROS_FIRST_REVENUE_RUN_STORE_BUILD = "kairos-first-revenue-run-store-20260728-1";
const KEY = "kairos:first-revenue-run:records";
const MAX_RUNS = 25;

export async function executeFirstRevenueRunStoreAction(state, action = "", input = {}) {
  const records = await load(state);
  if (action === "start") {
    const run = createFirstRevenueRun(input);
    if (records.some((item) => item.revenueProductId === run.revenueProductId && !["complete", "cancelled"].includes(item.status))) {
      throw storeError("FIRST_REVENUE_RUN_ACTIVE", "An active first revenue run already exists.", 409);
    }
    const stored = freezeRun({ ...run, completedStageIds: [], events: [event("run_started", input.operatorIdentityHash)], updatedAt: now() });
    records.push(stored); await save(state, records);
    return result(stored);
  }
  const runId = clean(input.runId, 180);
  const index = records.findIndex((item) => item.runId === runId);
  if (index < 0) throw storeError("FIRST_REVENUE_RUN_NOT_FOUND", "First revenue run was not found.", 404);
  if (action === "read") return result(records[index]);
  if (action === "complete-stage") {
    const run = records[index];
    const progress = validateRevenueRunProgress(run, run.completedStageIds);
    const stageId = clean(input.stageId, 120);
    if (!progress.nextStage || progress.nextStage.id !== stageId || progress.blockers.length) throw storeError("FIRST_REVENUE_STAGE_OUT_OF_ORDER", "Revenue stage is blocked or out of order.", 409);
    if (progress.nextStage.operatorApprovalRequired && !clean(input.operatorIdentityHash, 180)) throw storeError("FIRST_REVENUE_STAGE_APPROVAL_REQUIRED", "Operator approval identity is required.", 403);
    const completedStageIds = [...run.completedStageIds, stageId];
    const next = validateRevenueRunProgress(run, completedStageIds);
    records[index] = freezeRun({ ...run, completedStageIds, currentStage: next.nextStage?.id || null, status: next.complete ? "complete" : "in_progress", events: [...run.events, event("stage_completed", input.operatorIdentityHash, stageId)].slice(-100), updatedAt: now() });
    await save(state, records); return result(records[index]);
  }
  if (action === "list") return Object.freeze({ success: true, count: records.length, runs: Object.freeze(records.slice().reverse()), build: KAIROS_FIRST_REVENUE_RUN_STORE_BUILD });
  throw storeError("FIRST_REVENUE_RUN_ACTION_INVALID", "Unknown first revenue run action.", 400);
}

function result(run) { return Object.freeze({ success: true, run, progress: validateRevenueRunProgress(run, run.completedStageIds), builds: Object.freeze({ run: KAIROS_FIRST_REVENUE_RUN_BUILD, store: KAIROS_FIRST_REVENUE_RUN_STORE_BUILD }) }); }
function event(type, operatorIdentityHash, stageId = null) { return Object.freeze({ eventId: `fre_${fnv1a(`${type}:${stageId || ""}:${Date.now()}`)}`, type, stageId, operatorIdentityHash: clean(operatorIdentityHash, 180) || null, occurredAt: now() }); }
async function load(state) { const value = await state.storage.get(KEY); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put(KEY, records.slice(-MAX_RUNS)); }
function freezeRun(run) { return Object.freeze({ ...run, completedStageIds: Object.freeze([...(run.completedStageIds || [])]), events: Object.freeze([...(run.events || [])]), automaticPublicationAllowed: false, directStorefrontActivationAllowed: false }); }
function now() { return new Date().toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function fnv1a(value){let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,"0");}
function storeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
