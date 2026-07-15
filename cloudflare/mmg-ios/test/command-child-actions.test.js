import test from "node:test";
import assert from "node:assert/strict";
import commandWorker from "../src/kairos-standalone-command-worker-v2.js";

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

test("every routed non-website child card returns a complete operational contract", async () => {
  for (const action of REQUIRED_ACTIONS) {
    const response = await commandWorker.fetch(new Request("https://kairos.example/api/hub/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, objective: OBJECTIVE_OPTIONAL.has(action) ? "" : `Complete ${action} objective` }),
    }), {}, {});
    const body = await response.json();
    assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
    assert.notEqual(body?.error?.code, "unknown_child_action", action);
    assert.equal(typeof body.summary, "string", action);
    assert.ok(body.summary.length > 10, action);
    assert.ok(Array.isArray(body.sections) && body.sections.length > 0, action);
    assert.equal(body.evidence?.externalActionTaken, false, action);
  }
});
