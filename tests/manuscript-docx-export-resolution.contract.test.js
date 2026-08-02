import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studioPath = new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url);
const safariPath = new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url);
const webkitPath = new URL("../browser-tests/manuscript-docx-export-shape.spec.mjs", import.meta.url);

test("Manuscript Studio resolves real Mammoth ESM export shapes", async () => {
  const source = await readFile(studioPath, "utf8");

  assert.match(source, /const candidates = \[mammoth, mammoth\?\.default, mammoth\?\.default\?\.default\]/);
  assert.match(source, /candidates\.find\(candidate => typeof candidate\?\.extractRawText === "function"\)/);
  assert.doesNotMatch(source, /mammoth\.default\s*\|\|\s*mammoth/);
  assert.doesNotMatch(source, /const api = mammoth\.default/);
});

test("Safari installs a same-origin DOCX extractor before Manuscript Studio runs", async () => {
  const source = await readFile(safariPath, "utf8");

  assert.match(source, /installNativeDocxExtractor\(\)/);
  assert.match(source, /KairosDocxExtractor/);
  assert.match(source, /__KAIROS_MAMMOTH_TEST_MODULE__/);
  assert.match(source, /extractRawText:\s*extractDocxRawText/);
});

test("the iPhone WebKit regression follows canonical chunked source persistence", async () => {
  const source = await readFile(webkitPath, "utf8");

  assert.match(source, /default:\s*\{\}/);
  assert.match(source, /extractRawText:\s*async/);
  assert.match(source, /source\/session/);
  assert.match(source, /source\/file\/0/);
  assert.match(source, /source\/text-chunk\/0/);
  assert.match(source, /source\/commit/);
  assert.match(source, /\/api\/manuscript\/intake\/advance/);
  assert.match(source, /\/api\/production-registry\/projects\//);
  assert.doesNotMatch(source, /multipart\/form-data/);
});
