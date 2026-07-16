import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { KairosProject } from "../src/kairos-native-publishing-worker-v1.js";
import { handleOperationalRequest, KAIROS_ACTION_CONTRACTS, mirrorOperationalResponse } from "../src/kairos-operational-runtime-v1.js";
import { handleAutonomyRequest, runAutonomyCycle } from "../src/kairos-autonomy-runtime-v1.js";
import { normalizeNativeTaskOutput } from "../src/kairos-native-task-execution-v1.js";
import productionRuntime from "../src/kairos-production-entry-v37.js";

const REQUIRED_ACTIONS = [
  "knowledge-library",
  "research-brief",
  "decision-record",
  "doctrine-vault",
  "intelligence-synthesis",
  "manuscript-studio",
  "social-production",
  "publishing-studio",
  "creative-studio",
  "product-launch",
  "revenue-intelligence",
  "growth-plan",
  "offer-builder",
  "campaign-operations",
  "visitor-activity",
  "customer-portal",
  "deliverables",
  "customer-journey",
  "support-intelligence",
  "work-queue",
  "release-control",
  "executive-briefing",
  "system-registry",
];

const OBJECTIVE_OPTIONAL = new Set([
  "visitor-activity",
  "work-queue",
  "release-control",
  "executive-briefing",
  "system-registry",
]);

test("native execution accepts a grounded string deliverable from Qwen", () => {
  const evidenceReference = "workflow:deployment-proof";
  const result = normalizeNativeTaskOutput({
    status: "completed",
    summary: "Kairos completed the deployment observation from the authoritative durable workflow.",
    deliverable: "This usable internal deployment observation is grounded only in the supplied workflow record. It records the required evidence and reports no external action or live mutation.",
    findings: [{ claim: "The durable workflow can support this bounded internal observation.", evidenceReference, confidence: 0.98 }],
    evidenceReferences: [evidenceReference],
    verification: ["Persist and read back the artifact before task completion."],
    nextAction: "Continue the governed workflow.",
  }, [{ id: evidenceReference }], { stage: "observe", executionClass: "native-analysis" });
  assert.equal(result.status, "completed");
  assert.equal(result.normalization.deliverableSource, "deliverable");
  assert.equal(result.normalization.deliverableReconstructed, false);
});

test("native execution reconstructs a missing deliverable only from grounded structured fields", () => {
  const evidenceReference = "workflow:deployment-proof";
  const result = normalizeNativeTaskOutput({
    status: "completed",
    summary: "Kairos completed the deployment observation from the authoritative durable workflow.",
    findings: [{ claim: "The deployment workflow is present and eligible for bounded internal analysis.", evidenceReference, confidence: 0.97 }],
    evidenceReferences: [evidenceReference],
    verification: [{ check: "Durable read-back", result: "Verify the artifact hash before task completion." }],
    nextAction: "Continue the governed workflow.",
  }, [{ id: evidenceReference }], { stage: "observe", executionClass: "native-analysis" });
  assert.equal(result.status, "completed");
  assert.equal(result.normalization.deliverableSource, "grounded-structured-fields");
  assert.equal(result.normalization.deliverableReconstructed, true);
  assert.match(result.deliverable.content, /workflow:deployment-proof/);
  assert.match(result.deliverable.content, /Durable read-back/);
});

test("native execution still blocks missing deliverables without valid evidence and verification", () => {
  const result = normalizeNativeTaskOutput({
    status: "completed",
    summary: "Kairos returned a summary without the evidence required to prove completion.",
    evidenceReferences: ["external:invented"],
    verification: [],
  }, [{ id: "workflow:deployment-proof" }], { stage: "observe", executionClass: "native-analysis" });
  assert.equal(result.status, "blocked");
  assert.match(result.blockedReason, /deliverable/);
  assert.match(result.blockedReason, /grounded-evidence-reference/);
  assert.match(result.blockedReason, /verification/);
});

test("all 25 canonical actions have explicit domain ownership and routes", () => {
  assert.equal(Object.keys(KAIROS_ACTION_CONTRACTS).length, 25);
  for (const [id, contract] of Object.entries(KAIROS_ACTION_CONTRACTS)) {
    assert.ok(contract.title, id);
    assert.ok(contract.center, id);
    assert.ok(contract.owner, id);
    assert.ok(Array.isArray(contract.apiRoutes) && contract.apiRoutes.length > 0, id);
    if (!["website", "health"].includes(id)) {
      assert.ok(contract.module, id);
      assert.ok(contract.event, id);
    }
  }
});

test("every non-website child command creates durable work and workflow records", async () => {
  const env = memoryEnv();
  for (const action of REQUIRED_ACTIONS) {
    const response = await handleOperationalRequest(new Request("https://kairos.example/api/hub/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, objective: OBJECTIVE_OPTIONAL.has(action) ? "" : `Complete ${action} objective` }),
    }), env, {});
    const body = await response.json();
    assert.ok([200, 202].includes(response.status), `${action}: ${JSON.stringify(body)}`);
    assert.ok(["ready", "completed"].includes(body.status), `${action}: ${body.status}`);
    assert.match(body.workItemID, /^work-/i, action);
    assert.match(body.workflowID, /^workflow-/i, action);
    assert.equal(body.evidence?.persistent, true, action);
    assert.equal(body.evidence?.storage, "durable-object", action);
    assert.equal(body.evidence?.inventedData, false, action);
    assert.ok(Array.isArray(body.workflow?.tasks) && body.workflow.tasks.length >= 3, action);
    assert.notEqual(body.evidence?.source, "deterministic-child-deliverable-v1", action);
  }

  const workResponse = await handleOperationalRequest(new Request("https://kairos.example/api/hub/work-items"), env, {});
  const work = await workResponse.json();
  assert.equal(work.workItems.length, REQUIRED_ACTIONS.length);

  const workflowResponse = await handleOperationalRequest(new Request("https://kairos.example/api/workflows"), env, {});
  const workflows = await workflowResponse.json();
  assert.equal(workflows.workflows.length, REQUIRED_ACTIONS.length);
  assert.equal(workflows.persistence, "durable-object");
});

test("decision-record preservation stores actual context instead of a template", async () => {
  const env = memoryEnv();
  const response = await handleOperationalRequest(new Request("https://kairos.example/api/hub/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "decision-record",
      objective: "Use Durable Object storage as the operational source of truth.",
      context: "Cache entries do not replicate between data centers.",
      rationale: "Work and evidence must survive requests and deployments.",
      impact: "All command work enters the durable ledger.",
      owner: "Executive",
      effectiveDate: "2026-07-15",
      reviewTrigger: "Review after the first production execution cycle.",
    }),
  }), env, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "completed");
  assert.match(body.sections.find(section => section.name === "Context")?.content || "", /do not replicate/i);
  const stored = await handleOperationalRequest(new Request(`https://kairos.example/api/hub/work-items/${body.workItemID}`), env, {});
  const record = (await stored.json()).workItem;
  assert.equal(record.payload.owner, "Executive");
  assert.equal(record.evidence.persistent, true);
});

test("approved workflows start and persist completion of the third task", async () => {
  const env = memoryEnv();
  const createdResponse = await handleOperationalRequest(new Request("https://kairos.example/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Approval execution regression",
      objective: "Verify that the third child task executes after approval.",
      center: "operations",
      approvalRequired: true,
      tasks: [
        { title: "First task", description: "Observe" },
        { title: "Second task", description: "Decide" },
        { title: "Third task", description: "Execute" },
      ],
    }),
  }), env, {});
  assert.equal(createdResponse.status, 201);
  let workflow = (await createdResponse.json()).workflow;
  assert.equal(workflow.approvalStatus, "pending");
  assert.equal(workflow.taskCount, 3);
  assert.equal(workflow.completedTasks, 0);

  const approvedResponse = await patchWorkflow(env, workflow.id, { command: "approve", actor: "Executive" });
  workflow = (await approvedResponse.json()).workflow;
  assert.equal(approvedResponse.status, 200);
  assert.equal(workflow.approvalStatus, "approved");

  const startedResponse = await patchWorkflow(env, workflow.id, { command: "start" });
  workflow = (await startedResponse.json()).workflow;
  assert.equal(startedResponse.status, 200);
  assert.equal(workflow.state, "active");

  for (const task of workflow.tasks) {
    const response = await handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${workflow.id}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "completed" }),
    }), env, {});
    assert.equal(response.status, 200, task.title);
    workflow = (await response.json()).workflow;
  }

  assert.equal(workflow.tasks[2].state, "completed");
  assert.equal(workflow.completedTasks, 3);
  assert.equal(workflow.taskCount, 3);
  assert.equal(workflow.progress, 100);
  const stored = await handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${workflow.id}`), env, {});
  assert.equal((await stored.json()).workflow.tasks[2].state, "completed");
});

test("successful domain mutations are mirrored into durable receipts and workflows", async () => {
  const env = memoryEnv();
  const request = new Request("https://kairos.example/api/offers", { method: "POST", body: "{}" });
  const workflow = { id: "workflow-mirrored", title: "Mirrored workflow", objective: "Preserve it", state: "ready", tasks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const offer = { id: "offer-mirrored", title: "Mirrored offer", status: "draft", updatedAt: new Date().toISOString() };
  await mirrorOperationalResponse(request, Response.json({ status: "completed", workflow, offer }), env);
  const response = await handleOperationalRequest(new Request("https://kairos.example/api/workflows/workflow-mirrored"), env, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).workflow.id, "workflow-mirrored");
  const registry = await handleOperationalRequest(new Request("https://kairos.example/api/system-registry"), env, {}, async requestValue => Response.json({ status: "ready", route: new URL(requestValue.url).pathname }));
  const body = await registry.json();
  assert.equal(body.counts.executionReceipts, 1);
  assert.equal(body.counts.workflows, 1);
});

test("approved bounded autonomy completes a verified three-task native sequence", async () => {
  const env = memoryEnv({
    KAIROS_AUTONOMY_ENABLED: "true",
    KAIROS_AUTONOMY_MIN_INTERVAL_MS: "60000",
    AI: {
      async run(model, input) {
        assert.equal(model, "@cf/qwen/qwen3-30b-a3b-fp8");
        const system = input.messages[0].content;
        const state = JSON.parse(input.messages[1].content);
        if (system.includes("verified native MMG operating intelligence")) {
          return { response: JSON.stringify({
            summary: "Execute the highest-priority safe native workflow sequence.",
            decisions: [{ workflowID: state.candidateWorkflows[0].id, action: "execute-native", rationale: "The authoritative queue snapshot classifies the next task as automatic and internal.", confidence: 0.97 }],
            recommendations: ["Keep external effects approval-gated."],
            verification: ["Read back every artifact, workflow mutation, decision, and durable receipt."],
          }) };
        }
        assert.match(system, /native internal analysis and execution engine/i);
        const evidenceReference = `workflow:${state.workflow.id}`;
        const verification = state.task.stage === "observe"
          ? "Persist the artifact and verify its SHA-256 content hash before completing the task."
          : state.task.stage === "understand"
            ? { status: "verified", checks: [{ check: "Durable read-back", result: "Require an exact artifact read-back before task completion." }] }
            : [{ check: "Atomic completion", result: "Read back the artifact, workflow, decision, and receipt." }];
        return { response: JSON.stringify({
          status: "completed",
          summary: `Kairos completed the ${state.task.stage} task from the authoritative durable workflow record.`,
          deliverable: {
            title: `${state.task.stage} verified deliverable`,
            type: state.task.executionClass,
            content: `This usable internal deliverable records the verified ${state.task.stage} result for ${state.workflow.title}. It is grounded only in the supplied workflow evidence and reports no external action or live mutation.`,
          },
          findings: [{ claim: `The ${state.task.stage} task can be completed as a bounded internal deliverable.`, evidenceReference, confidence: 0.98 }],
          evidenceReferences: [evidenceReference],
          verification,
          nextAction: "Continue to the next governed lifecycle task.",
          blockedReason: "",
        }) };
      },
    },
  });
  const created = await handleOperationalRequest(new Request("https://kairos.example/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Autonomous internal operations",
      objective: "Observe the durable queue and prepare the next governed decision.",
      priority: "high",
      approvalRequired: true,
      tasks: [
        { title: "Observe authoritative current state", description: "Read durable records." },
        { title: "Understand objective and completion evidence", description: "Interpret the durable objective." },
        { title: "Decide governed execution path", description: "Choose the bounded internal route." },
      ],
    }),
  }), env, {});
  let workflow = (await created.json()).workflow;
  assert.equal(workflow.approvalStatus, "pending");
  const approved = await patchWorkflow(env, workflow.id, { command: "approve", actor: "Executive" });
  workflow = (await approved.json()).workflow;
  assert.equal(workflow.approvalStatus, "approved");
  assert.equal(workflow.state, "active");

  const cycle = await runAutonomyCycle(env, { source: "test-cycle" });
  assert.equal(cycle.status, "completed");
  assert.equal(cycle.inference.mode, "cloudflare-account-scoped");
  assert.equal(cycle.actionsApplied, 3);
  assert.equal(cycle.applied[0].workflowID, workflow.id);
  assert.equal(cycle.applied[2].stage, "decide");
  assert.equal(cycle.applied[2].artifactReadbackVerified, true);
  assert.equal(cycle.applied[2].atomicCommitVerified, true);

  const read = await handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${workflow.id}`), env, {});
  const updated = (await read.json()).workflow;
  assert.equal(updated.state, "completed");
  assert.equal(updated.tasks[0].state, "completed");
  assert.equal(updated.tasks[0].executionEvidence.externalActionTaken, false);
  assert.match(updated.tasks[0].nativeOutput.verification[0], /SHA-256/i);
  assert.ok(updated.tasks[1].nativeOutput.verification.some(value => /Durable read-back/i.test(value)));
  assert.equal(updated.tasks[2].state, "completed");
  assert.ok(updated.tasks[2].nativeOutput.verification.some(value => /Atomic completion/i.test(value)));
  assert.match(updated.tasks[2].nativeOutput.deliverable.content, /usable internal deliverable/i);
  assert.equal(updated.tasks[2].executionEvidence.artifactReadbackVerified, true);
  assert.equal(updated.progress, 100);

  const artifactResponse = await handleAutonomyRequest(new Request(`https://kairos.example/api/autonomy/artifacts/${updated.tasks[2].nativeOutput.artifactID}`), env);
  assert.equal(artifactResponse.status, 200);
  const artifact = (await artifactResponse.json()).artifact;
  assert.equal(artifact.status, "verified");
  assert.equal(artifact.safeguards.modelReasoningStored, false);
  assert.equal(artifact.safeguards.externalActionTaken, false);

  const second = await runAutonomyCycle(env, { source: "duplicate-test-cycle" });
  assert.equal(second.status, "deferred");
});

test("production approval dispatches an event-driven cycle that executes the third safe task", async () => {
  const env = memoryEnv({
    KAIROS_AUTONOMY_ENABLED: "true",
    AI: { async run(_model, input) {
      const system = input.messages[0].content;
      const state = JSON.parse(input.messages[1].content);
      if (system.includes("verified native MMG operating intelligence")) return { response: JSON.stringify({
        summary: "Execute the approved safe workflow.",
        decisions: [{ workflowID: state.candidateWorkflows[0].id, action: "execute-native", rationale: "Approval is preserved and the next task is automatic eligible.", confidence: 0.99 }],
        recommendations: [], verification: ["Verify every durable artifact read-back."],
      }) };
      const evidenceReference = `workflow:${state.workflow.id}`;
      return { response: JSON.stringify({
        status: "completed",
        summary: `Kairos produced the approved ${state.task.stage} result from durable workflow evidence.`,
        deliverable: { title: `Approved ${state.task.stage} artifact`, type: state.task.executionClass, content: `This verified internal artifact completes the approved ${state.task.stage} task using only the supplied durable workflow evidence. It records no external action and performs no live mutation.` },
        findings: [{ claim: "The safe approved task is grounded and complete.", evidenceReference, confidence: 0.99 }],
        evidenceReferences: [evidenceReference],
        verification: ["The artifact, task, decision, receipt, and workflow must all be read back before completion."],
        nextAction: "Continue the approved safe lifecycle.", blockedReason: "",
      }) };
    } },
  });
  const pending = [];
  const ctx = { waitUntil(value) { pending.push(Promise.resolve(value)); } };
  const createdResponse = await productionRuntime.fetch(new Request("https://kairos.example/api/workflows", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Event-driven approval regression",
      objective: "Execute all three approved safe native analysis tasks.",
      approvalRequired: true,
      tasks: [
        { title: "Observe authoritative current state", stage: "observe" },
        { title: "Understand objective and evidence", stage: "understand" },
        { title: "Decide governed path", stage: "decide" },
      ],
    }),
  }), env, ctx);
  let workflow = (await createdResponse.json()).workflow;
  await Promise.all(pending.splice(0));
  assert.equal(workflow.approvalStatus, "pending");

  const approvedResponse = await productionRuntime.fetch(new Request(`https://kairos.example/api/workflows/${workflow.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "approve", actor: "Executive" }),
  }), env, ctx);
  assert.equal(approvedResponse.status, 200);
  await Promise.all(pending.splice(0));

  const read = await productionRuntime.fetch(new Request(`https://kairos.example/api/workflows/${workflow.id}`), env, ctx);
  workflow = (await read.json()).workflow;
  assert.equal(workflow.state, "completed");
  assert.equal(workflow.tasks[2].state, "completed");
  assert.equal(workflow.tasks[2].executionEvidence.artifactReadbackVerified, true);
  assert.match(workflow.tasks[2].nativeOutput.deliverable.content, /verified internal artifact/i);
});

test("native task completion is blocked when enhanced inference cites invented evidence", async () => {
  const env = memoryEnv({
    KAIROS_AUTONOMY_ENABLED: "true",
    AI: {
      async run(_model, input) {
        const system = input.messages[0].content;
        const state = JSON.parse(input.messages[1].content);
        if (system.includes("verified native MMG operating intelligence")) return { response: JSON.stringify({
          summary: "Attempt the safe task.",
          decisions: [{ workflowID: state.candidateWorkflows[0].id, action: "execute-native", rationale: "Attempt grounded execution.", confidence: 0.9 }],
          recommendations: [], verification: [],
        }) };
        return { response: JSON.stringify({
          status: "completed",
          summary: "This output claims completion but is not grounded in the supplied catalog.",
          deliverable: { title: "Ungrounded output", type: "native-analysis", content: "This deliberately long output has enough text to pass the length requirement, but its evidence reference is invented and therefore must never complete the task." },
          findings: [{ claim: "Invented claim", evidenceReference: "external:invented", confidence: 1 }],
          evidenceReferences: ["external:invented"],
          verification: ["Pretend verification"], nextAction: "None", blockedReason: "",
        }) };
      },
    },
  });
  const created = await handleOperationalRequest(new Request("https://kairos.example/api/workflows", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Evidence gate", objective: "Reject unsupported analysis.", tasks: [{ title: "Observe authoritative current state" }] }),
  }), env, {});
  const workflow = (await created.json()).workflow;
  const cycle = await runAutonomyCycle(env, { source: "invalid-evidence-test" });
  assert.equal(cycle.status, "completed");
  assert.equal(cycle.actionsApplied, 0);
  const read = await handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${workflow.id}`), env, {});
  assert.equal((await read.json()).workflow.tasks[0].state, "ready");
  const decisions = await handleAutonomyRequest(new Request("https://kairos.example/api/autonomy/decisions"), env);
  const latest = (await decisions.json()).decisions[0];
  assert.equal(latest.status, "blocked");
  assert.match(latest.blockedReason, /grounded-evidence-reference/i);
});

test("high-impact execution remains approval-gated and produces no native completion artifact", async () => {
  const env = memoryEnv({ KAIROS_AUTONOMY_ENABLED: "true" });
  const created = await handleOperationalRequest(new Request("https://kairos.example/api/workflows", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Public release boundary",
      objective: "Publish the approved release to the live storefront.",
      tasks: [{ title: "Deploy and publish the live release", stage: "execute", executionClass: "high-impact-domain-action" }],
    }),
  }), env, {});
  const workflow = (await created.json()).workflow;
  const cycle = await runAutonomyCycle(env, { source: "high-impact-boundary-test" });
  assert.equal(cycle.status, "completed");
  assert.equal(cycle.actionsApplied, 0);
  const read = await handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${workflow.id}`), env, {});
  const updated = (await read.json()).workflow;
  assert.equal(updated.tasks[0].state, "ready");
  assert.equal(updated.tasks[0].nativeOutput, undefined);
});

test("bounded autonomy cannot bypass a pending approval even when inference requests advancement", async () => {
  const env = memoryEnv({
    KAIROS_AUTONOMY_ENABLED: "true",
    KAIROS_AUTONOMY_MIN_INTERVAL_MS: "60000",
    AI: {
      async run(_model, input) {
        const state = JSON.parse(input.messages[1].content);
        return { response: JSON.stringify({
          summary: "Evaluate the approval-gated workflow.",
          decisions: [{ workflowID: state.candidateWorkflows[0].id, action: "execute-native", rationale: "Attempt advancement.", confidence: 0.9 }],
          recommendations: [],
          verification: [],
        }) };
      },
    },
  });
  const created = await handleOperationalRequest(new Request("https://kairos.example/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Approval-gated autonomy boundary",
      objective: "Prove Kairos cannot bypass approval.",
      approvalRequired: true,
      tasks: [{ title: "Observe authoritative current state" }],
    }),
  }), env, {});
  const workflow = (await created.json()).workflow;
  const cycle = await runAutonomyCycle(env, { source: "approval-boundary-test" });
  assert.equal(cycle.status, "completed");
  assert.equal(cycle.actionsApplied, 0);
  const read = await handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${workflow.id}`), env, {});
  const updated = (await read.json()).workflow;
  assert.equal(updated.approvalStatus, "pending");
  assert.equal(updated.state, "ready");
  assert.equal(updated.tasks[0].state, "ready");
});

test("routed UI lazy-loads every specialized action instead of the generic hub form", async () => {
  const path = fileURLToPath(new URL("../../../web/kairos-dashboard/scripts/workspace-runtime.js", import.meta.url));
  const source = await readFile(path, "utf8");
  for (const action of REQUIRED_ACTIONS) assert.match(source, new RegExp(`["]${escapeRegex(action)}["]\\s*:`), action);
  assert.doesNotMatch(source, /api\/hub\/run/);
  assert.match(source, /openDomainWorkspace/);
  assert.match(source, /import\(`\.\/\$\{definition\.module\}`\)/);
});

function memoryEnv(overrides = {}) {
  const namespace = new MemoryNamespace();
  return { KAIROS_PROJECTS: namespace, ...overrides };
}

function patchWorkflow(env, id, body) {
  return handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), env, {});
}

class MemoryNamespace {
  constructor() { this.objects = new Map(); }
  idFromName(name) { return String(name); }
  get(id) {
    if (!this.objects.has(id)) this.objects.set(id, new KairosProject({ storage: new MemoryStorage() }, {}));
    return this.objects.get(id);
  }
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) {
    if (typeof key === "object" && key !== null && value === undefined) {
      for (const [entryKey, entryValue] of Object.entries(key)) this.values.set(entryKey, structuredClone(entryValue));
      return;
    }
    this.values.set(key, structuredClone(value));
  }
  async delete(key) { this.values.delete(key); }
  async setAlarm() {}
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
