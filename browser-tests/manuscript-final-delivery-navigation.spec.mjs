import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const ownerSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-final-deliverable-control-owner.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "final-delivery-navigation-12345678";

async function loadFinalState(page) {
  await page.route("https://kairos.test/**", async route => {
    if (route.request().resourceType() === "document") {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
          <section id="manuscript-auto-pipeline">
            <h3>Final delivery package ready</h3>
            <a href="/package.zip">Download Complete Package</a>
          </section>
          <aside id="kairos-final-delivery-control"></aside>
        </body></html>`,
      });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
  await page.goto("https://kairos.test/manuscript?open=manuscript");
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
  }, PROJECT_ID);
  await page.addScriptTag({ content: ownerSource });
}

test("completed final delivery state always exposes Return to Command Center", async ({ page }) => {
  await loadFinalState(page);
  const navigation = page.locator("#kairos-final-delivery-navigation");
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Return to Command Center" })).toBeVisible();
  await navigation.getByRole("button", { name: "Return to Command Center" }).tap();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
});

test("completed final delivery state returns to the same manuscript project", async ({ page }) => {
  await loadFinalState(page);
  const navigation = page.locator("#kairos-final-delivery-navigation");
  await navigation.getByRole("button", { name: "Return to Manuscript Studio" }).tap();
  await expect.poll(() => {
    const url = new URL(page.url());
    return {
      pathname: url.pathname,
      open: url.searchParams.get("open"),
      project: url.searchParams.get("project"),
    };
  }).toEqual({ pathname: "/manuscript", open: "manuscript", project: PROJECT_ID });
});
