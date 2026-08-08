import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync("web/kairos-dashboard/index.html", "utf8");
const app = fs.readFileSync("web/kairos-dashboard/app.html", "utf8");
const concierge = fs.readFileSync("web/kairos-dashboard/scripts/kairos-concierge.js", "utf8");

test("Kairos Concierge is mounted on canonical and staged entrypoints", () => {
  assert.match(index, /kairos-concierge\.js\?v=kairos-concierge-20260807-2/);
  assert.match(index, /mmg-concierge-build" content="kairos-concierge-20260807-2"/);
  assert.match(app, /kairos-concierge\.js\?v=kairos-concierge-20260807-2/);
});

test("Kairos Concierge uses the governed browser-safe hub without provider credentials", () => {
  assert.match(concierge, /fetch\("\/api\/hub\/run"/);
  assert.match(concierge, /action:\s*"support-intelligence"/);
  assert.match(concierge, /credentials:\s*"include"/);
  assert.doesNotMatch(concierge, /OPENAI_API_KEY|KAIROS_RUNTIME_TOKEN|Bearer\s+sk-/i);
});

test("Kairos Concierge preserves explicit voice opt-in and text fallback", () => {
  assert.match(concierge, /navigator\.mediaDevices\.getUserMedia\(\{audio:true\}\)/);
  assert.match(concierge, /state\.voiceEnabled\s*=\s*true/);
  assert.match(concierge, /speechSynthesis/);
  assert.match(concierge, /Microphone access was not granted\. Text input remains available\./);
  assert.match(concierge, /Voice input is not supported by this browser\. Type your request instead\./);
});

test("Kairos Concierge keeps bounded session continuity and safe rendering", () => {
  assert.match(concierge, /sessionStorage\.setItem\(STORAGE_KEY/);
  assert.match(concierge, /const MAX_HISTORY = 24/);
  assert.match(concierge, /escapeHTML\(item\.text\)/);
  assert.match(concierge, /maxlength="6000"/);
});
