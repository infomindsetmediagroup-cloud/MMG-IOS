import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const continuationSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-continuation-controller.js", import.meta.url),
  "utf8",
);
const recoverySource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-receipt-continuation-recovery.js", import.meta.url),
  "utf8",
);
const setupSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-project-setup.js", import.meta.url),
  "utf8",
);
const studioCSS = readFileSync(
  new URL("../web/kairos-dashboard/styles/manuscript-studio.css", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-live-receipt-12345678";

function fixtureHTML() {
  return `<!doctype html>
    <html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body>
        <div id="manuscript-studio-overlay" class="manuscript-overlay" data-kairos-manuscript-view="intake-receipt">
          <section class="manuscript-panel">
            <div class="manuscript-result" data-kairos-intake-receipt>
              <p><strong>Accepted source:</strong> 279,045 characters · 35,117 words</p>
              <div class="manuscript-actions manuscript-intake-actions">
                <a class="primary" data-finish href="#manuscript-project-setup" role="button">Continue to Project Setup</a>
              </div>
              <details class="manuscript-source-review">
                <summary class="secondary">Review Intake Source</summary>
              </details>
              <section id="manuscript-project-setup" class="manuscript-project-setup" data-kairos-project-setup-shell data-project-id="${PROJECT_ID}" aria-live="polite">
                <p class="eyebrow">Next stage</p>
                <h3>Complete Project Setup</h3>
                <p>Loading the saved project and production-assignment form…</p>
              </section>
            </div>
          </section>
        </div>
      </body>
    </html>`;
}

test("real intake receipt placeholder hydrates automatically in iPhone WebKit", async ({ page }) => {
  let setupReads = 0;
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === `/api/production-registry/manuscripts/${PROJECT_ID}/setup`
    ) {
      setupReads += 1;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "setup_not_started" } }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "test_route_unhandled", path: url.pathname } }),
    });
  });

  await page.goto("https://kairos.test/manuscript?open=manuscript");
  await page.addStyleTag({ content: studioCSS });

  // Reproduce the production failure: the setup module initializes before the
  // active project is available, so the real receipt placeholder remains.
  await page.addScriptTag({ type: "module", content: setupSource });
  await expect(page.locator("#manuscript-project-setup")).toHaveAttribute(
    "data-kairos-project-setup-shell",
    "",
  );

  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));
  }, PROJECT_ID);

  await page.addScriptTag({ content: continuationSource });
  await page.addScriptTag({ content: recoverySource });

  const setup = page.locator("#manuscript-project-setup");
  await expect(setup).toBeVisible({ timeout: 12_000 });
  await expect(setup).not.toHaveAttribute("data-kairos-project-setup-shell", "");
  await expect(setup).toContainText("Complete Project Setup");
  await expect(page.locator("[data-setup-author]")).toBeVisible();
  await expect(page.locator("[data-setup-service]")).toBeVisible();
  await expect(page.locator("[data-finish]")).toHaveCount(0);
  await expect(page.getByText("Review Intake Source", { exact: true })).toBeVisible();
  await expect.poll(() => setupReads).toBeLessThanOrEqual(2);

  const snapshot = await page.evaluate(() =>
    window.KairosManuscriptReceiptContinuationRecovery?.snapshot?.(),
  );
  expect(snapshot?.build).toBe("kairos-manuscript-receipt-continuation-recovery-20260804-1");
  expect(snapshot?.successfulContinuations).toBeGreaterThanOrEqual(1);
  expect(snapshot?.placeholderPresent).toBe(false);
  expect(snapshot?.lastError).toBeNull();
  expect(pageErrors).toEqual([]);
});
