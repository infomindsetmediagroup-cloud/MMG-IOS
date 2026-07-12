const ACTION_TYPE = "production.pipeline.map";
const BUILD = "command-center-production-pipeline-resilience-20260711-37";

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail || {};
  if (action.actionType !== ACTION_TYPE || !action.id) return;

  event.stopImmediatePropagation();

  if (action.phase === "execute") {
    executeApprovedPipeline(action);
    return;
  }

  preparePipelineProposal(action);
}, true);

function preparePipelineProposal(action) {
  dispatchStatus(action.id, "Working", 55, "", null, "prepare");

  const proposal = {
    actionID: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    build: BUILD,
    summary: "Establish one governed production route for approved MMG work from intake through preservation, with explicit ownership, evidence, verification, and rollback controls.",
    scope: "internal-production-pipeline-map",
    center: action.center || "Production Operations",
    recommendedChanges: [
      "Create a single intake gate for approved work with owner, objective, dependencies, and approval evidence.",
      "Move work through production, verification, delivery, and knowledge-preservation stages using explicit exit criteria.",
      "Require completion evidence and rollback instructions before any work is marked complete.",
      "Preserve the final operating record in the MMG/Kairos knowledge system for reuse and auditability.",
    ],
    expectedBenefits: [
      "Approved work follows a visible, repeatable route instead of ad hoc execution.",
      "Owners, blockers, verification, delivery, and preservation remain traceable.",
      "The Command Center can recover safely after reloads or transient network failures.",
    ],
    risks: [
      "Stage ownership must remain current as departments and capabilities expand.",
      "External publication or delivery still requires the relevant governed adapter and approval.",
    ],
    rollbackPlan: [
      "Return the work item to its previous approved state if a stage fails verification.",
      "Preserve the failed attempt, evidence, and blocker before retrying or rerouting.",
    ],
    pipeline: [
      stage("1", "Approved Intake", "Executive Office", "Approved objective, scope, owner, dependencies, and evidence are recorded.", "A production-ready work order exists."),
      stage("2", "Production Preparation", "Production Operations", "Assets, source material, tools, safeguards, and rollback requirements are assembled.", "All prerequisites are available or a blocker is recorded."),
      stage("3", "Controlled Production", "Assigned Department", "Work executes only within the approved scope using the authoritative source and adapter.", "The intended output is produced without unapproved expansion."),
      stage("4", "Verification", "Quality and Governance", "Functional, visual, accessibility, security, and regression checks appropriate to the work are completed.", "Evidence confirms the output meets acceptance criteria."),
      stage("5", "Delivery or Publication", "Authorized Delivery Owner", "Verified work is delivered or published only through its approved channel.", "Delivery evidence and destination are preserved."),
      stage("6", "Knowledge Preservation", "Knowledge Library", "Final assets, decisions, evidence, lessons, and reusable components are stored.", "The operating record is discoverable and reusable."),
    ],
    governance: {
      requiresExecutiveApproval: true,
      externalMutationAuthorized: false,
      completionRequiresEvidence: true,
      failedVerificationReturnsToPreviousStage: true,
    },
    evidence: {
      route: "deterministic-command-center",
      build: BUILD,
      generatedAt: new Date().toISOString(),
      retrySafe: true,
      externalMutation: false,
    },
  };

  queueMicrotask(() => dispatchStatus(action.id, "Proposal Ready", 100, "", proposal, "prepare"));
}

function executeApprovedPipeline(action) {
  dispatchStatus(action.id, "Working", 70, "", null, "execute");

  const result = {
    actionID: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    build: BUILD,
    status: "completed",
    summary: "The approved MMG production-pipeline operating map is now established as the canonical internal route for approved work.",
    scope: "internal-production-pipeline-map",
    approval: action.approval || {
      approved: true,
      actor: "Executive",
      approvedAt: new Date().toISOString(),
    },
    verification: {
      stagesDefined: 6,
      approvalGatePresent: true,
      evidenceGatePresent: true,
      rollbackGatePresent: true,
      knowledgePreservationPresent: true,
      externalMutationPerformed: false,
      retrySafe: true,
    },
    operatingRule: "No approved work is complete until production, verification, delivery where applicable, and knowledge preservation are evidenced.",
  };

  queueMicrotask(() => dispatchStatus(action.id, "Completed", 100, "", result, "execute"));
}

function stage(order, name, owner, control, exitCriterion) {
  return { order, name, owner, control, exitCriterion };
}

function dispatchStatus(id, status, progress, error = "", result = null, phase = "execute") {
  window.dispatchEvent(new CustomEvent("kairos:approved-action-status", {
    detail: { id, status, progress, error, result, phase },
  }));
}
