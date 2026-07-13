import {
  hashText,
  inspectStagingSource,
  parseShopifyJson,
  semanticHash,
  writeThemeFile,
} from "./kairos-compact-homepage-utils-v1.js";
import { auditHomepageLinks } from "./kairos-link-lifecycle-engine-v1.js";

const BUILD = "kairos-link-lifecycle-repair-20260713-2";
const HOMEPAGE_FILE = "templates/index.json";
const MIN_AUTO_CONFIDENCE = 0.9;
const URL_KEY = /(url|link|href|destination|button_link|button_url|cta_link|cta_url)$/i;

export async function prepareHomepageLinkRepair(request, env) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "").trim();
  if (!origin) throw new Error("MMG storefront origin is not configured.");

  const audit = await auditHomepageLinks(origin);
  const inspection = await inspectStagingSource(null, request, env, BUILD, [HOMEPAGE_FILE]);
  const sourceFile = inspection?.evidence?.files?.find(file => file.filename === HOMEPAGE_FILE && file.readable);
  if (!sourceFile?.content) throw new Error("Kairos Staging homepage source is unavailable.");

  const document = parseShopifyJson(sourceFile.content, "Kairos Staging homepage link repair source");
  const fields = collectURLFields(document);
  const verifiedCandidates = audit.results.filter(item => item.internal && item.recommendedURL);
  const repairs = [];
  const reviews = [];

  for (const item of verifiedCandidates) {
    const matches = fields.filter(field => equivalentURL(field.value, item.url, origin));
    const entry = {
      sourcePage: "/",
      label: item.label,
      currentURL: item.url,
      finalURL: item.finalURL,
      status: item.status,
      statusCode: item.statusCode,
      lifecycleDecision: item.lifecycleDecision,
      expectedStage: item.expectedStage,
      recommendedURL: item.recommendedURL,
      confidence: item.confidence,
      rationale: item.rationale,
      matchingFields: matches,
    };
    if (item.lifecycleDecision === "replace" && item.confidence >= MIN_AUTO_CONFIDENCE && matches.length) repairs.push(entry);
    else if (item.lifecycleDecision !== "keep") reviews.push(entry);
  }

  return {
    status: "ready-for-approval",
    build: BUILD,
    preparedAt: new Date().toISOString(),
    auditSummary: audit.summary,
    sourceTheme: inspection.evidence.stagingTheme,
    publishedTheme: inspection.evidence.mainTheme,
    sourceHash: sourceFile.sha256,
    autoRepairs: repairs,
    executiveReviews: reviews,
    safeguards: {
      stagingOnly: true,
      visualStructureLocked: true,
      liveThemeMutation: false,
      minimumAutoConfidence: MIN_AUTO_CONFIDENCE,
      inventedRoutes: "forbidden",
    },
  };
}

export async function executeHomepageLinkRepair(request, env, payload) {
  const approval = payload?.approval || {};
  const plan = payload?.plan || {};
  if (approval.status !== "approved") throw new Error("Executive approval is required before applying link repairs.");
  if (!Array.isArray(plan.autoRepairs)) throw new Error("The approved link-repair plan is invalid.");

  const inspection = await inspectStagingSource(null, request, env, BUILD, [HOMEPAGE_FILE]);
  const sourceFile = inspection?.evidence?.files?.find(file => file.filename === HOMEPAGE_FILE && file.readable);
  if (!sourceFile?.content) throw new Error("Kairos Staging homepage source is unavailable.");
  if (plan.sourceHash !== sourceFile.sha256) throw new Error("The staging homepage changed after approval. Generate a new link-repair plan.");
  if (approval.targetThemeID !== inspection.evidence.stagingTheme?.gid) throw new Error("The approved staging theme no longer matches Kairos Staging.");

  const original = parseShopifyJson(sourceFile.content, "Kairos Staging homepage before link repair");
  const candidate = structuredClone(original);
  const receipts = [];

  for (const repair of plan.autoRepairs) {
    if (Number(repair.confidence) < MIN_AUTO_CONFIDENCE) continue;
    if (!repair.recommendedURL || !Array.isArray(repair.matchingFields)) continue;
    for (const field of repair.matchingFields) {
      const before = getAtPath(candidate, field.path);
      if (typeof before !== "string") continue;
      if (!equivalentURL(before, repair.currentURL, env.MMG_STOREFRONT_ORIGIN)) continue;
      setAtPath(candidate, field.path, normalizeStoredURL(repair.recommendedURL, env.MMG_STOREFRONT_ORIGIN));
      receipts.push({
        path: field.path,
        label: repair.label,
        before,
        after: getAtPath(candidate, field.path),
        confidence: repair.confidence,
        rationale: repair.rationale,
        expectedStage: repair.expectedStage,
      });
    }
  }

  if (!receipts.length) throw new Error("No approved high-confidence link repairs matched the current staging source.");
  assertVisualStructureUnchanged(original, candidate);

  const expectedSemanticHash = await semanticHash(candidate);
  const replacement = `${JSON.stringify(candidate, null, 2)}\n`;
  await writeThemeFile(env, inspection.evidence.stagingTheme.gid, HOMEPAGE_FILE, replacement);

  const readBackInspection = await inspectStagingSource(null, request, env, BUILD, [HOMEPAGE_FILE]);
  const readBackFile = readBackInspection?.evidence?.files?.find(file => file.filename === HOMEPAGE_FILE && file.readable);
  if (!readBackFile?.content) throw new Error("Shopify returned no homepage source after link repair.");
  const verified = parseShopifyJson(readBackFile.content, "Shopify read-back after link repair");
  const actualSemanticHash = await semanticHash(verified);
  if (actualSemanticHash !== expectedSemanticHash) throw new Error("Shopify read-back did not match the approved link-repair result.");

  const verification = [];
  for (const receipt of receipts) {
    const absolute = new URL(receipt.after, String(env.MMG_STOREFRONT_ORIGIN || "")).toString();
    const response = await fetch(absolute, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    verification.push({ ...receipt, absoluteURL: absolute, statusCode: response.status, verified: response.ok && response.status !== 404 && response.status !== 410 });
  }
  if (verification.some(item => !item.verified)) throw new Error("One or more repaired links failed post-write verification.");

  return {
    status: "completed",
    build: BUILD,
    completedAt: new Date().toISOString(),
    summary: `${verification.length} high-confidence homepage link repair${verification.length === 1 ? "" : "s"} applied and verified on Kairos Staging.`,
    execution: {
      targetTheme: inspection.evidence.stagingTheme,
      publishedTheme: inspection.evidence.mainTheme,
      publishedThemeChanged: false,
      productionPublishAuthorized: false,
      file: HOMEPAGE_FILE,
      beforeSha256: sourceFile.sha256,
      afterSha256: await hashText(readBackFile.content),
    },
    receipts: verification,
    unresolved: Array.isArray(plan.executiveReviews) ? plan.executiveReviews : [],
    safeguards: { stagingOnly: true, liveThemeChanged: false, visualStructureLocked: true },
  };
}

function collectURLFields(document) {
  const fields = [];
  walk(document, [], fields);
  return fields;
}

function walk(value, path, fields) {
  if (Array.isArray(value)) return value.forEach((item, index) => walk(item, [...path, index], fields));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (typeof child === "string" && URL_KEY.test(key) && looksLikeURL(child)) fields.push({ path: next, key, value: child });
    else walk(child, next, fields);
  }
}

function looksLikeURL(value) {
  return /^\s*(\/|https?:\/\/)/i.test(String(value || ""));
}

function equivalentURL(a, b, origin) {
  try {
    const left = new URL(String(a || ""), origin);
    const right = new URL(String(b || ""), origin);
    return left.origin === right.origin && normalizePath(left.pathname) === normalizePath(right.pathname) && left.search === right.search;
  } catch { return false; }
}

function normalizeStoredURL(url, origin) {
  const parsed = new URL(url, origin);
  const base = new URL(origin);
  return parsed.origin === base.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
}

function normalizePath(path) {
  return String(path || "/").replace(/\/+$/, "") || "/";
}

function getAtPath(root, path) {
  return path.reduce((value, key) => value?.[key], root);
}

function setAtPath(root, path, value) {
  let cursor = root;
  for (let i = 0; i < path.length - 1; i += 1) cursor = cursor[path[i]];
  cursor[path[path.length - 1]] = value;
}

function assertVisualStructureUnchanged(before, after) {
  const signature = doc => JSON.stringify({
    order: doc?.order || [],
    sections: Object.fromEntries(Object.entries(doc?.sections || {}).map(([id, section]) => [id, {
      type: section?.type,
      disabled: section?.disabled,
      blockOrder: section?.block_order || [],
      blocks: Object.fromEntries(Object.entries(section?.blocks || {}).map(([blockId, block]) => [blockId, { type: block?.type, disabled: block?.disabled }]))
    }]))
  });
  if (signature(before) !== signature(after)) throw new Error("Visual structure changed during link repair. Execution was blocked.");
}
