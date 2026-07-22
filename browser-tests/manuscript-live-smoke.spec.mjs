import { expect, test } from "@playwright/test";

const liveURL = process.env.KAIROS_LIVE_URL;

test.skip(!liveURL, "KAIROS_LIVE_URL is required for the deployed-app smoke test.");

test("deployed Command Center initializes the controller and opens Manuscript Studio", async ({ page }) => {
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

  const launch = page.getByRole("button", { name: "Open Manuscript Studio" });
  await expect(launch).toBeVisible({ timeout: 15_000 });
  await launch.tap();

  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manuscript Studio" })).toBeVisible();
  expect(errors).toEqual([]);
});
