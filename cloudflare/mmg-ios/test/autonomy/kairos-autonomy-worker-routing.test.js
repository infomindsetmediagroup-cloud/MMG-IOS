import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../../src/kairos-production-entry-local-canonical-v1.js", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
const fetchStart = source.indexOf("async fetch(request, env, ctx)");
const scheduledStart = source.indexOf("async scheduled(controller, env, ctx)");
const fetchSource = source.slice(fetchStart, scheduledStart);
const scheduledSource = source.slice(scheduledStart);

function position(fragment) {
  const index = fetchSource.indexOf(fragment);
  assert.notEqual(index, -1, `Expected fetch() to contain ${fragment}`);
  return index;
}

test("imports the autonomy API handler", () => {
  assert.match(source, /handleAutonomyApiRequest[\s\S]*from "\.\/autonomy\/kairos-autonomy-api-v1\.js"/u);
});

test("imports the autonomy API build identifier", () => {
  assert.match(source, /KAIROS_AUTONOMY_API_BUILD[\s\S]*from "\.\/autonomy\/kairos-autonomy-api-v1\.js"/u);
});

test("invokes the autonomy API handler inside fetch", () => {
  assert.match(fetchSource, /handleAutonomyApiRequest\(request, env, ctx,/u);
});

test("passes raw env to the API handler", () => {
  assert.match(fetchSource, /handleAutonomyApiRequest\(request, env, ctx,/u);
});

test("passes provider-blocked env only through dispatchEnv", () => {
  assert.match(fetchSource, /dispatchEnv:\s*providerBlockedEnv\(env\)/u);
});

test("returns stamped autonomy responses", () => {
  assert.match(fetchSource, /if \(autonomyResponse\) return stamp\(autonomyResponse\);/u);
});

test("routes autonomy before direct manuscript handling", () => {
  assert.ok(position("handleAutonomyApiRequest") < position("DIRECT_MANUSCRIPT_PATHS.has"));
});

test("routes autonomy before package-state handling", () => {
  assert.ok(position("handleAutonomyApiRequest") < position("handleManuscriptPackageState(request"));
});

test("routes autonomy before dedicated-source handling", () => {
  assert.ok(position("handleAutonomyApiRequest") < position("handleDedicatedManuscriptSource(request"));
});

test("routes autonomy before canonical runtime fallback", () => {
  assert.ok(position("handleAutonomyApiRequest") < position("canonicalRuntime.fetch"));
});

test("does not invoke the autonomy API handler from scheduled", () => {
  assert.equal(scheduledSource.includes("handleAutonomyApiRequest"), false);
});

test("does not dispatch autonomy directly from the Worker entrypoint", () => {
  assert.equal(source.includes("dispatchAutonomyEvent"), false);
});

test("preserves canonical scheduled routing through providerBlockedEnv", () => {
  assert.match(scheduledSource, /canonicalRuntime\.scheduled\(controller, providerBlockedEnv\(env\), ctx\)/u);
});

test("stamps the autonomy API build", () => {
  assert.match(source, /headers\.set\("X-Kairos-Autonomy-API-Build"/u);
  assert.match(source, /KAIROS_AUTONOMY_API_BUILD/u);
});

test("preserves external provider disabled header", () => {
  assert.match(source, /X-Kairos-External-Provider", "disabled"/u);
});

test("preserves OpenAI calls disabled header", () => {
  assert.match(source, /X-Kairos-OpenAI-Calls", "disabled"/u);
});

test("does not add autonomy routes to provider-independent paths", () => {
  const setStart = source.indexOf("const PROVIDER_INDEPENDENT_OPERATIONAL_PATHS");
  const setEnd = source.indexOf("const DIRECT_MANUSCRIPT_PATHS");
  assert.equal(source.slice(setStart, setEnd).includes("/api/autonomy"), false);
});

test("does not expose the autonomy API token in response code", () => {
  const stampStart = source.indexOf("function stamp(response)");
  assert.equal(source.slice(stampStart).includes("KAIROS_AUTONOMY_API_TOKEN"), false);
});

test("updates the canonical build suffix for autonomy API routing", () => {
  assert.match(source, /KAIROS_LOCAL_CANONICAL_ENTRY_BUILD\s*=\s*"[^"]+-autonomy-api"/u);
});

test("does not embed cron or Durable Object migration configuration", () => {
  assert.equal(source.includes("[[migrations]]"), false);
  assert.equal(source.includes("new_sqlite_classes"), false);
  assert.equal(source.includes("crons ="), false);
  assert.equal(source.includes("scheduledAutonomy"), false);
});
