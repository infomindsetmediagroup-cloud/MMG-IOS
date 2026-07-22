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

test("deployed iPhone flow completes intake and assignment without an editorial request storm", async ({ page }) => {
  const errors = [];
  const calls = [];
  let savedSetup = false;
  let editorialReads = 0;

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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "updated" }),
      });
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
      calls.push({
        method,
        path,
        role: "cover",
        contentType: request.headers()["content-type"],
        filename: request.headers()["x-filename"],
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "stored", cover: { filename: "cover.png" } }),
      });
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
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(savedSetupRecord()),
      });
      return;
    }

    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/editorial$/.test(path)) {
      editorialReads += 1;
      calls.push({ method, path, role: "editorial" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          editorial: {
            status: "not-started",
            stage: "editorial-intake",
            currentVersionId: null,
            versions: [],
            review: null,
          },
        }),
      });
      return;
    }

    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/source\/text$/.test(path)) {
      calls.push({ method, path, role: "editorial-source" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ manuscript: "The preserved manuscript source for the deployed WebKit validation." }),
      });
      return;
    }

    if (method === "GET" && /^\/api\/production-registry\/manuscripts\/[^/]+\/(manufacturing|delivery|platform-submission)$/.test(path)) {
      const domain = path.split("/").at(-1);
      calls.push({ method, path, role: domain });
      const key = domain === "platform-submission" ? "submission" : domain;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ [key]: null }),
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

  await expect(overlay.locator("#manuscript-project-setup h3")).toHaveText("assigned-to-production", {
    timeout: 15_000,
  });
  await expect(overlay.locator("#manuscript-project-setup")).toContainText(
    "Begin the assigned editorial and production queue.",
  );
  await expect(overlay.locator("#manuscript-editorial-workbench")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => editorialReads).toBe(1);
  await page.waitForTimeout(1_000);

  expect(editorialReads).toBe(1);
  expect(calls.some((call) => call.role === "source")).toBe(true);
  expect(calls.some((call) => call.role === "intake")).toBe(true);
  expect(calls.some((call) => call.role === "registry")).toBe(true);
  expect(calls.some((call) => call.role === "cover" && call.contentType === "image/png" && call.filename === "cover.png")).toBe(true);
  expect(calls.some((call) => call.role === "assignment")).toBe(true);
  expect(errors).toEqual([]);
});
