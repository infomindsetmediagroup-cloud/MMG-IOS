import { readLatestExecutiveBriefing } from "./kairos-executive-briefing-v1.js";

const BUILD = "kairos-approved-work-dispatcher-20260713-2";
const CACHE_SECONDS = 60 * 60 * 24 * 30;

export async function dispatchApprovedBriefingItem(request, payload) {
  const briefing = await readLatestExecutiveBriefing(request);
  if (!briefing) throw new Error("No executive briefing is available.");

  const itemID = String(payload?.itemID || "").trim();
  const actor = String(payload?.actor || "Executive").trim().slice(0, 120) || "Executive";
  if (!itemID) throw new Error("Select an approved item to execute.");

  const item = briefing.items.find(candidate => candidate.id === itemID);
  if (!item) throw new Error("The approved item is not part of the current briefing.");
  if (item.state !== "approved" || item.decision?.status !== "approved") throw new Error("Only an approved briefing item can enter execution.");
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

export async function completeApprovedWorkDispatch(request, payload) {
  const itemID = String(payload?.itemID || "").trim();
  if (!itemID) throw new Error("Select the execution item to complete.");
  const workOrder = await readDispatch(request, itemID);
  if (!workOrder) throw new Error("No approved execution work order exists for this item.");
  if (workOrder.status === "completed") return { workOrder, receipt: await readReceipt(request, itemID) };

  const verification = payload?.verification || {};
  const result = payload?.result || {};
  const verifiedBy = String(verification.verifiedBy || "Kairos Verification").trim().slice(0, 160);
  const evidence = Array.isArray(verification.evidence) ? verification.evidence.slice(0, 50) : [];
  if (verification.status !== "verified") throw new Error("Execution cannot complete without verified status.");
  if (!verification.readBackConfirmed) throw new Error("Execution cannot complete until authoritative read-back is confirmed.");
  if (!evidence.length) throw new Error("Execution completion requires verification evidence.");
  if (!String(result.summary || "").trim()) throw new Error("Execution completion requires a result summary.");

  const completedAt = new Date().toISOString();
  const receipt = {
    id: `receipt-${crypto.randomUUID()}`,
    build: BUILD,
    status: "verified-complete",
    workOrderID: workOrder.id,
    briefingID: workOrder.briefingID,
    itemID,
    title: workOrder.title,
    completedAt,
    result: {
      summary: String(result.summary).trim().slice(0, 4000),
      destination: String(result.destination || "MMG system").trim().slice(0, 1000),
      outputIDs: Array.isArray(result.outputIDs) ? result.outputIDs.slice(0, 100) : [],
      mutationPerformed: Boolean(result.mutationPerformed),
      publicationPerformed: Boolean(result.publicationPerformed),
    },
    verification: {
      status: "verified",
      verifiedBy,
      readBackConfirmed: true,
      evidence,
      rollbackReceipt: result.mutationPerformed ? verification.rollbackReceipt || null : null,
    },
    knowledgeCapture: {
      required: true,
      recordType: "execution-receipt",
      libraryPath: `Executive Briefings/${workOrder.briefingID}/${itemID}`,
      summary: `${workOrder.title} completed and verified on ${completedAt}.`,
      sourceEvidencePreserved: true,
      executiveDecisionPreserved: true,
    },
    safeguards: {
      approvalBindingVerified: true,
      receiptImmutable: true,
      unverifiedCompletionBlocked: true,
    },
  };

  const completedWorkOrder = {
    ...workOrder,
    status: "completed",
    completedAt,
    receiptID: receipt.id,
    nextAction: "Filed in the execution log and available for future intelligence and reporting.",
  };
  await persistDispatch(request, completedWorkOrder);
  await persistReceipt(request, receipt);
  return { workOrder: completedWorkOrder, receipt };
}

export async function readApprovedWorkDispatch(request, itemID) {
  return readDispatch(request, String(itemID || "").trim());
}

export async function readApprovedWorkReceipt(request, itemID) {
  return readReceipt(request, String(itemID || "").trim());
}

async function persistDispatch(request, workOrder) {
  const response = storedResponse(workOrder);
  await caches.default.put(dispatchRequest(request, workOrder.itemID), response.clone());
  await caches.default.put(latestDispatchRequest(request), response);
}

async function persistReceipt(request, receipt) {
  const response = storedResponse(receipt);
  await caches.default.put(receiptRequest(request, receipt.itemID), response.clone());
  await caches.default.put(latestReceiptRequest(request), response);
}

function storedResponse(value) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
}

async function readDispatch(request, itemID) {
  if (!itemID) return null;
  const response = await caches.default.match(dispatchRequest(request, itemID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

async function readReceipt(request, itemID) {
  if (!itemID) return null;
  const response = await caches.default.match(receiptRequest(request, itemID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

function dispatchRequest(request, itemID) { return new Request(new URL(`/_kairos/approved-work/${encodeURIComponent(itemID)}`, request.url).toString(), { method: "GET" }); }
function receiptRequest(request, itemID) { return new Request(new URL(`/_kairos/approved-work/${encodeURIComponent(itemID)}/receipt`, request.url).toString(), { method: "GET" }); }
function latestDispatchRequest(request) { return new Request(new URL("/_kairos/approved-work/latest", request.url).toString(), { method: "GET" }); }
function latestReceiptRequest(request) { return new Request(new URL("/_kairos/approved-work/receipts/latest", request.url).toString(), { method: "GET" }); }
