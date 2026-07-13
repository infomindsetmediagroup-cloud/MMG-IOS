import {
  hashText,
  inspectStagingSource,
  parseShopifyJson,
  semanticHash,
  writeThemeFile,
} from "./kairos-compact-homepage-utils-v1.js";
import { prepareHomepageLinkRepair } from "./kairos-link-lifecycle-repair-v2.js";

const BUILD = "kairos-link-lifecycle-review-20260713-1";
const HOMEPAGE_FILE = "templates/index.json";
const REVIEW_TTL_SECONDS = 86400;

export async function prepareLifecycleReview(request, env) {
  const plan = await prepareHomepageLinkRepair(request, env);
  const items = Array.isArray(plan.executiveReviews) ? plan.executiveReviews : [];
  const reviewID = crypto.randomUUID();
  const review = {
    reviewID,
    status: items.length ? "awaiting-executive-decision" : "no-review-required",
    build: BUILD,
    createdAt: new Date().toISOString(),
    sourceHash: plan.sourceHash,
    targetTheme: plan.sourceTheme,
    publishedTheme: plan.publishedTheme,
    items: items.map((item, index) => ({
      reviewItemID: `${reviewID}:${index}`,
      decision: "pending",
      ...item,
    })),
    safeguards: {
      stagingOnly: true,
      liveThemeMutation: false,
      visualStructureLocked: true,
      inventedRoutes: "forbidden",
    },
  };
  await storeReview(request, review);
  return review;
}

export async function decideLifecycleReview(request, payload) {
  const reviewID = String(payload?.reviewID || "").trim();
  if (!reviewID) throw new Error("A reviewID is required.");
  const review = await loadReview(request, reviewID);
  if (!review) throw new Error("The lifecycle review could not be found or has expired.");

  const decisions = Array.isArray(payload?.decisions) ? payload.decisions : [];
  const byID = new Map(decisions.map(item => [String(item?.reviewItemID || ""), item]));
  review.items = review.items.map(item => {
    const incoming = byID.get(item.reviewItemID);
    if (!incoming) return item;
    const decision = String(incoming.decision || "").toLowerCase();
    if (!["approved", "rejected", "deferred"].includes(decision)) throw new Error(`Invalid decision for ${item.reviewItemID}.`);
    return {
      ...item,
      decision,
      decisionNotes: String(incoming.notes || "").slice(0, 1000),
      decidedAt: new Date().toISOString(),
      decidedBy: String(payload?.actor || "Executive").slice(0, 120),
    };
  });
  review.status = review.items.some(item => item.decision === "pending") ? "partially-decided" : "decision-complete";
  review.updatedAt = new Date().toISOString();
  await storeReview(request, review);
  return review;
}

export async function executeApprovedLifecycleReview(request, env, payload) {
  const reviewID = String(payload?.reviewID || "").trim();
  if (!reviewID) throw new Error("A reviewID is required.");
  const review = await loadReview(request, reviewID);
  if (!review) throw new Error("The lifecycle review could not be found or has expired.");
  const approved = review.items.filter(item => item.decision === "approved");
  if (!approved.length) throw new Error("No lifecycle corrections were approved for execution.");

  const inspection = await inspectStagingSource(null, request, env, BUILD, [HOMEPAGE_FILE]);
  const sourceFile = inspection?.evidence?.files?.find(file => file.filename === HOMEPAGE_FILE && file.readable);
  if (!sourceFile?.content) throw new Error("Kairos Staging homepage source is unavailable.");
  if (review.sourceHash !== sourceFile.sha256) throw new Error("The staging homepage changed after review preparation. Prepare a new review.");
  if (review.targetTheme?.gid !== inspection.evidence.stagingTheme?.gid) throw new Error("The reviewed staging theme no longer matches Kairos Staging.");

  const original = parseShopifyJson(sourceFile.content, "Kairos Staging homepage before approved lifecycle corrections");
  const candidate = structuredClone(original);
  const receipts = [];

  for (const item of approved) {
    if (!item.recommendedURL || !Array.isArray(item.matchingFields)) continue;
    const verifiedDestination = await verifyDestination(item.recommendedURL);
    if (!verifiedDestination.verified) throw new Error(`Approved destination failed verification: ${item.recommendedURL}`);
    for (const field of item.matchingFields) {
      const before = getAtPath(candidate, field.path);
      if (typeof before !== "string") continue;
      if (!equivalentURL(before, item.currentURL, env.MMG_STOREFRONT_ORIGIN)) continue;
      const after = normalizeStoredURL(item.recommendedURL, env.MMG_STOREFRONT_ORIGIN);
      setAtPath(candidate, field.path, after);
      receipts.push({
        reviewItemID: item.reviewItemID,
        path: field.path,
        label: item.label,
        before,
        after,
        confidence: item.confidence,
        rationale: item.rationale,
        expectedStage: item.expectedStage,
        decisionNotes: item.decisionNotes || "",
        destinationVerification: verifiedDestination,
      });
    }
  }

  if (!receipts.length) throw new Error("No approved lifecycle corrections matched the current staging source.");
  assertVisualStructureUnchanged(original, candidate);
  const expectedSemanticHash = await semanticHash(candidate);
  await writeThemeFile(env, inspection.evidence.stagingTheme.gid, HOMEPAGE_FILE, `${JSON.stringify(candidate, null, 2)}\n`);

  const readBackInspection = await inspectStagingSource(null, request, env, BUILD, [HOMEPAGE_FILE]);
  const readBackFile = readBackInspection?.evidence?.files?.find(file => file.filename === HOMEPAGE_FILE && file.readable);
  if (!readBackFile?.content) throw new Error("Shopify returned no homepage source after lifecycle correction.");
  const verified = parseShopifyJson(readBackFile.content, "Shopify read-back after lifecycle correction");
  if (await semanticHash(verified) !== expectedSemanticHash) throw new Error("Shopify read-back did not match the approved lifecycle result.");

  review.status = "executed";
  review.executedAt = new Date().toISOString();
  review.execution = {
    targetTheme: inspection.evidence.stagingTheme,
    publishedTheme: inspection.evidence.mainTheme,
    publishedThemeChanged: false,
    file: HOMEPAGE_FILE,
    beforeSha256: sourceFile.sha256,
    afterSha256: await hashText(readBackFile.content),
    receipts,
  };
  await storeReview(request, review);

  return {
    status: "completed",
    build: BUILD,
    completedAt: review.executedAt,
    summary: `${receipts.length} executive-approved lifecycle correction${receipts.length === 1 ? "" : "s"} applied and verified on Kairos Staging.`,
    reviewID,
    receipts,
    unresolved: review.items.filter(item => item.decision !== "approved"),
    safeguards: { stagingOnly: true, liveThemeChanged: false, visualStructureLocked: true },
  };
}

async function verifyDestination(url) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    return { verified: response.ok && response.status !== 404 && response.status !== 410, statusCode: response.status, finalURL: response.url || url };
  } catch (error) {
    return { verified: false, statusCode: 0, finalURL: url, error: error instanceof Error ? error.message : "Request failed" };
  }
}

function reviewRequest(request, reviewID) {
  return new Request(new URL(`/_kairos/link-lifecycle-reviews/${reviewID}`, request.url).toString(), { method: "GET" });
}

async function storeReview(request, review) {
  await caches.default.put(reviewRequest(request, review.reviewID), new Response(JSON.stringify(review), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${REVIEW_TTL_SECONDS}` },
  }));
}

async function loadReview(request, reviewID) {
  const response = await caches.default.match(reviewRequest(request, reviewID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
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

function normalizePath(path) { return String(path || "/").replace(/\/+$/, "") || "/"; }
function getAtPath(root, path) { return path.reduce((value, key) => value?.[key], root); }
function setAtPath(root, path, value) { let cursor = root; for (let i = 0; i < path.length - 1; i += 1) cursor = cursor[path[i]]; cursor[path[path.length - 1]] = value; }

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
  if (signature(before) !== signature(after)) throw new Error("Visual structure changed during lifecycle review execution. Execution was blocked.");
}
