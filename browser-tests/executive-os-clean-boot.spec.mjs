import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const safariSource = readFileSync(new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url), "utf8");
const legacySource = readFileSync(new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url), "utf8");
const commandHubSource = readFileSync(new URL("../web/kairos-dashboard/scripts/command-hub.js", import.meta.url), "utf8");
const executiveSource = readFileSync(new URL("../web/kairos-dashboard/scripts/executive-os.js", import.meta.url), "utf8");

async function installDashboardRoutes(page) {
  const scriptRequests = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: indexSource });
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

    if (path === "/scripts/legacy-runtime-loader.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: legacySource });
      return;
    }

    if (path === "/scripts/command-hub.js") {
      scriptRequests.push("command-hub.js");
      await route.fulfill({ status: 200, contentType: "text/javascript", body: commandHubSource });
      return;
    }

    if (path === "/scripts/executive-os.js") {
      scriptRequests.push("executive-os.js");
      await route.fulfill({ status: 200, contentType: "text/javascript", body: executiveSource });
      return;
    }

    if (path === "/scripts/executive-os-live-details.js" || path === "/scripts/executive-os-feedback.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "export {};" });
      return;
    }

    if (path.startsWith("/api/")) {
      if (path === "/api/health") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", build: "test" }) });
        return;
      }
      if (path === "/api/capabilities") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", capabilities: [] }) });
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
      scriptRequests.push(path.split("/").pop());
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "export {};" });
      return;
    }

    await route.fulfill({ status: 404, body: "not found" });
  });

  return scriptRequests;
}

test("default iPhone route restores the five-parent-card Kairos command dashboard", async ({ page }) => {
  const scriptRequests = await installDashboardRoutes(page);

  await page.goto("https://kairos.test/?test=five-center-dashboard", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("body").getAttribute("data-kairos-command-hub-ready"), { timeout: 20_000 }).toBe("true");

  await expect(page.locator("#kairos-executive-os")).toHaveCount(0);
  await expect(page.locator("#kairos-local-production-panel")).toHaveCount(0);
  await expect(page.locator(".parent-card")).toHaveCount(5);
  await expect(page.getByRole("button", { name: /Knowledge/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Content/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Business/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Customers/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Operations/ })).toBeVisible();

  await page.getByRole("button", { name: /Content/ }).tap();
  await expect(page.getByRole("heading", { name: "Choose an action" })).toBeVisible();
  await expect(page.locator(".child-card")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Open Manuscript Studio" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Return to Command Center" })).toBeEnabled();

  expect(scriptRequests[0]).toBe("command-hub.js");
  expect(scriptRequests).not.toContain("executive-local-inference.js");
});

test("Executive OS remains an explicit opt-in route and does not replace the command dashboard", async ({ page }) => {
  const scriptRequests = await installDashboardRoutes(page);

  await page.goto("https://kairos.test/?mode=executive", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#kairos-executive-os")).toBeVisible();
  await expect(page.locator(".parent-card")).toHaveCount(0);
  await expect(page.locator("#kairos-local-production-panel")).toHaveCount(0);
  expect(scriptRequests).toContain("executive-os.js");
  expect(scriptRequests).not.toContain("command-hub.js");
});

test("advanced workspace still returns to the five-center command dashboard", async ({ page }) => {
  await installDashboardRoutes(page);

  await page.goto("https://kairos.test/?mode=advanced", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("body").getAttribute("data-kairos-command-hub-ready"), { timeout: 20_000 }).toBe("true");
  await expect(page.locator(".parent-card")).toHaveCount(5);
  await expect(page.locator("[data-kairos-persistent-return]")).toBeVisible();
  await expect(page.locator("#kairos-executive-os")).toHaveCount(0);
});
