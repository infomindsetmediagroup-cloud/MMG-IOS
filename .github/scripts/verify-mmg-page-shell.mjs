import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

const storefrontOrigin = process.env.MMG_STOREFRONT_URL || "https://themindsetmediagroup.com";
const outputDirectory = process.env.MMG_PAGE_SHELL_OUTPUT || "artifacts/mmg-page-shell";
const expectedPageShellBuild = "kairos-page-shell-publisher-20260719-1";
const expectedNavigationBuild = "kairos-native-navigation-theme-publisher-20260719-9";
const canonicalTopLevel = ["Shop", "Create & Learn", "Services", "Company", "Support"];
const pages = [
  {
    key: "free-creator-toolkit",
    path: "/pages/free-creator-toolkit",
    expectedTitle: "The Free Creator Toolkit.",
    expectedFooterRepair: ".mmg-page-mini-navigation-hidden",
  },
  {
    key: "publishing-services",
    path: "/pages/publishing-services",
    expectedTitle: "Turn your knowledge into a published book.",
    expectedFooterRepair: ".mmg-page-directory-hidden",
    publishingProcess: true,
  },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

await mkdir(outputDirectory, { recursive: true });
const report = {
  storefrontOrigin,
  expectedPageShellBuild,
  expectedNavigationBuild,
  startedAt: new Date().toISOString(),
  passed: true,
  results: [],
  failures: [],
};

const browser = await chromium.launch({ headless: true });
try {
  for (const pageDefinition of pages) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("requestfailed", (request) => {
        const failure = request.failure()?.errorText || "request failed";
        if (!/ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure)) {
          failedRequests.push(`${request.method()} ${request.url()} — ${failure}`);
        }
      });

      const url = `${storefrontOrigin}${pageDefinition.path}?mmg_page_shell_verify=${Date.now()}`;
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(
        (build) => document.documentElement.dataset.mmgPageShell === build,
        expectedPageShellBuild,
        { timeout: 20_000 },
      );
      await page.waitForFunction(
        (build) => document.documentElement.dataset.mmgCanonicalNavigation === build,
        expectedNavigationBuild,
        { timeout: 20_000 },
      );
      await page.waitForTimeout(750);

      const checks = [];
      checks.push(check("HTTP response", Boolean(response?.ok()), response ? `${response.status()} ${response.statusText()}` : "No response"));
      checks.push(check(
        "Page-shell build marker",
        await page.locator("html").getAttribute("data-mmg-page-shell") === expectedPageShellBuild,
        await page.locator("html").getAttribute("data-mmg-page-shell"),
      ));
      checks.push(check(
        "Page-shell page marker",
        await page.locator("html").getAttribute("data-mmg-page-shell-page") === pageDefinition.key,
        await page.locator("html").getAttribute("data-mmg-page-shell-page"),
      ));

      const desktopTitles = await page.locator("header .mmg-canonical-nav > li > details > summary span").allTextContents();
      const drawerTitles = await page.locator(".mmg-canonical-drawer > li > details > summary").allTextContents();
      checks.push(check("Canonical desktop navigation", equalText(desktopTitles, canonicalTopLevel), desktopTitles));
      checks.push(check("Canonical drawer navigation", equalText(drawerTitles, canonicalTopLevel), drawerTitles));

      const visibleH1 = await page.locator("main h1:visible").allTextContents();
      checks.push(check("Exactly one visible H1", visibleH1.length === 1, visibleH1));
      checks.push(check("Correct hero H1", normalize(visibleH1[0]) === pageDefinition.expectedTitle, visibleH1));
      checks.push(check(
        "Native page title suppressed",
        await page.locator("main .mmg-native-page-title-hidden").count() === 1,
        `found ${await page.locator("main .mmg-native-page-title-hidden").count()}`,
      ));

      checks.push(check(
        "Page-specific directory normalized",
        await page.locator(`main ${pageDefinition.expectedFooterRepair}`).count() === 1,
        `found ${await page.locator(`main ${pageDefinition.expectedFooterRepair}`).count()}`,
      ));
      checks.push(check("Native Shopify footer preserved", await page.locator("footer").count() >= 1, "footer missing"));

      const unresolvedGuideLinks = await page.locator('main a[href*="/pages/project-guide"]').count();
      checks.push(check("No unresolved Project Guide links", unresolvedGuideLinks === 0, `found ${unresolvedGuideLinks}`));
      if (pageDefinition.publishingProcess) {
        checks.push(check("Publishing process target exists", await page.locator("#publishing-process").count() === 1, "#publishing-process missing"));
        checks.push(check(
          "Publishing process CTAs repaired",
          await page.locator('main a[href="/pages/publishing-services#publishing-process"][data-mmg-link-repaired="true"]').count() >= 3,
          `found ${await page.locator('main a[href="/pages/publishing-services#publishing-process"][data-mmg-link-repaired="true"]').count()}`,
        ));
      }

      const anchorAudit = await page.locator("main a, footer a").evaluateAll((anchors, origin) => anchors.flatMap((anchor) => {
        const style = window.getComputedStyle(anchor);
        const visible = style.display !== "none" && style.visibility !== "hidden" && anchor.getClientRects().length > 0;
        if (!visible) return [];
        const rawHref = anchor.getAttribute("href") || "";
        const label = (anchor.getAttribute("aria-label") || anchor.textContent || anchor.getAttribute("title") || "").replace(/\s+/g, " ").trim();
        let absolute = "";
        let sameOrigin = false;
        try {
          absolute = new URL(rawHref, origin).href;
          sameOrigin = new URL(absolute).origin === origin;
        } catch {}
        return [{ label, rawHref, absolute, sameOrigin }];
      }), storefrontOrigin);

      const unnamed = anchorAudit.filter((anchor) => !anchor.label || !anchor.rawHref);
      checks.push(check("Every page/footer link is named and has an href", unnamed.length === 0, unnamed));

      const fragmentFailures = await page.evaluate(() => {
        const failures = [];
        for (const anchor of document.querySelectorAll("main a[href^='#'], footer a[href^='#']")) {
          const href = anchor.getAttribute("href");
          if (!href || href === "#") continue;
          let id = "";
          try { id = decodeURIComponent(href.slice(1)); } catch { id = href.slice(1); }
          if (id && !document.getElementById(id)) failures.push({ text: (anchor.textContent || "").trim(), href });
        }
        return failures;
      });
      checks.push(check("All internal fragment links resolve", fragmentFailures.length === 0, fragmentFailures));

      const linkFailures = await auditSameOriginLinks(context, anchorAudit, storefrontOrigin);
      checks.push(check("All same-origin page/footer links resolve", linkFailures.length === 0, linkFailures));

      const overflow = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      checks.push(check("No horizontal overflow", Math.max(overflow.documentWidth, overflow.bodyWidth) <= overflow.viewportWidth + 2, overflow));
      checks.push(check("No page console errors", consoleErrors.length === 0, consoleErrors));
      checks.push(check("No failed required requests", failedRequests.length === 0, failedRequests));

      const screenshotPath = `${outputDirectory}/${pageDefinition.key}-${viewport.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const passed = checks.every((item) => item.passed);
      if (!passed) {
        report.passed = false;
        report.failures.push(...checks.filter((item) => !item.passed).map((item) => `${pageDefinition.key}/${viewport.name}: ${item.name} — ${format(item.details)}`));
      }
      report.results.push({
        page: pageDefinition.key,
        path: pageDefinition.path,
        viewport,
        passed,
        checks,
        screenshotPath,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

report.completedAt = new Date().toISOString();
await writeFile(`${outputDirectory}/verification-report.json`, JSON.stringify(report, null, 2));
await writeFile(`${outputDirectory}/verification-report.md`, markdown(report));
if (!report.passed) {
  console.error(report.failures.join("\n"));
  process.exit(1);
}
console.log(`PASS: MMG page shell verified across ${report.results.length} page/viewport combinations.`);

async function auditSameOriginLinks(context, anchors) {
  const candidates = [...new Set(anchors
    .filter((anchor) => anchor.sameOrigin && anchor.absolute)
    .map((anchor) => {
      const url = new URL(anchor.absolute);
      url.hash = "";
      return url.href;
    })
    .filter((href) => {
      const url = new URL(href);
      return !/\/(cart|checkout)(\/|$)/.test(url.pathname);
    }))].slice(0, 100);

  const failures = [];
  for (const href of candidates) {
    try {
      const response = await context.request.get(href, { timeout: 30_000, maxRedirects: 8 });
      const status = response.status();
      if (status >= 400 && status !== 429) failures.push({ href, status });
    } catch (error) {
      failures.push({ href, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return failures;
}

function check(name, passed, details) {
  return { name, passed: Boolean(passed), details };
}

function equalText(actual, expected) {
  return JSON.stringify(actual.map(normalize)) === JSON.stringify(expected);
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function format(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function markdown(value) {
  const lines = [
    "# MMG Page Shell Verification",
    "",
    `- Storefront: ${value.storefrontOrigin}`,
    `- Page-shell build: ${value.expectedPageShellBuild}`,
    `- Navigation build: ${value.expectedNavigationBuild}`,
    `- Result: ${value.passed ? "PASS" : "FAIL"}`,
    `- Completed: ${value.completedAt}`,
    "",
  ];
  for (const result of value.results) {
    lines.push(`## ${result.page} · ${result.viewport.name} (${result.viewport.width} × ${result.viewport.height})`, "");
    for (const item of result.checks) {
      lines.push(`- ${item.passed ? "PASS" : "FAIL"}: ${item.name}${item.passed ? "" : ` — ${format(item.details)}`}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
