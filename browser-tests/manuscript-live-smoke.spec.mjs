import { expect, test } from "@playwright/test";

const liveURL = process.env.KAIROS_LIVE_URL;
const ACTIVE_KEY = "kairos.production.active-workspace";

test.skip(!liveURL, "KAIROS_LIVE_URL is required for the deployed-app smoke test.");

async function openManuscriptStudio(page) {
  await page.goto(`${liveURL}/?proof=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptSetupController?.ready === true),
    { timeout: 15_000 },
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptSetupController?.build || ""),
  ).toBe("kairos-manuscript-project-setup-ui-20260722-3");

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptAutoPipelineController?.ready === true),
    { timeout: 15_000 },
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptAutoPipelineController?.build || ""),
  ).toBe("kairos-manuscript-auto-pipeline-ui-20260722-1");

  await expect.poll(
    () => page.evaluate(() => typeof window.KairosProductionWorkspace?.open === "function"),
    { timeout: 15_000 },
  ).toBe(true);

  const contentCenter = page.locator('.parent-card[data-center="content"]');
  await expect(contentCenter).toBeVisible({ timeout: 15_000 });
  await contentCenter.tap();

  const manuscriptAction = page.locator('[data-child="manuscript-studio"]');
  await expect(manuscriptAction).toBeVisible();
  await expect(manuscriptAction).toHaveText("Open Manuscript Studio");
  await manuscriptAction.tap();

  const overlay = page.locator("#manuscript-studio-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole("heading", { name: "Manuscript Studio" })).toBeVisible();
  return overlay;
}

function savedSetupRecord() {
  return {
    status: "assigned-to-production",
    nextAction: "Begin the assigned editorial and production queue.",
    setup: {
      status: "assigned-to-production",
      assignments: [
        { department: "Publishing Operations", role: "Project ownership", status: "assigned" },
      ],
      milestones: [
        { label: "Project setup", status: "completed" },
      ],
    },
  };
}

function productionReadyRecord(projectId, shopify = { status: "not-prepared" }) {
  return {
    status: "production-ready",
    projectId,
    metadata: {
      title: "Live WebKit Publication",
      subtitle: "Automatically Manufactured and Vaulted",
      author: "Michael King",
      description: "A complete deployed-browser validation of the automatic manuscript production pipeline.",
      keywords: ["publishing", "manuscript", "production", "digital", "creator", "workflow", "assets"],
      categories: ["Education / General", "Business & Economics / Skills", "Self-Help / General"],
      price: "9.95",
      currency: "USD",
      rights: { territories: ["Worldwide"] },
      templateSuffix: "mmg-book-product",
    },
    vault: {
      assetCount: 2,
      integrity: { passed: true, assetCount: 2 },
      packageDownloadURL: `/api/admin-asset-vault/projects/${projectId}/package`,
      assets: [
        {
          assetId: "gold-master-docx-liveproof1",
          filename: "gold-master.docx",
          role: "PRODUCTION_DELIVERABLE",
          byteSize: 24576,
          sha256: "1".repeat(64),
          downloadURL: `/api/admin-asset-vault/projects/${projectId}/assets/gold-master-docx-liveproof1`,
        },
        {
          assetId: "complete-production-package-zip-liveproof1",
          filename: "complete-production-package.zip",
          role: "FINAL_PRODUCTION_ZIP",
          byteSize: 1048576,
          sha256: "2".repeat(64),
          downloadURL: `/api/admin-asset-vault/projects/${projectId}/assets/complete-production-package-zip-liveproof1`,
        },
      ],
    },
    shopify,
  };
}

test("deployed Content route opens and registers a durable Manuscript Studio workspace", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await openManuscriptStudio(page);

  await expect.poll(
    () => page.evaluate((key) => {
      try {
        return JSON.parse(sessionStorage.getItem(key) || "null");
      } catch {
        return null;
      }
    }, ACTIVE_KEY),
    { timeout: 15_000 },
  ).toMatchObject({
    workspace: "manuscript-studio",
    projectId: expect.stringMatching(/^manuscript-studio-[a-z0-9-]+$/i),
  });

  await page.waitForTimeout(1_000);
  expect(errors).toEqual([]);
});

test("deployed iPhone flow completes intake, assignment, automatic vault packaging, and draft preparation without manual catalog fields", async ({ page }) => {
  const errors = [];
  const calls = [];
  let savedSetup = false;
  let editorialReads = 0;
  let autoPipelineReads = 0;
  let autoPipelineRuns = 0;

  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === "POST" && /^\/api\/production-registry\/manuscripts\/[^/]+\/source$/.test(path)) {
      calls.push({ method, path, role: "source" });
      const projectId = decodeURIComponent(path.split("/").at(-2));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "stored",
          source: {
            projectId,
            name: "live-webkit-manuscript.txt",
            size: 180,
            format: "txt",
            storedAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    if (method === "POST" && path === "/api/manuscript/intake/advance") {
      calls.push({ method, path, role: "intake" });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "production_intake",
          projectID: "intake-live-webkit",
          intakeID: "intake-live-webkit-1",
          customerMessage: "Your manuscript has advanced into MMG production intake.",
          manuscript: { characterCount: 180, wordCount: 28 },
          workflow: {
            requiredNextActions: [
              "Confirm publication metadata and service.",
              "Upload customer cover artwork.",
            ],
          },
        }),
      });
      return;
    }

    if (method === "PATCH" && /^\/api\/production-registry\/projects\/[^/]+$/.test(path)) {
      calls.push({ method, path, role: "registry" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "updated" }) });
      return;
    }

    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/setup$/.test(path)) {
      calls.push({ method, path, role: "setup-status" });
      await route.fulfill({
        status: savedSetup ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(savedSetup ? savedSetupRecord() : {
          status: "not-found",
          error: { code: "manuscript_setup_not_found", message: "Project setup has not been completed." },
        }),
      });
      return;
    }

    if (method === "PUT" && /^\/api\/production-registry\/manuscripts\/[^/]+\/setup\/cover$/.test(path)) {
      calls.push({ method, path, role: "cover", contentType: request.headers()["content-type"], filename: request.headers()["x-filename"] });
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "stored", cover: { filename: "cover.png" } }) });
      return;
    }

    if (method === "POST" && /^\/api\/production-registry\/manuscripts\/[^/]+\/setup$/.test(path)) {
      calls.push({ method, path, role: "assignment" });
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.authorName).toBe("Michael King");
      expect(payload.publicationTitle).toBe("Live WebKit Publication");
      expect(payload.service).toBe("complete-publishing-package");
      expect(payload.operationId).toBeTruthy();
      savedSetup = true;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(savedSetupRecord()) });
      return;
    }

    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/editorial$/.test(path)) {
      editorialReads += 1;
      calls.push({ method, path, role: "editorial" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ready", editorial: { status: "not-started", stage: "editorial-intake", currentVersionId: null, versions: [], review: null } }),
      });
      return;
    }

    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/source\/text$/.test(path)) {
      calls.push({ method, path, role: "editorial-source" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ manuscript: "The preserved manuscript source for the deployed WebKit validation." }) });
      return;
    }

    const autoMatch = path.match(/^\/api\/production-registry\/manuscripts\/([^/]+)\/auto-pipeline(?:\/(run|shopify-draft))?$/);
    if (autoMatch && method === "GET" && !autoMatch[2]) {
      autoPipelineReads += 1;
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "auto_pipeline_not_started" } }) });
      return;
    }

    if (autoMatch && method === "POST" && autoMatch[2] === "run") {
      autoPipelineRuns += 1;
      calls.push({ method, path, role: "auto-pipeline-run" });
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(productionReadyRecord(autoMatch[1])) });
      return;
    }

    if (autoMatch && method === "POST" && autoMatch[2] === "shopify-draft") {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.confirmation).toBe("CREATE SHOPIFY PRODUCT DRAFT");
      calls.push({ method, path, role: "shopify-draft" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(productionReadyRecord(autoMatch[1], {
          status: "draft-created-media-installed-awaiting-live-approval",
          prepared: { desired: { title: "Live WebKit Publication", productType: "Digital Download", templateSuffix: "mmg-book-product", price: "9.95" } },
          publication: { previewURL: "https://example.myshopify.com/products/live-webkit-publication" },
          media: { status: "media-installed-and-verified" },
          launch: { releaseId: "live-webkit-launch", requiredChecks: ["Cover correct"] },
        })),
      });
      return;
    }

    await route.continue();
  });

  const overlay = await openManuscriptStudio(page);
  await overlay.locator("#ms-title").fill("Live WebKit Publication");
  await overlay.locator("#ms-body").fill(
    "This is a complete browser-level manuscript test with enough text to pass intake validation and exercise every required button in the deployed Manuscript Studio flow.",
  );
  await overlay.locator("[data-advance]").tap();

  await expect(overlay.locator(".manuscript-result")).toBeVisible({ timeout: 15_000 });
  await expect(overlay.locator("#manuscript-project-setup")).toBeVisible({ timeout: 15_000 });

  await overlay.locator("[data-setup-author]").fill("Michael King");
  await overlay.locator("[data-setup-title]").fill("Live WebKit Publication");
  await overlay.locator("[data-setup-service]").selectOption("complete-publishing-package");
  await overlay.locator("[data-setup-cover]").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
  });

  await overlay.locator("[data-setup-submit]").tap();

  await expect(overlay.locator("#manuscript-project-setup h3")).toHaveText("assigned-to-production", { timeout: 15_000 });
  await expect(overlay.locator("#manuscript-editorial-workbench")).toBeVisible({ timeout: 15_000 });
  await expect(overlay.locator("#manuscript-auto-pipeline")).toBeVisible({ timeout: 15_000 });
  await expect(overlay.locator("#manuscript-auto-pipeline")).toContainText("Admin Asset Vault");
  await expect(overlay.locator("#manuscript-auto-pipeline a", { hasText: "Download Production-Ready ZIP" })).toBeVisible();
  expect(await overlay.locator("[data-cat-title], [data-cat-isbn], [data-cat-asin], [data-cat-rights-note]").count()).toBe(0);
  expect(await overlay.getByText("Prepare Catalog Record", { exact: true }).count()).toBe(0);

  await expect.poll(() => editorialReads).toBe(1);
  await expect.poll(() => autoPipelineRuns).toBe(1);
  await page.waitForTimeout(1_000);
  expect(editorialReads).toBe(1);
  expect(autoPipelineReads).toBe(1);
  expect(autoPipelineRuns).toBe(1);

  await overlay.locator("[data-auto-shopify-draft]").tap();
  await expect(overlay.locator("#manuscript-auto-pipeline")).toContainText("Draft created and media installed");

  expect(calls.some((call) => call.role === "source")).toBe(true);
  expect(calls.some((call) => call.role === "intake")).toBe(true);
  expect(calls.some((call) => call.role === "registry")).toBe(true);
  expect(calls.some((call) => call.role === "cover" && call.contentType === "image/png" && call.filename === "cover.png")).toBe(true);
  expect(calls.some((call) => call.role === "assignment")).toBe(true);
  expect(calls.some((call) => call.role === "auto-pipeline-run")).toBe(true);
  expect(calls.some((call) => call.role === "shopify-draft")).toBe(true);
  expect(errors).toEqual([]);
});
