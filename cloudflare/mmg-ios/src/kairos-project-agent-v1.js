import { Agent } from "agents";

export const KAIROS_PROJECT_AGENT_BUILD = "kairos-project-agent-20260725-1";
export const KAIROS_PROJECT_WORKFLOW_BINDING = "KAIROS_PROJECT_WORKFLOW";

const initialState = Object.freeze({
  contractVersion: "1.0.0",
  build: KAIROS_PROJECT_AGENT_BUILD,
  projectId: null,
  title: null,
  status: "created",
  stage: "project_initialized",
  progress: 0,
  activeWorkflow: null,
  pendingApproval: null,
  lastError: null,
  updatedAt: null,
});

export class KairosProjectAgent extends Agent {
  initialState = { ...initialState };

  async bootstrapProject(input = {}) {
    const projectId = normalizeProjectId(input.projectId);
    const now = new Date().toISOString();
    const next = {
      ...this.state,
      contractVersion: "1.0.0",
      build: KAIROS_PROJECT_AGENT_BUILD,
      projectId,
      title: cleanText(input.title, 180) || this.state.title || "Untitled Kairos Project",
      status: this.state.status === "completed" ? "completed" : "created",
      stage: this.state.stage || "project_initialized",
      updatedAt: now,
    };
    this.setState(next);
    return next;
  }

  async getProjectState() {
    return this.state;
  }

  async startFoundationWorkflow(input = {}) {
    const projectId = normalizeProjectId(input.projectId || this.state.projectId);
    const existing = this.state.activeWorkflow;
    if (existing && ["running", "waiting_for_approval"].includes(existing.status)) {
      return { reused: true, instanceId: existing.instanceId, state: this.state };
    }

    const instanceId = await this.runWorkflow(
      KAIROS_PROJECT_WORKFLOW_BINDING,
      {
        projectId,
        title: cleanText(input.title, 180) || this.state.title || "Untitled Kairos Project",
        requestedBy: cleanText(input.requestedBy, 120) || "kairos-owner",
        requestedAt: new Date().toISOString(),
      },
      {
        id: `kairos-project-${projectId}-${crypto.randomUUID()}`,
        metadata: { projectId, workflowVersion: "project-foundation-v1" },
        agentBinding: "KAIROS_PROJECT_AGENT",
      },
    );

    const now = new Date().toISOString();
    this.setState({
      ...this.state,
      projectId,
      title: cleanText(input.title, 180) || this.state.title || "Untitled Kairos Project",
      status: "running",
      stage: "workflow_started",
      progress: 0.05,
      activeWorkflow: {
        instanceId,
        workflowName: KAIROS_PROJECT_WORKFLOW_BINDING,
        workflowVersion: "project-foundation-v1",
        status: "running",
        startedAt: now,
        updatedAt: now,
      },
      pendingApproval: null,
      lastError: null,
      updatedAt: now,
    });

    return { reused: false, instanceId, state: this.state };
  }

  async approveFoundationWorkflow(instanceId, approval = {}) {
    requireInstance(instanceId, this.state.activeWorkflow);
    await this.approveWorkflow(instanceId, {
      reason: cleanText(approval.reason, 500) || "Approved by Kairos owner",
      metadata: {
        approvedBy: cleanText(approval.approvedBy, 120) || "kairos-owner",
        approvedAt: new Date().toISOString(),
      },
    });
    return { accepted: true, instanceId };
  }

  async rejectFoundationWorkflow(instanceId, rejection = {}) {
    requireInstance(instanceId, this.state.activeWorkflow);
    await this.rejectWorkflow(instanceId, {
      reason: cleanText(rejection.reason, 500) || "Rejected by Kairos owner",
    });
    return { accepted: true, instanceId };
  }

  async onWorkflowProgress(workflowName, instanceId, progress = {}) {
    if (workflowName !== KAIROS_PROJECT_WORKFLOW_BINDING) return;
    const now = new Date().toISOString();
    const waiting = progress.status === "waiting_for_approval";
    this.setState({
      ...this.state,
      status: waiting ? "waiting_for_approval" : "running",
      stage: cleanText(progress.step, 120) || this.state.stage,
      progress: clampProgress(progress.percent, this.state.progress),
      activeWorkflow: {
        ...(this.state.activeWorkflow || {}),
        instanceId,
        workflowName,
        workflowVersion: "project-foundation-v1",
        status: waiting ? "waiting_for_approval" : "running",
        updatedAt: now,
      },
      pendingApproval: waiting
        ? {
            workflowInstanceId: instanceId,
            type: "FOUNDATION_APPROVAL",
            requestedAt: now,
            message: cleanText(progress.message, 500) || "Approve the durable project foundation checkpoint.",
          }
        : null,
      updatedAt: now,
    });
  }

  async onWorkflowComplete(workflowName, instanceId, result = {}) {
    if (workflowName !== KAIROS_PROJECT_WORKFLOW_BINDING) return;
    const now = new Date().toISOString();
    this.setState({
      ...this.state,
      status: "completed",
      stage: "foundation_complete",
      progress: 1,
      activeWorkflow: {
        ...(this.state.activeWorkflow || {}),
        instanceId,
        workflowName,
        workflowVersion: "project-foundation-v1",
        status: "completed",
        completedAt: now,
        updatedAt: now,
        result,
      },
      pendingApproval: null,
      lastError: null,
      updatedAt: now,
    });
  }

  async onWorkflowError(workflowName, instanceId, error) {
    if (workflowName !== KAIROS_PROJECT_WORKFLOW_BINDING) return;
    const now = new Date().toISOString();
    this.setState({
      ...this.state,
      status: "failed_retriable",
      stage: "workflow_error",
      activeWorkflow: {
        ...(this.state.activeWorkflow || {}),
        instanceId,
        workflowName,
        workflowVersion: "project-foundation-v1",
        status: "failed_retriable",
        updatedAt: now,
      },
      pendingApproval: null,
      lastError: {
        code: "PROVIDER_UNAVAILABLE",
        message: cleanText(error?.message || error, 1000) || "The durable project workflow failed.",
        retriable: true,
        stage: "project_foundation",
      },
      updatedAt: now,
    });
  }
}

function normalizeProjectId(value) {
  const projectId = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(projectId)) {
    throw new Error("A valid projectId of at least eight lowercase letters, numbers, or hyphens is required.");
  }
  return projectId;
}

function requireInstance(instanceId, activeWorkflow) {
  if (!instanceId || activeWorkflow?.instanceId !== instanceId) {
    throw new Error("The workflow instance does not match the active Kairos project workflow.");
  }
}

function cleanText(value, maximum) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function clampProgress(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number(fallback || 0);
  return Math.max(0, Math.min(1, number));
}
