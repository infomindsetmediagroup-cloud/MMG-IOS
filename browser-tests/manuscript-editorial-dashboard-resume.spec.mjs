import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const editorialSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/production-workspace-controller.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-connected-project-12345678";
const EDITORIAL_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/editorial`;
const SOURCE_TEXT_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/source/text`;

test("a stalled Safari editorial request becomes a visible retry and then recovers", async ({ page }) => {
  let editorialReads = 0;
  let allowEditorial = false;

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div id="manuscript-studio-overlay">
            <div class="manuscript-result">
              <section id="manuscript-project-setup">
                <p>Production assignment</p>
                <h3>assigned-to-production</h3>
              </section>
            </div>
          </div>
        </body></html>`,
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === EDITORIAL_PATH) {
      editorialReads += 1;
      if (!allowEditorial) {
        await new Promise(resolve => setTimeout(resolve, 1_000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "late" }),
        }).catch(() => {});
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          editorial: {
            status: "editorial-in-progress",
            stage: "editorial-intake",
            currentVersionId: null,
            versions: [],
            review: null,
          },
        }),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === SOURCE_TEXT_PATH) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ manuscript: "Recovered editorial manuscript content ".repeat(30) }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/manuscript?open=manuscript");
  await page.evaluate(projectId => {
    globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__ = 250;
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
  }, PROJECT_ID);
  await page.addScriptTag({ type: "module", content: editorialSource });

  const workbench = page.locator("#manuscript-editorial-workbench");
  await expect(workbench).toContainText("Editorial Workbench needs attention", { timeout: 4_000 });
  await expect(workbench.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect.poll(() => editorialReads).toBe(2);
  await expect.poll(
    () => page.evaluate(() => window.KairosEditorialWorkbenchController.snapshot()),
  ).toMatchObject({ busy: false, loaded: false, requestTimeoutMs: 250 });

  allowEditorial = true;
  await workbench.getByRole("button", { name: "Retry" }).click({ force: true });

  await expect(workbench).toContainText("Editorial production in progress");
  await expect(workbench.locator("[data-editorial-save]")).toBeVisible();
  await expect.poll(() => editorialReads).toBe(3);
  await expect.poll(
    () => page.evaluate(() => window.KairosEditorialWorkbenchController.snapshot()),
  ).toMatchObject({ busy: false, loaded: true, error: null });
});

test("Content Manuscript Studio resumes the durable project instead of opening a disconnected intake", async ({ page }) => {
  const calls = [];
  const manuscript = "Connected manuscript source content ".repeat(120);

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({ method: request.method(), path: url.pathname });

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <button type="button" data-child="manuscript-studio">Open Manuscript Studio</button>
          <button type="button" class="manuscript-launch" hidden>Embedded launcher</button>
        </body></html>`,
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/production-registry/projects") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
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
            updatedAt: "2026-08-04T01:00:00.000Z",
          }],
        }),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === SOURCE_TEXT_PATH) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          manuscript,
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

  await page.goto("https://kairos.test/");
  await page.evaluate(() => {
    document.querySelector(".manuscript-launch").addEventListener("click", () => {
      if (document.querySelector("#manuscript-studio-overlay")) return;
      const overlay = document.createElement("div");
      overlay.id = "manuscript-studio-overlay";
      overlay.className = "manuscript-overlay";
      overlay.innerHTML = '<section class="manuscript-panel"><header><h2>Manuscript Studio</h2><button data-close>×</button></header><div data-disconnected-intake>Blank intake form</div></section>';
      document.body.append(overlay);
    });
    window.KairosManuscriptSetupController = {
      ready: true,
      enhance() {
        const section = document.querySelector("#manuscript-project-setup");
        if (!section) return;
        section.removeAttribute("data-kairos-project-setup-shell");
        section.innerHTML = '<p class="eyebrow">Production assignment</p><h3>assigned-to-production</h3><p>Continue editorial production.</p>';
      },
    };
    window.KairosManuscriptReceiptContinuationRecovery = { recover() {} };
  });
  await page.addScriptTag({ content: workspaceSource });

  await page.locator('[data-child="manuscript-studio"]').click({ force: true });

  const active = await page.evaluate(() => JSON.parse(
    sessionStorage.getItem("kairos.production.active-workspace") || "null",
  ));
  expect(active.projectId).toBe(PROJECT_ID);
  expect(active.workspace).toBe("manuscript-studio");

  const receipt = page.locator('[data-kairos-intake-receipt="restored-from-production-registry"]');
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("AI Video Prompt Mastery.docx");
  await expect(receipt).toContainText("assigned-to-production");
  await expect(receipt).toContainText("Continue editorial production");
  await expect(page.locator("[data-disconnected-intake]")).toHaveCount(0);
  await expect(page.locator("#manuscript-project-setup")).not.toHaveAttribute(
    "data-kairos-project-setup-shell",
    "",
  );

  expect(calls.some(call => call.method === "POST" && call.path === "/api/production-registry/projects")).toBe(false);
  expect(calls.some(call => call.method === "GET" && call.path === SOURCE_TEXT_PATH)).toBe(true);
});
