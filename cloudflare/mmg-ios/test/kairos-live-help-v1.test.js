import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KAIROS_LIVE_HELP_BUILD,
  KAIROS_LIVE_HELP_PUBLISH_CONFIRMATION,
  handleKairosLiveHelpRequest,
  __test,
} from "../src/kairos-live-help-v1.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(here, "../src/kairos-live-help-v1.js");
const entryPath = path.join(here, "../src/kairos-production-entry-local-canonical-v1.js");
const wranglerPath = path.join(here, "../wrangler.toml");
const env = {
  KAIROS_LIVE_HELP_SITE_ORIGIN: "https://themindsetmediagroup.com",
  KAIROS_LIVE_HELP_WORKER_ORIGIN: "https://mmg-ios.info-mindsetmediagroup.workers.dev",
  KAIROS_LIVE_HELP_ALLOWED_ORIGINS: "https://themindsetmediagroup.com",
  KAIROS_LIVE_HELP_THEME_PUBLISH_ENABLED: "true",
};

function request(pathname, init = {}) {
  return new Request(`https://mmg-ios.info-mindsetmediagroup.workers.dev${pathname}`, init);
}

async function body(response) {
  return response.json();
}

test("status exposes deterministic public-only contract", async () => {
  const response = await handleKairosLiveHelpRequest(request("/api/live-help/status"), env);
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.build, KAIROS_LIVE_HELP_BUILD);
  assert.equal(payload.externalInferenceProvider, false);
  assert.equal(payload.publicOnly, true);
  assert.equal(payload.privateCustomerDataAccess, false);
  assert.equal(payload.routes.widget, "/api/live-help/widget.js");
});

test("private order/account requests fail closed to authenticated support", async () => {
  const response = await handleKairosLiveHelpRequest(request("/api/live-help/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Where is my order and can you look up my account?" }),
  }), env);
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.intent, "private");
  assert.equal(payload.escalation, true);
  assert.equal(payload.privacy.privateCustomerDataAccessed, false);
  assert.equal(payload.privacy.messagePersisted, false);
  assert.match(payload.answer, /can’t access or collect private/i);
  assert.ok(payload.actions.some(action => action.href === "/pages/customer-portal"));
});

test("public company question is answered from curated knowledge", async () => {
  const response = await handleKairosLiveHelpRequest(request("/api/live-help/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What does Mindset Media Group do?" }),
  }), env);
  const payload = await body(response);
  assert.equal(payload.intent, "public_knowledge");
  assert.equal(payload.source, "curated_public_knowledge");
  assert.match(payload.answer, /revenue-generating intellectual property/i);
});

test("commerce questions use public Shopify catalog data when available", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /\/products\.json\?limit=100$/);
    return new Response(JSON.stringify({ products: [{ id: 1, title: "AI Image Mastery™", handle: "ai-image-mastery", variants: [{ price: "9.95", available: true }] }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await handleKairosLiveHelpRequest(request("/api/live-help/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What is the price of AI Image Mastery?" }),
    }), env);
    const payload = await body(response);
    assert.equal(payload.intent, "commerce");
    assert.equal(payload.source, "live_public_shopify_catalog");
    assert.match(payload.answer, /AI Image Mastery™ — \$9\.95/);
    assert.equal(payload.actions[0].href, "/products/ai-image-mastery");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalog failure falls back to canonical public reference pricing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const response = await handleKairosLiveHelpRequest(request("/api/live-help/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How much does the Creator Prompt Library cost?" }),
    }), env);
    const payload = await body(response);
    assert.equal(payload.source, "curated_catalog_fallback");
    assert.match(payload.answer, /\$14\.95 digital/);
    assert.match(payload.answer, /confirm current availability/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analytics accepts only allowlisted metadata and rejects message-like fields", async () => {
  const accepted = await handleKairosLiveHelpRequest(request("/api/live-help/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "widget_open", pagePath: "/pages/about?secret=1" }),
  }), env);
  assert.equal(accepted.status, 200);
  const rejected = await handleKairosLiveHelpRequest(request("/api/live-help/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "question_submitted", message: "do not store me" }),
  }), env);
  assert.equal(rejected.status, 400);
  assert.equal((await body(rejected)).error, "event_payload_rejected");
});

test("CORS is limited to the canonical storefront", async () => {
  const good = await handleKairosLiveHelpRequest(request("/api/live-help/status", { headers: { Origin: "https://themindsetmediagroup.com" } }), env);
  assert.equal(good.headers.get("Access-Control-Allow-Origin"), "https://themindsetmediagroup.com");
  const bad = await handleKairosLiveHelpRequest(request("/api/live-help/status", { headers: { Origin: "https://example.com" } }), env);
  assert.equal(bad.headers.get("Access-Control-Allow-Origin"), null);
});

test("widget is accessible, privacy-safe, reduced-motion safe, and session-throttled", async () => {
  const response = await handleKairosLiveHelpRequest(request("/api/live-help/widget.js"), env);
  const source = await response.text();
  assert.equal(response.status, 200);
  assert.match(source, /aria-label/);
  assert.match(source, /aria-live/);
  assert.match(source, /e\.key==='Escape'/);
  assert.match(source, /prefers-reduced-motion:reduce/);
  assert.match(source, /sessionStorage\.getItem/);
  assert.match(source, /textContent=/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /Do not enter order, payment, account, or personal information/);
  assert.match(source, /bottom:88px/);
});

test("theme injection is idempotent and pins the exact Worker widget", () => {
  const base = "<html><body><main>Store</main></body></html>";
  const once = __test.injectWidget(base, env);
  const twice = __test.injectWidget(once, env);
  assert.equal(twice, once);
  assert.equal((once.match(/KAIROS_LIVE_HELP_V1_START/g) || []).length, 1);
  assert.match(once, new RegExp(KAIROS_LIVE_HELP_BUILD));
  assert.match(once, /https:\/\/mmg-ios\.info-mindsetmediagroup\.workers\.dev\/api\/live-help\/widget\.js/);
});

test("theme mutation is confirmation-gated", async () => {
  const response = await handleKairosLiveHelpRequest(request("/api/live-help/theme/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "wrong" }),
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await body(response)).error, "publish_confirmation_required");
  assert.equal(KAIROS_LIVE_HELP_PUBLISH_CONFIRMATION, "PUBLISH_KAIROS_LIVE_HELP_V1");
});

test("canonical Worker wiring and production vars include Live Help", () => {
  const entry = fs.readFileSync(entryPath, "utf8");
  const wrangler = fs.readFileSync(wranglerPath, "utf8");
  assert.match(entry, /handleKairosLiveHelpRequest/);
  assert.match(entry, /X-Kairos-Live-Help/);
  assert.match(wrangler, /KAIROS_LIVE_HELP_THEME_PUBLISH_ENABLED = "true"/);
  assert.match(wrangler, /KAIROS_LIVE_HELP_ALLOWED_ORIGINS = "https:\/\/themindsetmediagroup\.com"/);
});

test("Live Help source has no external inference provider path", () => {
  const source = fs.readFileSync(srcPath, "utf8");
  assert.doesNotMatch(source, /api\.openai\.com/i);
  assert.doesNotMatch(source, /anthropic\.com/i);
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com/i);
  assert.doesNotMatch(source, /OPENAI_API_KEY/);
});
