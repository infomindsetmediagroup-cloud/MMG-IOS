import { readLatestWebsiteIntelligenceReport } from "./kairos-website-intelligence-supervisor-v1.js";

const BUILD = "kairos-executive-briefing-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 7;
const ALLOWED_DECISIONS = new Set(["approve", "deny", "fix"]);

export async function buildExecutiveBriefing(request, env, trigger = "manual") {
  const website = await readLatestWebsiteIntelligenceReport(request);
  const generatedAt = new Date().toISOString();
  const window = briefingWindow(generatedAt);
  const items = normalizeWebsiteItems(website?.readyForApproval || []);

  const briefing = {
    id: `briefing-${window}-${generatedAt.replace(/\D/g, "").slice(0, 14)}`,
    status: "ready",
    build: BUILD,
    trigger,
    window,
    generatedAt,
    title: window === "morning" ? "Morning Approval Brief" : "Evening Approval Brief",
    summary: items.length
      ? `${items.length} item${items.length === 1 ? " is" : "s are"} ready for your decision.`
      : "No items currently require approval.",
    counts: {
      ready: items.length,
      approved: 0,
      denied: 0,
      needsFix: 0,
      completed: 0,
    },
    groups: groupItems(items),
    items,
    actions: ["approve", "deny", "fix", "view-evidence"],
    operatingCycle: {
      approval: "Approved items become eligible for their governed execution path.",
      denial: "Denied items close with a recorded executive decision.",
      fix: "Items returned for correction retain the executive note and re-enter preparation.",
      completion: "Executed work must be verified, logged, and filed in the appropriate MMG record system.",
    },
    safeguards: {
      livePublicationAutomatic: false,
      externalSocialPublishingAvailable: false,
      decisionsAreAuditable: true,
      executionRequiresBoundAuthority: true,
    },
  };

  await persistBriefing(request, briefing);
  return briefing;
}

export async function readLatestExecutiveBriefing(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { return await response.json(); }
  catch { return null; }
}

export async function decideExecutiveBriefingItem(request, payload) {
  const briefing = await readLatestExecutiveBriefing(request);
  if (!briefing) throw new Error("No executive briefing is available.");

  const itemID = String(payload?.itemID || "").trim();
  const decision = String(payload?.decision || "").trim().toLowerCase();
  const note = String(payload?.note || "").trim().slice(0, 4000);
  const actor = String(payload?.actor || "Executive").trim().slice(0, 120) || "Executive";

  if (!itemID) throw new Error("Select an approval item.");
  if (!ALLOWED_DECISIONS.has(decision)) throw new Error("Decision must be approve, deny, or fix.");

  const index = briefing.items.findIndex(item => item.id === itemID);
  if (index < 0) throw new Error("The approval item is not part of the current briefing.");

  const current = briefing.items[index];
  if (current.decision?.status && current.decision.status !== "pending") {
    throw new Error("This item already has an executive decision.");
  }

  const decidedAt = new Date().toISOString();
  const status = decision === "approve" ? "approved" : decision === "deny" ? "denied" : "needs-fix";
  briefing.items[index] = {
    ...current,
    state: status,
    decision: {
      status,
      decision,
      actor,
      note,
      decidedAt,
    },
    nextAction: decision === "approve"
      ? "Route to governed execution and verify the result."
      : decision === "fix"
        ? "Return to the responsible engine with the executive correction note."
        : "Close the item and preserve the decision record.",
  };

  briefing.groups = groupItems(briefing.items);
  briefing.counts = countStates(briefing.items);
  briefing.updatedAt = decidedAt;
  briefing.status = briefing.counts.ready ? "ready" : "decided";
  briefing.summary = briefing.counts.ready
    ? `${briefing.counts.ready} item${briefing.counts.ready === 1 ? " remains" : "s remain"} for your decision.`
    : "Every item in this briefing has an executive decision.";

  await persistBriefing(request, briefing);
  await persistDecision(request, briefing.id, briefing.items[index]);
  return briefing;
}

function normalizeWebsiteItems(items) {
  return items.map((item, index) => ({
    id: String(item.id || `website-${index + 1}`),
    domain: "Website",
    category: String(item.businessArea || "Website Update"),
    title: String(item.title || "Website update ready"),
    summary: String(item.summary || "Kairos prepared a website recommendation."),
    recommendation: String(item.recommendation || "Review the prepared website change."),
    confidence: typeof item.confidence === "number" ? item.confidence : null,
    state: "pending",
    decision: { status: "pending" },
    controls: ["approve", "deny", "fix", "view-evidence"],
    evidence: item.evidence || {},
    execution: {
      connector: "shopify",
      readiness: "approval-required",
      automaticAfterApproval: false,
      route: inferWebsiteRoute(item),
    },
  }));
}

function inferWebsiteRoute(item) {
  const evidence = item?.evidence || {};
  if (evidence.currentURL || evidence.recommendedURL) return "/api/shopify/link-intelligence/review/execute";
  return "/api/shopify/website-retool/exceptions/execute";
}

function groupItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.domain || "Business";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.id);
  }
  return [...groups.entries()].map(([name, itemIDs]) => ({ name, itemIDs, count: itemIDs.length }));
}

function countStates(items) {
  return items.reduce((counts, item) => {
    if (item.state === "approved") counts.approved += 1;
    else if (item.state === "denied") counts.denied += 1;
    else if (item.state === "needs-fix") counts.needsFix += 1;
    else counts.ready += 1;
    if (item.state === "completed") counts.completed += 1;
    return counts;
  }, { ready: 0, approved: 0, denied: 0, needsFix: 0, completed: 0 });
}

function briefingWindow(iso) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso)));
  return hour < 15 ? "morning" : "evening";
}

async function persistBriefing(request, briefing) {
  const response = new Response(JSON.stringify(briefing), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
  await caches.default.put(latestRequest(request), response.clone());
  await caches.default.put(briefingRequest(request, briefing.id), response);
}

async function persistDecision(request, briefingID, item) {
  const key = new Request(new URL(`/_kairos/executive-briefings/${encodeURIComponent(briefingID)}/decisions/${encodeURIComponent(item.id)}`, request.url).toString(), { method: "GET" });
  await caches.default.put(key, new Response(JSON.stringify({
    briefingID,
    itemID: item.id,
    decision: item.decision,
    nextAction: item.nextAction,
    evidence: item.evidence,
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  }));
}

function latestRequest(request) {
  return new Request(new URL("/_kairos/executive-briefings/latest", request.url).toString(), { method: "GET" });
}

function briefingRequest(request, briefingID) {
  return new Request(new URL(`/_kairos/executive-briefings/${encodeURIComponent(briefingID)}`, request.url).toString(), { method: "GET" });
}
