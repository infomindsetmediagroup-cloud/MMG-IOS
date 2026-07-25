import { Agent } from "agents";

export const KAIROS_PROJECT_AGENT_BUILD = "kairos-project-agent-20260725-2-manuscript-workflow";
export const KAIROS_PROJECT_WORKFLOW_BINDING = "KAIROS_PROJECT_WORKFLOW";
export const KAIROS_MANUSCRIPT_WORKFLOW_BINDING = "KAIROS_MANUSCRIPT_WORKFLOW";

const initialState = Object.freeze({
  contractVersion: "1.0.0",
  build: KAIROS_PROJECT_AGENT_BUILD,
  projectId: null,
  title: null,
  status: "created",
  stage: "project_initialized",
  progress: 0,
  activeWorkflow: null,
  activeManuscriptWorkflow: null,
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

  async startManuscriptGenerationWorkflow(input = {}) {
    const projectId = normalizeProjectId(input.projectId || this.state.projectId);
    const existing = this.state.activeManuscriptWorkflow;
    if (existing && ["running", "waiting_for_approval"].includes(existing.status)) {
      return { reused: true, instanceId: existing.instanceId, state: this.state };
    }

    const requestedAt = new Date().toISOString();
    const requestedBy = cleanText(input.requestedBy, 120) || "kairos-owner";
    const instanceId = await this.runWorkflow(
      KAIROS_MANUSCRIPT_WORKFLOW_BINDING,
      {
        projectId,
        title: cleanText(input.title, 180) || this.state.title || "Untitled Kairos Project",
        requestedBy,
        requestedAt,
      },
      {
        id: `kairos-manuscript-${projectId}-${crypto.randomUUID()}`,
        metadata: { projectId, workflowVersion: "manuscript-generation-v1", approvalType: "START_PRODUCTION_JOB" },
        agentBinding: "KAIROS_PROJECT_AGENT",
      },
    );

    const now = new Date().toISOString();
    this.setState({
      ...this.state,
      projectId,
      title: cleanText(input.title, 180) || this.state.title || "Untitled Kairos Project",
      status: "running",
      stage: "manuscript_workflow_started",
      progress: 0.01,
      activeManuscriptWorkflow: {
        instanceId,
        workflowName: KAIROS_MANUSCRIPT_WORKFLOW_BINDING,
        workflowVersion: "manuscript-generation-v1",
        approvalType: "START_PRODUCTION_JOB",
        approvedBy: requestedBy,
        approvedAt: requestedAt,
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
    if (workflowName === KAIROS_PROJECT_WORKFLOW_BINDING) return this.updateFoundationProgress(instanceId, progress);
    if (workflowName === KAIROS_MANUSCRIPT_WORKFLOW_BINDING) return this.updateManuscriptProgress(instanceId, progress);
  }

  async onWorkflowComplete(workflowName, instanceId, result = {}) {
    if (workflowName === KAIROS_PROJECT_WORKFLOW_BINDING) {
      const now = new Date().toISOString();
      this.setState({ ...this.state, status: "completed", stage: "foundation_complete", progress: 1, activeWorkflow: { ...(this.state.activeWorkflow || {}), instanceId, workflowName, workflowVersion: "project-foundation-v1", status: "completed", completedAt: now, updatedAt: now, result }, pendingApproval: null, lastError: null, updatedAt: now });
      return;
    }
    if (workflowName === KAIROS_MANUSCRIPT_WORKFLOW_BINDING) {
      const now = new Date().toISOString();
      this.setState({ ...this.state, status: "completed", stage: "manuscript_generation_complete", progress: 1, activeManuscriptWorkflow: { ...(this.state.activeManuscriptWorkflow || {}), instanceId, workflowName, workflowVersion: "manuscript-generation-v1", status: "completed", completedAt: now, updatedAt: now, result }, pendingApproval: null, lastError: null, updatedAt: now });
    }
  }

  async onWorkflowError(workflowName, instanceId, error) {
    if (![KAIROS_PROJECT_WORKFLOW_BINDING, KAIROS_MANUSCRIPT_WORKFLOW_BINDING].includes(workflowName)) return;
    const now = new Date().toISOString();
    const manuscript = workflowName === KAIROS_MANUSCRIPT_WORKFLOW_BINDING;
    const activeKey = manuscript ? "activeManuscriptWorkflow" : "activeWorkflow";
    this.setState({ ...this.state, status: "failed_retriable", stage: manuscript ? "manuscript_generation_error" : "workflow_error", [activeKey]: { ...(this.state[activeKey] || {}), instanceId, workflowName, workflowVersion: manuscript ? "manuscript-generation-v1" : "project-foundation-v1", status: "failed_retriable", updatedAt: now }, pendingApproval: null, lastError: { code: classifyWorkflowError(error), message: cleanText(error?.message || error, 1000) || "The durable Kairos workflow failed.", retriable: true, stage: manuscript ? "manuscript_generation" : "project_foundation" }, updatedAt: now });
  }

  updateFoundationProgress(instanceId, progress) {
    const now = new Date().toISOString();
    const waiting = progress.status === "waiting_for_approval";
    this.setState({ ...this.state, status: waiting ? "waiting_for_approval" : "running", stage: cleanText(progress.step, 120) || this.state.stage, progress: clampProgress(progress.percent, this.state.progress), activeWorkflow: { ...(this.state.activeWorkflow || {}), instanceId, workflowName: KAIROS_PROJECT_WORKFLOW_BINDING, workflowVersion: "project-foundation-v1", status: waiting ? "waiting_for_approval" : "running", updatedAt: now }, pendingApproval: waiting ? { workflowInstanceId: instanceId, type: "FOUNDATION_APPROVAL", requestedAt: now, message: cleanText(progress.message, 500) || "Approve the durable project foundation checkpoint." } : null, updatedAt: now });
  }

  updateManuscriptProgress(instanceId, progress) {
    const now = new Date().toISOString();
    this.setState({ ...this.state, status: progress.status === "failed_retriable" ? "failed_retriable" : "running", stage: cleanText(progress.step, 120) || this.state.stage, progress: clampProgress(progress.percent, this.state.progress), activeManuscriptWorkflow: { ...(this.state.activeManuscriptWorkflow || {}), instanceId, workflowName: KAIROS_MANUSCRIPT_WORKFLOW_BINDING, workflowVersion: "manuscript-generation-v1", status: progress.status === "failed_retriable" ? "failed_retriable" : "running", updatedAt: now, message: cleanText(progress.message, 500) || null }, pendingApproval: null, updatedAt: now });
  }
}

function normalizeProjectId(value) { const projectId = String(value || "").trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(projectId)) throw new Error("A valid projectId of at least eight lowercase letters, numbers, or hyphens is required."); return projectId; }
function requireInstance(instanceId, activeWorkflow) { if (!instanceId || activeWorkflow?.instanceId !== instanceId) throw new Error("The workflow instance does not match the active Kairos project workflow."); }
function cleanText(value, maximum) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum); }
function clampProgress(value, fallback = 0) { const number = Number(value); if (!Number.isFinite(number)) return Number(fallback || 0); return Math.max(0, Math.min(1, number)); }
function classifyWorkflowError(error) { const value = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase(); if (value.includes("quota") || value.includes("insufficient_quota")) return "PROVIDER_QUOTA_EXHAUSTED"; if (value.includes("401") || value.includes("api key") || value.includes("auth")) return "PROVIDER_AUTH_INVALID"; if (value.includes("403") || value.includes("permission")) return "PROVIDER_PERMISSION_DENIED"; if (value.includes("source")) return "SOURCE_INVALID"; return "PROVIDER_UNAVAILABLE"; }
