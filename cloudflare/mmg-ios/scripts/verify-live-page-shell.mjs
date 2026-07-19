import { chromium } from "playwright";

const origin = "https://themindsetmediagroup.com";
const expectedBuild = "kairos-page-shell-publisher-20260719-1";
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

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const definition of pages) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const url = `${origin}${definition.path}?mmg_dom_verify=${Date.now()}-${viewport.name}`;
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(
        (build) => document.documentElement.dataset.mmgPageShell === build,
        expectedBuild,
        { timeout: 25_000 },
      );
      await page.waitForFunction(
        () => document.documentElement.dataset.mmgPageShellReady === "true",
        null,
        { timeout: 25_000 },
      );
      await page.waitForTimeout(1_000);

      const visibleH1 = (await page.locator("main h1:visible").allTextContents())
        .map((value) => value.replace(/\s+/g, " ").trim());
      const titleHidden = await page.locator("main .mmg-native-page-title-hidden").count();
      const normalizedBlockHidden = await page.locator(definition.hiddenSelector).count();
      const nativeFooter = await page.locator("footer").count();
      const build = await page.locator("html").getAttribute("data-mmg-page-shell");
      const ready = await page.locator("html").getAttribute("data-mmg-page-shell-ready");
      const pageKey = await page.locator("html").getAttribute("data-mmg-page-shell-page");
      const unresolvedProjectGuide = await page.locator('main a[href*="/pages/project-guide"]').count();
      const repairedProcessLinks = definition.publishing
        ? await page.locator('main a[href="/pages/publishing-services#publishing-process"][data-mmg-link-repaired="true"]').count()
        : 0;
      const publishingProcess = definition.publishing ? await page.locator("#publishing-process").count() : 0;
      const overflow = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));

      const passed = Boolean(response?.ok())
        && build === expectedBuild
        && ready === "true"
        && pageKey === definition.key
        && visibleH1.length === 1
        && visibleH1[0] === definition.hero
        && titleHidden === 1
        && normalizedBlockHidden === 1
        && nativeFooter >= 1
        && unresolvedProjectGuide === 0
        && (!definition.publishing || repairedProcessLinks >= 3)
        && (!definition.publishing || publishingProcess === 1)
        && Math.max(overflow.document, overflow.body) <= overflow.viewport + 2;

      results.push({
        page: definition.key,
        viewport: viewport.name,
        http: response?.status() || 0,
        build,
        ready,
        pageKey,
        visibleH1,
        titleHidden,
        normalizedBlockHidden,
        nativeFooter,
        unresolvedProjectGuide,
        repairedProcessLinks,
        publishingProcess,
        overflow,
        passed,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const passed = results.every((result) => result.passed);
console.log(JSON.stringify({ passed, expectedBuild, results }, null, 2));
if (!passed) process.exit(1);
