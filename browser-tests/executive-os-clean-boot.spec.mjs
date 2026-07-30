import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const safariSource = readFileSync(new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url), "utf8");
const executiveSource = readFileSync(new URL("../web/kairos-dashboard/scripts/executive-os.js", import.meta.url), "utf8");
const legacySource = readFileSync(new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url), "utf8");
const executiveCSS = readFileSync(new URL("../web/kairos-dashboard/styles/executive-os.css", import.meta.url), "utf8");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function installDashboardRoutes(page, { slowAPIs = false } = {}) {
  const legacyRequests = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: indexSource });
      return;
    }

    if (path === "/styles/executive-os.css") {
      await route.fulfill({ status: 200, contentType: "text/css", body: executiveCSS });
      return;
    }

    if (path.endsWith(".css")) {
      await route.fulfill({ status: 200, contentType: "text/css", body: "" });
      return;
    }

    if (path === "/scripts/safari-manuscript-intake-compat.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: safariSource });
      return;
    }

    if (path === "/scripts/executive-os.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: executiveSource });
      return;
    }

    if (path === "/scripts/legacy-runtime-loader.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: legacySource });
      return;
    }

    if (path === "/scripts/executive-os-live-details.js" || path === "/scripts/executive-os-feedback.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "export {};" });
      return;
    }

    if (path.startsWith("/api/")) {
      if (slowAPIs) await delay(4_000);
      if (path === "/api/health") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready" }) });
        return;
      }
      if (path === "/api/workflows") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", workflows: [] }) });
        return;
      }
      if (path === "/api/executive-briefing/latest") {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ briefing: null }) });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return;
    }

    if (path.startsWith("/scripts/") && path.endsWith(".js")) {
      legacyRequests.push(path.split("/").pop());
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "export {};" });
      return;
    }

    await route.fulfill({ status: 404, body: "not found" });
  });

  return legacyRequests;
}

test("iPhone WebKit remains tappable while executive API refresh is pending", async ({ page }) => {
  const legacyRequests = await installDashboardRoutes(page, { slowAPIs: true });

  await page.goto("https://kairos.test/?test=clean-boot", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#kairos-executive-os")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create" })).toBeVisible();

  await page.getByRole("button", { name: "Create" }).tap();
  await expect(page.getByRole("heading", { name: "What should Kairos accomplish?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start governed work" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Open manuscript production" })).toBeEnabled();
  expect(legacyRequests).toEqual([]);

  await page.getByRole("button", { name: "Open manuscript production" }).tap();
  await expect(page).toHaveURL(/mode=advanced/);
  await expect(page).toHaveURL(/open=manuscript/);
});

test("advanced mode loads the legacy runtime without mounting Executive OS", async ({ page }) => {
  const legacyRequests = await installDashboardRoutes(page);

  await page.goto("https://kairos.test/?mode=advanced", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#kairos-executive-os")).toHaveCount(0);
  await expect(page.locator("[data-kairos-persistent-return]")).toBeVisible();
  await expect.poll(() => page.locator("body").getAttribute("data-kairos-legacy-ready"), { timeout: 15_000 }).toBe("true");

  expect(legacyRequests.length).toBeGreaterThan(40);
  expect(legacyRequests[0]).toBe("command-hub.js");
  expect(legacyRequests).toContain("manuscript-studio.js");
  expect(legacyRequests).toContain("production-workspace-controller.js");
});
