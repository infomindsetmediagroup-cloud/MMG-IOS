import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const studioSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-docx-export-shape";
const ACTIVE_KEY = "kairos.production.active-workspace";
const MANUSCRIPT = [
  "This DOCX manuscript fixture reproduces the exact Mammoth export shape that failed on iPhone Safari.",
  "The module namespace exposes extractRawText as a named export while default is a truthy object without that function.",
  "Kairos must resolve the named export, preserve the original DOCX source through verified chunks, and advance the extracted text into production intake.",
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
      size: 21,
      format: "docx",
      checksum: "a".repeat(64),
      stored: true,
      uploadMode: "chunked-v1",
      storedAt: "2026-08-01T22:00:00.000Z",
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

test("iPhone WebKit resolves Mammoth named extractRawText and completes chunked source intake", async ({ page }) => {
  const calls = [];
  let uploadId = "";

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "POST" && path === `/api/production-registry/manuscripts/${PROJECT_ID}/source/session`) {
      calls.push(`${request.method()} ${path}`);
      const payload = JSON.parse(request.postData() || "{}");
      uploadId = payload.uploadId;
      expect(uploadId).toMatch(/^upload-/);
      expect(payload.format).toBe("docx");
      expect(payload.fileChunks).toBe(1);
      expect(payload.textChunks).toBe(1);
      expect(payload.checksum).toMatch(/^[a-f0-9]{64}$/);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "ready", upload: { uploadId } }),
      });
      return;
    }

    if (request.method() === "PUT" && path === `/api/production-registry/manuscripts/${PROJECT_ID}/source/file/0`) {
      calls.push(`${request.method()} ${path}`);
      expect(request.headers()["x-kairos-upload-id"]).toBe(uploadId);
      expect(request.postDataBuffer()?.byteLength || 0).toBeGreaterThan(0);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "stored" }) });
      return;
    }

    if (request.method() === "PUT" && path === `/api/production-registry/manuscripts/${PROJECT_ID}/source/text-chunk/0`) {
      calls.push(`${request.method()} ${path}`);
      expect(request.headers()["x-kairos-upload-id"]).toBe(uploadId);
      expect(request.postDataBuffer()?.toString("utf8")).toBe(MANUSCRIPT);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "stored" }) });
      return;
    }

    if (request.method() === "POST" && path === `/api/production-registry/manuscripts/${PROJECT_ID}/source/commit`) {
      calls.push(`${request.method()} ${path}`);
      expect(request.headers()["x-kairos-upload-id"]).toBe(uploadId);
      expect(JSON.parse(request.postData() || "{}").uploadId).toBe(uploadId);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(storedSource()),
      });
      return;
    }

    if (request.method() === "POST" && path === "/api/manuscript/intake/advance") {
      calls.push(`${request.method()} ${path}`);
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.manuscript).toBe(MANUSCRIPT);
      expect(payload.source?.stored).toBe(true);
      expect(payload.source?.format).toBe("docx");
      expect(payload.source?.uploadMode).toBe("chunked-v1");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(intakeResult()),
      });
      return;
    }

    if (request.method() === "PATCH" && path === `/api/production-registry/projects/${PROJECT_ID}`) {
      calls.push(`${request.method()} ${path}`);
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

  await page.addScriptTag({ type: "module", content: studioSource });
  await expect.poll(() => page.evaluate(() => window.KairosManuscriptStudio?.ready)).toBe(true);
  await page.locator(".manuscript-launch").tap();
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();

  await page.locator("[data-file]").setInputFiles({
    name: "MMG-Draft.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("PK DOCX fixture bytes"),
  });

  await expect(page.locator(".manuscript-source")).toContainText("stored and verified through chunks");
  await expect(page.locator(".manuscript-source")).toContainText("DOCX");
  await expect(page.locator("#ms-body")).toHaveValue(MANUSCRIPT);
  await expect(page.locator(".manuscript-error")).toHaveCount(0);

  await page.locator("[data-advance]").tap();

  await expect(page.locator(".manuscript-result")).toContainText("Production intake created");
  await expect(page.locator(".manuscript-result")).toContainText("Your DOCX manuscript has advanced into MMG production intake.");
  expect(calls).toEqual([
    `POST /api/production-registry/manuscripts/${PROJECT_ID}/source/session`,
    `PUT /api/production-registry/manuscripts/${PROJECT_ID}/source/file/0`,
    `PUT /api/production-registry/manuscripts/${PROJECT_ID}/source/text-chunk/0`,
    `POST /api/production-registry/manuscripts/${PROJECT_ID}/source/commit`,
    "POST /api/manuscript/intake/advance",
    `PATCH /api/production-registry/projects/${PROJECT_ID}`,
  ]);
});
