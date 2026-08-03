import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const studioSource = readFileSync("web/kairos-dashboard/scripts/manuscript-studio.js", "utf8");
const DRAFT_KEY = "kairos.manuscript-studio.recoverable-draft.v1";
const ACTIVE_KEY = "kairos.production.active-workspace";

function html() {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><main id="root"></main></body></html>`;
}

async function openHarness(page) {
  await page.route("https://kairos.test/", route => route.fulfill({ status: 200, contentType: "text/html", body: html() }));
  await page.goto("https://kairos.test/");
  await page.evaluate(() => {
    Object.defineProperty(window, "KairosDocxExtractor", {
      configurable: true,
      writable: true,
      value: {
        ready: true,
        local: true,
        extractRawText: async () => ({
          value: "AI Video Prompt Mastery production manuscript. ".repeat(7000),
          messages: [],
        }),
      },
    });
  });
}

test("real Manuscript Studio retries a forced 502 through direct verified chunks", async ({ page }) => {
  const calls = [];
  let uploadId = "";
  let firstFileChunkAttempts = 0;
  let projectId = "";

  await page.route("https://kairos.test/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = request.headers();
    calls.push({ method: request.method(), path: url.pathname, contentType: headers["content-type"] || "" });
    const projectMatch = url.pathname.match(/\/manuscripts\/([^/]+)\/source/);
    if (projectMatch) projectId = decodeURIComponent(projectMatch[1]);

    if (url.pathname.endsWith("/source/session")) {
      const payload = request.postDataJSON();
      uploadId = payload.uploadId;
      expect(payload.fileChunks).toBeGreaterThan(1);
      expect(payload.textChunks).toBeGreaterThan(1);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "upload-session-created", upload: { uploadId } }),
      });
      return;
    }

    if (url.pathname.endsWith("/source/file/0")) {
      firstFileChunkAttempts += 1;
      if (firstFileChunkAttempts === 1) {
        await route.fulfill({
          status: 502,
          headers: { "cf-ray": "forced-studio-502-LAX" },
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "forced direct Studio chunk retry" } }),
        });
        return;
      }
    }

    if (/\/source\/(file|text-chunk)\/\d+$/.test(url.pathname)) {
      expect(headers["x-kairos-upload-id"]).toBe(uploadId);
      expect(headers["content-type"]).toContain("application/octet-stream");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "chunk-stored" }),
      });
      return;
    }

    if (url.pathname.endsWith("/source/commit")) {
      expect(request.postDataJSON().uploadId).toBe(uploadId);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "stored-and-verified",
          source: {
            projectId,
            name: "AI-Video-Prompt-Mastery.docx",
            filename: "AI-Video-Prompt-Mastery.docx",
            format: "docx",
            size: 700 * 1024,
            stored: true,
            uploadMode: "chunked-v1",
            storedAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await openHarness(page);
  await page.addScriptTag({ type: "module", content: studioSource });
  await page.getByRole("button", { name: "Open Manuscript Studio" }).click();

  await page.locator("input[data-file]").setInputFiles({
    name: "AI-Video-Prompt-Mastery.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.alloc(700 * 1024, 7),
  });

  await expect(page.locator(".manuscript-source")).toContainText("stored and verified through chunks", { timeout: 30_000 });
  await expect(page.locator(".manuscript-error")).toHaveCount(0);

  const runtime = await page.evaluate(() => window.KairosManuscriptStudio);
  expect(runtime.build).toBe("manuscript-studio-flow-recovery-20260803-3");
  expect(runtime.chunkedSourceUpload).toBe(true);
  expect(runtime.multipartSourceUpload).toBe(false);
  expect(firstFileChunkAttempts).toBe(2);

  const fileChunkPaths = new Set(calls.filter(call => /\/source\/file\/\d+$/.test(call.path)).map(call => call.path));
  const textChunkPaths = new Set(calls.filter(call => /\/source\/text-chunk\/\d+$/.test(call.path)).map(call => call.path));
  expect(fileChunkPaths.size).toBeGreaterThan(1);
  expect(textChunkPaths.size).toBeGreaterThan(1);
  expect(calls.some(call => /multipart\/form-data/i.test(call.contentType))).toBe(false);
  expect(calls.some(call => call.path.endsWith("/source") && call.method === "POST")).toBe(false);
});

test("legacy 502 draft is migrated without restoring the red failure transaction", async ({ page }) => {
  await openHarness(page);
  await page.evaluate(({ draftKey, activeKey }) => {
    sessionStorage.setItem(activeKey, JSON.stringify({
      workspace: "manuscript-studio",
      projectId: "manuscript-studio-old-failed-12345678",
      build: "manuscript-studio-upload-retention-20260730-1",
    }));
    sessionStorage.setItem(draftKey, JSON.stringify({
      build: "manuscript-studio-upload-retention-20260730-1",
      title: "AI Video Prompt Mastery",
      manuscript: "A".repeat(279045),
      source: {
        projectId: "manuscript-studio-old-failed-12345678",
        name: "AI-Video-Prompt-Mastery.docx",
        filename: "AI-Video-Prompt-Mastery.docx",
        format: "docx",
        size: 700 * 1024,
        stored: false,
      },
      sourceSaveStatus: "failed",
      sourceSaveError: "The manuscript source could not be stored (HTTP 502; ray old-LAX).",
      projectId: "manuscript-studio-old-failed-12345678",
    }));
  }, { draftKey: DRAFT_KEY, activeKey: ACTIVE_KEY });

  await page.addScriptTag({ type: "module", content: studioSource });
  await page.getByRole("button", { name: "Open Manuscript Studio" }).click();

  await expect(page.locator(".manuscript-error")).toContainText("Recovered 279,045 manuscript characters");
  await expect(page.locator(".manuscript-error")).toContainText("Select the original manuscript file once");
  await expect(page.locator(".manuscript-error")).not.toContainText("HTTP 502");
  await expect(page.locator("button[data-advance]")).toBeDisabled();
  await expect(page.locator("button[data-advance]")).toHaveText("Select Original File to Continue");
  expect(await page.evaluate(key => sessionStorage.getItem(key), ACTIVE_KEY)).toBeNull();
});
