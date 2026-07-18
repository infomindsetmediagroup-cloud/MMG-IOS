import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const previewURL = process.env.MMG_PREVIEW_URL;
const outputDirectory = resolve(process.env.MMG_VERIFICATION_OUTPUT || "artifacts/canonical-homepage");
if (!previewURL) throw new Error("MMG_PREVIEW_URL is required.");
await mkdir(outputDirectory, { recursive: true });

const expectedSections = ["pathways", "resources", "services", "subscriptions", "kairos", "mission", "questions", "next-step"];
const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 844 },
];

const report = {
  previewURL,
  startedAt: new Date().toISOString(),
  passed: true,
  attempts: Number(process.env.MMG_VERIFICATION_ATTEMPT || "1"),
  viewports: [],
  failures: [],
};

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText || "request failed";
      if (!/ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure)) failedRequests.push(`${request.method()} ${request.url()} — ${failure}`);
    });

    const response = await page.goto(previewURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-mmg-canonical-homepage]", { state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1_200);

    const ignoredFailedRequests = failedRequests.filter(isOptionalShopPayRequest);
    const requiredFailedRequests = failedRequests.filter((entry) => !isOptionalShopPayRequest(entry));
    const { ignored: ignoredConsoleErrors, required: requiredConsoleErrors } = classifyConsoleErrors(
      consoleErrors,
      ignoredFailedRequests.length,
    );

    const checks = [];
    checks.push(check("HTTP response", Boolean(response && response.ok()), response ? `${response.status()} ${response.statusText()}` : "No navigation response"));

    const buildMarker = await page.locator("[data-mmg-canonical-homepage]").getAttribute("data-build");
    checks.push(check("Canonical build marker", buildMarker === "kairos-canonical-homepage-builder-20260717-1", buildMarker || "missing"));

    const h1Count = await page.locator("h1").count();
    checks.push(check("Exactly one H1", h1Count === 1, `found ${h1Count}`));

    for (const sectionID of expectedSections) {
      const section = page.locator(`#${sectionID}`);
      checks.push(check(`Section #${sectionID}`, await section.count() === 1 && await section.isVisible(), "required section missing or hidden"));
    }

    const anchorAudit = await page.locator("[data-mmg-canonical-homepage] a").evaluateAll((anchors) => anchors.map((anchor) => ({
      text: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
      href: anchor.getAttribute("href") || "",
      aria: anchor.getAttribute("aria-label") || "",
    })));
    const badAnchors = anchorAudit.filter((anchor) => !anchor.href || /^javascript:/i.test(anchor.href) || (!anchor.text && !anchor.aria));
    checks.push(check("Action links are valid", badAnchors.length === 0, badAnchors));

    await page.locator('a[href="#pathways"]').first().click();
    await page.waitForTimeout(700);
    const hash = await page.evaluate(() => location.hash);
    checks.push(check("Primary CTA interaction", hash === "#pathways", `location hash is ${hash || "empty"}`));

    const firstFAQ = page.locator("#questions details").first();
    await firstFAQ.locator("summary").click();
    checks.push(check("FAQ interaction", await firstFAQ.getAttribute("open") !== null, "first FAQ did not open"));

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    checks.push(check("No horizontal overflow", Math.max(overflow.documentWidth, overflow.bodyWidth) <= overflow.viewportWidth + 2, overflow));

    const unnamedControls = await page.locator("[data-mmg-canonical-homepage]").evaluate((root) => {
      const controls = [...root.querySelectorAll("button,a,input,select,textarea,summary")];
      return controls.filter((element) => {
        const name = (element.getAttribute("aria-label") || element.textContent || element.getAttribute("title") || "").trim();
        return !name;
      }).map((element) => element.outerHTML.slice(0, 180));
    });
    checks.push(check("Interactive controls have names", unnamedControls.length === 0, unnamedControls));

    const missingImageAlt = await page.locator("img:not([alt])").count();
    checks.push(check("Images include alt attributes", missingImageAlt === 0, `missing alt on ${missingImageAlt} image(s)`));

    checks.push(check("No page console errors", requiredConsoleErrors.length === 0, requiredConsoleErrors));
    checks.push(check("No failed required requests", requiredFailedRequests.length === 0, requiredFailedRequests));

    const screenshotPath = resolve(outputDirectory, `canonical-homepage-${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const viewportPassed = checks.every((item) => item.passed);
    report.viewports.push({
      ...viewport,
      passed: viewportPassed,
      checks,
      consoleErrors: requiredConsoleErrors,
      failedRequests: requiredFailedRequests,
      ignoredOptionalShopPay: {
        consoleErrors: ignoredConsoleErrors,
        failedRequests: ignoredFailedRequests,
      },
      screenshotPath,
    });
    if (!viewportPassed) {
      report.passed = false;
      report.failures.push(...checks.filter((item) => !item.passed).map((item) => `${viewport.name}: ${item.name} — ${format(item.details)}`));
    }
    await context.close();
  }
} finally {
  await browser.close();
}

report.completedAt = new Date().toISOString();
await writeFile(resolve(outputDirectory, "verification-report.json"), JSON.stringify(report, null, 2));
await writeFile(resolve(outputDirectory, "verification-summary.md"), markdown(report));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);

function isOptionalShopPayRequest(entry) {
  const match = String(entry || "").match(/^\S+\s+(https?:\/\/\S+)\s+—\s+(.+)$/);
  if (!match) return false;
  try {
    const url = new URL(match[1]);
    return url.hostname === "shop.app" && url.pathname.startsWith("/pay/hop") && /ERR_BLOCKED_BY_RESPONSE/i.test(match[2]);
  } catch {
    return false;
  }
}

function classifyConsoleErrors(errors, shopPayFailureCount) {
  const ignored = [];
  const required = [];
  let generic403Budget = shopPayFailureCount;
  for (const error of errors) {
    if (/Framing 'https:\/\/shop\.app\/' violates .*frame-ancestors/i.test(error)) {
      ignored.push(error);
      continue;
    }
    if (generic403Budget > 0 && /Failed to load resource: the server responded with a status of 403/i.test(error)) {
      ignored.push(error);
      generic403Budget -= 1;
      continue;
    }
    required.push(error);
  }
  return { ignored, required };
}

function check(name, passed, details) {
  return { name, passed: Boolean(passed), details: passed ? undefined : details };
}

function format(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function markdown(value) {
  const lines = [
    "# Canonical MMG Homepage Verification",
    "",
    `- Preview: ${value.previewURL}`,
    `- Result: ${value.passed ? "PASS" : "FAIL"}`,
    `- Completed: ${value.completedAt}`,
    "",
  ];
  for (const viewport of value.viewports) {
    lines.push(`## ${viewport.name} (${viewport.width} × ${viewport.height})`, "");
    for (const item of viewport.checks) lines.push(`- ${item.passed ? "PASS" : "FAIL"}: ${item.name}${item.passed ? "" : ` — ${format(item.details)}`}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
