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
const studioCSS = readFileSync(
  new URL("../web/kairos-dashboard/styles/manuscript-studio.css", import.meta.url),
  "utf8",
);
const setupSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-project-setup.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-safari-upload";
const ACTIVE_KEY = "kairos.production.active-workspace";
const MANUSCRIPT = [
  "This is a complete manuscript fixture used to validate the Safari upload path.",
  "It contains enough text to pass production-intake validation and preserve the source.",
  "The regression specifically verifies checksum generation before the durable upload.",
].join("\n\n");

function fixtureHTML() {
  return "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body></body></html>";
}

async function installSafariStudio(page, projectId = PROJECT_ID) {
  await page.goto("https://kairos.test/?mode=advanced");
  await page.evaluate(({ key, projectId: value }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId: value }));

    const subtle = crypto.subtle;
    const nativeDigest = subtle.digest.bind(subtle);
    const safariDigest = function safariDigest(algorithm, data) {
      if (typeof algorithm === "object") {
        return Promise.reject(new DOMException("The string did not match the expected pattern.", "SyntaxError"));
      }
      return nativeDigest(algorithm, data);
    };
    Object.defineProperty(safariDigest, "__rejectsObjectIdentifier", { value: true });
    try {
      Object.defineProperty(subtle, "digest", { configurable: true, value: safariDigest });
    } catch {
      subtle.digest = safariDigest;
    }
  }, { key: ACTIVE_KEY, projectId });

  await expect.poll(() => page.evaluate(() => crypto.subtle.digest.__rejectsObjectIdentifier === true)).toBe(true);
  await page.addScriptTag({ type: "module", content: compatibilitySource });
  await expect.poll(() => page.evaluate(() => window.KairosSafariManuscriptIntakeCompat?.ready)).toBe(true);
  await page.addStyleTag({ content: studioCSS });
  await page.addScriptTag({ type: "module", content: setupSource });
  await page.addScriptTag({ type: "module", content: studioSource });
  await page.locator(".manuscript-launch").tap();
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();
}

function storedSource(projectId = PROJECT_ID) {
  return {
    status: "stored-and-verified",
    source: {
      projectId,
      filename: "Draft-One.txt",
      name: "Draft-One.txt",
      size: Buffer.byteLength(MANUSCRIPT),
      format: "txt",
      checksum: "webkit-checksum",
      stored: true,
      uploadMode: "chunked-v1",
      storedAt: "2026-07-30T02:00:00.000Z",
    },
  };
}

function intakeResult() {
  return {
    status: "production_intake",
    projectID: "publishing-project-safari",
    intakeID: "intake-safari",
    customerMessage: "Your manuscript has advanced into MMG production intake.",
    manuscript: { characterCount: MANUSCRIPT.length, wordCount: MANUSCRIPT.split(/\s+/).length },
    workflow: { requiredNextActions: ["Complete project setup."] },
  };
}

function sourceBase(projectId = PROJECT_ID) {
  return `/api/production-registry/manuscripts/${projectId}/source`;
}

test("iPhone Safari stores a manuscript through direct chunks and advances to production intake", async ({ page }) => {
  const calls = [];
  let uploadId = "";

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const contentType = request.headers()["content-type"] || "";

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${sourceBase()}/session`) {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      const payload = request.postDataJSON();
      uploadId = payload.uploadId;
      expect(payload.fileChunks).toBe(1);
      expect(payload.textChunks).toBe(1);
      expect(payload.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(contentType).toContain("application/json");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "upload-session-created", upload: { uploadId } }),
      });
      return;
    }

    if (request.method() === "PUT" && (url.pathname === `${sourceBase()}/file/0` || url.pathname === `${sourceBase()}/text-chunk/0`)) {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      expect(contentType).toContain("application/octet-stream");
      expect(request.headers()["x-kairos-upload-id"]).toBe(uploadId);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "chunk-stored" }) });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${sourceBase()}/commit`) {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      expect(request.postDataJSON().uploadId).toBe(uploadId);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(storedSource()) });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/manuscript/intake/advance") {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.manuscript).toContain("Safari upload path");
      expect(payload.source?.stored).toBe(true);
      expect(payload.source?.uploadMode).toBe("chunked-v1");
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(intakeResult()) });
      return;
    }

    if (request.method() === "PATCH" && url.pathname === `/api/production-registry/projects/${PROJECT_ID}`) {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "updated" }) });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await installSafariStudio(page);

  await page.locator("[data-file]").setInputFiles({
    name: "Draft: One?.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT),
  });

  await expect(page.locator(".manuscript-source")).toContainText("stored and verified through chunks");
  await expect(page.locator(".manuscript-error")).toHaveCount(0);
  await expect(page.locator("#ms-body")).toHaveValue(MANUSCRIPT);

  await page.locator("[data-advance]").tap();

  await expect(page.locator(".manuscript-result")).toContainText("Production intake created");
  await expect(page.locator(".manuscript-result")).toContainText("Your manuscript has advanced into MMG production intake.");
  await expect(page.locator("#manuscript-project-setup")).toBeVisible();
  await expect(page.locator("[data-setup-author]")).toBeVisible();
  await expect(page.locator("[data-finish]")).toHaveAttribute("href", "#manuscript-project-setup");
  await page.locator("[data-finish]").tap();
  await expect(page.locator("#manuscript-project-setup")).toBeVisible();
  await page.locator("[data-kairos-source-review] > summary").tap();
  await expect(page.locator(".manuscript-result")).toContainText("Production intake created");
  await expect(page.locator("[data-kairos-source-review]")).toBeVisible();
  await expect(page.locator("[data-intake-source-review]")).toHaveValue(MANUSCRIPT);
  await page.locator("[data-kairos-source-review] > summary").tap();
  await expect(page.locator("[data-kairos-source-review]")).not.toHaveAttribute("open", "");
  await expect(page.locator("[data-finish]")).toBeVisible();
  expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
    `POST ${sourceBase()}/session`,
    `PUT ${sourceBase()}/file/0`,
    `PUT ${sourceBase()}/text-chunk/0`,
    `POST ${sourceBase()}/commit`,
    "POST /api/manuscript/intake/advance",
    `PATCH /api/production-registry/projects/${PROJECT_ID}`,
  ]);
  expect(calls.some(call => /multipart\/form-data/i.test(call.contentType))).toBe(false);
});

test("Safari retains file bytes and manually retries a rejected chunk session", async ({ page }) => {
  const calls = [];
  let sessionAttempts = 0;
  let uploadId = "";

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const contentType = request.headers()["content-type"] || "";

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${sourceBase()}/session`) {
      sessionAttempts += 1;
      calls.push({ method: request.method(), path: url.pathname, contentType });
      if (sessionAttempts === 1) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Temporary source session conflict." } }),
        });
        return;
      }
      const payload = request.postDataJSON();
      uploadId = payload.uploadId;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "upload-session-created", upload: { uploadId } }),
      });
      return;
    }

    if (request.method() === "PUT" && (url.pathname === `${sourceBase()}/file/0` || url.pathname === `${sourceBase()}/text-chunk/0`)) {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      expect(request.headers()["x-kairos-upload-id"]).toBe(uploadId);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "chunk-stored" }) });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${sourceBase()}/commit`) {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(storedSource()) });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/manuscript/intake/advance") {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.manuscript).toBe(MANUSCRIPT);
      expect(payload.source?.stored).toBe(true);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(intakeResult()) });
      return;
    }

    if (request.method() === "PATCH" && url.pathname === `/api/production-registry/projects/${PROJECT_ID}`) {
      calls.push({ method: request.method(), path: url.pathname, contentType });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "updated" }) });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await installSafariStudio(page);

  await page.locator("[data-file]").setInputFiles({
    name: "Draft: One?.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT),
  });

  await expect(page.locator("#ms-body")).toHaveValue(MANUSCRIPT);
  await expect(page.locator(".manuscript-source")).toContainText("text and original source retained; verified chunk save can retry");
  await expect(page.locator(".manuscript-source")).toContainText(`${MANUSCRIPT.length} characters retained`);
  await expect(page.locator("[data-retry-source]")).toBeVisible();
  await expect(page.locator(".manuscript-error")).toContainText("Temporary source session conflict.");
  await expect.poll(() => page.evaluate(() => {
    const draft = JSON.parse(sessionStorage.getItem("kairos.manuscript-studio.recoverable-draft.v1") || "{}");
    return draft.manuscript?.length || 0;
  })).toBe(MANUSCRIPT.length);

  await page.locator("[data-retry-source]").tap();

  await expect(page.locator(".manuscript-source")).toContainText("stored and verified through chunks");
  await expect(page.locator("#ms-body")).toHaveValue(MANUSCRIPT);
  await expect(page.locator("[data-retry-source]")).toHaveCount(0);
  await expect(page.locator(".manuscript-error")).toHaveCount(0);

  await page.locator("[data-advance]").tap();
  await expect(page.locator(".manuscript-result")).toContainText("Production intake created");
  expect(sessionAttempts).toBe(2);
  expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
    `POST ${sourceBase()}/session`,
    `POST ${sourceBase()}/session`,
    `PUT ${sourceBase()}/file/0`,
    `PUT ${sourceBase()}/text-chunk/0`,
    `POST ${sourceBase()}/commit`,
    "POST /api/manuscript/intake/advance",
    `PATCH /api/production-registry/projects/${PROJECT_ID}`,
  ]);
  expect(calls.some(call => /multipart\/form-data/i.test(call.contentType))).toBe(false);
});
