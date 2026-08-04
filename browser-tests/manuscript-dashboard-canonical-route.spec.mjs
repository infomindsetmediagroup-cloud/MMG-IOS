import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const dashboardRouteSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-dashboard-route-bridge.js", import.meta.url),
  "utf8",
);
const dedicatedRestoreSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-dedicated-project-restore.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-dashboard-handoff-12345678";
const MANUSCRIPT = "AI Video Prompt Mastery accepted manuscript content. ".repeat(5_800);

test("Content manuscript card routes to the dedicated Studio without running the embedded receipt", async ({ page }) => {
  const requests = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), path: url.pathname });

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <button type="button" data-child="manuscript-studio">Open Manuscript Studio</button>
          <div data-embedded-receipt hidden>Old embedded receipt</div>
        </body></html>`,
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
      openedAt: new Date().toISOString(),
    }));
  }, PROJECT_ID);
  await page.addScriptTag({ content: dashboardRouteSource });

  await page.locator('[data-child="manuscript-studio"]').click({ force: true });

  await expect.poll(() => new URL(page.url()).pathname).toBe("/manuscript");
  expect(new URL(page.url()).searchParams.get("open")).toBe("manuscript");
  expect(new URL(page.url()).searchParams.get("handoff")).toBe("dashboard-content");
  expect(new URL(page.url()).searchParams.get("project")).toBe(PROJECT_ID);

  const active = await page.evaluate(() => JSON.parse(
    sessionStorage.getItem("kairos.production.active-workspace") || "null",
  ));
  expect(active).toMatchObject({
    workspace: "manuscript-studio",
    projectId: PROJECT_ID,
    handoffReason: "content-card",
  });

  expect(requests.some(item => item.path.includes("/source/text"))).toBe(false);
  expect(requests.some(item => item.method === "POST" && item.path === "/api/production-registry/projects")).toBe(false);
});

test("dedicated Studio restores the exact dashboard project and accepted production stage", async ({ page }) => {
  const calls = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({ method: request.method(), path: url.pathname });

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div id="manuscript-studio-overlay" class="manuscript-overlay">
            <section class="manuscript-panel">
              <header><h2>Manuscript Studio</h2></header>
              <div data-blank-intake>Blank intake form</div>
            </section>
          </div>
        </body></html>`,
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/production-registry/projects") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projects: [{
            projectId: PROJECT_ID,
            projectType: "manuscript-studio",
            title: "AI Video Prompt Mastery",
            status: "assigned-to-production",
            stage: "editorial",
            progress: 55,
            activeWorkspace: "manuscript-studio",
            summary: "The manuscript, cover, metadata, and production assignment are stored and resumable.",
            nextAction: "Continue editorial production.",
            updatedAt: "2026-08-04T02:00:00.000Z",
          }],
        }),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === `/api/production-registry/manuscripts/${PROJECT_ID}/source/text`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          manuscript: MANUSCRIPT,
          source: {
            projectId: PROJECT_ID,
            filename: "AI Video Prompt Mastery.docx",
            format: "docx",
            stored: true,
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto(`https://kairos.test/manuscript?open=manuscript&handoff=dashboard-content&project=${PROJECT_ID}`);
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
    window.KairosManuscriptStudio = { ready: true };
    window.KairosManuscriptSetupController = {
      ready: true,
      enhance() {
        const setup = document.querySelector("#manuscript-project-setup");
        if (!setup) return;
        setup.removeAttribute("data-kairos-project-setup-shell");
        setup.innerHTML = '<p class="eyebrow">Editorial production</p><h3>Editorial Workbench</h3><p>Continue editorial production.</p>';
      },
    };
    window.KairosManuscriptReceiptContinuationRecovery = { recover() {} };
    window.addEventListener("kairos:manuscript:restore", event => {
      const overlay = document.querySelector("#manuscript-studio-overlay");
      overlay.dataset.restoredProjectId = event.detail?.project?.projectId || "";
    });
  }, PROJECT_ID);

  await page.addScriptTag({ content: dedicatedRestoreSource });
  window;
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:opened"));
  });

  const receipt = page.locator('[data-kairos-intake-receipt="dedicated-project-restore"]');
  await expect(receipt).toBeVisible({ timeout: 8_000 });
  await expect(receipt).toContainText("Connected manuscript project");
  await expect(receipt).toContainText("assigned-to-production");
  await expect(receipt).toContainText("Stage: editorial");
  await expect(receipt).toContainText("AI Video Prompt Mastery.docx");
  await expect(receipt).toContainText("Editorial Workbench");
  await expect(page.locator("[data-blank-intake]")).toHaveCount(0);
  await expect(page.locator("#manuscript-studio-overlay")).toHaveAttribute("data-restored-project-id", PROJECT_ID);

  const snapshot = await page.evaluate(() => window.KairosManuscriptDedicatedRestore.snapshot());
  expect(snapshot).toMatchObject({
    projectId: PROJECT_ID,
    restored: true,
    lastError: null,
  });
  expect(calls.some(item => item.path === `/api/production-registry/manuscripts/${PROJECT_ID}/source/text`)).toBe(true);
  expect(calls.some(item => item.method === "POST" && item.path === "/api/production-registry/projects")).toBe(false);
});
