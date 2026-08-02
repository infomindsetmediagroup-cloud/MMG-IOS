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

test("imports autonomy API v3", () => {
  assert.match(source, /from "\.\/autonomy\/kairos-autonomy-api-v3\.js";/u);
});

test("does not import autonomy API v2 directly", () => {
  assert.doesNotMatch(source, /kairos-autonomy-api-v2\.js/u);
});

test("uses the business-state canonical build identifier", () => {
  assert.match(
    source,
    /KAIROS_LOCAL_CANONICAL_ENTRY_BUILD = "kairos-local-canonical-entry-20260802-3-business-state-api";/u,
  );
});

test("invokes the autonomy API exactly once in fetch", () => {
  assert.equal(count("await handleAutonomyApiRequest("), 1);
});

test("passes the original request env and ctx to API v3", () => {
  assert.match(
    source,
    /handleAutonomyApiRequest\(request, env, ctx, \{\s*dispatchEnv: providerBlockedEnv\(env\),\s*\}\)/u,
  );
});

test("preserves provider-blocked dispatch environment", () => {
  assert.match(source, /dispatchEnv: providerBlockedEnv\(env\)/u);
});

test("does not inject collectorEnvironment at the Worker boundary", () => {
  assert.doesNotMatch(source, /collectorEnvironment\s*:/u);
});

test("does not inject collectorOptions at the Worker boundary", () => {
  assert.doesNotMatch(source, /collectorOptions\s*:/u);
});

test("does not inject a businessCollector at the Worker boundary", () => {
  assert.doesNotMatch(source, /businessCollector\s*:/u);
});

test("returns stamped autonomy responses before other routing", () => {
  const autonomy = indexOfRequired("if (autonomyResponse) return stamp(autonomyResponse);");
  const manuscript = indexOfRequired("if (DIRECT_MANUSCRIPT_PATHS.has(url.pathname))");
  assert.ok(autonomy < manuscript);
});

test("autonomy routing precedes package-state routing", () => {
  const autonomy = indexOfRequired("if (autonomyResponse) return stamp(autonomyResponse);");
  const packageState = indexOfRequired("const packageState = await handleManuscriptPackageState(request, env, ctx);");
  assert.ok(autonomy < packageState);
});

test("autonomy routing precedes dedicated-source routing", () => {
  const autonomy = indexOfRequired("if (autonomyResponse) return stamp(autonomyResponse);");
  const sourceRoute = indexOfRequired("const dedicatedSource = await handleDedicatedManuscriptSource(request, env);");
  assert.ok(autonomy < sourceRoute);
});

test("autonomy routing precedes canonical runtime delegation", () => {
  const autonomy = indexOfRequired("if (autonomyResponse) return stamp(autonomyResponse);");
  const runtime = indexOfRequired("return stamp(await canonicalRuntime.fetch(request, runtimeEnv, ctx));");
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

test("preserves manuscript package-state object interception", () => {
  assert.match(
    source,
    /handleManuscriptPackageStateObjectRequest\(this\.state, request\)/u,
  );
});

test("preserves manuscript source fallback to super fetch", () => {
  assert.match(source, /return super\.fetch\(request\);/u);
});

test("preserves direct manuscript request signature", () => {
  assert.match(source, /handleManuscriptRequest\(request\)/u);
  assert.doesNotMatch(source, /handleManuscriptRequest\(request, env, ctx\)/u);
});

test("preserves manuscript intake failure code", () => {
  assert.match(source, /code: "MANUSCRIPT_INTAKE_FAILED"/u);
});

test("preserves manuscript intake retriable flag", () => {
  assert.match(source, /retriable: true/u);
});

test("preserves manuscript intake HTTP 400 response", () => {
  assert.match(source, /\}, 400\)\);/u);
});

test("preserves provider-independent compatibility routing", () => {
  assert.match(
    source,
    /PROVIDER_INDEPENDENT_OPERATIONAL_PATHS\.has\(url\.pathname\)\s*\? operationalCompatibilityEnv\(env\)\s*:\s*providerBlockedEnv\(env\)/u,
  );
});

test("providerBlockedEnv blanks external provider credentials", () => {
  assert.match(
    source,
    /property === "OPENAI_API_KEY" \|\| property === "KAIROS_MODEL_AUTH_TOKEN"\) return "";/u,
  );
});

test("providerBlockedEnv forces browser WebGPU", () => {
  assert.match(source, /property === "KAIROS_MODEL_PROVIDER"\) return "browser-webgpu";/u);
});

test("providerBlockedEnv blanks external model endpoint", () => {
  assert.match(source, /property === "KAIROS_MODEL_ENDPOINT"\) return "";/u);
});

test("providerBlockedEnv forces the local Qwen model", () => {
  assert.match(
    source,
    /KAIROS_MODEL_NAME" \|\| property === "KAIROS_OPENAI_MODEL"\) return "Qwen2\.5-0\.5B-Instruct-q4f16_1-MLC";/u,
  );
});

test("providerBlockedEnv preserves string true compatibility values", () => {
  assert.match(
    source,
    /KAIROS_LOCAL_INFERENCE_ENABLED" \|\| property === "KAIROS_NO_COST_MODE"\) return "true";/u,
  );
});

test("operationalCompatibilityEnv wraps providerBlockedEnv", () => {
  assert.match(source, /const blocked = providerBlockedEnv\(env\);/u);
  assert.match(source, /return new Proxy\(blocked,/u);
});

test("operationalCompatibilityEnv preserves non-secret readiness sentinel", () => {
  assert.match(
    source,
    /return "kairos-local-readiness-sentinel-not-a-provider-key";/u,
  );
});

test("scheduled autonomy still uses the exact health cron", () => {
  assert.match(source, /controller\?\.cron === KAIROS_AUTONOMY_HEALTH_CRON/u);
});

test("scheduled autonomy still receives providerBlockedEnv", () => {
  assert.match(
    source,
    /handleAutonomyScheduledEvent\(controller, providerBlockedEnv\(env\), ctx\)/u,
  );
});

test("legacy scheduled delegation still receives providerBlockedEnv", () => {
  assert.match(
    source,
    /canonicalRuntime\.scheduled\(controller, providerBlockedEnv\(env\), ctx\)/u,
  );
});

test("scheduled handler does not call API v3", () => {
  const scheduledStart = indexOfRequired("async scheduled(controller, env, ctx)");
  const scheduledSource = source.slice(scheduledStart);
  assert.doesNotMatch(scheduledSource, /handleAutonomyApiRequest/u);
});

test("stamp preserves API-provided build header with v3 fallback", () => {
  assert.match(
    source,
    /headers\.get\("X-Kairos-Autonomy-API-Build"\) \|\| KAIROS_AUTONOMY_API_BUILD/u,
  );
});

test("stamp does not globally add the collector build header", () => {
  assert.doesNotMatch(source, /X-Kairos-Business-Collector-Build/u);
});

test("stamp preserves disabled external-provider headers", () => {
  assert.match(source, /headers\.set\("X-Kairos-External-Provider", "disabled"\);/u);
  assert.match(source, /headers\.set\("X-Kairos-OpenAI-Calls", "disabled"\);/u);
});

test("stamp preserves scheduler build header fallback", () => {
  assert.match(
    source,
    /headers\.get\("X-Kairos-Autonomy-Scheduler-Build"\) \|\| KAIROS_AUTONOMY_SCHEDULER_BUILD/u,
  );
});

test("does not add a scheduled business-state collector call", () => {
  assert.doesNotMatch(source, /collectBusinessState/u);
});

test("does not import the business collector directly", () => {
  assert.doesNotMatch(source, /kairos-business-collector-v1\.js/u);
});

test("does not import the observation core directly", () => {
  assert.doesNotMatch(source, /kairos-business-observation-v1\.js/u);
});
