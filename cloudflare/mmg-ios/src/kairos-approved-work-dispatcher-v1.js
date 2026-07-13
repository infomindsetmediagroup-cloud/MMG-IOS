import { readLatestExecutiveBriefing } from "./kairos-executive-briefing-v1.js";

const BUILD = "kairos-approved-work-dispatcher-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 14;

export async function dispatchApprovedBriefingItem(request, payload) {
  const briefing = await readLatestExecutiveBriefing(request);
  if (!briefing) throw new Error("No executive briefing is available.");

  const itemID = String(payload?.itemID || "").trim();
  const actor = String(payload?.actor || "Executive").trim().slice(0, 120) || "Executive";
  if (!itemID) throw new Error("Select an approved item to execute.");

  const item = briefing.items.find(candidate => candidate.id === itemID);
  if (!item) throw new Error("The approved item is not part of the current briefing.");
  if (item.state !== "approved" || item.decision?.status !== "approved") {
    throw new Error("Only an approved briefing item can enter execution.");
  }
  if (!item.execution?.route) throw new Error("The approved item does not have a registered execution route.");

  const existing = await readDispatch(request, itemID);
  if (existing) return existing;

  const queuedAt = new Date().toISOString();
  const workOrder = {
    id: `dispatch-${crypto.randomUUID()}`,
    build: BUILD,
    status: "ready-to-execute",
    briefingID: briefing.id,
    itemID: item.id,
    title: item.title,
    domain: item.domain,
    category: item.category,
    approvedBy: item.decision.actor || actor,
    approvedAt: item.decision.decidedAt,
    queuedBy: actor,
    queuedAt,
    execution: {
      connector: item.execution.connector || "internal",
      route: item.execution.route,
      authority: "executive-approved",
      automaticPublication: false,
      requiresBoundPayload: true,
      sourceEvidence: item.evidence || {},
    },
    verification: {
      required: true,
      readBackRequired: true,
      receiptRequired: true,
      rollbackRequiredWhenMutationOccurs: true,
      knowledgeCaptureRequired: true,
    },
    nextAction: "Build the route-specific execution payload, execute within approved authority, verify the result, and file the receipt.",
    safeguards: {
      livePublicationAutomatic: false,
      socialPublishingAutomatic: false,
      destructiveActionAutomatic: false,
      approvalBindingVerified: true,
    },
  };

  await persistDispatch(request, workOrder);
  return workOrder;
}

export async function readApprovedWorkDispatch(request, itemID) {
  return readDispatch(request, String(itemID || "").trim());
}

async function persistDispatch(request, workOrder) {
  const response = new Response(JSON.stringify(workOrder), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
  await caches.default.put(dispatchRequest(request, workOrder.itemID), response.clone());
  await caches.default.put(latestDispatchRequest(request), response);
}

async function readDispatch(request, itemID) {
  if (!itemID) return null;
  const response = await caches.default.match(dispatchRequest(request, itemID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

function dispatchRequest(request, itemID) {
  return new Request(new URL(`/_kairos/approved-work/${encodeURIComponent(itemID)}`, request.url).toString(), { method: "GET" });
}

function latestDispatchRequest(request) {
  return new Request(new URL("/_kairos/approved-work/latest", request.url).toString(), { method: "GET" });
}
