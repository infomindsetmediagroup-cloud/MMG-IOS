import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicHomepagePackage } from "../src/kairos-deterministic-homepage-v1.js";
import {
  KAIROS_CANONICAL_HOMEPAGE_VERSION,
  CANONICAL_HOMEPAGE_FILENAMES,
  CANONICAL_HOMEPAGE_SECTION_FILE,
  CANONICAL_HOMEPAGE_CSS_FILE,
  buildCanonicalHomepagePackage,
} from "../src/kairos-canonical-homepage-package-v1.js";
import { KAIROS_PROVIDER_POLICY, intelligenceConfigured } from "../src/kairos-intelligence-v1.js";
import shopifyWorker from "../src/kairos-standalone-shopify-worker-v1.js";

const OBJECTIVE = "Install the canonical MMG homepage on Kairos Staging and verify the complete package.";

function uneditableHomepage() {
  return {
    sections: {
      legacy_header: {
        type: "apps",
        settings: { color_scheme: "scheme-1", padding_top: 36 },
      },
      legacy_products: {
        type: "featured-product",
        settings: { product: "example-product", image_ratio: "adapt" },
      },
    },
    order: ["legacy_header", "legacy_products"],
  };
}

test("text-only homepage planner fails closed when no safe content settings exist", () => {
  assert.throws(
    () => buildDeterministicHomepagePackage(uneditableHomepage(), OBJECTIVE),
    error => error?.code === "approved_homepage_has_no_safe_content_settings",
  );
});

test("canonical installer builds the complete deterministic three-file Shopify package", () => {
  const original = uneditableHomepage();
  const result = buildCanonicalHomepagePackage(original, OBJECTIVE);
  assert.equal(result.version, KAIROS_CANONICAL_HOMEPAGE_VERSION);
  assert.deepEqual(result.files.map(file => file.filename), CANONICAL_HOMEPAGE_FILENAMES);
  assert.equal(result.document.order[0], result.sectionId);
  assert.equal(result.document.sections[result.sectionId].type, "mmg-canonical-homepage");
  assert.equal(result.document.sections[result.sectionId].disabled, false);
  assert.equal(result.document.sections.legacy_header.disabled, true);
  assert.equal(result.document.sections.legacy_products.disabled, true);
  assert.equal(original.sections.legacy_header.disabled, undefined);
  assert.deepEqual(original.order, ["legacy_header", "legacy_products"]);

  const section = result.files.find(file => file.filename === CANONICAL_HOMEPAGE_SECTION_FILE).content;
  const css = result.files.find(file => file.filename === CANONICAL_HOMEPAGE_CSS_FILE).content;
  assert.equal((section.match(/<h1\b/g) || []).length, 1);
  assert.equal((section.match(/<section\b/g) || []).length, 11);
  assert.match(section, /Your knowledge<br>has <em>value\.<\/em>/);
  assert.match(section, /{% schema %}/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.equal(result.acceptanceCriteria.some(item => /No OpenAI service/i.test(item)), true);
});

test("canonical package generation is idempotent and preserves its approved section identity", () => {
  const first = buildCanonicalHomepagePackage(uneditableHomepage(), OBJECTIVE);
  const second = buildCanonicalHomepagePackage(first.document, OBJECTIVE);
  assert.equal(second.sectionId, first.sectionId);
  assert.equal(second.document.order.filter(id => id === first.sectionId).length, 1);
  assert.equal(Object.values(second.document.sections).filter(section => section.type === "mmg-canonical-homepage").length, 1);
});

test("Kairos inference policy rejects OpenAI endpoints and permits only the private Kairos target contract", () => {
  const token = "k".repeat(48);
  assert.equal(KAIROS_PROVIDER_POLICY.openai, "prohibited");
  assert.equal(intelligenceConfigured({ KAIROS_INFERENCE_URL: "https://api.openai.com", KAIROS_INFERENCE_TOKEN: token }), false);
  assert.equal(intelligenceConfigured({ KAIROS_INFERENCE_URL: "https://company.openai.azure.com", KAIROS_INFERENCE_TOKEN: token }), false);
  assert.equal(intelligenceConfigured({ KAIROS_INFERENCE_URL: "https://gpu.kairos.internal", KAIROS_INFERENCE_TOKEN: token }), true);
});

test("website route refuses structural replacement when the current template has no editable text", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const shopify = new MockShopify(uneditableHomepage());
  globalThis.fetch = shopify.fetch.bind(shopify);
  globalThis.caches = { default: new MemoryCache() };
  const env = {
    SHOPIFY_STORE_DOMAIN: "kairos-test.myshopify.com",
    SHOPIFY_API_VERSION: "2026-07",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "test-admin-token",
  };

  try {
    const planSubmission = await shopifyWorker.fetch(new Request("https://kairos.example/api/shopify/staging/plan/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective: OBJECTIVE }),
    }), env);
    assert.equal(planSubmission.status, 500);
    const failure = await planSubmission.json();
    assert.equal(failure.error?.code, "approved_homepage_has_no_safe_content_settings");
    assert.equal(shopify.requestURLs.some(url => url.includes("mutation KairosThemeFiles")), false);
    assert.equal(shopify.files.has(CANONICAL_HOMEPAGE_SECTION_FILE), false);
    assert.equal(shopify.files.has(CANONICAL_HOMEPAGE_CSS_FILE), false);
    assert.equal(shopify.requestURLs.every(url => !/openai/i.test(url)), true);
    assert.deepEqual(JSON.parse(shopify.files.get("templates/index.json")), uneditableHomepage());
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

class MemoryCache {
  constructor() { this.values = new Map(); }
  async put(request, response) { this.values.set(String(request.url || request), response.clone()); }
  async match(request) { return this.values.get(String(request.url || request))?.clone(); }
}

class MockShopify {
  constructor(homepage) {
    this.files = new Map([["templates/index.json", JSON.stringify(homepage, null, 2) + "\n"]]);
    this.requestURLs = [];
  }

  async fetch(input, init = {}) {
    const url = String(input);
    this.requestURLs.push(url);
    assert.match(url, /\.myshopify\.com\/admin\/api\/2026-07\/graphql\.json$/);
    const body = JSON.parse(init.body);
    const query = String(body.query || "");
    const variables = body.variables || {};

    if (query.includes("query KairosThemes")) {
      return Response.json({ data: { themes: { nodes: [
        { id: "gid://shopify/OnlineStoreTheme/1", name: "Rise", role: "MAIN", processing: false, processingFailed: false },
        { id: "gid://shopify/OnlineStoreTheme/2", name: "Kairos Staging", role: "UNPUBLISHED", processing: false, processingFailed: false },
      ] } } });
    }
    if (query.includes("query KairosHomepageFile")) {
      const nodes = (variables.filenames || []).filter(filename => this.files.has(filename)).map(filename => ({
        filename,
        contentType: "TEXT",
        body: { content: this.files.get(filename) },
      }));
      const userErrors = (variables.filenames || []).filter(filename => !this.files.has(filename)).map(filename => ({ code: "NOT_FOUND", filename }));
      return Response.json({ data: { theme: { files: { nodes, userErrors } } } });
    }
    if (query.includes("mutation KairosThemeFilesUpsert")) {
      for (const file of variables.files || []) this.files.set(file.filename, file.body.value);
      return Response.json({ data: { themeFilesUpsert: { upsertedThemeFiles: (variables.files || []).map(file => ({ filename: file.filename })), userErrors: [] } } });
    }
    if (query.includes("mutation KairosThemeFilesDelete")) {
      for (const filename of variables.files || []) this.files.delete(filename);
      return Response.json({ data: { themeFilesDelete: { deletedThemeFiles: (variables.files || []).map(filename => ({ filename })), userErrors: [] } } });
    }
    return Response.json({ errors: [{ message: "Unexpected Shopify GraphQL operation." }] }, { status: 422 });
  }
}
