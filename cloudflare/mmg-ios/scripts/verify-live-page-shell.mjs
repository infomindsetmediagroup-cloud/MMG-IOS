import fs from "node:fs";
import puppeteer from "puppeteer-core";

const origin = "https://themindsetmediagroup.com";
const expectedBuild = "kairos-page-shell-publisher-20260719-1";
const reportPath = "../../web/kairos-dashboard/mmg-page-shell-verification.json";
const pages = [
  {
    key: "free-creator-toolkit",
    path: "/pages/free-creator-toolkit",
    hero: "The Free Creator Toolkit.",
    hiddenSelector: "main .mmg-page-mini-navigation-hidden",
  },
  {
    key: "publishing-services",
    path: "/pages/publishing-services",
    hero: "Turn your knowledge into a published book.",
    hiddenSelector: "main .mmg-page-directory-hidden",
    publishing: true,
  },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];
const executablePath = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((candidate) => candidate && fs.existsSync(candidate));

const report = {
  generatedAt: new Date().toISOString(),
  sourceSha: process.env.SOURCE_SHA || process.env.GITHUB_SHA || "unknown",
  origin,
  expectedBuild,
  executablePath: executablePath || null,
  passed: false,
  results: [],
  error: null,
};

let browser;
try {
  if (!executablePath) throw new Error("No Chrome or Chromium executable was available on the deployment runner.");
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  for (const definition of pages) {
    for (const viewport of viewports) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      const result = {
        page: definition.key,
        viewport: viewport.name,
        http: 0,
        build: null,
        ready: null,
        pageKey: null,
        visibleH1: [],
        titleHidden: 0,
        normalizedBlockHidden: 0,
        nativeFooter: 0,
        unresolvedProjectGuide: 0,
        repairedProcessLinks: 0,
        publishingProcess: 0,
        overflow: null,
        passed: false,
        error: null,
      };

      try {
        const response = await page.goto(
          `${origin}${definition.path}?mmg_dom_verify=${Date.now()}-${viewport.name}`,
          { waitUntil: "domcontentloaded", timeout: 60_000 },
        );
        result.http = response?.status() || 0;
        await page.waitForFunction(
          (build) => document.documentElement.dataset.mmgPageShell === build,
          { timeout: 25_000 },
          expectedBuild,
        );
        await page.waitForFunction(
          () => document.documentElement.dataset.mmgPageShellReady === "true",
          { timeout: 25_000 },
        );
        await new Promise((resolve) => setTimeout(resolve, 1_000));

        const state = await page.evaluate(({ hiddenSelector, publishing }) => {
          const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
          const visible = (element) => {
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
          };
          const visibleH1 = [...document.querySelectorAll("main h1")]
            .filter(visible)
            .map((element) => normalize(element.textContent));
          return {
            build: document.documentElement.dataset.mmgPageShell || null,
            ready: document.documentElement.dataset.mmgPageShellReady || null,
            pageKey: document.documentElement.dataset.mmgPageShellPage || null,
            visibleH1,
            titleHidden: document.querySelectorAll("main .mmg-native-page-title-hidden").length,
            normalizedBlockHidden: document.querySelectorAll(hiddenSelector).length,
            nativeFooter: document.querySelectorAll("footer").length,
            unresolvedProjectGuide: document.querySelectorAll('main a[href*="/pages/project-guide"]').length,
            repairedProcessLinks: publishing
              ? document.querySelectorAll('main a[href="/pages/publishing-services#publishing-process"][data-mmg-link-repaired="true"]').length
              : 0,
            publishingProcess: publishing ? document.querySelectorAll("#publishing-process").length : 0,
            overflow: {
              viewport: document.documentElement.clientWidth,
              document: document.documentElement.scrollWidth,
              body: document.body.scrollWidth,
            },
          };
        }, { hiddenSelector: definition.hiddenSelector, publishing: Boolean(definition.publishing) });
        Object.assign(result, state);
        result.passed = result.http >= 200
          && result.http < 400
          && result.build === expectedBuild
          && result.ready === "true"
          && result.pageKey === definition.key
          && result.visibleH1.length === 1
          && result.visibleH1[0] === definition.hero
          && result.titleHidden === 1
          && result.normalizedBlockHidden === 1
          && result.nativeFooter >= 1
          && result.unresolvedProjectGuide === 0
          && (!definition.publishing || result.repairedProcessLinks >= 3)
          && (!definition.publishing || result.publishingProcess === 1)
          && Math.max(result.overflow.document, result.overflow.body) <= result.overflow.viewport + 2;
      } catch (error) {
        result.error = error instanceof Error ? error.stack || error.message : String(error);
      } finally {
        report.results.push(result);
        await page.close();
      }
    }
  }
  report.passed = report.results.length === pages.length * viewports.length
    && report.results.every((result) => result.passed);
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  if (browser) await browser.close();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
