import { expect, test } from "@playwright/test";

const liveURL = process.env.KAIROS_LIVE_URL;

test.skip(!liveURL, "KAIROS_LIVE_URL is required for the deployed ABOS smoke test.");

test("deployed ABOS Create route opens Manuscript Studio in mobile WebKit", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(`${liveURL}/?abos-proof=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await expect(page.locator("#kairos-executive-os")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  await page.locator('[data-view="create"]').tap();
  await expect(page.getByRole("heading", { name: "What should Kairos accomplish?" })).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptSetupController?.ready === true),
    { timeout: 15_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptAutoPipelineController?.ready === true),
    { timeout: 15_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => typeof window.KairosProductionWorkspace?.open === "function"),
    { timeout: 15_000 },
  ).toBe(true);

  await page.locator("[data-manuscript]").tap();

  const overlay = page.locator("#manuscript-studio-overlay");
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  await expect(overlay.getByRole("heading", { name: "Manuscript Studio" })).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem("kairos.production.active-workspace") || "null");
    } catch {
      return null;
    }
  }), { timeout: 15_000 }).toMatchObject({
    workspace: "manuscript-studio",
    projectId: expect.stringMatching(/^manuscript-studio-[a-z0-9-]+$/i),
  });

  expect(errors).toEqual([]);
});
