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
  await expect(editorial).toContainText("Editorial Workbench");
  await expect(editorial.locator("[data-editorial-save]")).toBeVisible();
  await expect(page.locator("[data-kairos-editorial-handoff]")).toHaveCount(0);

  const snapshot = await page.evaluate(() => window.KairosManuscriptStageHandoff.snapshot());
  expect(snapshot.editorialPresent).toBe(true);
  expect(snapshot.editorialOpens).toBe(1);
  expect(snapshot.lastError).toBe("");
});

test("ready editorial state exposes the local-production handoff", async ({ page }) => {
  await page.setContent(`
    <div id="manuscript-studio-overlay">
      <section id="manuscript-project-setup">
        <p class="eyebrow">Production assignment</p>
        <h3>assigned-to-production</h3>
      </section>
      <section id="manuscript-editorial-workbench">
        <h3>Ready for manufacturing</h3>
      </section>
    </div>
  `);
  await page.addScriptTag({ content: handoffSource });

  const button = page.locator("[data-kairos-next-production]");
  await expect(button).toBeVisible();
  await expect(button).toHaveText("Continue to Local Production");
});
