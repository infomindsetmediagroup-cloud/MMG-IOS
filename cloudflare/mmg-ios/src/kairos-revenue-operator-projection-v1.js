import { evaluateRevenueBatchAssetCoverage } from "./kairos-revenue-batch-asset-bridge-v1.js";
import { getFirstRevenueBatchStageAction } from "./kairos-first-revenue-batch-stage-bridge-v1.js";

export const KAIROS_REVENUE_OPERATOR_PROJECTION_BUILD = "kairos-revenue-operator-projection-20260728-1";

export function projectRevenueOperatorRun(run = {}, product = {}) {
  const stageId = clean(run.currentStage, 80);
  const action = getFirstRevenueBatchStageAction(stageId);
  const batchType = stageId.includes("content") || stageId === "editorial-qa" ? "content" : stageId.includes("visual") || stageId === "visual-qa" ? "visual" : stageId.includes("package") || stageId === "build-package" ? "package" : null;
  const coverage = batchType ? evaluateRevenueBatchAssetCoverage(product, batchType) : null;
  const jobs = Array.isArray(product.productionJobs) ? product.productionJobs : [];
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const relevantTypes = coverage?.expected || [];
  const relevantJobs = jobs.filter((job) => relevantTypes.includes(job.outputType));
  const blockers = [];
  if (action && relevantJobs.some((job) => job.authorization?.status !== "authorized" && job.state !== "completed")) blockers.push("Authorize all required production jobs.");
  if (stageId?.endsWith("-qa") && coverage && !coverage.complete) blockers.push(`Complete missing assets: ${coverage.missing.join(", ")}.`);
  return Object.freeze({
    runId: run.runId || null,
    revenueProductId: run.revenueProductId || product.revenueProductId || null,
    title: product.title || "Revenue product",
    status: run.status || "planned",
    currentStage: stageId || null,
    nextAction: action,
    executionEnabled: Boolean(action) && blockers.length === 0,
    confirmation: confirmationFor(action),
    progress: Object.freeze({ completedStages: (run.completedStageIds || []).length, totalStages: (run.stages || []).length }),
    jobs: Object.freeze({ total: relevantJobs.length, authorized: relevantJobs.filter((job) => job.authorization?.status === "authorized").length, completed: relevantJobs.filter((job) => job.state === "completed").length }),
    assets: Object.freeze({ total: assets.length, relevant: assets.filter((asset) => relevantTypes.includes(asset.type)).length, coverageComplete: coverage?.complete || false, missing: coverage?.missing || [] }),
    receipts: Object.freeze((run.stageReceipts || []).slice(-20).reverse()),
    blockers: Object.freeze(blockers),
    automaticPublicationAllowed: false,
    build: KAIROS_REVENUE_OPERATOR_PROJECTION_BUILD,
  });
}

function confirmationFor(action) {
  const map = {
    "execute-content-batch": "EXECUTE REVENUE CONTENT BATCH",
    "execute-visual-batch": "EXECUTE REVENUE VISUAL BATCH",
    "execute-package-batch": "BUILD REVENUE DELIVERY PACKAGE",
    "approve-content-assets": "APPROVE REVENUE CONTENT ASSETS",
    "approve-visual-assets": "APPROVE REVENUE VISUAL ASSETS",
    "approve-package-assets": "APPROVE REVENUE PACKAGE ASSETS",
  };
  return map[action] || null;
}
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
