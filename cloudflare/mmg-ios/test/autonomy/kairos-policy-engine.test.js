import test from "node:test";
import assert from "node:assert/strict";

import {
  KAIROS_EVENT_SCHEMA_VERSION,
  validateEventEnvelope,
} from "../../src/autonomy/kairos-event-v1.js";
import {
  getWorkflowDefinition,
  listActiveWorkflows,
} from "../../src/autonomy/kairos-workflow-registry-v1.js";
import { evaluatePolicy } from "../../src/autonomy/kairos-policy-engine-v1.js";
import { executeWebsiteHealthWorkflow } from "../../src/autonomy/website-health-workflow-v1.js";

const POLICY_CONTEXT = Object.freeze({
  agent: "website-operations-agent.v1",
  workflowId: "website.health.v1",
  riskClass: "low",
  environment: "production",
  globalKillSwitch: "enabled",
});

const BUSINESS_POLICY_CONTEXT = Object.freeze({
  agent: "business-operations-agent.v1",
  workflowId: "business.operations.v1",
  riskClass: "low",
  environment: "production",
  globalKillSwitch: "enabled",
});

test("event envelopes are normalized without allowing schema-version override", () => {
  const result = validateEventEnvelope(
    {
      eventId: " evt_123 ",
      eventType: "website.health.schedule",
      source: "kairos.scheduler",
      occurredAt: "2026-08-01T12:00:00-07:00",
      tenantId: "mmg",
      payload: { targetUrl: "https://themindsetmediagroup.com/" },
      metadata: { schemaVersion: 999, release: "v1" },
    },
    {
      now: new Date("2026-08-02T05:00:00.000Z"),
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    },
  );

  assert.equal(result.valid, true);
  assert.equal(result.event.eventId, "evt_123");
  assert.equal(result.event.occurredAt, "2026-08-01T19:00:00.000Z");
  assert.equal(result.event.receivedAt, "2026-08-02T05:00:00.000Z");
  assert.equal(result.event.correlationId, "corr_00000000-0000-4000-8000-000000000001");
  assert.equal(result.event.metadata.schemaVersion, KAIROS_EVENT_SCHEMA_VERSION);
  assert.equal(result.event.metadata.release, "v1");
});

test("event validation rejects arrays and non-object payload bodies", () => {
  assert.equal(validateEventEnvelope([]).valid, false);

  const result = validateEventEnvelope({
    eventId: "evt_123",
    eventType: "website.health.schedule",
    source: "kairos.scheduler",
    occurredAt: "2026-08-01T19:00:00.000Z",
    tenantId: "mmg",
    payload: "not-an-object",
  });

  assert.equal(result.valid, false);
  assert.equal(result.code, "INVALID_EVENT_PAYLOAD_BODY");
});

test("workflow registry returns active immutable definitions", () => {
  const websiteWorkflow = getWorkflowDefinition("website.health.v1");
  const businessWorkflow = getWorkflowDefinition("business.operations.v1");
  assert.ok(websiteWorkflow);
  assert.ok(businessWorkflow);
  assert.equal(Object.isFrozen(websiteWorkflow), true);
  assert.equal(Object.isFrozen(websiteWorkflow.autonomousActions), true);
  assert.equal(Object.isFrozen(businessWorkflow), true);
  assert.equal(Object.isFrozen(businessWorkflow.autonomousActions), true);
  assert.deepEqual(
    listActiveWorkflows().map((entry) => entry.workflowId),
    ["website.health.v1", "business.operations.v1"],
  );
  assert.equal(getWorkflowDefinition("unknown.workflow"), null);
});

test("policy engine allows certified low-risk autonomous actions", () => {
  const decision = evaluatePolicy({ ...POLICY_CONTEXT, action: "website.inspect" });
  assert.equal(decision.decision, "ALLOW_AUTONOMOUS");
  assert.equal(decision.reasonCode, "ACTION_CERTIFIED_AUTONOMOUS");

  for (const action of [
    "collector.refresh",
    "website.reinspect",
    "incident.record",
    "repair.propose",
  ]) {
    const businessDecision = evaluatePolicy({ ...BUSINESS_POLICY_CONTEXT, action });
    assert.equal(businessDecision.decision, "ALLOW_AUTONOMOUS");
    assert.equal(businessDecision.reasonCode, "ACTION_CERTIFIED_AUTONOMOUS");
  }
});

test("policy engine blocks explicitly restricted actions", () => {
  const decision = evaluatePolicy({
    ...POLICY_CONTEXT,
    action: "shopify.price.change",
    riskClass: "high",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reasonCode, "ACTION_EXPLICITLY_BLOCKED");

  const fundsDecision = evaluatePolicy({ ...BUSINESS_POLICY_CONTEXT, action: "funds.spend" });
  assert.equal(fundsDecision.decision, "DENY");
  assert.equal(fundsDecision.reasonCode, "ACTION_EXPLICITLY_BLOCKED");
});

test("policy engine fails closed when the kill-switch state is missing or disabled", () => {
  for (const globalKillSwitch of [undefined, "disabled"]) {
    const decision = evaluatePolicy({
      ...POLICY_CONTEXT,
      action: "website.inspect",
      globalKillSwitch,
    });
    assert.equal(decision.decision, "DENY");
    assert.equal(decision.reasonCode, "GLOBAL_KILL_SWITCH_ACTIVE");
  }
});

test("policy engine requires approval for protected or elevated-risk actions", () => {
  const mergeDecision = evaluatePolicy({ ...POLICY_CONTEXT, action: "github.merge" });
  assert.equal(mergeDecision.decision, "REQUIRE_APPROVAL");
  assert.equal(mergeDecision.reasonCode, "ACTION_REQUIRES_EXECUTIVE_APPROVAL");

  const elevatedDecision = evaluatePolicy({
    ...POLICY_CONTEXT,
    action: "repair.propose",
    riskClass: "medium",
  });
  assert.equal(elevatedDecision.decision, "REQUIRE_APPROVAL");
  assert.equal(elevatedDecision.reasonCode, "RISK_BOUND_EXCEEDED");

  const executiveDecision = evaluatePolicy({
    ...BUSINESS_POLICY_CONTEXT,
    action: "executive.review.request",
    riskClass: "medium",
  });
  assert.equal(executiveDecision.decision, "REQUIRE_APPROVAL");
  assert.equal(executiveDecision.reasonCode, "ACTION_REQUIRES_EXECUTIVE_APPROVAL");
});

test("policy engine denies unauthorized agents and unknown actions", () => {
  const agentDecision = evaluatePolicy({
    ...POLICY_CONTEXT,
    agent: "unknown-agent.v1",
    action: "website.inspect",
  });
  assert.equal(agentDecision.decision, "DENY");
  assert.equal(agentDecision.reasonCode, "AGENT_NOT_AUTHORIZED");

  const actionDecision = evaluatePolicy({ ...POLICY_CONTEXT, action: "website.mutate" });
  assert.equal(actionDecision.decision, "DENY");
  assert.equal(actionDecision.reasonCode, "DEFAULT_FAIL_CLOSED");
});

test("website health workflow passes a bounded healthy HTML response", async () => {
  const html = `<!doctype html><html><head><title>Mindset Media Group</title></head><body>${"Healthy storefront content. ".repeat(10)}</body></html>`;
  let fetchCalls = 0;

  const result = await executeWebsiteHealthWorkflow(
    {},
    { KAIROS_KILL_SWITCH: "enabled", KAIROS_ENVIRONMENT: "production" },
    {
      now: new Date("2026-08-02T05:00:00.000Z"),
      fetchImpl: async (url, init) => {
        fetchCalls += 1;
        assert.equal(url.href, "https://themindsetmediagroup.com/");
        assert.ok(init.signal);
        assert.equal(init.redirect, "manual");
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  );

  assert.equal(fetchCalls, 1);
  assert.equal(result.status, "passed");
  assert.equal(result.incidentsDetected, 0);
  assert.equal(result.policyDecision.decision, "ALLOW_AUTONOMOUS");
  assert.equal(result.checkedAt, "2026-08-02T05:00:00.000Z");
});

test("website health workflow records a governed repair proposal for an HTTP failure", async () => {
  let sequence = 0;
  const result = await executeWebsiteHealthWorkflow(
    {},
    { KAIROS_KILL_SWITCH: "enabled", KAIROS_ENVIRONMENT: "production" },
    {
      randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
      fetchImpl: async () => new Response("Service unavailable", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      }),
    },
  );

  assert.equal(result.status, "degraded");
  assert.equal(result.incident.class, "HTTP_503");
  assert.equal(result.proposal.executionAuthorized, false);
  assert.equal(result.policyDecisions.recordIncident.decision, "ALLOW_AUTONOMOUS");
  assert.equal(result.policyDecisions.proposeRepair.decision, "ALLOW_AUTONOMOUS");
  assert.equal(result.auditPersistence.status, "not_configured");
});

test("website health workflow rejects non-allowlisted targets before fetch", async () => {
  let fetchCalled = false;
  const result = await executeWebsiteHealthWorkflow(
    { targetUrl: "https://example.com/" },
    { KAIROS_KILL_SWITCH: "enabled", KAIROS_ENVIRONMENT: "production" },
    {
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("fetch should not run");
      },
    },
  );

  assert.equal(fetchCalled, false);
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "TARGET_ORIGIN_NOT_ALLOWED");
});

test("website health workflow does not inspect while the global kill switch is active", async () => {
  let fetchCalled = false;
  const result = await executeWebsiteHealthWorkflow(
    {},
    { KAIROS_KILL_SWITCH: "disabled", KAIROS_ENVIRONMENT: "production" },
    {
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response("unexpected");
      },
    },
  );

  assert.equal(fetchCalled, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.policyDecision.reasonCode, "GLOBAL_KILL_SWITCH_ACTIVE");
});
