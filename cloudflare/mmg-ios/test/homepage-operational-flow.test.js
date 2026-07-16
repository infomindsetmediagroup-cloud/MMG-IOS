import test from "node:test";
import assert from "node:assert/strict";
import productionRuntime from "../src/kairos-production-entry.js";
import { md5Text } from "../src/kairos-compact-homepage-utils-v1.js";

const ORIGIN = "https://kairos.example";
const OBJECTIVE = "Retool the MMG homepage, build a staging preview, and apply the approved result.";
const MAIN_ID = "gid://shopify/OnlineStoreTheme/1";
const STAGING_ID = "gid://shopify/OnlineStoreTheme/2";

test("Shopify operation-result MD5 verification matches standard vectors", () => {
  assert.equal(md5Text(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5Text("abc"), "900150983cd24fb0d6963f7d28e17f72");
});

test("Website Retool completes proposal, staging preview, approval, live save, verification, and rollback", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const shopify = new MultiThemeShopify(uneditableHomepage(), { deferredWrites: 1 });
  globalThis.fetch = shopify.fetch.bind(shopify);
  globalThis.caches = { default: new MemoryCache() };
  const env = {
    SHOPIFY_STORE_DOMAIN: "kairos-test.myshopify.com",
    SHOPIFY_API_VERSION: "2026-07",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "test-admin-token",
    MMG_STOREFRONT_ORIGIN: "https://themindsetmediagroup.com",
  };

  try {
    const planSubmission = await request("/api/shopify/staging/plan/jobs", {
      method: "POST",
      body: { objective: OBJECTIVE, requestType: "homepage" },
    }, env);
    assert.equal(planSubmission.status, 202);
    const planEnvelope = await planSubmission.json();
    const plan = planEnvelope.result || (await (await productionRuntime.fetch(new Request(ORIGIN + planEnvelope.pollURL), env, {})).json()).result;
    assert.equal(plan.status, "ready-for-approval");
    assert.match(plan.plan.installationMode, /^kairos-canonical-homepage/);

    const executionSubmission = await request("/api/shopify/staging/execute/jobs", {
      method: "POST",
      body: {
        plan,
        approval: {
          status: "approved",
          approvedAt: new Date().toISOString(),
          planID: plan.planID,
          actionID: plan.actionID,
          targetThemeID: plan.plan.targetTheme.gid,
          sourceHashes: plan.plan.sourceHashes,
        },
      },
    }, env);
    assert.equal(executionSubmission.status, 202);
    const executionEnvelope = await executionSubmission.json();
    const execution = executionEnvelope.result || (await (await productionRuntime.fetch(new Request(ORIGIN + executionEnvelope.pollURL), env, {})).json()).result;
    assert.equal(execution.status, "completed");
    assert.equal(execution.execution.publishedThemeChanged, false);
    assert.equal(execution.execution.filesWritten.length, 3);
    assert.equal(shopify.completedWriteJobs, 1);
    assert.equal(shopify.writeJobPolls, 2);
    assert.equal(shopify.staleReadbacks, 0);
    assert.equal(execution.evidence.verificationSource, "shopify-successful-operation-results");
    assert.equal(execution.evidence.operationConfirmations.length, 3);
    assert.equal(execution.evidence.operationConfirmations.every(item => item.matched), true);
    assert.equal(execution.evidence.operationConfirmations.find(item => item.filename === "templates/index.json").actualBytes > 0, true);
    assert.deepEqual(shopify.writeBatches, [
      ["sections/mmg-canonical-homepage.liquid", "assets/mmg-canonical-homepage.css"],
      ["templates/index.json"],
    ]);
    assert.notDeepEqual(shopify.themeFiles(STAGING_ID), shopify.themeFiles(MAIN_ID));

    const visual = await jsonBody(await request("/api/shopify/staging/visual-verification", {
      method: "POST",
      body: { execution: execution.execution, result: execution, requestType: "homepage", path: "/" },
    }, env), 201);
    assert.equal(visual.status, "awaiting-executive-visual-review");
    assert.equal(visual.releaseTarget.approvedFiles.length, 3);
    assert.match(visual.preview.url, /preview_theme_id=2/);

    const approvedVisual = await jsonBody(await request("/api/shopify/staging/visual-approval", {
      method: "POST",
      body: { reviewID: visual.reviewID, decision: "approved", actor: "Executive", notes: "Mobile and desktop preview verified." },
    }, env));
    assert.equal(approvedVisual.status, "visual-review-approved");

    const prepared = await jsonBody(await request("/api/shopify/homepage-release/prepare", {
      method: "POST",
      body: { reviewID: visual.reviewID },
    }, env), 201);
    assert.equal(prepared.status, "awaiting-live-approval");
    assert.equal(prepared.targetTheme.role, "UNPUBLISHED");
    assert.equal(prepared.liveTheme.role, "MAIN");
    assert.equal(prepared.files.some(file => "stagingContent" in file || "liveBeforeContent" in file), false);

    const published = await jsonBody(await request("/api/shopify/homepage-release/publish", {
      method: "POST",
      body: { releaseID: prepared.releaseID, confirmation: "APPLY APPROVED HOMEPAGE", actor: "Executive" },
    }, env));
    assert.equal(published.status, "published-and-verified");
    assert.equal(published.publication.files.length, 3);
    assert.deepEqual(shopify.themeFiles(MAIN_ID), shopify.themeFiles(STAGING_ID));
    assert.equal(shopify.themeRole(MAIN_ID), "MAIN");
    assert.equal(shopify.themeRole(STAGING_ID), "UNPUBLISHED");

    const rolledBack = await jsonBody(await request("/api/shopify/homepage-release/rollback", {
      method: "POST",
      body: { releaseID: prepared.releaseID, confirmation: "ROLL BACK APPROVED HOMEPAGE", actor: "Executive" },
    }, env));
    assert.equal(rolledBack.status, "rolled-back-and-verified");
    assert.deepEqual(JSON.parse(shopify.themeFiles(MAIN_ID).get("templates/index.json")), uneditableHomepage());
    assert.equal(shopify.themeFiles(MAIN_ID).has("sections/mmg-canonical-homepage.liquid"), false);
    assert.equal(shopify.themeFiles(MAIN_ID).has("assets/mmg-canonical-homepage.css"), false);

    const failedRelease = await jsonBody(await request("/api/shopify/homepage-release/prepare", {
      method: "POST",
      body: { reviewID: visual.reviewID },
    }, env), 201);
    shopify.storefrontOK = false;
    const failedPublication = await jsonBody(await request("/api/shopify/homepage-release/publish", {
      method: "POST",
      body: { releaseID: failedRelease.releaseID, confirmation: "APPLY APPROVED HOMEPAGE", actor: "Executive" },
    }, env), 502);
    assert.equal(failedPublication.error.code, "publication_verification_failed_auto_restored");
    assert.deepEqual(JSON.parse(shopify.themeFiles(MAIN_ID).get("templates/index.json")), uneditableHomepage());
    assert.equal(shopify.themeFiles(MAIN_ID).has("sections/mmg-canonical-homepage.liquid"), false);
    const failedReceipt = await jsonBody(await productionRuntime.fetch(new Request(`${ORIGIN}/api/shopify/homepage-release/records/${failedRelease.releaseID}`), env, {}));
    assert.equal(failedReceipt.status, "publication-failed-auto-restored");
    assert.equal(failedReceipt.files.some(file => "stagingContent" in file || "liveBeforeContent" in file), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

async function request(path, { method = "GET", body } = {}, env) {
  return productionRuntime.fetch(new Request(ORIGIN + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }), env, {});
}

async function jsonBody(response, expectedStatus = 200) {
  const body = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}

function uneditableHomepage() {
  return {
    sections: {
      legacy_header: { type: "apps", settings: { color_scheme: "scheme-1", padding_top: 36 } },
      legacy_products: { type: "featured-product", settings: { product: "example-product", image_ratio: "adapt" } },
    },
    order: ["legacy_header", "legacy_products"],
  };
}

class MemoryCache {
  constructor() { this.values = new Map(); }
  async put(request, response) { this.values.set(String(request.url || request), response.clone()); }
  async match(request) { return this.values.get(String(request.url || request))?.clone(); }
}

class MultiThemeShopify {
  constructor(homepage, { deferredWrites = 0, staleReadsAfterJob = 0 } = {}) {
    this.storefrontOK = true;
    this.deferredWrites = deferredWrites;
    this.staleReadsAfterJob = staleReadsAfterJob;
    this.completedWriteJobs = 0;
    this.writeJobPolls = 0;
    this.staleReadbacks = 0;
    this.jobs = new Map();
    this.pendingWrites = [];
    this.writeBatches = [];
    this.nextJobID = 1;
    const source = JSON.stringify(homepage, null, 2) + "\n";
    this.themes = new Map([
      [MAIN_ID, { id: MAIN_ID, name: "Rise", role: "MAIN", processing: false, processingFailed: false }],
      [STAGING_ID, { id: STAGING_ID, name: "Kairos Staging", role: "UNPUBLISHED", processing: false, processingFailed: false }],
    ]);
    this.files = new Map([
      [MAIN_ID, new Map([["templates/index.json", source]])],
      [STAGING_ID, new Map([["templates/index.json", source]])],
    ]);
  }

  themeFiles(id) { return this.files.get(id); }
  themeRole(id) { return this.themes.get(id)?.role; }

  async fetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (!url.includes("/admin/api/")) {
      if (!this.storefrontOK) return new Response("Storefront unavailable", { status: 503, headers: { "Content-Type": "text/plain" } });
      return new Response("<!doctype html><html><head><title>Mindset Media Group</title><meta name=\"viewport\" content=\"width=device-width\"></head><body><main><h1>Your Knowledge Has Value</h1><a href=\"/pages/customer-portal\">Customer Portal</a></main></body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const body = JSON.parse(init.body);
    const query = String(body.query || "");
    const variables = body.variables || {};

    if (query.includes("query KairosThemes")) {
      return Response.json({ data: { themes: { nodes: [...this.themes.values()] } } });
    }
    if (query.includes("query KairosHomepageFile") || query.includes("query KairosThemeFiles")) {
      this.releaseCompletedWrites(variables.themeId);
      const files = this.files.get(variables.themeId) || new Map();
      const nodes = (variables.filenames || []).filter(filename => files.has(filename)).map(filename => ({
        filename,
        contentType: "TEXT",
        body: { content: files.get(filename) },
      }));
      const userErrors = (variables.filenames || []).filter(filename => !files.has(filename)).map(filename => ({ code: "NOT_FOUND", filename }));
      return Response.json({ data: { theme: { files: { nodes, userErrors } } } });
    }
    if (query.includes("query KairosThemeFileJob")) {
      const job = this.jobs.get(variables.id);
      if (!job) return Response.json({ data: { job: null } });
      this.writeJobPolls += 1;
      job.pollsRemaining -= 1;
      if (job.pollsRemaining <= 0 && !job.done) {
        if (this.staleReadsAfterJob > 0) {
          this.pendingWrites.push({ themeId: job.themeId, files: job.files, readsRemaining: this.staleReadsAfterJob });
        } else {
          this.applyFiles(job.themeId, job.files);
        }
        job.done = true;
        this.completedWriteJobs += 1;
      }
      const nodes = job.done ? (variables.filenames || []).filter(filename => job.files.some(file => file.filename === filename)).map(filename => {
        const file = job.files.find(item => item.filename === filename);
        return { filename, contentType: "TEXT", body: { content: file.body.value } };
      }) : [];
      return Response.json({ data: { job: { id: job.id, done: job.done, query: job.done ? { theme: { files: { nodes, userErrors: [] } } } : null } } });
    }
    if (query.includes("mutation KairosThemeFilesUpsert")) {
      this.writeBatches.push((variables.files || []).map(file => file.filename));
      if (this.deferredWrites > 0) {
        this.deferredWrites -= 1;
        const id = `gid://shopify/Job/${this.nextJobID++}`;
        this.jobs.set(id, { id, done: false, pollsRemaining: 2, themeId: variables.themeId, files: structuredClone(variables.files || []) });
        return Response.json({ data: { themeFilesUpsert: { job: { id, done: false }, upsertedThemeFiles: [], userErrors: [] } } });
      }
      this.applyFiles(variables.themeId, variables.files || []);
      return Response.json({ data: { themeFilesUpsert: { job: null, upsertedThemeFiles: (variables.files || []).map(file => ({ filename: file.filename, checksumMd5: md5Text(file.body.value), size: file.filename === "templates/index.json" ? null : new TextEncoder().encode(file.body.value).length, updatedAt: new Date().toISOString() })), userErrors: [] } } });
    }
    if (query.includes("mutation KairosThemeFilesDelete")) {
      const files = this.files.get(variables.themeId);
      for (const filename of variables.files || []) files.delete(filename);
      return Response.json({ data: { themeFilesDelete: { deletedThemeFiles: (variables.files || []).map(filename => ({ filename })), userErrors: [] } } });
    }
    return Response.json({ errors: [{ message: "Unexpected Shopify GraphQL operation." }] }, { status: 422 });
  }

  applyFiles(themeId, files) {
    const target = this.files.get(themeId);
    for (const file of files) target.set(file.filename, file.body.value);
  }

  releaseCompletedWrites(themeId) {
    for (const pending of this.pendingWrites) {
      if (pending.themeId !== themeId || pending.applied) continue;
      if (pending.readsRemaining > 0) {
        pending.readsRemaining -= 1;
        this.staleReadbacks += 1;
        continue;
      }
      this.applyFiles(pending.themeId, pending.files);
      pending.applied = true;
    }
    this.pendingWrites = this.pendingWrites.filter(pending => !pending.applied);
  }
}
