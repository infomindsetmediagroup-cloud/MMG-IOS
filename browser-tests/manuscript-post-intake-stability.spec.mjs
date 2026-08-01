import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const guardSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-post-intake-guard.js", import.meta.url),
  "utf8",
);
const studioSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url),
  "utf8",
);
const setupSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-project-setup.js", import.meta.url),
  "utf8",
);
const editorialSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url),
  "utf8",
);
const pipelineSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/production-workspace-controller.js", import.meta.url),
  "utf8",
);

const ACTIVE_KEY = "kairos.production.active-workspace";
const INTERNAL_PROJECT_ID = "manuscript-studio-post-intake-stability";
const PUB_ID = "PUB-01e16d4e-cbb8-4d34-9cef-74dd69ab80cf";
const INTAKE_ID = "INT-1e64523f-3fc4-417f-9cef-07fcb50f46f3";
const MANUSCRIPT = (
  "This mobile WebKit manuscript fixture verifies that a successful production intake remains visible after registry refresh, setup enhancement, editorial checks, and package-state reads.\n\n"
).repeat(900);

function fixtureHTML() {
  return "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body></body></html>";
}

function sourceBase(projectId = INTERNAL_PROJECT_ID) {
  return `/api/production-registry/manuscripts/${projectId}/source`;
}

test("successful manuscript intake remains visible under the full post-intake runtime", async ({ page }, testInfo) => {
  test.setTimeout(70_000);

  const browserLog = [];
  const failedRequests = [];
  const navigations = [];
  let uploadId = "";
  let projectWrites = 0;
  let registryReads = 0;
  let pipelineReads = 0;
  let setupReads = 0;
  let editorialReads = 0;

  page.on("console", message => {
    browserLog.push({ type: message.type(), text: message.text(), at: Date.now() });
  });
  page.on("pageerror", error => {
    browserLog.push({ type: "pageerror", text: error.message, stack: error.stack || "", at: Date.now() });
  });
  page.on("requestfailed", request => {
    failedRequests.push({ method: request.method(), url: request.url(), failure: request.failure(), at: Date.now() });
  });
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) navigations.push({ url: frame.url(), at: Date.now() });
  });

  await page.addInitScript(() => {
    const probe = {
      stateEvents: [],
      visibilityEvents: [],
      clicks: [],
      history: [],
      errors: [],
    };
    window.__kairosPostIntakeProbe = probe;

    window.addEventListener("kairos:production:state-changed", event => {
      probe.stateEvents.push({ at: Date.now(), detail: event.detail || null });
    });
    window.addEventListener("kairos:production:workspace-visibility", event => {
      probe.visibilityEvents.push({ at: Date.now(), detail: event.detail || null });
    });
    window.addEventListener("error", event => {
      probe.errors.push({ type: "error", message: event.message, stack: event.error?.stack || "", at: Date.now() });
    });
    window.addEventListener("unhandledrejection", event => {
      probe.errors.push({
        type: "unhandledrejection",
        message: String(event.reason?.message || event.reason || ""),
        stack: event.reason?.stack || "",
        at: Date.now(),
      });
    });
    document.addEventListener("click", event => {
      const target = event.target instanceof Element
        ? event.target.closest("button,a,[role=button]")
        : null;
      probe.clicks.push({
        at: Date.now(),
        trusted: event.isTrusted,
        text: target?.textContent?.trim() || "",
        dataset: target ? { ...target.dataset } : {},
      });
    }, true);

    for (const method of ["pushState", "replaceState"]) {
      const native = history[method].bind(history);
      history[method] = (...args) => {
        probe.history.push({ method, at: Date.now(), from: location.href, to: String(args[2] || "") });
        return native(...args);
      };
    }
  });

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (method === "POST" && url.pathname === `${sourceBase()}/session`) {
      uploadId = request.postDataJSON().uploadId;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "upload-session-created", upload: { uploadId } }),
      });
      return;
    }

    if (method === "PUT" && (
      url.pathname === `${sourceBase()}/file/0` ||
      url.pathname === `${sourceBase()}/text-chunk/0`
    )) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "chunk-stored", uploadId }),
      });
      return;
    }

    if (method === "POST" && url.pathname === `${sourceBase()}/commit`) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "stored-and-verified",
          source: {
            projectId: INTERNAL_PROJECT_ID,
            filename: "post-intake.txt",
            name: "post-intake.txt",
            size: Buffer.byteLength(MANUSCRIPT),
            format: "txt",
            checksum: "a".repeat(64),
            stored: true,
            uploadMode: "chunked-v1",
            storedAt: "2026-07-31T20:00:00.000Z",
          },
        }),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/api/manuscript/intake/advance") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "production_intake",
          projectID: PUB_ID,
          intakeID: INTAKE_ID,
          customerMessage: "Your manuscript has been accepted into MMG production intake.",
          manuscript: {
            characterCount: MANUSCRIPT.length,
            wordCount: MANUSCRIPT.trim().split(/\s+/).length,
          },
          workflow: { requiredNextActions: ["Complete project setup."] },
        }),
      });
      return;
    }

    if (method === "PATCH" && url.pathname === `/api/production-registry/projects/${INTERNAL_PROJECT_ID}`) {
      projectWrites += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "updated", project: request.postDataJSON() }),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/api/production-registry/projects") {
      projectWrites += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "updated", project: request.postDataJSON() }),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/production-registry/projects") {
      registryReads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ projects: [] }),
      });
      return;
    }

    const stateMatch = url.pathname.match(
      /^\/api\/production-registry\/manuscripts\/([^/]+)\/(auto-pipeline|setup|editorial)$/,
    );
    if (method === "GET" && stateMatch) {
      const routeName = stateMatch[2];
      if (routeName === "auto-pipeline") pipelineReads += 1;
      if (routeName === "setup") setupReads += 1;
      if (routeName === "editorial") editorialReads += 1;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        headers: routeName === "auto-pipeline"
          ? {
              "X-Kairos-Package-State": "not-started",
              "X-Kairos-Package-State-Build": "test-package-state",
              "Server-Timing": "package_state;dur=1",
            }
          : {},
        body: JSON.stringify({ error: { code: `${routeName}_not_started` } }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "test_route_unhandled", path: url.pathname } }),
    });
  });

  await page.goto("https://kairos.test/?mode=advanced");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { key: ACTIVE_KEY, projectId: INTERNAL_PROJECT_ID });

  for (const source of [guardSource, studioSource, setupSource, editorialSource, pipelineSource, workspaceSource]) {
    await page.addScriptTag({ type: "module", content: source });
  }

  await page.locator(".manuscript-launch").tap();
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();

  await page.locator("[data-file]").setInputFiles({
    name: "post-intake.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT),
  });
  await expect(page.locator(".manuscript-source")).toContainText("stored and verified through chunks");

  const urlBeforeIntake = page.url();
  await page.locator("[data-advance]").tap();

  const result = page.locator(".manuscript-result");
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toContainText("Production intake created");
  await expect(result).toContainText(PUB_ID);
  await expect(result).toContainText(INTAKE_ID);

  await page.waitForTimeout(25_000);

  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();
  await expect(result).toBeVisible();
  await expect(result).toContainText("Production intake created");
  expect(page.url()).toBe(urlBeforeIntake);

  const probe = await page.evaluate(() => window.__kairosPostIntakeProbe);
  const guard = await page.evaluate(() => window.KairosManuscriptPostIntakeGuard?.snapshot?.());

  await testInfo.attach("post-intake-probe.json", {
    body: JSON.stringify({
      probe,
      guard,
      browserLog,
      failedRequests,
      navigations,
      counters: { projectWrites, registryReads, pipelineReads, setupReads, editorialReads },
    }, null, 2),
    contentType: "application/json",
  });

  expect(browserLog.filter(entry => ["error", "pageerror"].includes(entry.type))).toEqual([]);
  expect(probe.errors).toEqual([]);
  expect(probe.history).toEqual([]);
  expect(probe.clicks.filter(click => /return to production center/i.test(click.text))).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(projectWrites, "one intake registry owner").toBe(1);
  expect(pipelineReads, "bounded package-state reads").toBeLessThanOrEqual(2);
  expect(setupReads, "bounded setup reads").toBeLessThanOrEqual(3);
  expect(editorialReads, "bounded editorial reads").toBeLessThanOrEqual(3);
  expect(probe.stateEvents.length, "bounded post-intake state events").toBeLessThanOrEqual(8);
  expect(guard?.overlayPresent).toBe(true);
  expect(guard?.resultPresent).toBe(true);
  expect(guard?.duplicateStudioModules).toEqual([]);
  expect(guard?.overlayRestores).toBe(0);
});
