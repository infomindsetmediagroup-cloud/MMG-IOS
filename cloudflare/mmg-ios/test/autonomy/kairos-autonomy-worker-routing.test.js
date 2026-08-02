import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../../src/kairos-production-entry-local-canonical-v1.js", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
const fetchStart = source.indexOf("async fetch(request, env, ctx)");
const scheduledStart = source.indexOf("async scheduled(controller, env, ctx)");
const fetchSource = source.slice(fetchStart, scheduledStart);
const scheduledSource = source.slice(scheduledStart, source.indexOf("function providerBlockedEnv"));

function position(fragment) {
  const index = fetchSource.indexOf(fragment);
  assert.notEqual(index, -1, `Expected fetch() to contain ${fragment}`);
  return index;
}

test("imports the composed autonomy API handler and build", () => {
  assert.match(source, /handleAutonomyApiRequest[\s\S]*KAIROS_AUTONOMY_API_BUILD[\s\S]*from "\.\/autonomy\/kairos-autonomy-api-v3\.js"/u);
});

test("invokes the autonomy API handler with raw env and provider-blocked dispatch env", () => {
  assert.match(fetchSource, /handleAutonomyApiRequest\(request, env, ctx, \{[\s\S]*dispatchEnv:\s*providerBlockedEnv\(env\)/u);
});

test("returns stamped autonomy responses before all other route families", () => {
  assert.match(fetchSource, /if \(autonomyResponse\) return stamp\(autonomyResponse\);/u);
  assert.ok(position("handleAutonomyApiRequest") < position("DIRECT_MANUSCRIPT_PATHS.has"));
  assert.ok(position("handleAutonomyApiRequest") < position("handleManuscriptPackageState(request"));
  assert.ok(position("handleAutonomyApiRequest") < position("handleDedicatedManuscriptSource(request"));
  assert.ok(position("handleAutonomyApiRequest") < position("canonicalRuntime.fetch"));
});

test("imports the scheduler boundary without direct dispatcher execution", () => {
  assert.match(source, /handleAutonomyScheduledEvent[\s\S]*KAIROS_AUTONOMY_SCHEDULER_BUILD[\s\S]*KAIROS_AUTONOMY_HEALTH_CRON[\s\S]*from "\.\/autonomy\/kairos-autonomy-scheduler-v1\.js"/u);
  assert.equal(source.includes("dispatchAutonomyEvent"), false);
});

test("routes only the exact autonomy cron to the scheduler", () => {
  assert.match(scheduledSource, /controller\?\.cron === KAIROS_AUTONOMY_HEALTH_CRON/u);
  assert.match(scheduledSource, /return handleAutonomyScheduledEvent\(controller, providerBlockedEnv\(env\), ctx\);/u);
  assert.ok(scheduledSource.indexOf("KAIROS_AUTONOMY_HEALTH_CRON") < scheduledSource.indexOf("canonicalRuntime.scheduled"));
});

test("preserves non-autonomy scheduled routing through providerBlockedEnv", () => {
  assert.match(scheduledSource, /canonicalRuntime\.scheduled\(controller, providerBlockedEnv\(env\), ctx\)/u);
});

test("does not invoke the autonomy API handler from scheduled", () => {
  assert.equal(scheduledSource.includes("handleAutonomyApiRequest"), false);
});

test("stamps API and scheduler build identifiers", () => {
  assert.match(source, /headers\.set\("X-Kairos-Autonomy-API-Build"/u);
  assert.match(source, /headers\.set\("X-Kairos-Autonomy-Scheduler-Build"/u);
});

test("preserves provider-disabled response headers", () => {
  assert.match(source, /X-Kairos-External-Provider", "disabled"/u);
  assert.match(source, /X-Kairos-OpenAI-Calls", "disabled"/u);
});

test("does not add autonomy routes to provider-independent paths", () => {
  const setStart = source.indexOf("const PROVIDER_INDEPENDENT_OPERATIONAL_PATHS");
  const setEnd = source.indexOf("const DIRECT_MANUSCRIPT_PATHS");
  assert.equal(source.slice(setStart, setEnd).includes("/api/autonomy"), false);
});

test("does not expose autonomy secrets in response stamping", () => {
  const stampStart = source.indexOf("function stamp(response)");
  assert.equal(source.slice(stampStart).includes("KAIROS_AUTONOMY_API_TOKEN"), false);
});

test("updates the canonical build identifier for business-state API v3", () => {
  assert.match(
    source,
    /KAIROS_LOCAL_CANONICAL_ENTRY_BUILD\s*=\s*"kairos-local-canonical-entry-20260802-3-business-state-api"/u,
  );
});

test("does not embed Wrangler migration or cron configuration", () => {
  assert.equal(source.includes("[[migrations]]"), false);
  assert.equal(source.includes("new_sqlite_classes"), false);
  assert.equal(source.includes("crons ="), false);
});
