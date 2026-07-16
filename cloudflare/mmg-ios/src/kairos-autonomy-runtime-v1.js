import { inferenceRuntime, parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";
import { ledgerBatchUpsert, ledgerGet, ledgerList, ledgerUpsert } from "./kairos-operational-runtime-v1.js";
import { classifyNativeTask, executeNativeTask, KAIROS_NATIVE_TASK_EXECUTION_BUILD } from "./kairos-native-task-execution-v1.js";

export const KAIROS_AUTONOMY_BUILD = "kairos-autonomy-runtime-20260716-2";
const CONTROL_OBJECT = "kairos-intelligence-control-v1";
const OPEN_STATES = new Set(["ready", "active"]);
const TERMINAL_TASK_STATES = new Set(["completed", "cancelled"]);

export const KAIROS_AUTONOMY_POLICY = Object.freeze({
  mode: "verified-native-intelligent-autonomy",
  automaticCapabilities: Object.freeze([
    "read-authoritative-state",
    "prioritize-durable-work",
    "start-eligible-internal-workflows",
    "produce-grounded-native-analysis-deliverables",
    "execute-safe-internal-domain-deliverables",
    "verify-durable-artifact-readback-before-completion",
    "preserve-decisions-and-receipts",
  ]),
  approvalRequired: Object.freeze([
    "external-publication",
    "customer-communication",
    "spending-or-billing",
    "destructive-change",
    "permission-or-access-change",
    "live-storefront-mutation",
  ]),
  prohibited: Object.freeze([
    "fabricate-evidence",
    "bypass-approval",
    "claim-unverified-completion",
    "expand-constitutional-authority",
  ]),
});

export async function handleAutonomyRequest(request, env, delegate) {
  const url = new URL(request.url);
  if (url.pathname === "/api/autonomy/status" && request.method === "GET") return autonomyStatus(env);
  if (url.pathname === "/api/autonomy/cycles" && request.method === "GET") {
    const cycles = await ledgerList(env, "autonomy-cycles", 50);
    return json({ status: "ready", build: KAIROS_AUTONOMY_BUILD, cycles });
  }
  if (url.pathname === "/api/autonomy/decisions" && request.method === "GET") {
    const decisions = await ledgerList(env, "autonomy-decisions", 100);
    return json({ status: "ready", build: KAIROS_AUTONOMY_BUILD, decisions });
  }
  if (url.pathname === "/api/autonomy/artifacts" && request.method === "GET") {
    const artifacts = await ledgerList(env, "native-task-artifacts", 200);
    return json({ status: "ready", build: KAIROS_AUTONOMY_BUILD, nativeExecutionBuild: KAIROS_NATIVE_TASK_EXECUTION_BUILD, artifacts });
  }
  const artifactMatch = url.pathname.match(/^\/api\/autonomy\/artifacts\/([^/]+)$/);
  if (artifactMatch && request.method === "GET") {
    const artifact = await ledgerGet(env, "native-task-artifacts", decodeURIComponent(artifactMatch[1]));
    return artifact ? json({ status: "ready", build: KAIROS_AUTONOMY_BUILD, artifact }) : json({ status: "not-found", error: { code: "native_artifact_not_found", message: "Native execution artifact not found." } }, 404);
  }
  if (url.pathname === "/api/autonomy/run" && request.method === "POST") {
    const payload = await safeBody(request);
    const targetWorkflowID = clean(payload?.workflowID, 220) || null;
    const cycle = await runAutonomyCycle(env, {
      source: clean(payload?.source || "manual-bounded-cycle", 160),
      targetWorkflowID,
      claimScope: targetWorkflowID ? `workflow-${targetWorkflowID}` : null,
      delegate,
    });
    return json(cycle, cycle.status === "disabled" ? 503 : cycle.status === "failed" ? 502 : cycle.status === "deferred" ? 202 : 200);
  }
  return null;
}

export async function runAutonomyCycle(env, options = {}) {
  if (!autonomyEnabled(env)) {
    return { status: "disabled", build: KAIROS_AUTONOMY_BUILD, policy: KAIROS_AUTONOMY_POLICY, message: "Kairos bounded autonomy is disabled." };
  }
  if (!env?.KAIROS_PROJECTS) {
    return { status: "failed", build: KAIROS_AUTONOMY_BUILD, error: { code: "autonomy_ledger_unavailable", message: "Kairos durable operational storage is unavailable." } };
  }

  const source = clean(options.source || "scheduled", 160);
  const targetWorkflowID = clean(options.targetWorkflowID, 220) || null;
  const claimScope = clean(options.claimScope, 220) || (targetWorkflowID ? `workflow-${targetWorkflowID}` : "operational-cycle");
  const claim = await claimCycle(env, source, claimScope, options.minimumIntervalMs);
  if (claim.status !== "claimed") return { status: "deferred", build: KAIROS_AUTONOMY_BUILD, source, claim, policy: KAIROS_AUTONOMY_POLICY };

  const cycleID = `autonomy-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  try {
    const snapshot = await gatherSnapshot(env, options.delegate, targetWorkflowID);
    const plan = snapshot.candidates.length ? await buildDecisionPlan(env, snapshot) : emptyDecisionPlan(targetWorkflowID);
    const applied = [];
    const preserved = [];
    const maximum = Math.max(1, Math.min(10, Number(env.KAIROS_AUTONOMY_MAX_WORKFLOWS_PER_CYCLE || 3)));
    let nativeTaskBudget = Math.max(1, Math.min(5, Number(env.KAIROS_AUTONOMY_MAX_NATIVE_TASKS_PER_CYCLE || 5)));
    const perWorkflowMaximum = Math.max(1, Math.min(5, Number(env.KAIROS_AUTONOMY_MAX_TASKS_PER_WORKFLOW_PER_CYCLE || 5)));

    for (const initialDecision of plan.decisions.slice(0, maximum)) {
      const workflow = snapshot.workflowRecords.get(initialDecision.workflowID);
      if (!workflow) continue;
      const executionClaim = await claimCycle(env, source, `execution-${workflow.id}`, 60_000);
      if (executionClaim.status !== "claimed") continue;
      const workItem = workflow.workItemID ? snapshot.workItemRecords.get(workflow.workItemID) || null : null;
      let decision = initialDecision;
      let workflowTasksApplied = 0;
      while (decision && nativeTaskBudget > 0 && workflowTasksApplied < perWorkflowMaximum) {
        const result = await applyDecision(env, workflow, workItem, decision, cycleID, new Date().toISOString(), snapshot.publicSnapshot);
        preserved.push(result.decision);
        if (!result.applied) break;
        applied.push(result.applied);
        nativeTaskBudget -= 1;
        workflowTasksApplied += 1;
        decision = continuationDecision(workflow, workItem, result.applied);
        if (decision && decision.action !== "execute-native") {
          const boundary = await applyDecision(env, workflow, workItem, decision, cycleID, new Date().toISOString(), snapshot.publicSnapshot);
          preserved.push(boundary.decision);
          break;
        }
      }
      if (nativeTaskBudget <= 0) break;
    }

    const completedAt = new Date().toISOString();
    const cycle = {
      id: cycleID,
      status: "completed",
      build: KAIROS_AUTONOMY_BUILD,
      source,
      claimID: claim.id,
      startedAt,
      completedAt,
      updatedAt: completedAt,
      inference: plan.inference,
      nativeExecutionBuild: KAIROS_NATIVE_TASK_EXECUTION_BUILD,
      summary: plan.summary,
      snapshot: snapshot.publicSnapshot,
      candidateWorkflows: snapshot.candidates.length,
      decisionsPreserved: preserved.length,
      actionsApplied: applied.length,
      applied,
      recommendations: plan.recommendations,
      verification: plan.verification,
      safeguards: KAIROS_AUTONOMY_POLICY,
    };
    await ledgerUpsert(env, "autonomy-cycles", cycleID, cycle);
    return cycle;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const cycle = {
      id: cycleID,
      status: "failed",
      build: KAIROS_AUTONOMY_BUILD,
      source,
      claimID: claim.id,
      startedAt,
      completedAt: failedAt,
      updatedAt: failedAt,
      error: { code: error?.code || "autonomy_cycle_failed", message: safeMessage(error) },
      safeguards: KAIROS_AUTONOMY_POLICY,
    };
    await ledgerUpsert(env, "autonomy-cycles", cycleID, cycle);
    return cycle;
  }
}

async function autonomyStatus(env) {
  const [cycles, decisions, artifacts] = await Promise.all([
    ledgerList(env, "autonomy-cycles", 50),
    ledgerList(env, "autonomy-decisions", 100),
    ledgerList(env, "native-task-artifacts", 200),
  ]);
  const enabled = autonomyEnabled(env);
  return json({
    status: enabled ? "operational" : "disabled",
    build: KAIROS_AUTONOMY_BUILD,
    enabled,
    mode: KAIROS_AUTONOMY_POLICY.mode,
    schedule: "event-driven execution · 15-minute recovery cycle",
    intelligence: inferenceRuntime(env),
    policy: KAIROS_AUTONOMY_POLICY,
    nativeExecutionBuild: KAIROS_NATIVE_TASK_EXECUTION_BUILD,
    counts: { cycles: cycles.length, decisions: decisions.length, verifiedNativeArtifacts: artifacts.filter(value => value?.status === "verified").length },
    lastCycle: cycles[0] || null,
  }, enabled ? 200 : 503);
}

async function gatherSnapshot(env, delegate, targetWorkflowID = null) {
  const [workflows, workItems, receipts, artifacts, readiness, health] = await Promise.all([
    ledgerList(env, "workflows", 500),
    ledgerList(env, "work-items", 500),
    ledgerList(env, "execution-receipts", 100),
    ledgerList(env, "native-task-artifacts", 200),
    delegateJSON(delegate, "/api/readiness-registry"),
    delegateJSON(delegate, "/api/health"),
  ]);
  const workItemRecords = new Map(workItems.filter(value => value?.id).map(value => [value.id, value]));
  const candidates = workflows
    .filter(workflow => workflow?.id && OPEN_STATES.has(workflow.state))
    .filter(workflow => !targetWorkflowID || workflow.id === targetWorkflowID)
    .sort(compareWorkflows)
    .slice(0, 30)
    .map(workflow => {
      const workItem = workflow.workItemID ? workItemRecords.get(workflow.workItemID) || null : null;
      return {
        id: workflow.id,
        title: clean(workflow.title, 240),
        objective: clean(workflow.objective, 1000),
        state: workflow.state,
        priority: workflow.priority || "normal",
        owner: workflow.owner || "Kairos",
        action: workItem?.action || null,
        approvalRequired: Boolean(workflow.approvalRequired),
        approvalStatus: workflow.approvalStatus || "not-required",
        progress: Number(workflow.progress || 0),
        tasks: (workflow.tasks || []).map(task => {
          const classification = classifyNativeTask(workflow, task, workItem);
          return {
            id: task.id,
            title: clean(task.title, 240),
            description: clean(task.description, 1000),
            state: task.state,
            stage: classification.stage,
            executionClass: classification.executionClass,
            automaticEligible: classification.automaticEligible,
            approvalRequired: classification.approvalRequired,
            eligibilityReason: classification.reason,
          };
        }),
      };
    });
  return {
    candidates,
    workflowRecords: new Map(workflows.filter(value => value?.id).map(value => [value.id, value])),
    workItemRecords,
    publicSnapshot: {
      capturedAt: new Date().toISOString(),
      workflows: workflows.length,
      workItems: workItems.length,
      recentExecutionReceipts: receipts.length,
      verifiedNativeArtifacts: artifacts.filter(value => value?.status === "verified").length,
      readyWorkflows: workflows.filter(value => value.state === "ready").length,
      activeWorkflows: workflows.filter(value => value.state === "active").length,
      pendingApprovals: workflows.filter(value => value.approvalRequired && value.approvalStatus !== "approved" && !["completed", "cancelled"].includes(value.state)).length,
      readiness: compact(readiness),
      health: compact(health),
    },
  };
}

async function buildDecisionPlan(env, snapshot) {
  const fallback = deterministicPlan(snapshot, "deterministic-policy-fallback");
  const hasAutomaticWork = snapshot.candidates.some(workflow => workflow.tasks.find(task => !TERMINAL_TASK_STATES.has(task.state))?.automaticEligible);
  if (!hasAutomaticWork) return deterministicPlan(snapshot, "enhanced-inference-not-required-for-approval-or-hold");
  const runtime = inferenceRuntime(env);
  if (!runtime.configured) return fallback;
  try {
    const generated = await runKairosIntelligence(env, {
      purpose: "autonomy-cycle",
      temperature: 0.1,
      maxTokens: 2400,
      system: "You are Kairos, the verified native MMG operating intelligence. Return strict JSON only with keys summary, decisions, recommendations, verification. Each decision must contain workflowID, action, rationale, confidence. action must be execute-native, request-approval, or hold. Choose execute-native only when the candidate's next open task has automaticEligible true. Native execution must produce and durably verify a grounded internal deliverable before the task can complete. Never authorize external publication, customer communication, spending, billing, destructive changes, permissions, access changes, or live storefront mutations. Never claim an execution occurred without an authoritative artifact and read-back receipt.",
      user: JSON.stringify({ policy: KAIROS_AUTONOMY_POLICY, operatingState: snapshot.publicSnapshot, candidateWorkflows: snapshot.candidates }),
    });
    const parsed = parseStrictJSON(generated.text);
    const byID = new Map(snapshot.candidates.map(value => [value.id, value]));
    const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions.map(value => normalizeDecision(value, byID)).filter(Boolean) : [];
    if (!decisions.length && snapshot.candidates.length) throw new Error("Enhanced inference returned no valid bounded decisions.");
    const decided = new Set(decisions.map(value => value.workflowID));
    for (const candidate of snapshot.candidates) {
      if (!decided.has(candidate.id)) decisions.push(deterministicDecision(candidate));
    }
    return {
      summary: clean(parsed?.summary, 3000) || "Kairos evaluated the durable operating queue.",
      decisions,
      recommendations: normalizeStrings(parsed?.recommendations, 10, 1000),
      verification: normalizeStrings(parsed?.verification, 10, 1000),
      inference: { status: "operational", mode: generated.runtime, provider: generated.provider, model: generated.model, privacy: generated.privacy, fallbackReason: null },
    };
  } catch (error) {
    return deterministicPlan(snapshot, clean(error?.code || error?.message || "enhanced-inference-failed", 300));
  }
}

function deterministicPlan(snapshot, fallbackReason) {
  const decisions = snapshot.candidates.map(deterministicDecision);
  return {
    summary: "Kairos evaluated the durable queue with its constitutional bounded-autonomy policy.",
    decisions,
    recommendations: ["Present pending approvals and domain-execution requirements in the Work Queue."],
    verification: ["Every automatic transition must have a verified native artifact, durable read-back, decision, and execution receipt."],
    inference: { status: "fallback", mode: "deterministic-native", provider: "kairos-native", model: null, privacy: "local-deterministic-processing", fallbackReason },
  };
}

function normalizeDecision(value, candidates) {
  const workflowID = clean(value?.workflowID, 220);
  const workflow = candidates.get(workflowID);
  if (!workflow) return null;
  let action = clean(value?.action, 60).toLowerCase().replaceAll("_", "-");
  if (action === "advance-internal") action = "execute-native";
  if (!new Set(["execute-native", "request-approval", "hold"]).has(action)) action = "hold";
  const nextTask = workflow.tasks.find(task => !TERMINAL_TASK_STATES.has(task.state));
  if (workflow.approvalRequired && workflow.approvalStatus !== "approved") action = "request-approval";
  else if (nextTask?.automaticEligible) action = "execute-native";
  else if (action === "execute-native") action = nextTask?.approvalRequired ? "request-approval" : "hold";
  return {
    workflowID,
    action,
    rationale: clean(value?.rationale, 1600) || "Kairos applied the bounded-autonomy policy.",
    confidence: Math.max(0, Math.min(1, Number(value?.confidence || 0.5))),
  };
}

function deterministicDecision(workflow) {
  if (workflow.approvalRequired && workflow.approvalStatus !== "approved") {
    return { workflowID: workflow.id, action: "request-approval", rationale: "The workflow has a constitutional approval gate that Kairos cannot bypass.", confidence: 1 };
  }
  const task = workflow.tasks.find(value => !TERMINAL_TASK_STATES.has(value.state));
  return task?.automaticEligible
    ? { workflowID: workflow.id, action: "execute-native", rationale: `Produce and verify the grounded native deliverable for: ${task.title}.`, confidence: 0.9 }
    : task?.approvalRequired
      ? { workflowID: workflow.id, action: "request-approval", rationale: `${task.title} crosses an approval boundary: ${task.eligibilityReason}.`, confidence: 1 }
      : { workflowID: workflow.id, action: "hold", rationale: "The next task is not eligible for verified native execution; domain evidence or a classified execution path is required.", confidence: 0.98 };
}

function continuationDecision(workflow, workItem, applied) {
  const task = (workflow.tasks || []).find(value => !TERMINAL_TASK_STATES.has(value.state));
  if (!task || workflow.state === "completed") return null;
  const classification = classifyNativeTask(workflow, task, workItem);
  return classification.automaticEligible
    ? { workflowID: workflow.id, action: "execute-native", rationale: `Continue the governed lifecycle after verified read-back of ${applied.artifactID}; produce ${task.title}.`, confidence: 1 }
    : classification.approvalRequired
      ? { workflowID: workflow.id, action: "request-approval", rationale: `${task.title} reached the constitutional boundary: ${classification.reason}.`, confidence: 1 }
      : { workflowID: workflow.id, action: "hold", rationale: `${task.title} is not eligible for native automatic execution: ${classification.reason}.`, confidence: 1 };
}

function emptyDecisionPlan(targetWorkflowID) {
  return {
    summary: targetWorkflowID ? "The targeted workflow has no open native-eligible work." : "The operating queue has no open native-eligible work.",
    decisions: [],
    recommendations: [],
    verification: ["No workflow or task state was changed."],
    inference: { status: "not-required", mode: "deterministic-native", provider: "kairos-native", model: null, privacy: "local-deterministic-processing", fallbackReason: null },
  };
}

async function applyDecision(env, workflow, workItem, decision, cycleID, decidedAt, operatingSnapshot) {
  const decisionID = `autonomy-decision-${crypto.randomUUID()}`;
  const preserved = {
    id: decisionID,
    cycleID,
    workflowID: workflow.id,
    action: decision.action,
    rationale: decision.rationale,
    confidence: decision.confidence,
    status: "preserved",
    decidedAt,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    authority: KAIROS_AUTONOMY_POLICY.mode,
  };

  let applied = null;
  const task = (workflow.tasks || []).find(value => !TERMINAL_TASK_STATES.has(value.state));
  if (decision.action === "execute-native" && task && (!workflow.approvalRequired || workflow.approvalStatus === "approved")) {
    try {
      const execution = await executeNativeTask(env, { workflow, task, workItem, cycleID, decisionID, operatingSnapshot });
      if (execution.status !== "verified") {
        preserved.status = "blocked";
        preserved.blockedReason = execution.reason;
        preserved.classification = execution.classification;
      } else {
        const artifact = execution.artifact;
        const completedAt = new Date().toISOString();
        if (workflow.state === "ready") {
          workflow.state = "active";
          workflow.startedAt ||= completedAt;
        }
        task.state = "completed";
        task.completedAt = completedAt;
        task.updatedAt = completedAt;
        task.stage = artifact.stage;
        task.executionClass = artifact.executionClass;
        task.nativeOutput = {
          artifactID: artifact.id,
          status: artifact.status,
          stage: artifact.stage,
          summary: artifact.summary,
          deliverable: artifact.deliverable,
          findings: artifact.findings,
          evidenceReferences: artifact.evidenceReferences,
          verification: artifact.verification,
          nextAction: artifact.nextAction,
          contentHash: artifact.contentHash,
        };
        task.executionEvidence = {
          source: cycleID,
          decisionID,
          artifactID: artifact.id,
          contentHash: artifact.contentHash,
          kind: "verified-native-task-execution",
          rationale: decision.rationale,
          authoritativeStateRead: true,
          artifactReadbackVerified: true,
          externalActionTaken: false,
          liveMutationPerformed: false,
          recordedAt: completedAt,
        };
        workflow.updatedAt = completedAt;
        refreshWorkflow(workflow);
        if (workflow.progress === 100) {
          workflow.state = "completed";
          workflow.completedAt = completedAt;
          workflow.nextAction = "Review verified native deliverables and execution receipts";
        }
        let workItemUpdate = null;
        if (workItem?.id) {
          const artifactIDs = [...new Set([...(Array.isArray(workItem.nativeArtifactIDs) ? workItem.nativeArtifactIDs : []), artifact.id])];
          const completed = workflow.state === "completed";
          workItemUpdate = {
            ...workItem,
            state: completed ? "completed" : "active",
            status: completed ? "completed" : "active",
            operation: completed ? "autonomous-native-execution-completed" : "autonomous-native-execution",
            nativeArtifactIDs: artifactIDs,
            latestNativeOutput: task.nativeOutput,
            completedAt: completed ? completedAt : workItem.completedAt || null,
            updatedAt: completedAt,
            nextAction: artifact.nextAction || workflow.nextAction,
            evidence: {
              ...(workItem.evidence || {}),
              lastNativeArtifactID: artifact.id,
              nativeArtifactReadbackVerified: true,
              externalActionTaken: false,
              inventedData: false,
            },
          };
        }

        const receiptID = `receipt-${crypto.randomUUID()}`;
        const receipt = {
          id: receiptID,
          cycleID,
          decisionID,
          workflowID: workflow.id,
          workItemID: workItem?.id || null,
          taskID: task.id,
          artifactID: artifact.id,
          contentHash: artifact.contentHash,
          status: "completed",
          operation: `verified-native-${artifact.stage}`,
          artifactReadbackVerified: true,
          externalActionTaken: false,
          liveMutationPerformed: false,
          evidence: task.executionEvidence,
          createdAt: completedAt,
          updatedAt: completedAt,
        };
        preserved.status = "applied";
        preserved.appliedAt = completedAt;
        preserved.taskID = task.id;
        preserved.artifactID = artifact.id;
        preserved.receiptID = receiptID;
        preserved.updatedAt = completedAt;

        await ledgerBatchUpsert(env, [
          { collection: "workflows", id: workflow.id, value: workflow },
          ...(workItemUpdate ? [{ collection: "work-items", id: workItem.id, value: workItemUpdate }] : []),
          { collection: "execution-receipts", id: receiptID, value: receipt },
          { collection: "autonomy-decisions", id: decisionID, value: preserved },
        ]);
        const [workflowReadback, workItemReadback, receiptReadback, decisionReadback] = await Promise.all([
          ledgerGet(env, "workflows", workflow.id),
          workItemUpdate ? ledgerGet(env, "work-items", workItem.id) : Promise.resolve(null),
          ledgerGet(env, "execution-receipts", receiptID),
          ledgerGet(env, "autonomy-decisions", decisionID),
        ]);
        const verifiedTask = workflowReadback?.tasks?.find(value => value.id === task.id);
        if (verifiedTask?.state !== "completed" || verifiedTask?.nativeOutput?.artifactID !== artifact.id) throw new Error("Kairos could not read back the completed native workflow task.");
        if (workItemUpdate && workItemReadback?.evidence?.nativeArtifactReadbackVerified !== true) throw new Error("Kairos could not verify the native work-item read-back.");
        if (receiptReadback?.artifactID !== artifact.id || receiptReadback?.artifactReadbackVerified !== true) throw new Error("Kairos could not verify the native execution receipt.");
        if (decisionReadback?.status !== "applied" || decisionReadback?.artifactID !== artifact.id) throw new Error("Kairos could not verify the native execution decision.");
        if (workItemUpdate) Object.assign(workItem, workItemUpdate);

        applied = {
          workflowID: workflow.id,
          workItemID: workItem?.id || null,
          taskID: task.id,
          taskTitle: task.title,
          stage: artifact.stage,
          artifactID: artifact.id,
          contentHash: artifact.contentHash,
          receiptID,
          state: workflow.state,
          progress: workflow.progress,
          artifactReadbackVerified: true,
          atomicCommitVerified: true,
          externalActionTaken: false,
        };
      }
    } catch (error) {
      preserved.status = "blocked";
      preserved.blockedReason = clean(error?.code || error?.message || "verified-native-task-execution-failed", 1200);
      if (task.state === "completed" && !applied) {
        const blockedAt = new Date().toISOString();
        task.state = "blocked";
        task.completedAt = null;
        task.updatedAt = blockedAt;
        task.blockedReason = preserved.blockedReason;
        workflow.state = "blocked";
        workflow.blockedReason = preserved.blockedReason;
        workflow.updatedAt = blockedAt;
        refreshWorkflow(workflow);
        await ledgerUpsert(env, "workflows", workflow.id, workflow);
      }
    }
  }
  await ledgerUpsert(env, "autonomy-decisions", decisionID, preserved);
  return { decision: preserved, applied };
}

function refreshWorkflow(workflow) {
  const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
  const completedTasks = tasks.filter(task => TERMINAL_TASK_STATES.has(task.state)).length;
  workflow.taskCount = tasks.length;
  workflow.completedTasks = completedTasks;
  workflow.progress = tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0;
  const next = tasks.find(task => !TERMINAL_TASK_STATES.has(task.state));
  workflow.nextAction = next?.title || "Review completion evidence";
}

async function claimCycle(env, source, scope = "operational-cycle", requestedMinimumIntervalMs = null) {
  const minimumIntervalMs = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(requestedMinimumIntervalMs || env.KAIROS_AUTONOMY_MIN_INTERVAL_MS || 15 * 60 * 1000)));
  const response = await controlStub(env).fetch(new Request("https://kairos.internal/control/autonomy/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, source, minimumIntervalMs }),
  }));
  const body = await safeResponseJSON(response);
  if (response.status === 409) return body;
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || "Kairos could not claim the autonomous cycle."), { code: body?.error?.code || "autonomy_claim_failed" });
  return body;
}

function controlStub(env) {
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(CONTROL_OBJECT));
}

function autonomyEnabled(env) {
  return String(env?.KAIROS_AUTONOMY_ENABLED || "").trim().toLowerCase() === "true";
}

function compareWorkflows(left, right) {
  const priority = { critical: 0, high: 1, normal: 2, low: 3 };
  return (priority[left.priority] ?? 2) - (priority[right.priority] ?? 2) || Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0);
}

async function delegateJSON(delegate, path) {
  if (!delegate) return null;
  try {
    const response = await delegate(new Request(`https://kairos.internal${path}`, { method: "GET" }));
    return await response.clone().json();
  } catch { return null; }
}

function compact(value) {
  if (!value || typeof value !== "object") return value ?? null;
  const text = JSON.stringify(value);
  if (text.length <= 20_000) return value;
  return { status: value.status || null, build: value.build || null, keys: Object.keys(value).slice(0, 40), truncated: true };
}

function normalizeStrings(value, limit, maximum) {
  return Array.isArray(value) ? value.slice(0, limit).map(item => clean(typeof item === "string" ? item : item?.rationale || item?.summary, maximum)).filter(Boolean) : [];
}

function clean(value, maximum) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maximum); }
function safeMessage(error) { return error instanceof Error ? error.message.slice(0, 1600) : "Kairos autonomy encountered an unexpected error."; }
async function safeBody(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Autonomy": KAIROS_AUTONOMY_BUILD, "X-Content-Type-Options": "nosniff" } }); }
