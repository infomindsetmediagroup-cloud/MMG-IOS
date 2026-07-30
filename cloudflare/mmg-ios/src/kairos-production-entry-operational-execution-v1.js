import { getAgentByName } from "agents";
import dashboardRuntime, {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-revenue-dashboard-v1.js";
import { handleKairosAPI } from "./kairos-api-runtime-v1.js";

export {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
};

export const KAIROS_OPERATIONAL_EXECUTION_BUILD = "kairos-operational-execution-20260730-2-approval-recovery";

const RUNTIME_PROJECT_PATH = "/registry/kairos-runtime-projects";
const REGISTRY_OBJECT = "mmg-production-project-registry";
const HUB_ACTIONS = new Set(["objective", "growth-plan", "revenue-intelligence"]);
const ACTION_ROUTE = /^\/api\/workflows\/([^/]+)\/(resume|approve|reject|start-production)$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === "/api/operational-readiness") {
      if (method !== "GET") return methodNotAllowed("GET");
      return stamp(operationalReadiness(env));
    }

    if (path === "/api/hub/run") {
      if (method !== "POST") return methodNotAllowed("POST");
      return stamp(await startGovernedObjective(request, env));
    }

    if (path === "/api/workflows") {
      if (method !== "GET") return methodNotAllowed("GET");
      return stamp(await readOperationalWorkflows(request, env, ctx));
    }

    const actionMatch = path.match(ACTION_ROUTE);
    if (actionMatch) {
      if (method !== "POST") return methodNotAllowed("POST");
      return stamp(await handleWorkflowAction(request, env, decodeURIComponent(actionMatch[1]), actionMatch[2].toLowerCase()));
    }

    return dashboardRuntime.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof dashboardRuntime.scheduled === "function") {
      return dashboardRuntime.scheduled(controller, env, ctx);
    }
    return undefined;
  },
};

function operationalReadiness(env) {
  const checks = {
    runtimeStorage: Boolean(env?.KAIROS_PROJECTS?.idFromName && env?.KAIROS_PROJECTS?.get),
    projectAgent: Boolean(env?.KAIROS_PROJECT_AGENT),
    foundationWorkflow: Boolean(env?.KAIROS_PROJECT_WORKFLOW),
    manuscriptWorkflow: Boolean(env?.KAIROS_MANUSCRIPT_WORKFLOW),
    modelProvider: Boolean(env?.OPENAI_API_KEY),
  };
  const ready = Object.values(checks).every(Boolean);
  return json({
    status: ready ? "ready" : "degraded",
    checks,
    objectiveSubmission: checks.runtimeStorage && checks.projectAgent && checks.foundationWorkflow ? "ready" : "blocked",
    sourceGeneration: checks.modelProvider && checks.runtimeStorage ? "ready" : "blocked",
    productionExecution: checks.projectAgent && checks.manuscriptWorkflow ? "ready" : "blocked",
    approvalPolicy: "explicit",
    automaticPublicationAllowed: false,
    commerceMutationAllowed: false,
    build: KAIROS_OPERATIONAL_EXECUTION_BUILD,
  }, ready ? 200 : 503);
}

async function startGovernedObjective(request, env) {
  let runtimeProject = null;
  try {
    assertOperationalBindings(env);
    const payload = await request.json().catch(() => ({}));
    const action = clean(payload?.action || "objective", 80).toLowerCase();
    const objective = clean(payload?.objective, 12000);
    if (!HUB_ACTIONS.has(action)) {
      return json({ error: { code: "HUB_ACTION_INVALID", message: "Kairos accepts objective, growth-plan, or revenue-intelligence work from this browser." } }, 400);
    }
    if (objective.length < 3) {
      return json({ error: { code: "OBJECTIVE_REQUIRED", message: "State the business outcome before Kairos begins." } }, 400);
    }

    const runtimeProjectId = `kproject_browser_${crypto.randomUUID()}`;
    const agentProjectId = agentProjectID(runtimeProjectId);
    const operatorIdentityHash = browserIdentityHash(request);
    const title = hubTitle(action, objective);
    const approvalId = `approval_${crypto.randomUUID()}`;
    const created = await runtimeMutation(env, {
      operation: "create",
      input: {
        projectId: runtimeProjectId,
        department: action === "growth-plan" ? "growth" : action === "revenue-intelligence" ? "revenue" : "publishing",
        projectType: action === "objective" ? "digital_asset_project" : action,
        title,
        state: "planning",
        progress: { percent: 25, stage: "foundation_planning", completedUnits: 1, totalUnits: 4 },
        objective: {
          summary: objective,
          classification: action,
          deliverableTypes: action === "objective" ? ["digital_asset_package"] : ["operating_plan"],
          requiredAssetTypes: [],
          complexity: "unclassified",
          approved: false,
        },
        approvals: [{ approvalId, gate: "production_plan", required: true, status: "pending", identityHash: operatorIdentityHash }],
        operatorIdentityHash,
        environment: clean(env?.KAIROS_ENVIRONMENT || "production", 80),
        commitSha: clean(env?.KAIROS_COMMIT_SHA, 80) || null,
      },
    });
    runtimeProject = created.project;

    const agent = await projectAgent(env, agentProjectId);
    await agent.bootstrapProject({ projectId: agentProjectId, title });
    const foundation = await agent.startFoundationWorkflow({ projectId: agentProjectId, title, requestedBy: operatorIdentityHash });
    runtimeProject = await advanceToApproval(env, runtimeProject, operatorIdentityHash);

    return json({
      status: "accepted",
      runtimeProjectId,
      agentProjectId,
      workflowInstanceId: foundation.instanceId,
      workflow: projectOperationalState(runtimeProject, foundation.state || await agent.getProjectState()),
      nextAction: "Review and approve the durable project foundation.",
      automaticPublicationAllowed: false,
      commerceMutationAllowed: false,
      build: KAIROS_OPERATIONAL_EXECUTION_BUILD,
    }, 202);
  } catch (error) {
    if (runtimeProject?.projectId) {
      try {
        await blockRuntimeProject(env, runtimeProject, error, browserIdentityHash(request));
      } catch {}
    }
    return failure(error, "OBJECTIVE_START_FAILED", "Kairos could not start the governed workflow.");
  }
}

async function readOperationalWorkflows(request, env, ctx) {
  try {
    assertOperationalBindings(env);
    const delegated = await dashboardRuntime.fetch(request, env, ctx);
    const payload = await delegated.json().catch(() => ({}));
    if (!delegated.ok) {
      throw runtimeError(payload?.error?.message || `Workflow projection returned ${delegated.status}.`, payload?.error?.code || "WORKFLOW_PROJECTION_FAILED", delegated.status);
    }
    const workflows = Array.isArray(payload?.workflows) ? payload.workflows : [];
    const enriched = await Promise.all(workflows.slice(0, 75).map(async (workflow) => {
      try {
        const agent = await projectAgent(env, agentProjectID(workflow.id));
        return projectOperationalState(workflow, await agent.getProjectState());
      } catch (error) {
        return {
          ...workflow,
          state: workflow.state || "blocked",
          actionRequired: "resume-foundation",
          canResume: true,
          statusReason: error instanceof Error ? error.message : "Project Agent state is unavailable.",
          operationalBuild: KAIROS_OPERATIONAL_EXECUTION_BUILD,
        };
      }
    }));
    return json({
      ...payload,
      status: "ready",
      workflows: enriched,
      count: enriched.length,
      executionSource: "kairos-project-agent-workflows",
      operationalBuild: KAIROS_OPERATIONAL_EXECUTION_BUILD,
    });
  } catch (error) {
    return failure(error, "WORKFLOW_PROJECTION_FAILED", "Kairos could not load operational workflows.");
  }
}

async function handleWorkflowAction(request, env, runtimeProjectId, action) {
  try {
    assertOperationalBindings(env);
    if (!/^kproject_[a-z0-9_-]{8,}$/i.test(runtimeProjectId)) {
      return json({ error: { code: "WORKFLOW_ID_INVALID", message: "The Kairos workflow identifier is invalid." } }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const runtimeProject = await readRuntimeProject(env, runtimeProjectId);
    const agentProjectId = agentProjectID(runtimeProjectId);
    const agent = await projectAgent(env, agentProjectId);
    const operator = browserIdentityHash(request);

    if (action === "resume") {
      const result = await resumeFoundation(env, runtimeProject, agent, agentProjectId, operator);
      return json({ status: "accepted", action, runtimeProjectId, agentProjectId, ...result, automaticPublicationAllowed: false }, 202);
    }
    if (action === "approve") {
      const result = await approveFoundation(env, runtimeProject, agent, agentProjectId, operator);
      return json({ status: "accepted", action, runtimeProjectId, agentProjectId, ...result, automaticPublicationAllowed: false }, 202);
    }
    if (action === "reject") {
      const result = await rejectFoundation(env, runtimeProject, agent, operator, body?.reason);
      return json({ status: "accepted", action, runtimeProjectId, agentProjectId, ...result, automaticPublicationAllowed: false }, 202);
    }
    if (action === "start-production") {
      const result = await startProduction(env, runtimeProject, agent, agentProjectId, operator);
      return json({ status: "accepted", action, runtimeProjectId, agentProjectId, ...result, automaticPublicationAllowed: false }, 202);
    }
    return json({ error: { code: "WORKFLOW_ACTION_INVALID", message: "This Kairos workflow action is not supported." } }, 400);
  } catch (error) {
    return failure(error, "WORKFLOW_ACTION_FAILED", "Kairos could not complete the workflow action.");
  }
}

async function resumeFoundation(env, runtimeProject, agent, agentProjectId, operator) {
  const title = clean(runtimeProject.title, 180) || "MMG digital asset project";
  const state = await agent.bootstrapProject({ projectId: agentProjectId, title });
  const foundation = await agent.startFoundationWorkflow({ projectId: agentProjectId, title, requestedBy: operator });
  const updated = await advanceToApproval(env, runtimeProject, operator);
  return {
    workflowInstanceId: foundation.instanceId,
    workflow: projectOperationalState(updated, foundation.state || state),
    nextAction: "Review and approve the durable project foundation.",
  };
}

async function approveFoundation(env, runtimeProject, agent, agentProjectId, operator) {
  const agentState = await agent.getProjectState();
  const instanceId = agentState?.pendingApproval?.workflowInstanceId || agentState?.activeWorkflow?.instanceId;
  const foundationStatus = clean(agentState?.activeWorkflow?.status, 80).toLowerCase();
  const foundationAlreadyCompleted = foundationStatus === "completed" && !agentState?.pendingApproval;
  if (!instanceId) throw runtimeError("No foundation workflow was found.", "FOUNDATION_APPROVAL_NOT_FOUND", 409);
  if (!foundationAlreadyCompleted) {
    await agent.approveFoundationWorkflow(instanceId, { approvedBy: operator, reason: "Approved in the Kairos Executive OS." });
  }

  try {
    const source = await createAndStoreAuthoritativeSource(env, runtimeProject, agentProjectId);
    const approvals = approveRuntimeApprovals(runtimeProject.approvals, operator);
    const assets = upsertById(runtimeProject.assets, {
      assetId: `asset_source_${agentProjectId}`,
      type: "authoritative_source",
      status: "verified",
      version: 1,
      checksum: source.checksum || null,
      sourceReference: source.sourceDownloadURL || `/api/production-registry/manuscripts/${encodeURIComponent(agentProjectId)}/source/download`,
      receivedAt: new Date().toISOString(),
    }, "assetId");
    const deliverables = upsertById(runtimeProject.deliverables, {
      deliverableId: `deliverable_manuscript_${agentProjectId}`,
      type: "digital_asset_manuscript",
      status: "planned",
      version: 1,
      assetIds: [`asset_source_${agentProjectId}`],
      approved: false,
    }, "deliverableId");
    const updated = await transitionRuntime(env, runtimeProject.projectId, {
      state: "queued",
      event: event("approval_granted", "queued", operator, "The foundation was approved and the authoritative source was generated and verified."),
      progress: { percent: 60, stage: "source_ready", completedUnits: 3, totalUnits: 5 },
      objective: { ...(runtimeProject.objective || {}), approved: true },
      approvals,
      assets,
      deliverables,
      queue: { ...(runtimeProject.queue || {}), status: "queued", priority: "normal", queuedAt: new Date().toISOString() },
      blockedReason: null,
      operatorIdentityHash: operator,
    });
    return {
      workflowInstanceId: instanceId,
      source,
      workflow: projectOperationalState(updated, await agent.getProjectState()),
      nextAction: "Start the approved production workflow.",
    };
  } catch (error) {
    await blockRuntimeProject(env, runtimeProject, error, operator, approveRuntimeApprovals(runtimeProject.approvals, operator));
    throw error;
  }
}

async function rejectFoundation(env, runtimeProject, agent, operator, reason) {
  const agentState = await agent.getProjectState();
  const instanceId = agentState?.pendingApproval?.workflowInstanceId || agentState?.activeWorkflow?.instanceId;
  if (!instanceId) throw runtimeError("No pending foundation approval was found.", "FOUNDATION_APPROVAL_NOT_FOUND", 409);
  await agent.rejectFoundationWorkflow(instanceId, { reason: clean(reason, 500) || "Rejected in the Kairos Executive OS." });
  const approvals = (Array.isArray(runtimeProject.approvals) ? runtimeProject.approvals : []).map((item) => ({
    ...item,
    status: item.required === false ? item.status : "rejected",
    decidedAt: new Date().toISOString(),
    identityHash: operator,
    rationale: clean(reason, 500) || "Rejected in the Kairos Executive OS.",
  }));
  const updated = await transitionRuntime(env, runtimeProject.projectId, {
    state: "planning",
    event: event("approval_rejected", "planning", operator, clean(reason, 500) || "The foundation requires revision."),
    progress: { percent: 25, stage: "revision_required", completedUnits: 1, totalUnits: 4 },
    approvals,
    blockedReason: null,
    operatorIdentityHash: operator,
  });
  return { workflowInstanceId: instanceId, workflow: projectOperationalState(updated, await agent.getProjectState()), nextAction: "Revise and resume the project foundation." };
}

async function startProduction(env, runtimeProject, agent, agentProjectId, operator) {
  const sourceReady = (Array.isArray(runtimeProject.assets) ? runtimeProject.assets : []).some((asset) => asset.type === "authoritative_source" && asset.status === "verified");
  if (!sourceReady) throw runtimeError("The authoritative source must be generated and verified before production starts.", "PRODUCTION_SOURCE_REQUIRED", 409);
  if (!Array.isArray(runtimeProject.approvals) || !runtimeProject.approvals.some((item) => item.required && item.status === "approved")) {
    throw runtimeError("The project foundation must be approved before production starts.", "PRODUCTION_APPROVAL_REQUIRED", 409);
  }
  const title = clean(runtimeProject.title, 180) || "MMG digital asset project";
  const production = await agent.startManuscriptGenerationWorkflow({ projectId: agentProjectId, title, requestedBy: operator });
  let updated = runtimeProject;
  if (runtimeProject.state === "awaiting_approval") {
    updated = await transitionRuntime(env, runtimeProject.projectId, {
      state: "queued",
      event: event("approval_granted", "queued", operator, "Production approval was confirmed."),
      approvals: approveRuntimeApprovals(runtimeProject.approvals, operator),
      queue: { ...(runtimeProject.queue || {}), status: "queued", queuedAt: new Date().toISOString() },
      operatorIdentityHash: operator,
    });
  }
  if (updated.state === "queued") {
    updated = await transitionRuntime(env, updated.projectId, {
      state: "executing",
      event: event("execution_started", "executing", operator, "The durable manuscript production workflow started."),
      progress: { percent: 65, stage: "manuscript_workflow_started", completedUnits: 3, totalUnits: 5 },
      queue: { ...(updated.queue || {}), status: "running", startedAt: new Date().toISOString(), attempt: Number(updated.queue?.attempt || 0) + 1 },
      operatorIdentityHash: operator,
    });
  }
  return {
    workflowInstanceId: production.instanceId,
    reused: production.reused === true,
    workflow: projectOperationalState(updated, production.state || await agent.getProjectState()),
    nextAction: "Kairos is generating and durably storing the manuscript production units.",
  };
}

async function createAndStoreAuthoritativeSource(env, runtimeProject, agentProjectId) {
  const objective = clean(runtimeProject.objective?.summary, 8000);
  const title = clean(runtimeProject.title, 180) || "MMG digital asset project";
  const generationPrompt = [
    "Create the authoritative production source for a Mindset Media Group digital asset.",
    "Return plain text only, with no preface or meta commentary.",
    "Produce a commercially useful initial manuscript of at least 1,500 words.",
    "Include: final working title, audience, transformation promise, structured section headings, substantive draft content, practical examples, implementation steps, conclusion, and a concise production QA checklist.",
    "Do not invent research statistics, testimonials, customer results, prices, publication status, or external actions.",
    `MMG OBJECTIVE: ${objective}`,
  ].join("\n\n");
  const modelResponse = await handleKairosAPI(new Request("https://kairos.internal/api/kairos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objective: generationPrompt,
      mode: "draft",
      department: clean(runtimeProject.department || "publishing", 120),
      projectId: agentProjectId,
      maxOutputTokens: 6000,
    }),
  }), env);
  if (!modelResponse) throw runtimeError("The Kairos model runtime did not accept the source-generation request.", "SOURCE_GENERATION_UNAVAILABLE", 503);
  const modelBody = await modelResponse.json().catch(() => ({}));
  if (!modelResponse.ok || typeof modelBody?.message !== "string") {
    throw runtimeError(modelBody?.error?.message || "Kairos could not generate the authoritative source.", modelBody?.error?.code || "SOURCE_GENERATION_FAILED", modelResponse.status || 503);
  }
  const manuscript = modelBody.message.trim();
  if (manuscript.length < 500) throw runtimeError("Kairos generated an incomplete authoritative source.", "SOURCE_GENERATION_INCOMPLETE", 502);

  const stub = registryStub(env);
  const storedResponse = await stub.fetch(new Request(`https://kairos.internal/registry/manuscripts/${encodeURIComponent(agentProjectId)}/source-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manuscript, title, filename: `${slug(title)}-authoritative-source.txt` }),
  }));
  const stored = await storedResponse.json().catch(() => ({}));
  if (!storedResponse.ok) throw runtimeError(stored?.error?.message || "The authoritative source could not be stored.", stored?.error?.code || "SOURCE_STORAGE_FAILED", storedResponse.status);
  return { ...stored.source, projectId: agentProjectId, generatedBy: modelBody?.metadata?.model || env?.KAIROS_MODEL_NAME || null };
}

async function advanceToApproval(env, project, operator) {
  let current = project;
  if (current.state === "initialized") {
    current = await transitionRuntime(env, current.projectId, {
      state: "intake",
      event: event("objective_submitted", "intake", operator, "The objective entered governed intake."),
      progress: { percent: 10, stage: "intake", completedUnits: 0, totalUnits: 4 },
      operatorIdentityHash: operator,
    });
  }
  if (current.state === "intake") {
    current = await transitionRuntime(env, current.projectId, {
      state: "objective_analysis",
      event: event("objective_analyzed", "objective_analysis", operator, "The objective contract was validated."),
      progress: { percent: 20, stage: "objective_analysis", completedUnits: 1, totalUnits: 4 },
      operatorIdentityHash: operator,
    });
  }
  if (current.state === "objective_analysis") {
    current = await transitionRuntime(env, current.projectId, {
      state: "planning",
      event: event("plan_created", "planning", operator, "The durable project foundation plan was created."),
      progress: { percent: 30, stage: "planning", completedUnits: 1, totalUnits: 4 },
      operatorIdentityHash: operator,
    });
  }
  if (current.state === "planning") {
    current = await transitionRuntime(env, current.projectId, {
      state: "awaiting_approval",
      event: event("approval_requested", "awaiting_approval", operator, "Approve the durable project foundation before execution continues."),
      progress: { percent: 50, stage: "foundation_approval_required", completedUnits: 2, totalUnits: 4 },
      operatorIdentityHash: operator,
    });
  }
  return current;
}

async function blockRuntimeProject(env, project, error, operator, approvals = project.approvals) {
  const message = error instanceof Error ? error.message : "Kairos workflow execution failed.";
  if (["archived", "cancelled"].includes(project.state)) return project;
  return transitionRuntime(env, project.projectId, {
    state: "blocked",
    event: event("blocked", "blocked", operator, message),
    blockedReason: message,
    approvals,
    operatorIdentityHash: operator,
  });
}

function projectOperationalState(workflow, agentState = {}) {
  const foundation = agentState?.activeWorkflow || null;
  const manuscript = agentState?.activeManuscriptWorkflow || null;
  const sourceReady = (Array.isArray(workflow?.assets) ? workflow.assets : []).some((asset) => asset.type === "authoritative_source" && ["verified", "stored", "ready"].includes(String(asset.status || "").toLowerCase()));
  const agentMissing = !agentState?.projectId;
  const tasks = [...(Array.isArray(workflow?.tasks) ? workflow.tasks : [])];
  if (foundation) tasks.push(agentTask("Foundation workflow", foundation));
  if (manuscript) tasks.push(agentTask("Manuscript production", manuscript));
  if (agentState?.pendingApproval) tasks.push({ id: `approval-${agentState.pendingApproval.workflowInstanceId}`, title: "Foundation approval", summary: agentState.pendingApproval.message, state: "pending", status: "pending", completed: false });

  let state = workflow?.state || "active";
  let progressPercent = Number(workflow?.progressPercent || 0);
  let nextAction = workflow?.nextAction || "Review the current workflow state.";
  let actionRequired = null;
  let canResume = false;
  let canApprove = false;
  let canReject = false;
  let canStartProduction = false;

  if (agentMissing && !["completed", "cancelled"].includes(state)) {
    state = "pending";
    actionRequired = "resume-foundation";
    canResume = true;
    nextAction = "Resume the durable project foundation workflow.";
  } else if (agentState?.lastError || String(agentState?.status || "").includes("failed")) {
    state = "blocked";
    nextAction = agentState?.lastError?.message || "Review the workflow failure before retrying.";
  } else if (manuscript?.status === "completed") {
    state = "completed";
    progressPercent = 100;
    nextAction = "Review the completed manuscript evidence and continue packaging.";
  } else if (["running", "waiting_for_approval"].includes(manuscript?.status)) {
    state = "active";
    progressPercent = Math.max(progressPercent, Math.round(Number(agentState?.progress || 0) * 100));
    nextAction = manuscript?.message || "Kairos is generating and durably storing manuscript units.";
  } else if (agentState?.pendingApproval || foundation?.status === "waiting_for_approval") {
    state = "pending";
    progressPercent = Math.max(progressPercent, 50);
    actionRequired = "approve-foundation";
    canApprove = true;
    canReject = true;
    nextAction = agentState?.pendingApproval?.message || "Approve the durable project foundation.";
  } else if (foundation?.status === "completed" || (workflow?.rawState === "queued" && sourceReady)) {
    state = "queued";
    progressPercent = Math.max(progressPercent, 60);
    actionRequired = sourceReady ? "start-production" : "prepare-source";
    canStartProduction = sourceReady;
    nextAction = sourceReady ? "Start the approved production workflow." : "Generate and verify the authoritative source.";
  } else if (foundation?.status === "running") {
    state = "active";
    progressPercent = Math.max(progressPercent, Math.round(Number(agentState?.progress || 0) * 100));
    nextAction = "Kairos is preparing the durable project foundation.";
  }

  const deliverables = [...(Array.isArray(workflow?.deliverables) ? workflow.deliverables : [])];
  if (manuscript?.status === "completed" && !deliverables.some((item) => item.id === `generated-${agentState.projectId}`)) {
    deliverables.push({ id: `generated-${agentState.projectId}`, title: "Generated manuscript", name: "Generated manuscript", type: "manuscript", status: "completed", url: `/api/production-registry/manuscripts/${encodeURIComponent(agentState.projectId)}/generation-job` });
  }

  return {
    ...workflow,
    state,
    progressPercent,
    nextAction,
    actionRequired,
    canResume,
    canApprove,
    canReject,
    canStartProduction,
    sourceReady,
    agentProjectId: agentState?.projectId || agentProjectID(workflow?.id),
    workflowInstanceId: manuscript?.instanceId || foundation?.instanceId || null,
    foundationWorkflow: foundation,
    manuscriptWorkflow: manuscript,
    pendingApproval: agentState?.pendingApproval || null,
    statusReason: agentState?.lastError?.message || workflow?.statusReason || null,
    tasks,
    deliverables,
    operationalBuild: KAIROS_OPERATIONAL_EXECUTION_BUILD,
    automaticPublicationAllowed: false,
    commerceMutationAllowed: false,
  };
}

function agentTask(title, workflow) {
  const status = clean(workflow?.status || "pending", 40);
  return {
    id: clean(workflow?.instanceId || `${title}-${status}`, 180),
    title,
    summary: clean(workflow?.message || `${title} is ${status}.`, 500),
    state: status === "completed" ? "completed" : status.includes("failed") ? "blocked" : status === "waiting_for_approval" ? "pending" : "active",
    status,
    completed: status === "completed",
    occurredAt: workflow?.updatedAt || workflow?.startedAt || null,
  };
}

async function projectAgent(env, projectId) {
  if (!env?.KAIROS_PROJECT_AGENT) throw runtimeError("The Kairos project-agent binding is unavailable.", "PROJECT_AGENT_UNAVAILABLE", 503);
  return getAgentByName(env.KAIROS_PROJECT_AGENT, projectId, { locationHint: "wnam", routingRetry: { maxAttempts: 3 } });
}

async function readRuntimeProject(env, projectId) {
  const result = await runtimeMutation(env, { operation: "read", projectId });
  if (!result?.project) throw runtimeError("Kairos runtime project was not found.", "RUNTIME_PROJECT_NOT_FOUND", 404);
  return result.project;
}

async function transitionRuntime(env, projectId, input) {
  const result = await runtimeMutation(env, { operation: "transition", projectId, input });
  return result.project;
}

async function runtimeMutation(env, payload) {
  const response = await registryStub(env).fetch(new Request(`https://kairos.internal${RUNTIME_PROJECT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw runtimeError(body?.error?.message || "Kairos runtime storage operation failed.", body?.error?.code || "RUNTIME_STORAGE_FAILED", response.status);
  return body;
}

function registryStub(env) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) throw runtimeError("Kairos runtime project storage is unavailable.", "RUNTIME_STORAGE_UNAVAILABLE", 503);
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
}

function approveRuntimeApprovals(value, operator) {
  const now = new Date().toISOString();
  return (Array.isArray(value) ? value : []).map((item) => ({
    ...item,
    status: item.required === false ? item.status : "approved",
    decidedAt: now,
    identityHash: operator,
    rationale: "Approved in the Kairos Executive OS.",
  }));
}

function event(type, state, actorIdentityHash, summary) {
  return { type, state, actorIdentityHash, summary, occurredAt: new Date().toISOString(), evidenceIds: [] };
}

function upsertById(value, item, key) {
  const list = Array.isArray(value) ? value.slice() : [];
  const index = list.findIndex((entry) => entry?.[key] === item[key]);
  if (index >= 0) list[index] = { ...list[index], ...item };
  else list.push(item);
  return list;
}

function assertOperationalBindings(env) {
  const readiness = operationalReadiness(env);
  if (readiness.status >= 400) throw runtimeError("Kairos operational bindings are incomplete.", "OPERATIONAL_BINDINGS_INCOMPLETE", 503);
}

function agentProjectID(runtimeProjectId) {
  const value = clean(runtimeProjectId, 180).toLowerCase().replace(/_/g, "-").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 128);
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(value)) throw runtimeError("The Kairos project identifier could not be normalized for the project Agent.", "PROJECT_AGENT_ID_INVALID", 400);
  return value;
}

function hubTitle(action, objective) {
  if (action === "growth-plan") return "MMG growth-plan production";
  if (action === "revenue-intelligence") return "MMG revenue intelligence review";
  return objective.length > 96 ? `${objective.slice(0, 93)}…` : objective;
}

function browserIdentityHash(request) {
  const identity = clean(request.headers.get("cf-access-authenticated-user-email") || request.headers.get("x-kairos-operator") || "kairos-dashboard-operator", 320).toLowerCase();
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function slug(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "mmg-digital-asset";
}

function methodNotAllowed(allowed) {
  return stamp(json({ error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405));
}

function failure(error, fallbackCode, fallbackMessage) {
  return json({
    status: "failed",
    error: {
      code: error?.code || fallbackCode,
      message: error instanceof Error ? error.message : fallbackMessage,
      retriable: Number(error?.status || 500) >= 500,
    },
    automaticPublicationAllowed: false,
    commerceMutationAllowed: false,
    build: KAIROS_OPERATIONAL_EXECUTION_BUILD,
  }, Number(error?.status || 503));
}

function runtimeError(message, code = "OPERATIONAL_EXECUTION_FAILED", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Operational-Execution", KAIROS_OPERATIONAL_EXECUTION_BUILD);
  headers.set("X-Kairos-Automatic-Publication", "disabled");
  headers.set("X-Kairos-Commerce-Mutation", "approval-gated");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Operational-Execution": KAIROS_OPERATIONAL_EXECUTION_BUILD,
      "X-Kairos-Automatic-Publication": "disabled",
      "X-Kairos-Commerce-Mutation": "approval-gated",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}
