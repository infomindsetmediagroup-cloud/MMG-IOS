import { getWorkflowDefinition } from "./kairos-workflow-registry-v1.js";

const RISK_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });

export function evaluatePolicy(context = {}) {
  const {
    agent,
    workflowId,
    action,
    riskClass = "low",
    environment = "production",
    globalKillSwitch,
  } = context;

  if (globalKillSwitch !== "enabled") {
    return deny(
      "global.kill.switch",
      1,
      "GLOBAL_KILL_SWITCH_ACTIVE",
      "All autonomous execution is globally suspended or the kill-switch state is unknown.",
    );
  }

  const workflow = getWorkflowDefinition(workflowId);
  if (!workflow) {
    return deny(
      "workflow.registry.v1",
      1,
      "UNKNOWN_OR_INACTIVE_WORKFLOW",
      `Workflow ${String(workflowId || "<missing>")} is not registered or active.`,
    );
  }

  if (typeof agent !== "string" || !workflow.agents.includes(agent)) {
    return deny(
      workflow.workflowId,
      workflow.version,
      "AGENT_NOT_AUTHORIZED",
      `Agent ${String(agent || "<missing>")} is not authorized for workflow ${workflow.workflowId}.`,
    );
  }

  if (typeof action !== "string" || !action.trim()) {
    return deny(
      workflow.workflowId,
      workflow.version,
      "INVALID_ACTION",
      "A non-empty action identifier is required.",
    );
  }

  if (!Object.hasOwn(RISK_RANK, riskClass)) {
    return deny(
      workflow.workflowId,
      workflow.version,
      "INVALID_RISK_CLASS",
      `Risk class ${String(riskClass)} is not recognized.`,
    );
  }

  if (!workflow.environments.includes(environment)) {
    return deny(
      workflow.workflowId,
      workflow.version,
      "ENVIRONMENT_NOT_AUTHORIZED",
      `Environment ${String(environment)} is not authorized for workflow ${workflow.workflowId}.`,
    );
  }

  const normalizedAction = action.trim();

  if (workflow.blockedActions.includes(normalizedAction)) {
    return deny(
      workflow.workflowId,
      workflow.version,
      "ACTION_EXPLICITLY_BLOCKED",
      `Action ${normalizedAction} is strictly blocked by workflow policy.`,
    );
  }

  if (workflow.approvalRequiredActions.includes(normalizedAction)) {
    return requireApproval(
      workflow.workflowId,
      workflow.version,
      "ACTION_REQUIRES_EXECUTIVE_APPROVAL",
      `Action ${normalizedAction} requires explicit approval before execution.`,
    );
  }

  if (workflow.autonomousActions.includes(normalizedAction)) {
    const exceedsWorkflowRisk = RISK_RANK[riskClass] > RISK_RANK[workflow.riskClass];
    const elevatedProductionRisk = environment === "production" && RISK_RANK[riskClass] >= RISK_RANK.medium;

    if (exceedsWorkflowRisk || elevatedProductionRisk) {
      return requireApproval(
        workflow.workflowId,
        workflow.version,
        "RISK_BOUND_EXCEEDED",
        `Action ${normalizedAction} exceeds the autonomous risk bounds for ${workflow.workflowId}.`,
      );
    }

    return {
      decision: "ALLOW_AUTONOMOUS",
      policyId: workflow.workflowId,
      policyVersion: workflow.version,
      reasonCode: "ACTION_CERTIFIED_AUTONOMOUS",
      explanation: "Action is permitted under the registered workflow and current risk bounds.",
    };
  }

  return deny(
    workflow.workflowId,
    workflow.version,
    "DEFAULT_FAIL_CLOSED",
    `Action ${normalizedAction} is not granted under workflow policy.`,
  );
}

function deny(policyId, policyVersion, reasonCode, explanation) {
  return {
    decision: "DENY",
    policyId,
    policyVersion,
    reasonCode,
    explanation,
  };
}

function requireApproval(policyId, policyVersion, reasonCode, explanation) {
  return {
    decision: "REQUIRE_APPROVAL",
    policyId,
    policyVersion,
    reasonCode,
    explanation,
  };
}
