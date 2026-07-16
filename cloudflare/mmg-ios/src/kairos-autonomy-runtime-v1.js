import { inferenceRuntime, parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";
import { ledgerGet, ledgerList, ledgerUpsert } from "./kairos-operational-runtime-v1.js";

export const KAIROS_AUTONOMY_BUILD = "kairos-autonomy-runtime-20260715-1";
const CONTROL_OBJECT = "kairos-intelligence-control-v1";
const OPEN_STATES = new Set(["ready", "active"]);
const TERMINAL_TASK_STATES = new Set(["completed", "cancelled"]);

export const KAIROS_AUTONOMY_POLICY = Object.freeze({
  mode: "bounded-supervised-autonomy",
  automaticCapabilities: Object.freeze([
    "read-authoritative-state",
    "prioritize-durable-work",
    "start-eligible-internal-workflows",
    "complete-evidence-backed-analysis-steps",
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
  if (url.pathname === "/api/autonomy/run" && request.method === "POST") {
    const payload = await safeBody(request);
    const cycle = await runAutonomyCycle(env, {
      source: clean(payload?.source || "manual-bounded-cycle", 160),
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
  const claim = await claimCycle(env, source);
  if (claim.status !== "claimed") return { status: "deferred", build: KAIROS_AUTONOMY_BUILD, source, claim, policy: KAIROS_AUTONOMY_POLICY };

  const cycleID = `autonomy-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  try {
    const snapshot = await gatherSnapshot(env, options.delegate);
    const plan = await buildDecisionPlan(env, snapshot);
    const applied = [];
    const preserved = [];
    const maximum = Math.max(1, Math.min(10, Number(env.KAIROS_AUTONOMY_MAX_WORKFLOWS_PER_CYCLE || 3)));

    for (const decision of plan.decisions.slice(0, maximum)) {
      const workflow = snapshot.workflowRecords.get(decision.workflowID);
      if (!workflow) continue;
      const result = await applyDecision(env, workflow, decision, cycleID, startedAt);
      preserved.push(result.decision);
      if (result.applied) applied.push(result.applied);
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
  const [cycles, decisions] = await Promise.all([
    ledgerList(env, "autonomy-cycles", 50),
    ledgerList(env, "autonomy-decisions", 100),
  ]);
  const enabled = autonomyEnabled(env);
  return json({
    status: enabled ? "operational" : "disabled",
    build: KAIROS_AUTONOMY_BUILD,
    enabled,
    mode: KAIROS_AUTONOMY_POLICY.mode,
    schedule: "Cloudflare Cron Trigger · twice daily",
    intelligence: inferenceRuntime(env),
    policy: KAIROS_AUTONOMY_POLICY,
    counts: { cycles: cycles.length, decisions: decisions.length },
    lastCycle: cycles[0] || null,
  }, enabled ? 200 : 503);
}

async function gatherSnapshot(env, delegate) {
  const [workflows, workItems, receipts, readiness, health] = await Promise.all([
    ledgerList(env, "workflows", 500),
    ledgerList(env, "work-items", 500),
    ledgerList(env, "execution-receipts", 100),
    delegateJSON(delegate, "/api/readiness-registry"),
    delegateJSON(delegate, "/api/health"),
  ]);
  const candidates = workflows
    .filter(workflow => workflow?.id && OPEN_STATES.has(workflow.state))
    .sort(compareWorkflows)
    .slice(0, 30)
    .map(workflow => ({
      id: workflow.id,
      title: clean(workflow.title, 240),
      objective: clean(workflow.objective, 1000),
      state: workflow.state,
      priority: workflow.priority || "normal",
      owner: workflow.owner || "Kairos",
      approvalRequired: Boolean(workflow.approvalRequired),
      approvalStatus: workflow.approvalStatus || "not-required",
      progress: Number(workflow.progress || 0),
      tasks: (workflow.tasks || []).map(task => ({ id: task.id, title: clean(task.title, 240), state: task.state })),
    }));
  return {
    candidates,
    workflowRecords: new Map(workflows.filter(value => value?.id).map(value => [value.id, value])),
    publicSnapshot: {
      capturedAt: new Date().toISOString(),
      workflows: workflows.length,
      workItems: workItems.length,
      recentExecutionReceipts: receipts.length,
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
  const runtime = inferenceRuntime(env);
  if (!runtime.configured) return fallback;
  try {
    const generated = await runKairosIntelligence(env, {
      purpose: "autonomy-cycle",
      temperature: 0.1,
      maxTokens: 2200,
      system: "You are Kairos, the bounded MMG operating intelligence. Return strict JSON only with keys summary, decisions, recommendations, verification. Each decision must contain workflowID, action, rationale, confidence. action must be advance-internal, request-approval, or hold. You may advance only evidence-backed internal Observe, Understand, or Decide tasks. Never authorize external publication, customer communication, spending, billing, destructive changes, permissions, access changes, or live storefront mutations. Never claim an execution occurred without authoritative evidence.",
      user: JSON.stringify({ policy: KAIROS_AUTONOMY_POLICY, operatingState: snapshot.publicSnapshot, candidateWorkflows: snapshot.candidates }),
    });
    const parsed = parseStrictJSON(generated.text);
    const byID = new Map(snapshot.candidates.map(value => [value.id, value]));
    const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions.map(value => normalizeDecision(value, byID)).filter(Boolean) : [];
    if (!decisions.length && snapshot.candidates.length) throw new Error("Enhanced inference returned no valid bounded decisions.");
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
  const decisions = snapshot.candidates.map(workflow => {
    if (workflow.approvalRequired && workflow.approvalStatus !== "approved") {
      return { workflowID: workflow.id, action: "request-approval", rationale: "The workflow has a constitutional approval gate that Kairos cannot bypass.", confidence: 1 };
    }
    const task = workflow.tasks.find(value => !TERMINAL_TASK_STATES.has(value.state) && internalAnalysisTitle(value.title));
    return task
      ? { workflowID: workflow.id, action: "advance-internal", rationale: `Advance the evidence-backed internal analysis step: ${task.title}.`, confidence: 0.9 }
      : { workflowID: workflow.id, action: "hold", rationale: "No eligible internal analysis step remains; domain execution or verified evidence is required.", confidence: 0.98 };
  });
  return {
    summary: "Kairos evaluated the durable queue with its constitutional bounded-autonomy policy.",
    decisions,
    recommendations: ["Present pending approvals and domain-execution requirements in the Work Queue."],
    verification: ["Every automatic transition must have a durable decision and execution receipt."],
    inference: { status: "fallback", mode: "deterministic-native", provider: "kairos-native", model: null, privacy: "local-deterministic-processing", fallbackReason },
  };
}

function normalizeDecision(value, candidates) {
  const workflowID = clean(value?.workflowID, 220);
  const workflow = candidates.get(workflowID);
  if (!workflow) return null;
  let action = clean(value?.action, 60).toLowerCase().replaceAll("_", "-");
  if (!new Set(["advance-internal", "request-approval", "hold"]).has(action)) action = "hold";
  if (workflow.approvalRequired && workflow.approvalStatus !== "approved") action = "request-approval";
  if (action === "advance-internal" && !workflow.tasks.some(task => !TERMINAL_TASK_STATES.has(task.state) && internalAnalysisTitle(task.title))) action = "hold";
  return {
    workflowID,
    action,
    rationale: clean(value?.rationale, 1600) || "Kairos applied the bounded-autonomy policy.",
    confidence: Math.max(0, Math.min(1, Number(value?.confidence || 0.5))),
  };
}

async function applyDecision(env, workflow, decision, cycleID, decidedAt) {
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
  if (decision.action === "advance-internal" && (!workflow.approvalRequired || workflow.approvalStatus === "approved")) {
    const task = (workflow.tasks || []).find(value => !TERMINAL_TASK_STATES.has(value.state) && internalAnalysisTitle(value.title));
    if (task) {
      const completedAt = new Date().toISOString();
      if (workflow.state === "ready") {
        workflow.state = "active";
        workflow.startedAt ||= completedAt;
      }
      task.state = "completed";
      task.completedAt = completedAt;
      task.updatedAt = completedAt;
      task.executionEvidence = {
        source: cycleID,
        decisionID,
        kind: "bounded-internal-analysis",
        rationale: decision.rationale,
        authoritativeStateRead: true,
        externalActionTaken: false,
        recordedAt: completedAt,
      };
      workflow.updatedAt = completedAt;
      refreshWorkflow(workflow);
      await ledgerUpsert(env, "workflows", workflow.id, workflow);
      if (workflow.workItemID) {
        const workItem = await ledgerGet(env, "work-items", workflow.workItemID);
        if (workItem) await ledgerUpsert(env, "work-items", workItem.id, { ...workItem, state: "active", status: "active", operation: "autonomous-internal-analysis", updatedAt: completedAt });
      }
      const receiptID = `receipt-${crypto.randomUUID()}`;
      const receipt = {
        id: receiptID,
        cycleID,
        decisionID,
        workflowID: workflow.id,
        taskID: task.id,
        status: "completed",
        operation: "bounded-internal-analysis",
        externalActionTaken: false,
        evidence: task.executionEvidence,
        createdAt: completedAt,
        updatedAt: completedAt,
      };
      await ledgerUpsert(env, "execution-receipts", receiptID, receipt);
      preserved.status = "applied";
      preserved.appliedAt = completedAt;
      preserved.taskID = task.id;
      preserved.receiptID = receiptID;
      applied = { workflowID: workflow.id, taskID: task.id, taskTitle: task.title, receiptID, state: workflow.state, progress: workflow.progress };
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

async function claimCycle(env, source) {
  const minimumIntervalMs = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(env.KAIROS_AUTONOMY_MIN_INTERVAL_MS || 15 * 60 * 1000)));
  const response = await controlStub(env).fetch(new Request("https://kairos.internal/control/autonomy/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "operational-cycle", source, minimumIntervalMs }),
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

function internalAnalysisTitle(value) {
  return /^(observe|understand|decide)\b/i.test(String(value || "").trim());
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
