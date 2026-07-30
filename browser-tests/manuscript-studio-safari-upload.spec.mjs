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

test("iPhone Safari uploads a manuscript, computes its checksum, and advances to production intake", async ({ page }) => {
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
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          source: {
            projectId: PROJECT_ID,
            filename: "Draft-One.txt",
            name: "Draft-One.txt",
            size: Buffer.byteLength(MANUSCRIPT),
            format: "txt",
            checksum: "webkit-checksum",
            storedAt: "2026-07-30T02:00:00.000Z",
          },
        }),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/manuscript/intake/advance") {
      calls.push({ method: request.method(), path: url.pathname });
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.manuscript).toContain("Safari upload path");
      expect(payload.source?.stored).toBe(true);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "production_intake",
          projectID: "publishing-project-safari",
          intakeID: "intake-safari",
          customerMessage: "Your manuscript has advanced into MMG production intake.",
          manuscript: { characterCount: MANUSCRIPT.length, wordCount: MANUSCRIPT.split(/\s+/).length },
          workflow: { requiredNextActions: ["Complete project setup."] },
        }),
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
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));

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
  }, { key: ACTIVE_KEY, projectId: PROJECT_ID });

  await expect.poll(() => page.evaluate(() => crypto.subtle.digest.__rejectsObjectIdentifier === true)).toBe(true);
  await page.addScriptTag({ type: "module", content: compatibilitySource });
  await expect.poll(() => page.evaluate(() => window.KairosSafariManuscriptIntakeCompat?.ready)).toBe(true);

  await page.addScriptTag({ type: "module", content: studioSource });
  await page.locator(".manuscript-launch").tap();
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();

  await page.locator("[data-file]").setInputFiles({
    name: "Draft: One?.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT),
  });

  await expect(page.locator(".manuscript-source")).toContainText("stored and verified");
  await expect(page.locator(".manuscript-error")).toHaveCount(0);
  await expect(page.locator("#ms-body")).toHaveValue(MANUSCRIPT);

  await page.locator("[data-advance]").tap();

  await expect(page.locator(".manuscript-result")).toContainText("Production intake created");
  await expect(page.locator(".manuscript-result")).toContainText("Your manuscript has advanced into MMG production intake.");
  expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
    `POST /api/production-registry/manuscripts/${PROJECT_ID}/source`,
    "POST /api/manuscript/intake/advance",
    `PATCH /api/production-registry/projects/${PROJECT_ID}`,
  ]);
});
