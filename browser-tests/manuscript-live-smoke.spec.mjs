import { expect, test } from "@playwright/test";

const liveURL = process.env.KAIROS_LIVE_URL;

test.skip(!liveURL, "KAIROS_LIVE_URL is required for the deployed-app smoke test.");

test("deployed Command Center opens Manuscript Studio through the public Content-center route", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${liveURL}/?proof=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptSetupController?.ready === true),
    { timeout: 15_000 },
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptSetupController?.build || ""),
  ).toBe("kairos-manuscript-project-setup-ui-20260722-3");

  const contentCenter = page.locator('.parent-card[data-center="content"]');
  await expect(contentCenter).toBeVisible({ timeout: 15_000 });
  await contentCenter.tap();

  const manuscriptAction = page.locator('[data-child="manuscript-studio"]');
  await expect(manuscriptAction).toBeVisible();
  await expect(manuscriptAction).toHaveText("Open Manuscript Studio");
  await manuscriptAction.tap();

  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manuscript Studio" })).toBeVisible();

  await page.waitForTimeout(3_000);
  expect(errors).toEqual([]);
});
