import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controlSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-final-deliverable-engine.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-final-delivery-control-test";
const BASE = `/api/production-registry/manuscripts/${PROJECT_ID}`;

function html() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
    <div id="manuscript-studio-overlay"><div class="manuscript-result">
      <section><h3>Final files and delivery package</h3><p>queued</p></section>
      <section id="manuscript-editorial-workbench"><h3>Loading Editorial Workbench…</h3></section>
    </div></div>
  </body></html>`;
}

test("final delivery control is visible and completes a package while Editorial Workbench remains stalled", async ({ page }) => {
  const calls = { build: 0, zip: 0 };
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html() });
    }
    if (request.method() === "GET" && url.pathname === `${BASE}/auto-pipeline`) {
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "not built" } }) });
    }
    if (request.method() === "GET" && url.pathname === `${BASE}/deliverables/build`) {
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "not built" } }) });
    }
    if (request.method() === "POST" && url.pathname === `${BASE}/deliverables/build`) {
      calls.build += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          deliverablesBuild: {
            id: "build-1",
            status: "COMPLETED",
            metadata: { workingTitle: "Verified Final Package" },
            artifacts: [
              { filename: "manuscript.docx", byteSize: 1024 },
              { filename: "complete-package.zip", byteSize: 2048 },
            ],
          },
        }),
      });
    }
    if (request.method() === "GET" && url.pathname === `${BASE}/deliverables/zip`) {
      calls.zip += 1;
      return route.fulfill({ status: 200, contentType: "application/zip", body: Buffer.from("verified-package") });
    }
    if (url.pathname === `${BASE}/editorial`) {
      return new Promise(() => {});
    }
    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });
  await page.addScriptTag({ content: controlSource });

  const control = page.locator("#kairos-final-delivery-control");
  await expect(control).toBeVisible();
  await expect(control.getByRole("button", { name: "Produce Final Deliverable" })).toBeVisible();

  await control.getByRole("button", { name: "Produce Final Deliverable" }).tap();
  await expect(control.getByRole("link", { name: "Download Complete Package" })).toBeVisible();
  await expect(control).toContainText("Verified Final Package");
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Download Complete Package");
  expect(calls.build).toBe(1);
  await expect(page.locator("#manuscript-editorial-workbench")).toContainText("Loading Editorial Workbench");
});

test("final delivery control terminates in a retryable visible error when both engines fail", async ({ page }) => {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html() });
    }
    if (url.pathname === `${BASE}/auto-pipeline` || url.pathname === `${BASE}/deliverables/build`) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "forced package failure" } }) });
    }
    if (url.pathname === `${BASE}/editorial`) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "forced editorial failure" } }) });
    }
    if (url.pathname === `${BASE}/auto-pipeline/run`) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "forced canonical failure" } }) });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });
  await page.addScriptTag({ content: controlSource });
  const control = page.locator("#kairos-final-delivery-control");
  await control.getByRole("button", { name: "Produce Final Deliverable" }).tap();
  await expect(control).toContainText("Final package needs attention");
  await expect(control.getByRole("button", { name: "Retry Final Deliverable" })).toBeEnabled();
});