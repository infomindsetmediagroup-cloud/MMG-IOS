import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const editorialSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-editorial-loop-test";
const EDITORIAL_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/editorial`;
const SOURCE_TEXT_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/source/text`;

test("editorial workbench mounts once and performs one load during repeated DOM mutations", async ({ page }) => {
  let editorialReads = 0;
  let sourceReads = 0;

  await page.route("https://kairos.test/**", async (route) => {
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
        body: JSON.stringify({ manuscript: "A preserved manuscript source used for the editorial workbench regression test." }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
      openedAt: new Date().toISOString(),
    }));
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });

  await page.addScriptTag({ type: "module", content: editorialSource });

  await expect.poll(
    () => page.evaluate(() => window.KairosEditorialWorkbenchController?.ready === true),
  ).toBe(true);
  await expect(page.locator("#manuscript-editorial-workbench")).toBeVisible();
  await expect.poll(() => editorialReads).toBe(1);
  await expect.poll(() => sourceReads).toBe(1);

  await page.evaluate(() => {
    for (let index = 0; index < 250; index += 1) {
      const node = document.createElement("span");
      node.textContent = `mutation-${index}`;
      document.body.appendChild(node);
    }
    document.querySelector("#manuscript-project-setup")?.appendChild(document.createElement("div"));
  });

  await page.waitForTimeout(750);
  expect(editorialReads).toBe(1);
  expect(sourceReads).toBe(1);
  await expect(page.locator("#manuscript-editorial-workbench")).toHaveCount(1);
});
