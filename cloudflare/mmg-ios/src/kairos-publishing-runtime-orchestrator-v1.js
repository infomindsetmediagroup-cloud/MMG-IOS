import { transitionKairosRuntimeProject } from "./kairos-runtime-project-v1.js";

export const KAIROS_PUBLISHING_RUNTIME_ORCHESTRATOR_BUILD = "kairos-publishing-runtime-orchestrator-20260727-1";

const PROJECT_TYPES = new Set(["book","ebook","guide","workbook","article","publishing_project"]);

export function analyzePublishingObjective(project, input = {}) {
  const summary = clean(input.summary || project?.objective?.summary, 2000);
  if (!summary) throw orchestrationError("OBJECTIVE_REQUIRED", "A publishing objective summary is required.");
  const projectType = inferProjectType(input.projectType || project?.projectType, summary);
  const complexity = inferComplexity(input, summary);
  const deliverableTypes = boundedUnique(input.deliverableTypes?.length ? input.deliverableTypes : defaultsFor(projectType), 50);
  const requiredAssetTypes = boundedUnique(input.requiredAssetTypes?.length ? input.requiredAssetTypes : requiredAssetsFor(projectType), 50);
  const workflow = Object.freeze([
    "intake_validation","objective_analysis","production_brief","approval_gate","content_production","quality_review","packaging","delivery"
  ]);
  return Object.freeze({
    summary,
    classification: projectType,
    complexity,
    deliverableTypes,
    requiredAssetTypes,
    workflow,
    productionBrief: Object.freeze({
      audience: clean(input.audience, 500) || null,
      tone: clean(input.tone, 160) || "professional",
      targetLength: normalizePositiveInteger(input.targetLength),
      constraints: boundedUnique(input.constraints, 50),
      successCriteria: boundedUnique(input.successCriteria, 50),
    }),
    approved: false,
    build: KAIROS_PUBLISHING_RUNTIME_ORCHESTRATOR_BUILD,
  });
}

export function applyPublishingObjectiveAnalysis(project, input = {}) {
  const objective = analyzePublishingObjective(project, input);
  const assets = project.assets || [];
  const receivedTypes = new Set(assets.filter((item) => item.status === "received" || item.status === "validated").map((item) => item.type));
  const missingAssets = objective.requiredAssetTypes.filter((type) => !receivedTypes.has(type));
  const nextState = missingAssets.length ? "blocked" : "planning";
  return transitionKairosRuntimeProject(project, {
    state: nextState,
    objective,
    blockedReason: missingAssets.length ? `Missing required assets: ${missingAssets.join(", ")}` : null,
    progress: { percent: missingAssets.length ? 18 : 28, stage: nextState, completedUnits: missingAssets.length ? 1 : 2, totalUnits: 8 },
    event: {
      type: missingAssets.length ? "blocked" : "objective_analyzed",
      state: nextState,
      actorIdentityHash: input.operatorIdentityHash,
      summary: missingAssets.length ? "Publishing objective analyzed; required assets are missing." : "Publishing objective analyzed and production planning opened.",
    },
  });
}

export function queueApprovedPublishingProject(project, input = {}) {
  const approval = (project.approvals || []).find((item) => item.required && item.status === "approved");
  if (!approval) throw orchestrationError("PROJECT_APPROVAL_REQUIRED", "Required production approval must be granted before queueing.");
  if (project.state !== "awaiting_approval" && project.state !== "failed") throw orchestrationError("PROJECT_NOT_QUEUEABLE", "Only approved or explicitly retried projects can be queued.");
  if (project.state === "failed" && input.retryAuthorized !== true) throw orchestrationError("RETRY_AUTHORIZATION_REQUIRED", "Retry authorization is required before a failed project can be queued.");
  return transitionKairosRuntimeProject(project, {
    state: "queued",
    queue: {
      ...project.queue,
      status: "queued",
      priority: clean(input.priority || project.queue?.priority || "normal", 40),
      queuedAt: new Date().toISOString(),
      attempt: Math.max(1, Number(project.queue?.attempt || 0) + 1),
      retryAuthorized: input.retryAuthorized === true,
    },
    progress: { percent: 45, stage: "queued", completedUnits: 4, totalUnits: 8 },
    event: { type: "execution_queued", state: "queued", actorIdentityHash: input.operatorIdentityHash, summary: "Approved publishing project entered the execution queue." },
  });
}

export function startQueuedPublishingProject(project, input = {}) {
  if (project.state !== "queued") throw orchestrationError("PROJECT_NOT_QUEUED", "Project must be queued before execution starts.");
  return transitionKairosRuntimeProject(project, {
    state: "executing",
    queue: { ...project.queue, status: "running", startedAt: new Date().toISOString() },
    progress: { percent: 55, stage: "executing", completedUnits: 4, totalUnits: 8 },
    event: { type: "execution_started", state: "executing", actorIdentityHash: input.operatorIdentityHash, summary: "Publishing execution started." },
  });
}

function inferProjectType(value, summary) { const normalized = clean(value || "", 120).toLowerCase(); if (PROJECT_TYPES.has(normalized)) return normalized; const text = summary.toLowerCase(); if (text.includes("workbook")) return "workbook"; if (text.includes("guide")) return "guide"; if (text.includes("article")) return "article"; if (text.includes("ebook") || text.includes("e-book")) return "ebook"; return "book"; }
function inferComplexity(input, summary) { const target = Number(input.targetLength || 0); if (target >= 50000 || summary.length > 1200) return "high"; if (target >= 15000 || summary.length > 500) return "medium"; return "standard"; }
function defaultsFor(type) { if (type === "article") return ["article","metadata"]; if (type === "workbook") return ["manuscript","workbook_pdf","editable_source","metadata"]; return ["manuscript","formatted_pdf","editable_source","metadata"]; }
function requiredAssetsFor(type) { return type === "article" ? ["source_brief"] : ["source_manuscript","brand_guidelines"]; }
function boundedUnique(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizePositiveInteger(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : null; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function orchestrationError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
