import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync("web/kairos-dashboard/index.html", "utf8");
const app = fs.readFileSync("web/kairos-dashboard/app.html", "utf8");
const concierge = fs.readFileSync("web/kairos-dashboard/scripts/kairos-concierge.js", "utf8");
const canonical = fs.readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-canonical-v1.js", "utf8");

test("Kairos Concierge v4 is mounted on canonical and staged entrypoints", () => {
  assert.match(index, /kairos-concierge\.js\?v=kairos-concierge-20260807-4-v38-compatible/);
  assert.match(index, /mmg-concierge-build" content="kairos-concierge-20260807-4-v38-compatible"/);
  assert.match(app, /kairos-concierge\.js\?v=kairos-concierge-20260807-4-v38-compatible/);
  assert.match(canonical, /KAIROS_CONCIERGE_BUILD = "kairos-concierge-20260807-4-v38-compatible"/);
  assert.match(canonical, /KAIROS_CONCIERGE_SCRIPT/);
  assert.match(canonical, /new HTMLRewriter\(\)/);
});

test("Kairos Concierge keeps authenticated customer data on the secure Worker boundary", () => {
  assert.match(concierge, /const SECURE_CUSTOMER_PORTAL/);
  assert.match(concierge, /const PUBLIC_CUSTOMER_PORTAL/);
  assert.match(concierge, /\/pages\/customer-portal/);
  assert.match(concierge, /if \(!SECURE_CUSTOMER_PORTAL\) return/);
  assert.match(concierge, /fetch\("\/api\/customer\/auth\/session/);
  assert.match(concierge, /fetch\("\/api\/kairos\/customer\/projects/);
  assert.match(concierge, /credentials:\s*"same-origin"/);
  assert.match(concierge, /SECURE_PORTAL_URL/);
  assert.doesNotMatch(concierge, /fetch\("\/api\/hub\/run"/);
  assert.doesNotMatch(concierge, /customer-journey|support-intelligence/);
  assert.doesNotMatch(concierge, /OPENAI_API_KEY|KAIROS_RUNTIME_TOKEN|Bearer\s+sk-/i);
});

test("Kairos Concierge is compatible with MMG theme v3.8 storefront framing", () => {
  assert.match(concierge, /themindsetmediagroup\\\.com/);
  assert.match(concierge, /\.mmg-global-backtop/);
  assert.match(concierge, /answerStorefrontRequest/);
  assert.match(concierge, /Private project and account data is available only inside the authenticated Kairos workspace/);
  assert.match(concierge, /SURFACE === "customer" \? "customer-session" : SURFACE/);
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
