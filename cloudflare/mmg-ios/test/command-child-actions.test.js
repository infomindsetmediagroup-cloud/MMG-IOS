import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { KairosProject } from "../src/kairos-native-publishing-worker-v1.js";
import { handleOperationalRequest, KAIROS_ACTION_CONTRACTS, mirrorOperationalResponse } from "../src/kairos-operational-runtime-v1.js";
import { runAutonomyCycle } from "../src/kairos-autonomy-runtime-v1.js";

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

test("bounded autonomy uses enhanced inference and advances one evidence-backed internal task", async () => {
  const env = memoryEnv({
    KAIROS_AUTONOMY_ENABLED: "true",
    KAIROS_AUTONOMY_MIN_INTERVAL_MS: "60000",
    AI: {
      async run(model, input) {
        assert.equal(model, "@cf/qwen/qwen3-30b-a3b-fp8");
        const state = JSON.parse(input.messages[1].content);
        return { response: JSON.stringify({
          summary: "Advance the highest-priority internal analysis step.",
          decisions: [{ workflowID: state.candidateWorkflows[0].id, action: "advance-internal", rationale: "The authoritative queue snapshot supports the Observe step.", confidence: 0.97 }],
          recommendations: ["Keep external effects approval-gated."],
          verification: ["Read back the workflow and durable receipt."],
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
      tasks: [
        { title: "Observe authoritative current state", description: "Read durable records." },
        { title: "Execute through the domain workspace", description: "Remain bounded." },
      ],
    }),
  }), env, {});
  const workflow = (await created.json()).workflow;

  const cycle = await runAutonomyCycle(env, { source: "test-cycle" });
  assert.equal(cycle.status, "completed");
  assert.equal(cycle.inference.mode, "cloudflare-account-scoped");
  assert.equal(cycle.actionsApplied, 1);
  assert.equal(cycle.applied[0].workflowID, workflow.id);

  const read = await handleOperationalRequest(new Request(`https://kairos.example/api/workflows/${workflow.id}`), env, {});
  const updated = (await read.json()).workflow;
  assert.equal(updated.state, "active");
  assert.equal(updated.tasks[0].state, "completed");
  assert.equal(updated.tasks[0].executionEvidence.externalActionTaken, false);
  assert.equal(updated.tasks[1].state, "ready");
  assert.equal(updated.progress, 50);

  const second = await runAutonomyCycle(env, { source: "duplicate-test-cycle" });
  assert.equal(second.status, "deferred");
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
          decisions: [{ workflowID: state.candidateWorkflows[0].id, action: "advance-internal", rationale: "Attempt advancement.", confidence: 0.9 }],
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
