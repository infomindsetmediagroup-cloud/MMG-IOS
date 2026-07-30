import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const compatibilitySource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url),
  "utf8",
);
const studioSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-docx-named-export";
const ACTIVE_KEY = "kairos.production.active-workspace";
const EXTRACTED = [
  "This DOCX manuscript fixture proves that Kairos resolves Mammoth's named export.",
  "The default export is intentionally empty, matching the production Safari failure.",
  "The extracted manuscript must be retained, stored, and advanced into production intake.",
].join("\n\n");

function fixtureHTML() {
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
}

test("iPhone Safari uploads DOCX when Mammoth exposes extractRawText as a named export", async ({ page }) => {
  const calls = [];

  await page.route("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm", async route => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/javascript; charset=utf-8",
      },
      body: `export async function extractRawText() { return { value: ${JSON.stringify(EXTRACTED)}, messages: [] }; }\nexport default {};`,
    });
  });

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "POST" && url.pathname === `/api/production-registry/manuscripts/${PROJECT_ID}/source`) {
      calls.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          source: {
            projectId: PROJECT_ID,
            filename: "Named-Export.docx",
            name: "Named-Export.docx",
            size: 128,
            format: "docx",
            checksum: "docx-checksum",
            storedAt: "2026-07-30T10:00:00.000Z",
          },
        }),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/manuscript/intake/advance") {
      calls.push(`${request.method()} ${url.pathname}`);
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.manuscript).toBe(EXTRACTED);
      expect(payload.source?.stored).toBe(true);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "production_intake",
          projectID: "publishing-project-docx",
          intakeID: "intake-docx",
          customerMessage: "DOCX manuscript advanced into MMG production intake.",
          manuscript: { characterCount: EXTRACTED.length, wordCount: EXTRACTED.split(/\s+/).length },
          workflow: { requiredNextActions: ["Complete project setup."] },
        }),
      });
      return;
    }

    if (request.method() === "PATCH" && url.pathname === `/api/production-registry/projects/${PROJECT_ID}`) {
      calls.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "updated" }) });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await page.goto("https://kairos.test/?mode=advanced");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { key: ACTIVE_KEY, projectId: PROJECT_ID });

  await page.addScriptTag({ type: "module", content: compatibilitySource });
  await expect.poll(() => page.evaluate(() => window.KairosSafariManuscriptIntakeCompat?.ready)).toBe(true);
  await page.addScriptTag({ type: "module", content: studioSource });
  await page.locator(".manuscript-launch").tap();
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();

  await page.locator("[data-file]").setInputFiles({
    name: "Named-Export.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("fake-docx-container"),
  });

  await expect(page.locator("#ms-body")).toHaveValue(EXTRACTED);
  await expect(page.locator(".manuscript-source")).toContainText("stored and verified");
  await expect(page.locator(".manuscript-error")).toHaveCount(0);

  await page.locator("[data-advance]").tap();
  await expect(page.locator(".manuscript-result")).toContainText("Production intake created");
  expect(calls).toEqual([
    `POST /api/production-registry/manuscripts/${PROJECT_ID}/source`,
    "POST /api/manuscript/intake/advance",
    `PATCH /api/production-registry/projects/${PROJECT_ID}`,
  ]);
});
