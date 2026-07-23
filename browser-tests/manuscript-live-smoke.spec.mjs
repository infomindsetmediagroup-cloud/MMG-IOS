import { expect, test } from "@playwright/test";

const liveURL = process.env.KAIROS_LIVE_URL;
const ACTIVE_KEY = "kairos.production.active-workspace";
const SMOKE_INFERENCE_BUILD = "kairos-local-inference-live-webkit-smoke";
const SMOKE_INFERENCE_MODEL = "playwright-webkit-smoke-model";

test.skip(!liveURL, "KAIROS_LIVE_URL is required for the deployed-app smoke test.");

async function openManuscriptStudio(page) {
  await page.goto(`${liveURL}/?proof=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.KairosManuscriptSetupController?.ready === true), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.KairosManuscriptSetupController?.build || "")).toBe("kairos-manuscript-project-setup-ui-20260722-3");
  await expect.poll(() => page.evaluate(() => window.KairosManuscriptAutoPipelineController?.ready === true), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.KairosManuscriptAutoPipelineController?.build || "")).toBe("kairos-manuscript-auto-pipeline-ui-20260722-1");
  await expect.poll(() => page.evaluate(() => window.KairosPublishingExperience?.ready === true), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => typeof window.KairosProductionWorkspace?.open === "function"), { timeout: 15_000 }).toBe(true);

  const contentCenter = page.locator('.parent-card[data-center="content"]');
  await expect(contentCenter).toBeVisible({ timeout: 15_000 });
  await contentCenter.tap();
  const manuscriptAction = page.locator('[data-child="manuscript-studio"]');
  await expect(manuscriptAction).toBeVisible();
  await manuscriptAction.tap();
  const overlay = page.locator("#manuscript-studio-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole("heading", { name: "Manuscript Studio" })).toBeVisible();
  return overlay;
}

async function installLocalInferenceSmokeDouble(page) {
  await page.evaluate(({ build, model }) => {
    window.KairosLocalInference = Object.freeze({
      ready: true,
      build,
      async run({ onProgress } = {}) {
        onProgress?.("Deterministic live-smoke inference complete");
        return {
          status: "local-inference-ready",
          build,
          model,
          wordCount: 25_500,
          generatedSections: 4,
        };
      },
      getModel: () => model,
    });
  }, { build: SMOKE_INFERENCE_BUILD, model: SMOKE_INFERENCE_MODEL });

  await expect.poll(() => page.evaluate(() => window.KairosLocalInference?.build || "")).toBe(SMOKE_INFERENCE_BUILD);
}

function savedSetupRecord() {
  return {
    status: "assigned-to-production",
    nextAction: "Begin the assigned editorial and production queue.",
    setup: {
      status: "assigned-to-production",
      assignments: [{ department: "Publishing Operations", role: "Project ownership", status: "assigned" }],
      milestones: [{ label: "Project setup", status: "completed" }],
    },
  };
}

function productionReadyRecord(projectId, status = "production-ready", shopify = { status: "not-prepared" }) {
  return {
    status,
    projectId,
    signature: "a".repeat(64),
    metadata: {
      title: "Live WebKit Publication",
      subtitle: "Manufactured, Reviewed, and Vaulted",
      author: "Mindset Media Group™",
      description: "A deployed-browser validation of the explicit publishing experience.",
      price: "9.95",
      currency: "USD",
      templateSuffix: "mmg-book-product",
    },
    vault: {
      assetCount: 2,
      integrity: { passed: true, assetCount: 2 },
      packageDownloadURL: `/api/admin-asset-vault/projects/${projectId}/package`,
      assets: [
        { assetId: "digital-edition-liveproof1", filename: "digital-asset-edition-v2.pdf", role: "CUSTOMER_DELIVERABLE", byteSize: 24576, downloadURL: `/api/admin-asset-vault/projects/${projectId}/assets/digital-edition-liveproof1` },
        { assetId: "complete-production-package-zip-liveproof1", filename: "complete-production-package.zip", role: "FINAL_PRODUCTION_ZIP", byteSize: 1048576, downloadURL: `/api/admin-asset-vault/projects/${projectId}/assets/complete-production-package-zip-liveproof1` },
      ],
    },
    shopify,
  };
}

function approvedRecord(projectId) {
  return {
    ...productionReadyRecord(projectId, "package-approved"),
    packageApproval: { approved: true, approvedAt: new Date().toISOString(), approvedBy: "MMG Executive", immutableVersion: true },
  };
}

function draftRecord(projectId) {
  return productionReadyRecord(projectId, "package-approved", {
    status: "draft-created-media-installed-awaiting-live-approval",
    publication: {
      status: "draft-created-delivery-attached-and-verified",
      previewURL: "https://example.myshopify.com/products/live-webkit-publication",
      customerDelivery: { status: "attached-and-verified" },
    },
    media: { status: "media-installed-and-verified" },
    launch: { releaseId: "live-webkit-launch", requiredChecks: ["Cover correct"] },
  });
}

test("deployed Content route opens and registers a durable Manuscript Studio workspace", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openManuscriptStudio(page);
  await expect.poll(() => page.evaluate(key => {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch { return null; }
  }, ACTIVE_KEY), { timeout: 15_000 }).toMatchObject({
    workspace: "manuscript-studio",
    projectId: expect.stringMatching(/^manuscript-studio-[a-z0-9-]+$/i),
  });
  await page.waitForTimeout(1_000);
  expect(errors).toEqual([]);
});

test("deployed iPhone flow requires Start, Package Approval, and Shopify Preview actions", async ({ page }) => {
  const errors = [];
  const calls = [];
  let savedSetup = false;
  let editorialReads = 0;
  let autoPipelineReads = 0;
  let autoPipelineRuns = 0;

  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (method === "POST" && /^\/api\/production-registry\/manuscripts\/[^/]+\/source$/.test(path)) {
      calls.push("source");
      const projectId = decodeURIComponent(path.split("/").at(-2));
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "stored", source: { projectId, name: "live-webkit-manuscript.txt", size: 180, format: "txt", storedAt: new Date().toISOString() } }) });
    }
    if (method === "POST" && path === "/api/manuscript/intake/advance") {
      calls.push("intake");
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "production_intake", projectID: "intake-live-webkit", intakeID: "intake-live-webkit-1", customerMessage: "Your manuscript has advanced into MMG production intake.", manuscript: { characterCount: 180, wordCount: 28 }, workflow: { requiredNextActions: ["Confirm publication metadata and service.", "Upload customer cover artwork."] } }) });
    }
    if (method === "PATCH" && /^\/api\/production-registry\/projects\/[^/]+$/.test(path)) {
      calls.push("registry");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "updated" }) });
    }
    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/setup$/.test(path)) {
      return route.fulfill({ status: savedSetup ? 200 : 404, contentType: "application/json", body: JSON.stringify(savedSetup ? savedSetupRecord() : { status: "not-found", error: { code: "manuscript_setup_not_found", message: "Project setup has not been completed." } }) });
    }
    if (method === "PUT" && /^\/api\/production-registry\/manuscripts\/[^/]+\/setup\/cover$/.test(path)) {
      calls.push("cover");
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "stored", cover: { filename: "cover.png" } }) });
    }
    if (method === "POST" && /^\/api\/production-registry\/manuscripts\/[^/]+\/setup$/.test(path)) {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.publicationTitle).toBe("Live WebKit Publication");
      expect(payload.service).toBe("complete-publishing-package");
      savedSetup = true;
      calls.push("assignment");
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(savedSetupRecord()) });
    }
    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/editorial$/.test(path)) {
      editorialReads += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", editorial: { status: "not-started", stage: "editorial-intake", currentVersionId: null, versions: [], review: null } }) });
    }
    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/source\/text$/.test(path)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ manuscript: "The preserved manuscript source for the deployed WebKit validation." }) });
    }

    const approvalMatch = path.match(/^\/api\/production-registry\/manuscripts\/([^/]+)\/experience\/approve-package$/);
    if (approvalMatch && method === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.confirmation).toBe("APPROVE PACKAGE");
      calls.push("approve-package");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(approvedRecord(approvalMatch[1])) });
    }

    const autoMatch = path.match(/^\/api\/production-registry\/manuscripts\/([^/]+)\/auto-pipeline(?:\/(run|shopify-draft))?$/);
    if (autoMatch && method === "GET" && !autoMatch[2]) {
      autoPipelineReads += 1;
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "auto_pipeline_not_started" } }) });
    }
    if (autoMatch && method === "POST" && autoMatch[2] === "run") {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.localInferenceBuild).toBe(SMOKE_INFERENCE_BUILD);
      expect(payload.localInferenceModel).toBe(SMOKE_INFERENCE_MODEL);
      autoPipelineRuns += 1;
      calls.push("start-production");
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(productionReadyRecord(autoMatch[1])) });
    }
    if (autoMatch && method === "POST" && autoMatch[2] === "shopify-draft") {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.confirmation).toBe("CREATE SHOPIFY PRODUCT DRAFT");
      calls.push("preview-shopify");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(draftRecord(autoMatch[1])) });
    }
    return route.continue();
  });

  const overlay = await openManuscriptStudio(page);
  await installLocalInferenceSmokeDouble(page);
  await overlay.locator("#ms-title").fill("Live WebKit Publication");
  await overlay.locator("#ms-body").fill("This is a complete browser-level manuscript test with enough text to pass intake validation and exercise every required button in the deployed Manuscript Studio flow.");
  await overlay.locator("[data-advance]").tap();
  await expect(overlay.locator("#manuscript-project-setup")).toBeVisible({ timeout: 15_000 });
  await overlay.locator("[data-setup-author]").fill("Michael King");
  await overlay.locator("[data-setup-title]").fill("Live WebKit Publication");
  await overlay.locator("[data-setup-service]").selectOption("complete-publishing-package");
  await overlay.locator("[data-setup-cover]").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]) });
  await overlay.locator("[data-setup-submit]").tap();

  await expect(overlay.locator("#manuscript-project-setup h3")).toHaveText("assigned-to-production", { timeout: 15_000 });
  await expect(overlay.locator("#manuscript-editorial-workbench")).toBeVisible({ timeout: 15_000 });
  const pipeline = overlay.locator("#manuscript-auto-pipeline");
  await expect(pipeline).toBeVisible({ timeout: 15_000 });
  await expect(pipeline).toContainText("Start a New Production Job");
  expect(autoPipelineRuns).toBe(0);

  await pipeline.locator("[data-start-production]").tap();
  await expect(pipeline).toContainText("Package Preview");
  await expect(pipeline.getByRole("link", { name: "Preview Package" })).toBeVisible();

  await pipeline.locator("[data-approve-package]").tap();
  await expect(pipeline).toContainText("Admin Asset Vault");
  await expect(pipeline).toContainText("Production Complete");

  await pipeline.locator("[data-preview-shopify]").tap();
  await expect(pipeline).toContainText("Shopify Product Preview");
  await expect(pipeline).toContainText("Attached and verified");

  expect(await overlay.locator("[data-cat-title], [data-cat-isbn], [data-cat-asin], [data-cat-rights-note]").count()).toBe(0);
  expect(await overlay.getByText("Prepare Catalog Record", { exact: true }).count()).toBe(0);
  await expect.poll(() => editorialReads).toBe(1);
  await expect.poll(() => autoPipelineReads).toBe(1);
  await expect.poll(() => autoPipelineRuns).toBe(1);
  expect(calls).toEqual(expect.arrayContaining(["source", "intake", "registry", "cover", "assignment", "start-production", "approve-package", "preview-shopify"]));
  expect(errors).toEqual([]);
});
