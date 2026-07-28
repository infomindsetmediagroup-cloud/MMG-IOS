import { createAIVideoPromptMasterySeed } from "./kairos-ai-video-prompt-mastery-seed-v1.js";

export const KAIROS_FIRST_REVENUE_RUN_EXECUTOR_BUILD = "kairos-first-revenue-run-executor-20260728-1";

const ACTIONS = Object.freeze({
  "create-product": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products", confirmation: null }),
  "plan-production": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/plan-jobs", confirmation: null }),
  "execute-content": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/execute-content-batch", confirmation: "EXECUTE REVENUE CONTENT BATCH" }),
  "execute-visuals": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/execute-visual-batch", confirmation: "EXECUTE REVENUE VISUAL BATCH" }),
  "editorial-qa": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/approve-content-assets", confirmation: "APPROVE REVENUE CONTENT ASSETS" }),
  "visual-qa": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/approve-visual-assets", confirmation: "APPROVE REVENUE VISUAL ASSETS" }),
  "build-package": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/build-package", confirmation: "BUILD REVENUE DELIVERY PACKAGE" }),
  "package-qa": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/approve-package-assets", confirmation: "APPROVE REVENUE PACKAGE ASSETS" }),
  "shopify-handoff": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/shopify-handoff", confirmation: null }),
  "create-shopify-draft": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/create-shopify-draft", confirmation: "CREATE SHOPIFY DRAFT" }),
  "certify-launch": Object.freeze({ method: "POST", path: "/api/kairos/revenue/products/{id}/certify-launch", confirmation: null }),
});

export function createFirstRevenueExecutionPlan(run = {}, input = {}) {
  if (!run.runId || !run.revenueProductId) throw executionError("FIRST_REVENUE_RUN_INVALID", "A persisted first revenue run is required.");
  const completed = new Set(Array.isArray(run.completedStageIds) ? run.completedStageIds : []);
  const stages = Array.isArray(run.stages) ? run.stages : [];
  const next = stages.find((stage) => !completed.has(stage.id));
  if (!next) return Object.freeze({ complete: true, next: null, request: null, build: KAIROS_FIRST_REVENUE_RUN_EXECUTOR_BUILD });
  const blockers = (next.dependsOn || []).filter((id) => !completed.has(id));
  if (blockers.length) throw executionError("FIRST_REVENUE_STAGE_BLOCKED", `Stage ${next.id} is blocked by ${blockers.join(", ")}.`, 409);
  const action = ACTIONS[next.id];
  if (!action) throw executionError("FIRST_REVENUE_STAGE_UNSUPPORTED", `Stage ${next.id} has no execution adapter.`);
  const seed = run.seed || createAIVideoPromptMasterySeed({ revenueProductId: run.revenueProductId });
  const body = buildBody(next.id, run, seed, input, action);
  return Object.freeze({
    complete: false,
    next,
    request: Object.freeze({ method: action.method, path: action.path.replace("{id}", encodeURIComponent(run.revenueProductId)), body }),
    automaticPublicationAllowed: false,
    build: KAIROS_FIRST_REVENUE_RUN_EXECUTOR_BUILD,
  });
}

export async function executeFirstRevenueStage(run = {}, input = {}, transport) {
  if (typeof transport !== "function") throw executionError("FIRST_REVENUE_TRANSPORT_REQUIRED", "An authenticated runtime transport is required.", 503);
  const plan = createFirstRevenueExecutionPlan(run, input);
  if (plan.complete) return plan;
  const response = await transport(plan.request);
  if (!response || response.ok !== true) throw executionError("FIRST_REVENUE_STAGE_FAILED", response?.error?.message || `Stage ${plan.next.id} failed.`, response?.status || 502);
  return Object.freeze({ ...plan, result: response.body || null, completedStageId: plan.next.id, executedAt: new Date().toISOString() });
}

function buildBody(stageId, run, seed, input, action) {
  const base = { runId: run.runId, revenueProductId: run.revenueProductId, rationale: clean(input.rationale, 1000) || `Execute first revenue run stage ${stageId}.` };
  if (action.confirmation) base.confirmation = action.confirmation;
  if (stageId === "create-product") return { ...seed, confirmation: "CREATE FIRST REVENUE PRODUCT", runId: run.runId };
  if (stageId === "plan-production") return { ...base, requiredAssets: seed.requiredAssets };
  if (stageId === "execute-content") return { ...base, outputTypes: ["manuscript", "prompt-library", "workbook"] };
  if (stageId === "execute-visuals") return { ...base, outputTypes: ["cover", "product-image"] };
  if (stageId.endsWith("-qa")) return { ...base, decision: "approved", operatorIdentityHash: clean(input.operatorIdentityHash, 180) || null };
  return base;
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function executionError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
