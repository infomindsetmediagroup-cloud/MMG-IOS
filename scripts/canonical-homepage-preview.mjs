import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const KAIROS_ORIGIN = String(process.env.KAIROS_PRODUCTION_URL || "https://mmg-ios.info-mindsetmediagroup.workers.dev").replace(/\/$/, "");
const STORE_DOMAIN = String(process.env.SHOPIFY_STORE_DOMAIN || "07kd8e-qw.myshopify.com").trim();
const ARTIFACT_ROOT = resolve("artifacts/canonical-homepage");
const SNAPSHOT_ROOT = resolve("shopify/canonical-homepage-preview");
const CLIENT_BUILD = "canonical-homepage-playwright-20260717-1";
const MAX_CONTINUATION_BATCHES = 4;
const MAX_REPAIR_PASSES = 2;

const CRITICAL_COPY = Object.freeze([
  "Your Knowledge Has Value",
  "Choose What You Want to Build",
  "Kairos Turns Objectives Into Guided Execution",
  "We’re Not Gatekeepers. We’re Door Openers.",
  "Start With What You Know",
]);

const state = {
  startedAt: new Date().toISOString(),
  baselineRefreshVerified: false,
  batches: [],
  snapshots: new Map(),
  previewURL: "",
  finalExecution: null,
  attempts: [],
  websiteIntelligence: null,
};

class KairosHTTPError extends Error {
  constructor(message, status, code, body) {
    super(message);
    this.name = "KairosHTTPError";
    this.status = status;
    this.code = code || "kairos_request_failed";
    this.body = body;
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[™®]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function safeThemePath(filename) {
  const value = String(filename || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!value || value.includes("..") || !/^[a-zA-Z0-9._/-]+$/.test(value)) {
    throw new Error(`Unsafe Shopify filename: ${filename}`);
  }
  return value;
}

async function requestJSON(pathOrURL, init = {}) {
  const url = pathOrURL.startsWith("http") ? pathOrURL : `${KAIROS_ORIGIN}${pathOrURL}`;
  const response = await fetch(url, {
    redirect: "follow",
    ...init,
    headers: {
      Accept: "application/json",
      "X-MMG-Client-Build": CLIENT_BUILD,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { summary: text }; }
  if (!response.ok && response.status !== 202) {
    throw new KairosHTTPError(
      body?.error?.message || body?.summary || `${url} returned HTTP ${response.status}`,
      response.status,
      body?.error?.code,
      body,
    );
  }
  return { response, body };
}

async function submitJob(path, payload, label) {
  const submitted = await requestJSON(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const headers = Object.fromEntries(submitted.response.headers.entries());
  if (submitted.body?.result && submitted.body?.status === "completed") {
    return { result: submitted.body.result, headers, envelope: submitted.body };
  }

  const pollURL = submitted.body?.pollURL || (submitted.body?.jobID ? `${path}/${submitted.body.jobID}` : "");
  if (!pollURL) {
    throw new KairosHTTPError(`${label} returned no job identifier.`, submitted.response.status, "job_identifier_missing", submitted.body);
  }

  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
    const polled = await requestJSON(pollURL);
    if (polled.body?.status === "completed" && polled.body?.result) {
      return { result: polled.body.result, headers, envelope: polled.body };
    }
    if (["failed", "cancelled", "needs-attention", "blocked"].includes(polled.body?.status)) {
      throw new KairosHTTPError(
        polled.body?.error?.message || polled.body?.summary || `${label} failed.`,
        polled.response.status,
        polled.body?.error?.code,
        polled.body,
      );
    }
  }
  throw new KairosHTTPError(`${label} exceeded the monitoring window.`, 504, "job_poll_timeout", {});
}

function recordPlanSnapshots(planEnvelope) {
  const files = planEnvelope?.plan?.textOnlyPackage?.files || [];
  for (const file of files) {
    const filename = safeThemePath(file.filename);
    const existing = state.snapshots.get(filename);
    state.snapshots.set(filename, {
      filename,
      beforeSource: existing?.beforeSource ?? String(file.beforeSource || ""),
      afterSource: String(file.candidateSource || existing?.afterSource || ""),
      beforeSha256: existing?.beforeSha256 ?? String(file.beforeSha256 || ""),
      afterSha256: String(file.afterSha256 || existing?.afterSha256 || ""),
      operations: [
        ...(existing?.operations || []),
        ...((Array.isArray(file.operations) ? file.operations : []).map(operation => ({
          id: operation.id || operation.operationID || "",
          zone: operation.zone || "",
          kind: operation.kind || "",
          before: operation.before || operation.currentValue || "",
          after: operation.after || operation.replacement || operation.nextValue || "",
        }))),
      ],
    });
  }
}

function executionPreviewURL(execution) {
  const direct = execution?.preview?.url || execution?.execution?.preview?.url;
  if (direct) return String(direct);
  const gid = String(execution?.execution?.targetTheme?.gid || execution?.rollback?.targetThemeID || "");
  const id = gid.match(/(\d+)$/)?.[1] || "";
  return id ? `https://${STORE_DOMAIN}/?preview_theme_id=${encodeURIComponent(id)}` : "";
}

async function approveAndExecute(planResult, phase) {
  recordPlanSnapshots(planResult);
  const changes = Array.isArray(planResult?.plan?.changes)
    ? planResult.plan.changes.filter(change => change?.changeType !== "no-change")
    : [];
  if (!changes.length || planResult?.plan?.executable === false) {
    return null;
  }

  const approval = {
    status: "approved",
    approvedAt: new Date().toISOString(),
    build: CLIENT_BUILD,
    planID: planResult.planID,
    actionID: planResult.actionID,
    targetThemeID: planResult?.plan?.targetTheme?.gid || "",
    sourceHashes: planResult?.plan?.sourceHashes || {},
    objective: planResult.objective || phase,
  };

  const executed = await submitJob("/api/shopify/staging/execute/jobs", { plan: planResult, approval }, `${phase} execution`);
  const previewURL = executionPreviewURL(executed.result);
  if (!previewURL) throw new Error(`${phase} completed without a Shopify preview URL.`);
  state.previewURL = previewURL;
  state.finalExecution = executed.result;
  state.batches.push({
    phase,
    planID: planResult.planID,
    planBuild: planResult.build,
    executionBuild: executed.result?.build,
    targetTheme: executed.result?.execution?.targetTheme,
    operationCount: planResult?.plan?.textOnlyPackage?.operations?.length || 0,
    filesWritten: executed.result?.execution?.filesWritten || [],
    verification: executed.result?.verification || [],
    previewURL,
  });
  return executed.result;
}

async function initializeFreshStaging() {
  const objective = [
    "Initialize the canonical MMG homepage staging workspace from the current live MAIN Shopify theme.",
    "Preserve the complete approved visual design, section and block structure, Liquid, HTML, CSS, JavaScript, assets, links, typography, spacing, animation, and responsive behavior.",
    "Prepare the first safe source-bound homepage text batch on Kairos Staging only. Do not publish the live theme.",
  ].join(" ");

  const planned = await submitJob("/api/shopify/staging/plan/jobs", {
    objective,
    requestType: "homepage",
    clientBuild: CLIENT_BUILD,
  }, "Fresh staging initialization");

  state.baselineRefreshVerified = planned.headers["x-kairos-baseline-restored"] === "verified";
  await approveAndExecute(planned.result, "Fresh staging initialization");
}

async function continueCanonicalHomepage(label) {
  const objective = [
    "Continue curating the entire homepage from the current approved staging state.",
    "Complete every remaining homepage journey zone using the canonical MMG ecosystem narrative.",
    "Preserve all links, products, collections, structure, Liquid, HTML, CSS, JavaScript, assets, visual styling, animation, and responsive behavior.",
    "Use staging only and return exact source-hash-bound verification and rollback evidence.",
  ].join(" ");

  try {
    const planned = await submitJob("/api/shopify/staging/plan/jobs", {
      objective,
      requestType: "homepage",
      clientBuild: CLIENT_BUILD,
    }, label);
    await approveAndExecute(planned.result, label);
    return { changed: true, plan: planned.result };
  } catch (error) {
    if (error instanceof KairosHTTPError && ["whole_homepage_no_remaining_changes", "homepage_no_remaining_changes"].includes(error.code)) {
      return { changed: false, exhausted: true };
    }
    throw error;
  }
}

function ignoredBrowserError(message) {
  const text = String(message || "").toLowerCase();
  return [
    "favicon.ico",
    "shopifycloud",
    "preview bar",
    "third-party cookie",
    "content security policy",
    "failed to load resource: net::err_blocked_by_client",
  ].some(fragment => text.includes(fragment));
}

async function inspectViewport(browser, name, viewport, previewURL) {
  const context = await browser.newContext({
    viewport,
    locale: "en-US",
    colorScheme: "light",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !ignoredBrowserError(message.text())) consoleErrors.push(message.text());
  });
  page.on("pageerror", error => {
    if (!ignoredBrowserError(error.message)) pageErrors.push(error.message);
  });

  const response = await page.goto(previewURL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => null);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));

  const status = response?.status() || 0;
  const title = await page.title();
  const bodyText = await page.locator("body").innerText();
  const bodyNormalized = normalizeText(bodyText);
  const visibleH1 = await page.locator("h1:visible").count();
  const sections = await page.locator("main .shopify-section:visible, main section:visible, .shopify-section:visible").count();
  const duplicateIDs = await page.evaluate(() => {
    const counts = new Map();
    for (const element of document.querySelectorAll("[id]")) {
      if (!element.id) continue;
      counts.set(element.id, (counts.get(element.id) || 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })).slice(0, 20);
  });
  const images = await page.evaluate(() => [...document.images].map(image => ({
    src: image.currentSrc || image.src,
    alt: image.alt,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    visible: Boolean(image.offsetWidth || image.offsetHeight || image.getClientRects().length),
  })));
  const brokenImages = images.filter(image => image.visible && (!image.complete || image.naturalWidth < 1));
  const anchors = await page.evaluate(() => [...document.querySelectorAll("a")].map(anchor => ({
    text: (anchor.textContent || "").trim(),
    href: anchor.getAttribute("href") || "",
    absolute: anchor.href || "",
    visible: Boolean(anchor.offsetWidth || anchor.offsetHeight || anchor.getClientRects().length),
  })));
  const invalidAnchors = anchors.filter(anchor => anchor.visible && (!anchor.href.trim() || anchor.href.trim() === "#" || /^javascript:/i.test(anchor.href))).slice(0, 20);

  const interaction = { menu: "not-found", search: "not-found", cart: "not-found" };
  const menuToggle = page.locator('summary.header__icon--menu, button[aria-controls*="menu" i], .header__icon--menu, [data-menu-toggle]').first();
  if (await menuToggle.count()) {
    try {
      await menuToggle.click({ timeout: 8_000 });
      await page.waitForTimeout(250);
      const expanded = await menuToggle.getAttribute("aria-expanded");
      interaction.menu = expanded === "true" || await page.locator('details[open], [role="dialog"]:visible, .menu-drawer:visible').count() > 0 ? "passed" : "opened-without-detectable-state";
      await page.keyboard.press("Escape").catch(() => null);
    } catch (error) {
      interaction.menu = `failed: ${error.message}`;
    }
  }

  const searchControl = page.locator('a[href*="/search"], summary[aria-label*="search" i], button[aria-label*="search" i]').first();
  if (await searchControl.count()) {
    const href = await searchControl.getAttribute("href");
    interaction.search = href || "interactive-control-present";
  }
  const cartControl = page.locator('a[href*="/cart"]').first();
  if (await cartControl.count()) interaction.cart = await cartControl.getAttribute("href") || "present";

  const internalCandidates = [...new Set(anchors
    .filter(anchor => anchor.visible && anchor.absolute)
    .map(anchor => anchor.absolute)
    .filter(value => {
      try {
        const url = new URL(value);
        return url.hostname === STORE_DOMAIN && !/\/account\/logout|\/cart\/change|\/cart\/add/.test(url.pathname);
      } catch { return false; }
    }))].slice(0, 24);
  const brokenLinks = [];
  for (const url of internalCandidates) {
    try {
      const linkResponse = await context.request.get(url, { timeout: 20_000, maxRedirects: 5 });
      if (linkResponse.status() >= 400) brokenLinks.push({ url, status: linkResponse.status() });
    } catch (error) {
      brokenLinks.push({ url, status: 0, error: error.message });
    }
  }

  const missingCopy = CRITICAL_COPY.filter(copy => !bodyNormalized.includes(normalizeText(copy)));
  const failures = [];
  if (status < 200 || status >= 400) failures.push(`Preview returned HTTP ${status}.`);
  if (!title.trim()) failures.push("Document title is empty.");
  if (visibleH1 !== 1) failures.push(`Expected exactly one visible H1; found ${visibleH1}.`);
  if (sections < 5) failures.push(`Expected at least five visible Shopify sections; found ${sections}.`);
  if (missingCopy.length) failures.push(`Missing canonical copy: ${missingCopy.join(" | ")}`);
  if (brokenImages.length) failures.push(`${brokenImages.length} visible image(s) failed to load.`);
  if (invalidAnchors.length) failures.push(`${invalidAnchors.length} visible anchor(s) have empty, hash-only, or JavaScript destinations.`);
  if (brokenLinks.length) failures.push(`${brokenLinks.length} sampled internal link(s) returned an error.`);
  if (pageErrors.length) failures.push(`${pageErrors.length} uncaught page error(s) occurred.`);
  if (consoleErrors.length) failures.push(`${consoleErrors.length} browser console error(s) occurred.`);
  if (interaction.menu.startsWith("failed")) failures.push(`Header menu interaction ${interaction.menu}.`);
  if (interaction.search === "not-found") failures.push("No header search control was found.");
  if (interaction.cart === "not-found") failures.push("No cart link was found.");

  await mkdir(ARTIFACT_ROOT, { recursive: true });
  await page.screenshot({ path: join(ARTIFACT_ROOT, `${name}.png`), fullPage: true });
  await context.close();

  return {
    name,
    viewport,
    status,
    finalURL: page.url(),
    title,
    visibleH1,
    sections,
    missingCopy,
    duplicateIDs,
    brokenImages: brokenImages.slice(0, 20),
    invalidAnchors,
    brokenLinks,
    consoleErrors,
    pageErrors,
    interaction,
    failures,
  };
}

async function verifyPreview(previewURL) {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await inspectViewport(browser, "desktop", { width: 1440, height: 1100 }, previewURL);
    const mobile = await inspectViewport(browser, "mobile", { width: 390, height: 844 }, previewURL);
    const failures = [...new Set([...desktop.failures, ...mobile.failures])];
    return {
      passed: failures.length === 0,
      verifiedAt: new Date().toISOString(),
      previewURL,
      failures,
      viewports: [desktop, mobile],
    };
  } finally {
    await browser.close();
  }
}

async function runWebsiteIntelligence() {
  try {
    const response = await requestJSON("/api/shopify/website-intelligence/run", { method: "POST", body: JSON.stringify({ source: CLIENT_BUILD }) });
    state.websiteIntelligence = response.body?.report || response.body;
  } catch (error) {
    state.websiteIntelligence = { status: "unavailable", message: error.message, code: error.code || "" };
  }
}

async function writeSnapshots() {
  await rm(SNAPSHOT_ROOT, { recursive: true, force: true });
  for (const snapshot of state.snapshots.values()) {
    const baselinePath = join(SNAPSHOT_ROOT, "baseline", safeThemePath(snapshot.filename));
    const candidatePath = join(SNAPSHOT_ROOT, "candidate", safeThemePath(snapshot.filename));
    await mkdir(dirname(baselinePath), { recursive: true });
    await mkdir(dirname(candidatePath), { recursive: true });
    await writeFile(baselinePath, snapshot.beforeSource, "utf8");
    await writeFile(candidatePath, snapshot.afterSource, "utf8");
  }
}

async function writeReceipt(finalVerification, status) {
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  await writeSnapshots();
  const receipt = {
    status,
    build: CLIENT_BUILD,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    sourceOfTruth: "infomindsetmediagroup-cloud/MMG-IOS@main + current Shopify MAIN theme",
    kairosOrigin: KAIROS_ORIGIN,
    storeDomain: STORE_DOMAIN,
    baselineRefreshVerified: state.baselineRefreshVerified,
    clonedThemeVerified: state.batches.some(batch => batch.targetTheme?.name === "Kairos Staging"),
    previewURL: state.previewURL,
    batches: state.batches,
    changedFiles: [...state.snapshots.values()].map(snapshot => ({
      filename: snapshot.filename,
      beforeSha256: snapshot.beforeSha256,
      afterSha256: snapshot.afterSha256,
      operationCount: snapshot.operations.length,
    })),
    execution: state.finalExecution,
    playwright: finalVerification,
    attempts: state.attempts,
    websiteIntelligence: state.websiteIntelligence,
  };
  await writeFile(join(ARTIFACT_ROOT, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  const lines = [
    "# Canonical MMG Homepage Preview",
    "",
    `- **Status:** ${status}`,
    `- **Preview:** ${state.previewURL || "Unavailable"}`,
    `- **Fresh Shopify theme clone verified:** ${receipt.clonedThemeVerified ? "Yes" : "No"}`,
    `- **Baseline refresh response verified:** ${state.baselineRefreshVerified ? "Yes" : "No"}`,
    `- **Changed Shopify source files:** ${receipt.changedFiles.length}`,
    `- **Execution batches:** ${state.batches.length}`,
    `- **Playwright result:** ${finalVerification?.passed ? "Passed" : "Failed"}`,
    "",
    "## Playwright coverage",
    "",
    "Desktop and mobile rendering, HTTP response, title, visible H1 count, section count, canonical copy, image loading, internal link sampling, invalid anchors, duplicate IDs, browser errors, header menu, search, and cart controls.",
    "",
    "## Failures",
    "",
    ...(finalVerification?.failures?.length ? finalVerification.failures.map(failure => `- ${failure}`) : ["- None"]),
    "",
  ];
  await writeFile(join(ARTIFACT_ROOT, "report.md"), lines.join("\n"), "utf8");
}

async function main() {
  await rm(ARTIFACT_ROOT, { recursive: true, force: true });
  await mkdir(ARTIFACT_ROOT, { recursive: true });

  await initializeFreshStaging();

  for (let index = 1; index <= MAX_CONTINUATION_BATCHES; index += 1) {
    const result = await continueCanonicalHomepage(`Canonical homepage continuation ${index}`);
    if (!result.changed) break;
    if (result.plan?.plan?.journeyCoverage?.complete) break;
  }

  if (!state.previewURL) throw new Error("Kairos did not return a real Shopify staging preview URL.");

  let verification = await verifyPreview(state.previewURL);
  state.attempts.push(verification);

  for (let repairPass = 1; !verification.passed && repairPass <= MAX_REPAIR_PASSES; repairPass += 1) {
    const continuation = await continueCanonicalHomepage(`Autonomous preview repair ${repairPass}`);
    if (!continuation.changed) break;
    verification = await verifyPreview(state.previewURL);
    state.attempts.push(verification);
  }

  await runWebsiteIntelligence();
  await writeReceipt(verification, verification.passed ? "verified" : "failed-verification");

  console.log(JSON.stringify({
    status: verification.passed ? "verified" : "failed-verification",
    previewURL: state.previewURL,
    baselineRefreshVerified: state.baselineRefreshVerified,
    filesChanged: state.snapshots.size,
    batches: state.batches.length,
    failures: verification.failures,
  }, null, 2));

  if (!verification.passed) {
    throw new Error(`Canonical homepage preview failed verification: ${verification.failures.join(" | ")}`);
  }
}

main().catch(async error => {
  const fallback = state.attempts.at(-1) || { passed: false, failures: [error.message], viewports: [] };
  await writeReceipt(fallback, "failed").catch(() => null);
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
