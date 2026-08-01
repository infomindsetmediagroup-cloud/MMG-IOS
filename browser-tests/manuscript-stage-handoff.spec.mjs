import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const handoffSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-stage-handoff-controller.js", import.meta.url),
  "utf8",
);
const editorialSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-stage-handoff";

function fixtureHTML() {
  return `<!doctype html>
    <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body>
      <div id="manuscript-studio-overlay">
        <div class="manuscript-result">
          <section id="manuscript-project-setup" data-project-id="${PROJECT_ID}">
            <p class="eyebrow">Production assignment</p>
            <h3>assigned-to-production</h3>
            <p>The project is stored in the durable production registry.</p>
          </section>
        </div>
      </div>
    </body></html>`;
}

test("saved Project Setup exposes and opens the Editorial Workbench", async ({ page }) => {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (url.pathname === "/scripts/manuscript-editorial-workbench.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: editorialSource });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === `/api/production-registry/manuscripts/${PROJECT_ID}/editorial`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "editorial-in-progress",
          editorial: {
            status: "editorial-in-progress",
            stage: "editorial-intake",
            versions: [],
            review: null,
          },
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
        body: JSON.stringify({ manuscript: "Editorial manuscript content ".repeat(20) }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/manuscript?open=manuscript");
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
  }, PROJECT_ID);
  await page.addScriptTag({ content: handoffSource });

  const button = page.locator("[data-kairos-next-editorial]");
  await expect(button).toBeVisible();
  await expect(button).toHaveText("Continue to Editorial Review");

  await button.tap();

  const editorial = page.locator("#manuscript-editorial-workbench");
  await expect(editorial).toBeVisible({ timeout: 8_000 });
  await expect(editorial).toContainText("Editorial production in progress");
  await expect(editorial.locator("[data-editorial-save]")).toBeVisible();
  await expect(page.locator("[data-kairos-editorial-handoff]")).toHaveCount(0);

  const snapshot = await page.evaluate(() => window.KairosManuscriptStageHandoff.snapshot());
  expect(snapshot.editorialPresent).toBe(true);
  expect(snapshot.editorialOpens).toBe(1);
  expect(snapshot.lastError).toBe("");
});

test("production controls render before the local WebGPU runtime downloads", async ({ page }) => {
  let inferenceRequests = 0;

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div id="manuscript-studio-overlay">
            <section id="manuscript-project-setup">
              <p class="eyebrow">Production assignment</p>
              <h3>assigned-to-production</h3>
            </section>
            <section id="manuscript-editorial-workbench">
              <h3>Ready for manufacturing</h3>
            </section>
          </div>
        </body></html>`,
      });
      return;
    }

    if (url.pathname === "/scripts/kairos-state-fetch-install.js") {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: "globalThis.__kairosStateFetchInstalled=true;globalThis.__KAIROS_STATE_FETCH_INSTALLED__=true;",
      });
      return;
    }

    if (url.pathname === "/scripts/manuscript-auto-pipeline.js") {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `
          globalThis.KairosManuscriptAutoPipelineController = Object.freeze({
            ready: true,
            enhance() {
              if (document.querySelector("#manuscript-auto-pipeline")) return;
              const section = document.createElement("section");
              section.id = "manuscript-auto-pipeline";
              section.innerHTML = '<h3>Local Production</h3><div class="manuscript-actions"><button type="button" data-start-local-production>Start Local Production</button></div>';
              document.querySelector("#manuscript-editorial-workbench").insertAdjacentElement("afterend", section);
            },
            async startLocalProduction() {
              globalThis.__kairosLocalProductionStarted = (globalThis.__kairosLocalProductionStarted || 0) + 1;
            },
          });
        `,
      });
      return;
    }

    if (url.pathname === "/scripts/kairos-local-inference.js") {
      inferenceRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: "globalThis.KairosLocalInference=Object.freeze({ready:true,build:'test-local-runtime'});",
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/manuscript?open=manuscript");
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
  }, PROJECT_ID);
  await page.addScriptTag({ content: handoffSource });

  const handoff = page.locator("[data-kairos-next-production]");
  await expect(handoff).toBeVisible();
  await handoff.tap();

  const start = page.locator("[data-start-local-production]");
  await expect(start).toBeVisible({ timeout: 5_000 });
  expect(inferenceRequests).toBe(0);
  await expect(page.locator("[data-kairos-local-runtime-status]")).toContainText(
    "local AI runtime will load only after Start Local Production",
  );

  await start.tap();

  await expect.poll(
    () => page.evaluate(() => globalThis.__kairosLocalProductionStarted || 0),
  ).toBe(1);
  expect(inferenceRequests).toBe(1);

  const snapshot = await page.evaluate(() => window.KairosManuscriptStageHandoff.snapshot());
  expect(snapshot.pipelinePresent).toBe(true);
  expect(snapshot.localRuntimeReady).toBe(true);
  expect(snapshot.localStarts).toBe(1);
  expect(snapshot.lastError).toBe("");
});
