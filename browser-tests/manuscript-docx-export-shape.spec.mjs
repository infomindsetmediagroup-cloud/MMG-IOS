import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const hotfixSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-docx-upload-hotfix.js", import.meta.url),
  "utf8",
);
const studioSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-docx-export-shape";
const ACTIVE_KEY = "kairos.production.active-workspace";
const MANUSCRIPT = [
  "This DOCX manuscript fixture reproduces the exact Mammoth export shape that failed on iPhone Safari.",
  "The module namespace exposes extractRawText as a named export while default is a truthy object without that function.",
  "Kairos must resolve the named export, preserve the original DOCX source, and advance the extracted text into production intake.",
].join("\n\n");

function fixtureHTML() {
  return "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body></body></html>";
}

function storedSource() {
  return {
    source: {
      projectId: PROJECT_ID,
      filename: "MMG-Draft.docx",
      name: "MMG-Draft.docx",
      size: 24,
      format: "docx",
      checksum: "docx-export-shape-checksum",
      storedAt: "2026-07-30T10:00:00.000Z",
    },
  };
}

function intakeResult() {
  return {
    status: "production_intake",
    projectID: "publishing-project-docx",
    intakeID: "intake-docx",
    customerMessage: "Your DOCX manuscript has advanced into MMG production intake.",
    manuscript: { characterCount: MANUSCRIPT.length, wordCount: MANUSCRIPT.split(/\s+/).length },
    workflow: { requiredNextActions: ["Complete project setup."] },
  };
}

test("iPhone WebKit resolves Mammoth named extractRawText when default lacks the method", async ({ page }) => {
  const calls = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "POST" && url.pathname === `/api/production-registry/manuscripts/${PROJECT_ID}/source`) {
      calls.push({ method: request.method(), path: url.pathname });
      expect(request.headers()["content-type"]).toContain("multipart/form-data");
      expect(request.postDataBuffer()).toBeTruthy();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(storedSource()),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/manuscript/intake/advance") {
      calls.push({ method: request.method(), path: url.pathname });
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.manuscript).toBe(MANUSCRIPT);
      expect(payload.source?.stored).toBe(true);
      expect(payload.source?.format).toBe("docx");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(intakeResult()),
      });
      return;
    }

    if (request.method() === "PATCH" && url.pathname === `/api/production-registry/projects/${PROJECT_ID}`) {
      calls.push({ method: request.method(), path: url.pathname });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "updated" }) });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await page.goto("https://kairos.test/?mode=advanced");
  await page.evaluate(({ key, projectId, manuscript }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
    globalThis.__KAIROS_MAMMOTH_TEST_MODULE__ = {
      default: {},
      extractRawText: async () => ({ value: manuscript, messages: [] }),
    };
  }, { key: ACTIVE_KEY, projectId: PROJECT_ID, manuscript: MANUSCRIPT });

  await page.addScriptTag({ type: "module", content: hotfixSource });
  await expect.poll(() => page.evaluate(() => window.KairosManuscriptDocxHotfix?.ready)).toBe(true);
  await page.addScriptTag({ type: "module", content: studioSource });
  await page.locator(".manuscript-launch").tap();
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();

  await page.locator("[data-file]").setInputFiles({
    name: "MMG-Draft.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("PK DOCX fixture bytes"),
  });

  await expect(page.locator(".manuscript-source")).toContainText("stored and verified");
  await expect(page.locator(".manuscript-source")).toContainText("DOCX");
  await expect(page.locator("#ms-body")).toHaveValue(MANUSCRIPT);
  await expect(page.locator(".manuscript-error")).toHaveCount(0);

  await page.locator("[data-advance]").tap();

  await expect(page.locator(".manuscript-result")).toContainText("Production intake created");
  await expect(page.locator(".manuscript-result")).toContainText("Your DOCX manuscript has advanced into MMG production intake.");
  expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
    `POST /api/production-registry/manuscripts/${PROJECT_ID}/source`,
    "POST /api/manuscript/intake/advance",
    `PATCH /api/production-registry/projects/${PROJECT_ID}`,
  ]);
});
