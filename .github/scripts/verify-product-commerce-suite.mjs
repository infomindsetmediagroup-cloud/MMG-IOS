import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const origin = String(process.env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, "");
const output = process.env.MMG_VERIFICATION_OUTPUT || "artifacts/product-commerce-suite/browser";
const products = [
  { kind: "digital", handle: process.env.MMG_DIGITAL_PRODUCT_HANDLE || "ai-image-mastery" },
  { kind: "service", handle: process.env.MMG_SERVICE_PRODUCT_HANDLE || "professional-cover-design-service" },
];
const viewports = [{ name: "desktop", width: 1440, height: 1100 }, { name: "mobile", width: 390, height: 844 }];
await mkdir(output, { recursive: true });
const report = { origin, startedAt: new Date().toISOString(), passed: true, pages: [], failures: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const product of products) for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", message => { if (message.type() === "error" && !/Shop Pay|judgeme|jdgm/i.test(message.text())) consoleErrors.push(message.text()); });
    page.on("requestfailed", request => { const failure = request.failure()?.errorText || "request failed"; if (!/ERR_ABORTED|NS_BINDING_ABORTED|judgeme|jdgm/i.test(`${request.url()} ${failure}`)) failedRequests.push(`${request.method()} ${request.url()} — ${failure}`); });
    const url = `${origin}/products/${product.handle}?commerce_suite_proof=${Date.now()}`;
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
    const checks = [];
    checks.push(check("HTTP response", Boolean(response?.ok()), response ? `${response.status()} ${response.statusText()}` : "no response"));
    checks.push(check("Asset viewer rendered", await page.locator("[data-mmg-product-asset-viewer], [data-mmg-asset-viewer]").count() === 1, "asset viewer missing"));
    checks.push(check("Trust layer rendered", await page.locator("[data-mmg-trust]").count() === 1, "trust layer missing"));
    checks.push(check("Related products rendered", await page.locator("[data-mmg-related-products]").count() === 1, "related products missing"));
    checks.push(check("Cart continuity rendered", await page.locator("[data-mmg-cart-continuity]").count() === 1, "cart continuity missing"));
    checks.push(check("Policy disclosure rendered", await page.getByText("Service and delivery standards", { exact: false }).count() >= 1, "policy disclosure missing"));
    checks.push(check("Review integrity statement rendered", await page.getByText("never fabricated", { exact: false }).count() >= 1, "review integrity statement missing"));
    const currentLinks = await page.locator("[data-mmg-related-products] a[href]").evaluateAll((links, handle) => links.filter(link => (link.getAttribute("href") || "").includes(`/products/${handle}`)).length, product.handle).catch(() => 0);
    checks.push(check("Current product excluded", currentLinks === 0, `${currentLinks} current-product recommendation(s)`));
    const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    checks.push(check("No horizontal overflow", Math.max(overflow.document, overflow.body) <= overflow.viewport + 2, overflow));
    const unnamed = await page.locator("[data-mmg-trust], [data-mmg-product-asset-viewer], [data-mmg-asset-viewer], [data-mmg-related-products]").evaluateAll(roots => roots.flatMap(root => [...root.querySelectorAll("button,a,input,select,summary")].filter(el => !(el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim()).map(el => el.outerHTML.slice(0, 180))));
    checks.push(check("Controls have accessible names", unnamed.length === 0, unnamed));
    checks.push(check("No required console errors", consoleErrors.length === 0, consoleErrors));
    checks.push(check("No required request failures", failedRequests.length === 0, failedRequests));
    const screenshot = join(output, `${product.kind}-${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const passed = checks.every(item => item.passed);
    report.pages.push({ ...product, viewport, url, passed, checks, screenshot });
    if (!passed) { report.passed = false; report.failures.push(...checks.filter(item => !item.passed).map(item => `${product.kind}/${viewport.name}: ${item.name} — ${format(item.details)}`)); }
    await context.close();
  }
} finally { await browser.close(); }
report.completedAt = new Date().toISOString();
await writeFile(join(output, "verification-report.json"), JSON.stringify(report, null, 2));
await writeFile(join(output, "verification-report.md"), markdown(report));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);

function check(name, passed, details) { return { name, passed: Boolean(passed), details }; }
function format(value) { return typeof value === "string" ? value : JSON.stringify(value); }
function markdown(value) { const lines = ["# MMG Product Commerce Suite Verification", "", `- Origin: ${value.origin}`, `- Result: ${value.passed ? "PASS" : "FAIL"}`, `- Completed: ${value.completedAt}`, ""]; for (const page of value.pages) { lines.push(`## ${page.kind} · ${page.viewport.name}`, "", `- URL: ${page.url}`); for (const item of page.checks) lines.push(`- ${item.passed ? "PASS" : "FAIL"}: ${item.name}${item.passed ? "" : ` — ${format(item.details)}`}`); lines.push(""); } return `${lines.join("\n")}\n`; }
