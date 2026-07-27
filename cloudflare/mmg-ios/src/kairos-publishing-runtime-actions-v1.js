import { transitionKairosRuntimeProject } from "./kairos-runtime-project-v1.js";

export const KAIROS_PUBLISHING_RUNTIME_ACTIONS_BUILD = "kairos-publishing-runtime-actions-20260727-2";

export function applyKairosPublishingRuntimeAction(record, action, input = {}) {
  const normalizedAction = clean(action, 40);
  if (normalizedAction === "qa-pass") return qaPass(record, input);
  if (normalizedAction === "qa-fail") return qaFail(record, input);
  if (normalizedAction === "package") return packageProject(record, input);
  if (normalizedAction === "deliver") return deliverProject(record, input);
  throw actionError("RUNTIME_ACTION_INVALID", "Publishing runtime action is not registered.");
}

function qaPass(record, input) {
  if (record.state !== "quality_review") throw actionError("QA_STATE_INVALID", "QA pass requires quality_review state.");
  return transitionKairosRuntimeProject(record, {
    state: "packaging",
    event: { type: "qa_passed", state: "packaging", actorIdentityHash: input.operatorIdentityHash, evidenceIds: input.evidenceIds, summary: clean(input.summary || "Publishing quality review passed.", 1200) },
    progress: { percent: 80, stage: "packaging", completedUnits: input.completedUnits, totalUnits: input.totalUnits },
    operatorIdentityHash: input.operatorIdentityHash,
  });
}

function qaFail(record, input) {
  if (record.state !== "quality_review") throw actionError("QA_STATE_INVALID", "QA failure requires quality_review state.");
  return transitionKairosRuntimeProject(record, {
    state: "executing",
    event: { type: "qa_failed", state: "executing", actorIdentityHash: input.operatorIdentityHash, evidenceIds: input.evidenceIds, summary: clean(input.summary || "Publishing quality review failed and returned to execution.", 1200) },
    progress: { percent: 65, stage: "execution_rework", completedUnits: input.completedUnits, totalUnits: input.totalUnits },
    operatorIdentityHash: input.operatorIdentityHash,
  });
}

function packageProject(record, input) {
  if (record.state !== "packaging") throw actionError("PACKAGE_STATE_INVALID", "Packaging requires packaging state.");
  const deliverables = Array.isArray(input.deliverables) && input.deliverables.length ? input.deliverables : record.deliverables;
  if (!deliverables.length) throw actionError("DELIVERABLES_REQUIRED", "At least one deliverable is required before packaging.");
  return transitionKairosRuntimeProject(record, {
    state: "delivery",
    deliverables,
    event: { type: "package_created", state: "delivery", actorIdentityHash: input.operatorIdentityHash, evidenceIds: input.evidenceIds, summary: clean(input.summary || "Publishing deliverable package created.", 1200) },
    progress: { percent: 90, stage: "delivery", completedUnits: input.completedUnits, totalUnits: input.totalUnits },
    operatorIdentityHash: input.operatorIdentityHash,
  });
}

function deliverProject(record, input) {
  if (record.state !== "delivery") throw actionError("DELIVERY_STATE_INVALID", "Delivery requires delivery state.");
  if (input.deliveryApproved !== true) throw actionError("DELIVERY_APPROVAL_REQUIRED", "Explicit delivery approval is required.");
  return transitionKairosRuntimeProject(record, {
    state: "follow_up",
    event: { type: "delivered", state: "follow_up", actorIdentityHash: input.operatorIdentityHash, evidenceIds: input.evidenceIds, summary: clean(input.summary || "Publishing deliverables released to the customer.", 1200) },
    progress: { percent: 100, stage: "follow_up", completedUnits: input.completedUnits, totalUnits: input.totalUnits },
    operatorIdentityHash: input.operatorIdentityHash,
  });
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function actionError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }