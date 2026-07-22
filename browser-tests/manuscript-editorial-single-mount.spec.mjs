import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-editorial-12345678";
const EDITORIAL_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/editorial`;
const SOURCE_TEXT_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/source/text`;

function fixtureHTML() {
  return `<!doctype html>
  <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body>
      <div id="manuscript-studio-overlay">
        <div class="manuscript-result">
          <section id="manuscript-project-setup" data-project-id="${PROJECT_ID}">
            <p class="eyebrow">Production assignment</p>
            <h3>assigned-to-production</h3>
          </section>
        </div>
      </div>
    </body>
  </html>`;
}

test("editorial workbench mounts once and issues one load under a DOM mutation storm", async ({ page }) => {
  let editorialReads = 0;
  let sourceReads = 0;
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("https://kairos.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "GET" && url.pathname === EDITORIAL_PATH) {
      editorialReads += 1;
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

    if (request.method() === "GET" && url.pathname === SOURCE_TEXT_PATH) {
      sourceReads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ manuscript: "A stable editorial source manuscript." }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ projectId }) => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
      openedAt: new Date().toISOString(),
    }));
  }, { projectId: PROJECT_ID });

  await page.addScriptTag({ type: "module", content: controllerSource });
  await expect(page.locator("#manuscript-editorial-workbench")).toBeVisible();
  await expect(page.locator("#manuscript-editorial-workbench h3")).toHaveText("Editorial Workbench");

  await page.evaluate(() => {
    const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    for (let index = 0; index < 250; index += 1) {
      const marker = document.createElement("span");
      marker.dataset.mutationProbe = String(index);
      result.appendChild(marker);
      marker.textContent = `mutation-${index}`;
    }
  });

  await page.waitForTimeout(500);

  await expect(page.locator("#manuscript-editorial-workbench")).toHaveCount(1);
  expect(editorialReads).toBe(1);
  expect(sourceReads).toBe(1);
  expect(pageErrors).toEqual([]);
});
