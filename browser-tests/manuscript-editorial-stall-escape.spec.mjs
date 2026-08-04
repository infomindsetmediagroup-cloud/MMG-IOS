import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const watchdogSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-watchdog.js", import.meta.url),
  "utf8",
);
const editorialSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-editorial-stall-escape-test";

test("a permanently stalled editorial read exposes and completes the final deliverable escape", async ({ page }) => {
  const calls = { editorial: 0, packageRead: 0, primary: 0, fallback: 0 };

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
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
    }

    if (request.method() === "GET" && url.pathname.endsWith("/editorial")) {
      calls.editorial += 1;
      await new Promise(resolve => setTimeout(resolve, 5_000));
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "The editorial shard never completed the fixture read." } }),
      });
    }

    if (request.method() === "GET" && url.pathname.endsWith("/auto-pipeline")) {
      calls.packageRead += 1;
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }

    if (request.method() === "GET" && url.pathname.endsWith("/deliverables/build")) {
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }

    if (request.method() === "POST" && url.pathname.endsWith("/auto-pipeline/run")) {
      calls.primary += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Canonical package engine unavailable in the stall fixture." } }),
      });
    }

    if (request.method() === "POST" && url.pathname.endsWith("/deliverables/build")) {
      calls.fallback += 1;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          deliverablesBuild: {
            id: "stall-escape-build-1",
            status: "COMPLETED",
            metadata: { workingTitle: "Recovered Through Stall Escape" },
            artifacts: [
              { kind: "FINAL_MANUSCRIPT", filename: "final-manuscript.md", byteSize: 5000, sha256: "a".repeat(64) },
              { kind: "ZIP_ARCHIVE", filename: "deliverables-recovered-through-stall-escape.zip", byteSize: 9000, sha256: "b".repeat(64) },
            ],
          },
        }),
      });
    }

    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/manuscript");
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
    globalThis.__KAIROS_EDITORIAL_WATCHDOG_DEADLINE_MS__ = 300;
    globalThis.__KAIROS_MANUSCRIPT_HARD_DEADLINE_MS__ = 900;
    globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__ = 900;
  }, PROJECT_ID);

  await page.addScriptTag({ content: watchdogSource });
  await page.addScriptTag({ type: "module", content: editorialSource });

  const recovery = page.locator("[data-kairos-editorial-stall-escape]");
  await expect(recovery).toBeVisible({ timeout: 2_000 });
  await expect(recovery.getByRole("button", { name: "Resume Final Deliverable" })).toBeVisible();

  await recovery.getByRole("button", { name: "Resume Final Deliverable" }).tap();

  const pipeline = page.locator("#manuscript-auto-pipeline");
  await expect(pipeline).toContainText("Recovered Through Stall Escape", { timeout: 5_000 });
  await expect(pipeline).toContainText("deterministic-deliverables-fallback");
  await expect(pipeline.getByRole("link", { name: "Download Complete Package" })).toHaveAttribute(
    "href",
    `/api/production-registry/manuscripts/${PROJECT_ID}/deliverables/zip`,
  );

  const snapshot = await page.evaluate(() => window.KairosManuscriptEditorialWatchdog.snapshot());
  expect(snapshot.patchBuild).toBe("kairos-manuscript-editorial-stall-escape-20260804-2");
  expect(snapshot.recoveries).toBeGreaterThanOrEqual(1);
  expect(snapshot.engine).toBe("deterministic-deliverables-fallback");
  expect(snapshot.status).toBe("production-ready");
  expect(calls.packageRead).toBe(1);
  expect(calls.primary).toBe(1);
  expect(calls.fallback).toBe(1);
});
