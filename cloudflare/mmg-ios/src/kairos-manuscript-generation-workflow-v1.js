import { AgentWorkflow } from "agents/workflows";
import {
  KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
  beginManuscriptGenerationWorkflow,
  executeManuscriptGenerationWorkflowUnit,
  failManuscriptGenerationWorkflow,
  finalizeManuscriptGenerationWorkflow,
} from "./kairos-manuscript-generation-job-v1.js";

export const KAIROS_MANUSCRIPT_GENERATION_WORKFLOW_BUILD = "kairos-manuscript-generation-workflow-20260725-1";

const MAX_STEPS = 32;

export class KairosManuscriptGenerationWorkflow extends AgentWorkflow {
  async run(event, step) {
    const input = event.payload || {};
    const validated = await step.do("validate-manuscript-workflow-contract", async () => {
      const projectId = String(input.projectId || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(projectId)) {
        throw new Error("The manuscript workflow received an invalid projectId.");
      }
      return {
        projectId,
        title: String(input.title || "Untitled Kairos Project").trim().slice(0, 180),
        requestedBy: String(input.requestedBy || "kairos-owner").trim().slice(0, 120),
        requestedAt: input.requestedAt || new Date().toISOString(),
        workflowVersion: KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
        contractVersion: "1.0.0",
      };
    });

    await step.mergeAgentState({
      status: "running",
      stage: "manuscript_workflow_validated",
      progress: 0.02,
      pendingApproval: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });

    await this.reportProgress({
      step: "manuscript_workflow_validated",
      status: "running",
      percent: 0.02,
      message: "The durable manuscript workflow contract is valid.",
    });

    try {
      const started = await step.do("initialize-manuscript-generation", async () => beginManuscriptGenerationWorkflow(this.env, {
        ...validated,
        workflowInstanceId: this.instanceId,
      }));

      const firstStep = Math.max(0, Number(started?.job?.step || 0));
      for (let index = firstStep; index < MAX_STEPS; index += 1) {
        const unit = await step.do(`expand-manuscript-unit-${String(index + 1).padStart(2, "0")}`, async () => executeManuscriptGenerationWorkflowUnit(this.env, {
          projectId: validated.projectId,
          step: index,
          workflowInstanceId: this.instanceId,
        }));

        const job = unit?.job || {};
        const percent = Math.min(0.94, 0.05 + (Math.max(0, Number(job.step || index + 1)) / MAX_STEPS) * 0.89);
        await step.mergeAgentState({
          status: "running",
          stage: unit?.alreadyStored ? "manuscript_unit_reconciled" : "manuscript_unit_stored",
          progress: percent,
          pendingApproval: null,
          lastError: null,
          updatedAt: new Date().toISOString(),
        });

        await this.reportProgress({
          step: unit?.alreadyStored ? "manuscript_unit_reconciled" : "manuscript_unit_stored",
          status: "running",
          percent,
          message: unit?.alreadyStored
            ? `Expansion unit ${index + 1} was already durably stored.`
            : `Expansion unit ${index + 1} was generated, stored, and verified.`,
        });

        if (unit?.done) break;
      }

      const completed = await step.do("finalize-manuscript-generation", async () => finalizeManuscriptGenerationWorkflow(this.env, {
        projectId: validated.projectId,
        workflowInstanceId: this.instanceId,
      }));

      const result = {
        stepId: "manuscript-generation-complete",
        workflowVersion: validated.workflowVersion,
        inputSchemaVersion: validated.contractVersion,
        status: "completed",
        attempt: 1,
        idempotencyKey: `manuscript:${validated.projectId}:${validated.workflowVersion}`,
        startedAt: started?.job?.createdAt || validated.requestedAt,
        completedAt: completed?.job?.completedAt || new Date().toISOString(),
        inputReferences: [`project:${validated.projectId}`, `manuscript:${validated.projectId}:source`],
        outputReferences: [`manuscript:${validated.projectId}:expanded`, `workflow:${this.instanceId}`],
        error: null,
        approvalReceipt: JSON.stringify({
          type: "START_PRODUCTION_JOB",
          approved: true,
          approvedBy: validated.requestedBy,
          approvedAt: validated.requestedAt,
          workflowInstanceId: this.instanceId,
        }),
        job: completed?.job || null,
      };

      await step.mergeAgentState({
        status: "completed",
        stage: "manuscript_generation_complete",
        progress: 1,
        pendingApproval: null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });

      await this.reportProgress({
        step: "manuscript_generation_complete",
        status: "complete",
        percent: 1,
        message: "The durable manuscript generation workflow is complete.",
      });

      await step.reportComplete(result);
      return result;
    } catch (error) {
      try {
        await failManuscriptGenerationWorkflow(this.env, {
          projectId: validated.projectId,
          workflowInstanceId: this.instanceId,
          code: classifyError(error),
          message: String(error?.message || error || "Durable manuscript generation failed."),
        });
      } catch {}

      await step.mergeAgentState({
        status: "failed_retriable",
        stage: "manuscript_generation_error",
        pendingApproval: null,
        lastError: {
          code: classifyError(error),
          message: String(error?.message || error || "Durable manuscript generation failed.").slice(0, 1000),
          retriable: true,
          stage: "manuscript_generation",
        },
        updatedAt: new Date().toISOString(),
      });

      await this.reportProgress({
        step: "manuscript_generation_error",
        status: "failed_retriable",
        percent: 0,
        message: String(error?.message || error || "Durable manuscript generation failed.").slice(0, 500),
      });
      throw error;
    }
  }
}

function classifyError(error) {
  const value = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  if (value.includes("quota") || value.includes("insufficient_quota")) return "PROVIDER_QUOTA_EXHAUSTED";
  if (value.includes("401") || value.includes("api key") || value.includes("auth")) return "PROVIDER_AUTH_INVALID";
  if (value.includes("403") || value.includes("permission")) return "PROVIDER_PERMISSION_DENIED";
  if (value.includes("source")) return "SOURCE_INVALID";
  return "PROVIDER_UNAVAILABLE";
}
