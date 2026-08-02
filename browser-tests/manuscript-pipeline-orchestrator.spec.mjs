import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-pipeline-orchestrator.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-a2z-project";

function baseHTML(body) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
}

async function activate(page) {
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
  }, PROJECT_ID);
  await page.addScriptTag({ content: source });
}

test("Project Setup stores the cover and assignment in one idempotent transaction", async ({ page }) => {
  let setupPosts = 0;
  let separateCoverWrites = 0;

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: baseHTML(`
          <section id="manuscript-project-setup" data-project-id="${PROJECT_ID}">
            <input data-setup-author value="Michael King">
            <input data-setup-title value="Pipeline Test Book">
            <select data-setup-service><option value="complete-publishing-package" selected>Complete Publishing Package</option></select>
            <select data-setup-edition><option value="multi-format" selected>Multi-format</option></select>
            <input data-setup-trim value="6x9">
            <select data-setup-isbn><option value="not-decided" selected>Not decided</option></select>
            <input data-setup-cover type="file">
            <textarea data-setup-notes>Production fixture</textarea>
            <button data-setup-submit>Save Setup & Assign Production</button>
            <button data-setup-status>Check saved status</button>
          </section>
        `),
      });
      return;
    }

    if (url.pathname.endsWith("/setup/cover")) {
      separateCoverWrites += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return;
    }

    if (request.method() === "POST" && url.pathname.endsWith("/setup")) {
      setupPosts += 1;
      expect(request.headers()["x-kairos-idempotency-key"]).toBeTruthy();
      expect(request.headers()["content-type"]).toContain("multipart/form-data");
      const body = request.postDataBuffer();
      expect(body?.byteLength || 0).toBeGreaterThan(20);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "assigned-to-production",
          nextAction: "Continue to Editorial Review.",
          setup: {
            projectId: PROJECT_ID,
            status: "assigned-to-production",
            assignments: [{ department: "Editorial Production", role: "Production review", status: "assigned" }],
            milestones: [{ label: "Customer cover received", status: "completed" }],
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/manuscript");
  await activate(page);
  await page.locator("[data-setup-cover]").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
  });

  await page.locator("[data-setup-submit]").click();

  await expect(page.locator("[data-kairos-next-editorial]")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#manuscript-project-setup")).toContainText("assigned-to-production");
  expect(setupPosts).toBe(1);
  expect(separateCoverWrites).toBe(0);
});

test("approved editorial state manufactures a downloadable delivery package", async ({ page }) => {
  let runRequests = 0;

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: baseHTML(`
          <section id="manuscript-project-setup"><h3>assigned-to-production</h3></section>
          <section id="manuscript-editorial-workbench"><h3>ready-for-manufacturing</h3></section>
          <section id="manuscript-auto-pipeline">
            <button data-start-local-production>Manufacture Delivery Package</button>
          </section>
        `),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname.endsWith("/setup")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setup: { status: "assigned-to-production" } }),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname.endsWith("/editorial")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ editorial: { status: "ready-for-manufacturing" } }),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname.endsWith("/auto-pipeline/run")) {
      runRequests += 1;
      expect(request.headers()["x-kairos-idempotency-key"]).toBeTruthy();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "production-ready",
          nextAction: "Review and approve the delivery package.",
          metadata: { title: "Pipeline Test Book" },
          vault: {
            packageDownloadURL: "/api/admin-asset-vault/projects/test/package",
            integrity: { passed: true },
            assets: [
              { filename: "book.pdf", role: "PDF", byteSize: 1234, downloadURL: "/assets/book.pdf" },
              { filename: "complete-production-package.zip", role: "DELIVERY_PACKAGE", byteSize: 4321, downloadURL: "/assets/package.zip" },
            ],
          },
          shopify: { status: "not-prepared" },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/manuscript");
  await activate(page);
  await page.locator("[data-start-local-production]").click();

  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Pipeline Test Book", { timeout: 5_000 });
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("2 verified deliverables");
  await expect(page.locator("a", { hasText: "Preview Package" })).toBeVisible();
  await expect(page.locator("[data-approve-package]")).toBeVisible();
  expect(runRequests).toBe(1);
});
