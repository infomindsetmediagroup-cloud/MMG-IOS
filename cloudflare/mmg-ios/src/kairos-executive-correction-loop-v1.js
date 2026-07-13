import { readLatestExecutiveBriefing } from "./kairos-executive-briefing-v1.js";

const BUILD = "kairos-executive-correction-loop-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 14;

export async function prepareExecutiveCorrection(request, payload) {
  const briefing = await readLatestExecutiveBriefing(request);
  if (!briefing) throw new Error("No executive briefing is available.");

  const itemID = clean(payload?.itemID, 240);
  if (!itemID) throw new Error("Select an item that was returned for correction.");
  const item = briefing.items.find(candidate => candidate.id === itemID);
  if (!item) throw new Error("The correction item is not part of the current briefing.");
  if (item.state !== "needs-fix" || item.decision?.status !== "needs-fix") {
    throw new Error("Only an item marked Fix can enter the correction loop.");
  }
  if (!clean(item.decision?.note, 4000)) throw new Error("The Fix decision must include correction instructions.");

  const existing = await readCorrection(request, itemID);
  if (existing && existing.status !== "resubmitted") return existing;

  const preparedAt = new Date().toISOString();
  const correction = {
    id: `correction-${crypto.randomUUID()}`,
    build: BUILD,
    status: "ready-for-revision",
    briefingID: briefing.id,
    itemID,
    preparedAt,
    domain: item.domain,
    category: item.category,
    title: item.title,
    executiveInstruction: item.decision.note,
    original: {
      summary: item.summary,
      recommendation: item.recommendation,
      evidence: item.evidence || {},
      confidence: item.confidence,
    },
    revisionContract: {
      preserveObjective: true,
      addressExecutiveInstruction: true,
      retainSourceEvidence: true,
      inventedEvidenceForbidden: true,
      connectorClaimsForbiddenWithoutProof: true,
      publicationClaimsForbiddenWithoutReceipt: true,
      approvalRequiredAgain: true,
    },
    requiredSubmission: ["summary", "recommendation", "revisionNotes", "evidence"],
    nextAction: "Revise the deliverable, verify the correction against source evidence, and resubmit it for executive approval.",
  };

  await persistCorrection(request, correction);
  return correction;
}

export async function resubmitExecutiveCorrection(request, payload) {
  const briefing = await readLatestExecutiveBriefing(request);
  if (!briefing) throw new Error("No executive briefing is available.");
  const itemID = clean(payload?.itemID, 240);
  const correction = await readCorrection(request, itemID);
  if (!correction) throw new Error("Prepare the correction package before resubmitting the item.");
  if (correction.status === "resubmitted") return { briefing, correction };

  const index = briefing.items.findIndex(item => item.id === itemID);
  if (index < 0) throw new Error("The correction item is not part of the current briefing.");
  const current = briefing.items[index];
  if (current.state !== "needs-fix") throw new Error("This item is no longer awaiting correction.");

  const revision = payload?.revision || {};
  const summary = clean(revision.summary, 4000);
  const recommendation = clean(revision.recommendation, 4000);
  const revisionNotes = clean(revision.revisionNotes, 4000);
  const evidence = revision.evidence && typeof revision.evidence === "object" ? revision.evidence : null;
  if (!summary || !recommendation || !revisionNotes || !evidence) {
    throw new Error("A corrected summary, recommendation, revision note, and evidence package are required.");
  }

  const resubmittedAt = new Date().toISOString();
  const revisionNumber = Number(current.revision?.number || 0) + 1;
  briefing.items[index] = {
    ...current,
    summary,
    recommendation,
    evidence,
    state: "pending",
    decision: { status: "pending" },
    revision: {
      number: revisionNumber,
      resubmittedAt,
      instructionAddressed: correction.executiveInstruction,
      revisionNotes,
      previousDecision: current.decision,
      originalSummary: correction.original.summary,
      originalRecommendation: correction.original.recommendation,
    },
    nextAction: "Review the corrected deliverable and approve, deny, or return it for another correction.",
  };

  briefing.counts = countStates(briefing.items);
  briefing.groups = groupItems(briefing.items);
  briefing.updatedAt = resubmittedAt;
  briefing.status = "ready";
  briefing.summary = `${briefing.counts.ready} item${briefing.counts.ready === 1 ? " is" : "s are"} ready for your decision.`;

  correction.status = "resubmitted";
  correction.resubmittedAt = resubmittedAt;
  correction.revisionNumber = revisionNumber;
  correction.revisionNotes = revisionNotes;
  await persistCorrection(request, correction);
  await persistBriefing(request, briefing);
  return { briefing, correction };
}

export async function readExecutiveCorrection(request, itemID) {
  return readCorrection(request, clean(itemID, 240));
}

function clean(value, limit) { return String(value || "").trim().slice(0, limit); }
function countStates(items) {
  return items.reduce((counts, item) => {
    if (item.state === "approved") counts.approved += 1;
    else if (item.state === "denied") counts.denied += 1;
    else if (item.state === "needs-fix") counts.needsFix += 1;
    else if (item.state === "completed") counts.completed += 1;
    else counts.ready += 1;
    return counts;
  }, { ready: 0, approved: 0, denied: 0, needsFix: 0, completed: 0 });
}
function groupItems(items) {
  const groups = new Map();
  for (const item of items) { const key = item.domain || "Business"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item.id); }
  return [...groups.entries()].map(([name, itemIDs]) => ({ name, itemIDs, count: itemIDs.length }));
}
async function persistBriefing(request, briefing) {
  const response = storedResponse(briefing);
  await caches.default.put(new Request(new URL("/_kairos/executive-briefings/latest", request.url).toString(), { method: "GET" }), response.clone());
  await caches.default.put(new Request(new URL(`/_kairos/executive-briefings/${encodeURIComponent(briefing.id)}`, request.url).toString(), { method: "GET" }), response);
}
async function persistCorrection(request, correction) { await caches.default.put(correctionRequest(request, correction.itemID), storedResponse(correction)); }
async function readCorrection(request, itemID) {
  if (!itemID) return null;
  const response = await caches.default.match(correctionRequest(request, itemID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}
function storedResponse(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function correctionRequest(request, itemID) { return new Request(new URL(`/_kairos/executive-corrections/${encodeURIComponent(itemID)}`, request.url).toString(), { method: "GET" }); }
