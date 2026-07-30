import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studio = readFileSync("web/kairos-dashboard/scripts/manuscript-studio.js", "utf8");
const legacy = readFileSync("web/kairos-dashboard/scripts/legacy-runtime-loader.js", "utf8");
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

test("the isolated advanced loader delivers the repaired manuscript release without a global boot request", () => {
  assert.match(index, /legacy-runtime-loader\.js\?v=legacy-manuscript-retention-20260730-1/);
  assert.doesNotMatch(index, /manuscript-runtime-cache-guard\.js/);
  assert.match(legacy, /kairos-legacy-runtime-loader-20260730-2/);
  assert.match(legacy, /const RELEASE = "manuscript-upload-retention-20260730-1"/);
  assert.match(legacy, /script\.src = `\.\/scripts\/\$\{filename\}\?v=\$\{RELEASE\}`/);
  assert.match(legacy, /"manuscript-studio\.js"/);
});
