import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ENTRY_URL = new URL(
  "../../src/kairos-production-entry-local-canonical-v1.js",
  import.meta.url,
);
const source = readFileSync(ENTRY_URL, "utf8");

function indexOfRequired(fragment) {
  const index = source.indexOf(fragment);
  assert.notEqual(index, -1, `Expected source fragment: ${fragment}`);
  return index;
}

function count(fragment) {
  return source.split(fragment).length - 1;
}

test("imports complete operations API v5", () => {
  assert.match(source, /from "\.\/autonomy\/kairos-autonomy-api-v5\.js";/u);
  assert.doesNotMatch(source, /from "\.\/autonomy\/kairos-autonomy-api-v[1-4]\.js";/u);
});

test("imports complete operations scheduler v2", () => {
  assert.match(source, /from "\.\/autonomy\/kairos-autonomy-scheduler-v2\.js";/u);
  assert.doesNotMatch(source, /from "\.\/autonomy\/kairos-autonomy-scheduler-v1\.js";/u);
});

test("uses the complete autonomous operations canonical build identifier", () => {
  assert.match(
    source,
    /KAIROS_LOCAL_CANONICAL_ENTRY_BUILD =\s*"kairos-local-canonical-entry-20260802-4-complete-autonomous-operations";/u,
  );
});

test("invokes the autonomy API exactly once in fetch", () => {
  assert.equal(count("await handleAutonomyApiRequest("), 1);
});

test("passes raw env for authentication and provider-blocked env for operations", () => {
  assert.match(source, /const autonomousEnv = providerBlockedEnv\(env\);/u);
  assert.match(
    source,
    /handleAutonomyApiRequest\(request, env, ctx, \{\s*dispatchEnv: autonomousEnv,\s*operationsEnv: autonomousEnv,\s*\}\)/u,
  );
});

test("returns stamped autonomy responses before all other routing", () => {
  const autonomy = indexOfRequired("if (autonomyResponse) return stamp(autonomyResponse);");
  const manuscript = indexOfRequired("if (DIRECT_MANUSCRIPT_PATHS.has(url.pathname))");
  const packageState = indexOfRequired("const packageState = await handleManuscriptPackageState(request, env, ctx);");
  const sourceRoute = indexOfRequired("const dedicatedSource = await handleDedicatedManuscriptSource(request, env);");
  const runtime = indexOfRequired("return stamp(await canonicalRuntime.fetch(request, runtimeEnv, ctx));");
  assert.ok(autonomy < manuscript);
  assert.ok(autonomy < packageState);
  assert.ok(autonomy < sourceRoute);
  assert.ok(autonomy < runtime);
});

test("non-autonomy null response falls through", () => {
  assert.match(source, /if \(autonomyResponse\) return stamp\(autonomyResponse\);/u);
  assert.doesNotMatch(source, /if \(!autonomyResponse\).*404/u);
});

test("preserves exact provider-independent operational paths", () => {
  assert.match(
    source,
    /const PROVIDER_INDEPENDENT_OPERATIONAL_PATHS = new Set\(\[\s*"\/api\/hub\/run",\s*"\/api\/workflows",\s*\]\);/u,
  );
});

test("preserves exact direct manuscript paths", () => {
  assert.match(
    source,
    /const DIRECT_MANUSCRIPT_PATHS = new Set\(\[\s*"\/api\/manuscript\/capabilities",\s*"\/api\/manuscript\/intake\/advance",\s*"\/api\/manuscript\/review",\s*\]\);/u,
  );
});

test("preserves manuscript package-state object interception and source fallback", () => {
  assert.match(source, /handleManuscriptPackageStateObjectRequest\(this\.state, request\)/u);
  assert.match(source, /return super\.fetch\(request\);/u);
});

test("preserves direct manuscript request and structured failure contract", () => {
  assert.match(source, /handleManuscriptRequest\(request\)/u);
  assert.doesNotMatch(source, /handleManuscriptRequest\(request, env, ctx\)/u);
  assert.match(source, /code: "MANUSCRIPT_INTAKE_FAILED"/u);
  assert.match(source, /retriable: true/u);
  assert.match(source, /\}, 400\)\);/u);
});

test("preserves provider-independent compatibility routing", () => {
  assert.match(
    source,
    /PROVIDER_INDEPENDENT_OPERATIONAL_PATHS\.has\(url\.pathname\)\s*\? operationalCompatibilityEnv\(env\)\s*:\s*autonomousEnv/u,
  );
});

test("providerBlockedEnv disables external providers and forces browser WebGPU", () => {
  assert.match(
    source,
    /property === "OPENAI_API_KEY" \|\| property === "KAIROS_MODEL_AUTH_TOKEN"\) return "";/u,
  );
  assert.match(source, /property === "KAIROS_MODEL_PROVIDER"\) return "browser-webgpu";/u);
  assert.match(source, /property === "KAIROS_MODEL_ENDPOINT"\) return "";/u);
  assert.match(
    source,
    /KAIROS_MODEL_NAME" \|\| property === "KAIROS_OPENAI_MODEL"\) return "Qwen2\.5-0\.5B-Instruct-q4f16_1-MLC";/u,
  );
  assert.match(
    source,
    /KAIROS_LOCAL_INFERENCE_ENABLED" \|\| property === "KAIROS_NO_COST_MODE"\) return "true";/u,
  );
});

test("operational compatibility retains only the non-secret readiness sentinel", () => {
  assert.match(source, /const blocked = providerBlockedEnv\(env\);/u);
  assert.match(source, /return new Proxy\(blocked,/u);
  assert.match(source, /return "kairos-local-readiness-sentinel-not-a-provider-key";/u);
});

test("scheduled autonomy uses the exact hourly cron and provider-blocked environment", () => {
  assert.match(source, /controller\?\.cron === KAIROS_AUTONOMY_HEALTH_CRON/u);
  assert.match(
    source,
    /handleAutonomyScheduledEvent\(controller, providerBlockedEnv\(env\), ctx\)/u,
  );
  assert.match(
    source,
    /canonicalRuntime\.scheduled\(controller, providerBlockedEnv\(env\), ctx\)/u,
  );
});

test("scheduled handler does not route through the HTTP API", () => {
  const scheduledStart = indexOfRequired("async scheduled(controller, env, ctx)");
  const scheduledSource = source.slice(scheduledStart);
  assert.doesNotMatch(scheduledSource, /handleAutonomyApiRequest/u);
});

test("stamp preserves API and scheduler build headers", () => {
  assert.match(
    source,
    /headers\.get\("X-Kairos-Autonomy-API-Build"\) \|\| KAIROS_AUTONOMY_API_BUILD/u,
  );
  assert.match(
    source,
    /headers\.get\("X-Kairos-Autonomy-Scheduler-Build"\) \|\| KAIROS_AUTONOMY_SCHEDULER_BUILD/u,
  );
});

test("stamp preserves disabled external-provider headers", () => {
  assert.match(source, /headers\.set\("X-Kairos-External-Provider", "disabled"\);/u);
  assert.match(source, /headers\.set\("X-Kairos-OpenAI-Calls", "disabled"\);/u);
});

test("Worker does not directly import collectors, prioritizers, orchestrators, or ledgers", () => {
  assert.doesNotMatch(source, /kairos-business-collector-v1\.js/u);
  assert.doesNotMatch(source, /kairos-business-prioritizer-v1\.js/u);
  assert.doesNotMatch(source, /kairos-business-orchestrator-v1\.js/u);
  assert.doesNotMatch(source, /createAutonomyLedgerClient/u);
});
