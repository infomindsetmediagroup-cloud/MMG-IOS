import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync("web/kairos-dashboard/index.html", "utf8");
const app = fs.readFileSync("web/kairos-dashboard/app.html", "utf8");
const concierge = fs.readFileSync("web/kairos-dashboard/scripts/kairos-concierge.js", "utf8");
const canonical = fs.readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-canonical-v1.js", "utf8");

test("Kairos Concierge v3 is mounted on canonical and staged entrypoints", () => {
  assert.match(index, /kairos-concierge\.js\?v=kairos-concierge-20260807-3-account-aware/);
  assert.match(index, /mmg-concierge-build" content="kairos-concierge-20260807-3-account-aware"/);
  assert.match(app, /kairos-concierge\.js\?v=kairos-concierge-20260807-3-account-aware/);
  assert.match(canonical, /KAIROS_CONCIERGE_SCRIPT/);
  assert.match(canonical, /new HTMLRewriter\(\)/);
});

test("Kairos Concierge uses authenticated customer projection plus governed browser-safe hub", () => {
  assert.match(concierge, /fetch\("\/api\/customer\/auth\/session/);
  assert.match(concierge, /fetch\("\/api\/kairos\/customer\/projects/);
  assert.match(concierge, /fetch\("\/api\/hub\/run"/);
  assert.match(concierge, /CUSTOMER_PORTAL \? "customer-journey" : "support-intelligence"/);
  assert.match(concierge, /credentials:\s*"include"/);
  assert.doesNotMatch(concierge, /OPENAI_API_KEY|KAIROS_RUNTIME_TOKEN|Bearer\s+sk-/i);
});

test("Kairos Concierge preserves explicit voice opt-in and same-origin microphone policy", () => {
  assert.match(concierge, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(concierge, /state\.voiceEnabled\s*=\s*true/);
  assert.match(concierge, /speechSynthesis/);
  assert.match(concierge, /Microphone access was not granted\. Text input remains available\./);
  assert.match(concierge, /Voice input is not supported by this browser\. Type your request instead\./);
  assert.match(canonical, /microphone=\(self\)/);
});

test("Kairos Concierge keeps bounded account-scoped continuity and CSP-safe rendering", () => {
  assert.match(concierge, /localStorage\.setItem\(storageKey/);
  assert.match(concierge, /customer:\$\{hashText\(id\)\}/);
  assert.match(concierge, /const MAX_HISTORY = 32/);
  assert.match(concierge, /escapeHTML\(item\.text\)/);
  assert.match(concierge, /maxlength="6000"/);
  assert.match(concierge, /style\.setAttribute\("nonce", "kairos-dashboard-v1"\)/);
  assert.match(canonical, /tokens\.includes\("'self'"\)/);
});
