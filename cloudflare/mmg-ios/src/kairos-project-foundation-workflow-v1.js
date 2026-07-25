import { AgentWorkflow } from "agents/workflows";

export const KAIROS_PROJECT_FOUNDATION_WORKFLOW_BUILD = "kairos-project-foundation-workflow-20260725-1";

export class KairosProjectFoundationWorkflow extends AgentWorkflow {
  async run(event, step) {
    const input = event.payload || {};
    const validated = await step.do("validate-project-contract", async () => {
      const projectId = String(input.projectId || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(projectId)) {
        throw new Error("The project workflow received an invalid projectId.");
      }
      return {
        projectId,
        title: String(input.title || "Untitled Kairos Project").trim().slice(0, 180),
        requestedBy: String(input.requestedBy || "kairos-owner").trim().slice(0, 120),
        requestedAt: input.requestedAt || new Date().toISOString(),
        workflowVersion: "project-foundation-v1",
        contractVersion: "1.0.0",
      };
    });

    await step.mergeAgentState({
      status: "running",
      stage: "foundation_contract_validated",
      progress: 0.25,
      pendingApproval: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });

    await this.reportProgress({
      step: "foundation_contract_validated",
      status: "running",
      percent: 0.25,
      message: "The persistent project contract is valid.",
    });

    const checkpoint = await step.do("create-foundation-checkpoint", async () => ({
      stepId: "project-foundation-checkpoint",
      workflowVersion: validated.workflowVersion,
      inputSchemaVersion: validated.contractVersion,
      status: "waiting_for_approval",
      attempt: 1,
      idempotencyKey: `foundation:${validated.projectId}:v1`,
      startedAt: new Date().toISOString(),
      completedAt: null,
      inputReferences: [`project:${validated.projectId}`],
      outputReferences: [],
      error: null,
      approvalReceipt: null,
    }));

    await step.mergeAgentState({
      status: "waiting_for_approval",
      stage: "foundation_approval_required",
      progress: 0.5,
      pendingApproval: {
        workflowInstanceId: this.instanceId,
        type: "FOUNDATION_APPROVAL",
        requestedAt: new Date().toISOString(),
        message: "Approve the durable project foundation before workflow execution continues.",
      },
      updatedAt: new Date().toISOString(),
    });

    await this.reportProgress({
      step: "foundation_approval_required",
      status: "waiting_for_approval",
      percent: 0.5,
      message: "Approve the durable project foundation before workflow execution continues.",
    });

    const approval = await this.waitForApproval(step, { timeout: "30 days" });

    const result = await step.do("seal-foundation-receipt", async () => {
      const completedAt = new Date().toISOString();
      return {
        ...checkpoint,
        status: "completed",
        completedAt,
        outputReferences: [`project-agent:${validated.projectId}`, `workflow:${this.instanceId}`],
        approvalReceipt: JSON.stringify({
          approved: true,
          workflowInstanceId: this.instanceId,
          approvedAt: approval?.metadata?.approvedAt || completedAt,
          approvedBy: approval?.metadata?.approvedBy || "kairos-owner",
          reason: approval?.reason || "Approved",
        }),
      };
    });

    await step.mergeAgentState({
      status: "completed",
      stage: "foundation_complete",
      progress: 1,
      pendingApproval: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });

    await this.reportProgress({
      step: "foundation_complete",
      status: "complete",
      percent: 1,
      message: "The durable Kairos project foundation is complete.",
    });

    await step.reportComplete(result);
    return result;
  }
}
