import { createAIVideoPromptMasterySeed, KAIROS_AI_VIDEO_PROMPT_MASTERY_SEED_BUILD } from "./kairos-ai-video-prompt-mastery-seed-v1.js";

export const KAIROS_FIRST_REVENUE_RUN_BUILD = "kairos-first-revenue-run-20260728-1";

export function createFirstRevenueRun(input = {}) {
  if (clean(input.confirmation, 120) !== "START FIRST REVENUE RUN") {
    throw runError("FIRST_REVENUE_RUN_CONFIRMATION_REQUIRED", "Use confirmation START FIRST REVENUE RUN.", 409);
  }
  const seed = createAIVideoPromptMasterySeed(input);
  const stages = Object.freeze([
    stage("create-product", [], "Create the canonical revenue-product record."),
    stage("plan-production", ["create-product"], "Plan manuscript, prompt-library, workbook, cover, and product-image jobs."),
    stage("execute-content", ["plan-production"], "Execute and store all written-content jobs."),
    stage("execute-visuals", ["execute-content"], "Generate and store approved storefront visual assets."),
    stage("editorial-qa", ["execute-content"], "Approve written assets or return them for changes."),
    stage("visual-qa", ["execute-visuals"], "Approve image dimensions, legibility, branding, and storefront suitability."),
    stage("build-package", ["editorial-qa", "visual-qa"], "Render PDF and DOCX outputs and assemble the customer ZIP."),
    stage("package-qa", ["build-package"], "Approve every delivery asset."),
    stage("shopify-handoff", ["package-qa"], "Build and receive the governed Shopify draft handoff."),
    stage("create-shopify-draft", ["shopify-handoff"], "Create the real Shopify product in DRAFT status."),
    stage("certify-launch", ["create-shopify-draft"], "Certify the product for manual Shopify review.")
  ]);
  return Object.freeze({
    runId: `revenue_run_${fnv1a(`${seed.revenueProductId}:${Date.now()}`)}`,
    revenueProductId: seed.revenueProductId,
    seed,
    stages,
    currentStage: stages[0].id,
    status: "planned_awaiting_operator_execution",
    createdAt: new Date().toISOString(),
    automaticPublicationAllowed: false,
    directStorefrontActivationAllowed: false,
    builds: Object.freeze({ seed: KAIROS_AI_VIDEO_PROMPT_MASTERY_SEED_BUILD, run: KAIROS_FIRST_REVENUE_RUN_BUILD })
  });
}

export function validateRevenueRunProgress(run = {}, completedStageIds = []) {
  const completed = new Set(Array.isArray(completedStageIds) ? completedStageIds : []);
  const stages = Array.isArray(run.stages) ? run.stages : [];
  const next = stages.find((item) => !completed.has(item.id));
  if (!next) return Object.freeze({ complete: true, nextStage: null, blockers: Object.freeze([]) });
  const blockers = next.dependsOn.filter((id) => !completed.has(id));
  return Object.freeze({ complete: false, nextStage: next, blockers: Object.freeze(blockers) });
}

function stage(id, dependsOn, objective) { return Object.freeze({ id, dependsOn: Object.freeze(dependsOn), objective, operatorApprovalRequired: ["editorial-qa", "visual-qa", "package-qa", "create-shopify-draft"].includes(id) }); }
function fnv1a(value){let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,"0");}
function clean(value,max){return String(value||"").replace(/\u0000/g,"").trim().slice(0,max);}
function runError(code,message,status=400){const error=new Error(message);error.code=code;error.status=status;return error;}
