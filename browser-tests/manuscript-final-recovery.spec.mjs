import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(
  new URL("../web/kairos-dashboard/manuscript-final.html", import.meta.url),
  "utf8",
);

async function serveConsole(page, handler) {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body: pageSource });
    }
    return handler(route, request, url);
  });
}

test("final recovery console restores an existing package without loading Editorial Workbench", async ({ page }) => {
  const projectId = "recovery-project-existing-12345678";
  await serveConsole(page, async (route, request, url) => {
    if (request.method() === "GET" && url.pathname.endsWith("/auto-pipeline")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "production-ready",
          metadata: { title: "Recovered Package" },
          vault: {
            packageDownloadURL: `/api/production-registry/manuscripts/${projectId}/deliverables/zip`,
            assets: [{ filename: "README.txt", byteSize: 42 }],
          },
        }),
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto(`https://kairos.test/manuscript-final.html?project=${projectId}`);
  await expect(page.getByText("Final delivery package ready.")).toBeVisible();
  const download = page.getByRole("link", { name: "Download Complete Package" });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("href", `/api/production-registry/manuscripts/${projectId}/deliverables/zip`);
  await expect(page.locator("#status")).not.toContainText("Loading Editorial Workbench");
});

test("final recovery console falls back to deterministic manufacturing and exposes a download", async ({ page }) => {
  const projectId = "recovery-project-fallback-12345678";
  let primaryRuns = 0;
  let fallbackRuns = 0;

  await serveConsole(page, async (route, request, url) => {
    if (request.method() === "GET" && url.pathname.endsWith("/auto-pipeline")) {
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    if (request.method() === "GET" && url.pathname.endsWith("/deliverables/build")) {
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/auto-pipeline/run")) {
      primaryRuns += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "canonical unavailable" } }),
      });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/deliverables/build")) {
      fallbackRuns += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "COMPLETED",
          metadata: { workingTitle: "Deterministic Package" },
          artifacts: [{ filename: "complete-production-package.zip", byteSize: 4096 }],
        }),
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto(`https://kairos.test/manuscript-final.html?project=${projectId}`);
  await page.getByRole("button", { name: "Resume Final Deliverable" }).click();
  await expect(page.getByText("Final delivery package ready.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Complete Package" })).toHaveAttribute(
    "href",
    `/api/production-registry/manuscripts/${projectId}/deliverables/zip`,
  );
  expect(primaryRuns).toBe(1);
  expect(fallbackRuns).toBe(1);
});

test("final recovery console converts a stalled request into a visible error", async ({ page }) => {
  const projectId = "recovery-project-timeout-12345678";
  await serveConsole(page, async route => {
    await new Promise(resolve => setTimeout(resolve, 12000));
    return route.fulfill({ status: 504, contentType: "application/json", body: "{}" });
  });

  await page.goto(`https://kairos.test/manuscript-final.html?project=${projectId}`);
  await expect(page.locator("#status")).toContainText("No completed package was found", { timeout: 22000 });
  await expect(page.getByRole("button", { name: "Resume Final Deliverable" })).toBeEnabled();
});
