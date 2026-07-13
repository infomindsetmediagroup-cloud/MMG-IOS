import {
  decideLifecycleReview,
  executeApprovedLifecycleReview,
  prepareLifecycleReview,
} from "./kairos-link-lifecycle-review-v1.js";
import {
  completeApprovedWorkDispatch,
  readApprovedWorkDispatch,
} from "./kairos-approved-work-dispatcher-v1.js";

const BUILD = "kairos-approved-website-executor-20260713-1";

export async function runApprovedWebsiteExecution(request, env, payload) {
  const itemID = String(payload?.itemID || "").trim();
  const actor = String(payload?.actor || "Executive").trim().slice(0, 120) || "Executive";
  if (!itemID) throw new Error("Select an approved website item to execute.");

  const workOrder = await readApprovedWorkDispatch(request, itemID);
  if (!workOrder) throw new Error("Create the approved execution work order before running it.");
  if (workOrder.status === "completed") return { status: "completed", workOrder, alreadyCompleted: true };
  if (workOrder.domain !== "Website") throw new Error("This executor only accepts approved Website work.");
  if (workOrder.execution?.authority !== "executive-approved") throw new Error("The work order is not bound to executive approval.");

  const route = String(workOrder.execution?.route || "");
  if (route !== "/api/shopify/link-intelligence/review/execute") {
    return {
      status: "needs-preparation",
      build: BUILD,
      itemID,
      route,
      summary: "This approved website item needs a route-specific staging package before execution.",
      requiredPreparation: route === "/api/shopify/website-retool/exceptions/execute"
        ? ["schema-bound exception plan", "source hashes", "approved values", "rollback package"]
        : ["registered route adapter"],
      safeguards: { mutationPerformed: false, liveThemeChanged: false, approvalPreserved: true },
    };
  }

  const evidence = workOrder.execution?.sourceEvidence || {};
  const currentURL = String(evidence.currentURL || "").trim();
  const recommendedURL = String(evidence.recommendedURL || "").trim();
  if (!currentURL || !recommendedURL) throw new Error("The approved link correction is missing its current or recommended URL.");

  const review = await prepareLifecycleReview(request, env);
  const matches = review.items.filter(item => sameURL(item.currentURL, currentURL, env.MMG_STOREFRONT_ORIGIN)
    && sameURL(item.recommendedURL, recommendedURL, env.MMG_STOREFRONT_ORIGIN));
  if (!matches.length) throw new Error("The approved link correction no longer matches the current Kairos Staging review. Prepare a new executive briefing.");

  const decided = await decideLifecycleReview(request, {
    reviewID: review.reviewID,
    actor,
    decisions: matches.map(item => ({
      reviewItemID: item.reviewItemID,
      decision: "approved",
      notes: `Approved through executive briefing ${workOrder.briefingID}, item ${itemID}.`,
    })),
  });

  const execution = await executeApprovedLifecycleReview(request, env, { reviewID: decided.reviewID });
  const receiptEvidence = [
    { type: "lifecycle-review", reviewID: decided.reviewID, sourceHash: decided.sourceHash },
    { type: "shopify-read-back", receipts: execution.receipts, safeguards: execution.safeguards },
  ];
  const completed = await completeApprovedWorkDispatch(request, {
    itemID,
    result: {
      summary: execution.summary,
      destination: "Shopify Kairos Staging",
      outputIDs: [decided.reviewID],
      mutationPerformed: true,
      publicationPerformed: false,
    },
    verification: {
      status: "verified",
      verifiedBy: BUILD,
      readBackConfirmed: true,
      evidence: receiptEvidence,
      rollbackReceipt: {
        available: true,
        file: execution?.receipts?.length ? "templates/index.json" : null,
        beforeSourceHash: decided.sourceHash,
        liveThemeChanged: false,
      },
    },
  });

  return {
    status: "completed",
    build: BUILD,
    itemID,
    review: decided,
    execution,
    workOrder: completed.workOrder,
    receipt: completed.receipt,
    safeguards: {
      stagingOnly: true,
      liveThemeChanged: false,
      visualStructureLocked: true,
      approvalBindingVerified: true,
      readBackVerified: true,
    },
  };
}

function sameURL(a, b, origin) {
  try {
    const left = new URL(String(a || ""), origin);
    const right = new URL(String(b || ""), origin);
    return left.origin === right.origin
      && normalizePath(left.pathname) === normalizePath(right.pathname)
      && left.search === right.search;
  } catch { return false; }
}

function normalizePath(path) { return String(path || "/").replace(/\/+$/, "") || "/"; }
