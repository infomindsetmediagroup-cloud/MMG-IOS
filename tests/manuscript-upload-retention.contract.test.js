import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studio = readFileSync("web/kairos-dashboard/scripts/manuscript-studio.js", "utf8");
const guard = readFileSync("web/kairos-dashboard/scripts/manuscript-runtime-cache-guard.js", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

test("manuscript extraction survives downstream source-storage failures", () => {
  assert.match(studio, /manuscript-studio-upload-retention-20260730-1/);
  assert.match(studio, /kairos\.manuscript-studio\.recoverable-draft\.v1/);
  assert.match(studio, /state\.sourceFile = file/);
  assert.match(studio, /state\.sourceSaveStatus = "failed"/);
  assert.match(studio, /Retry source save/);
  assert.match(studio, /Your extracted manuscript is retained/);
  assert.match(studio, /sessionStorage\.setItem\(DRAFT_KEY/);
  assert.doesNotMatch(studio, /catch\s*\(error\)\s*\{\s*state\.manuscript\s*=\s*"";\s*state\.source\s*=\s*null/);
});

test("Safari receives the repaired manuscript module through a one-shot cache guard", () => {
  assert.match(index, /manuscript-runtime-cache-guard\.js\?v=manuscript-upload-retention-20260730-1/);
  assert.match(guard, /manuscript-runtime-cache-guard-20260730-1/);
  assert.match(guard, /manuscript-upload-retention-20260730-1/);
  assert.match(guard, /url\.pathname\.endsWith\("\/scripts\/manuscript-studio\.js"\)/);
  assert.match(guard, /url\.searchParams\.set\("v", MANUSCRIPT_RELEASE\)/);
  assert.match(guard, /queueMicrotask\(restore\)/);
});
