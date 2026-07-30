import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url), "utf8");
const loader = readFileSync(new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");

test("DOCX extraction resolves Mammoth named and default export shapes", () => {
  assert.match(source, /manuscript-studio-docx-export-resolution-20260730-1/);
  assert.match(source, /resolveMammothExtractRawText\(mammoth\)/);
  assert.match(source, /moduleNamespace\?\.default/);
  assert.match(source, /moduleNamespace\?\.default\?\.default/);
  assert.match(source, /typeof candidate\?\.extractRawText === "function"/);
  assert.doesNotMatch(source, /const api = mammoth\.default \|\| mammoth/);
  assert.match(loader, /manuscript-docx-export-resolution-20260730-1/);
  assert.match(index, /legacy-runtime-loader\.js\?v=legacy-docx-export-resolution-20260730-1/);
});
