export const KAIROS_HOMEPAGE_CONTINUATION_BUILD = "kairos-homepage-continuation-20260717-1";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const PLAN_CACHE_TTL_SECONDS = 60 * 60;

const CONTINUATION_COPY = Object.freeze([
  ["Hero heading", "Your Knowledge Has Value."],
  ["Hero supporting text", "Turn what you know, what you have lived, and what you are building into books, digital products, brands, and lasting intellectual property."],
  ["Primary hero button label", "Explore the Ecosystem"],
  ["Secondary hero button label", "Meet Kairos"],
  ["Pathway heading", "Choose What You Want to Build"],
  ["Pathway supporting text", "Publish your knowledge, build your brand, grow as a creator, learn practical AI, develop digital products, access professional services, or join a personalized subscription through the path that fits your objective."],
  ["Products and services heading", "Tools, Services, and Resources Built for Progress"],
  ["Products and services supporting text", "Explore practical digital products, publishing and editorial services, creator and business support, personalized subscriptions, and educational resources connected to your next objective."],
  ["Kairos heading", "Kairos Turns Objectives Into Guided Execution"],
  ["Kairos supporting text", "Kairos is the intelligence operating system inside Mindset Media Group. It organizes context, identifies the next action, coordinates the work, and moves ideas toward verified results."],
  ["Mission heading", "We’re Not Gatekeepers. We’re Door Openers."],
  ["Mission supporting text", "Mindset Media Group makes professional knowledge, publishing, technology, and opportunity more accessible without unnecessary complexity or barriers."],
  ["Final heading", "Start With What You Know"],
  ["Final supporting text", "Choose a path, explore the available products and services, join a personalized subscription, or let Kairos guide your next step."],
  ["Final primary button label", "Explore Mindset Media Group"],
  ["Final secondary button label", "Start With Kairos"],
]);

export function isHomepageContinuationPayload(payload) {
  const requestType = normalize(payload?.requestType || payload?.pageType || "homepage");
  if (requestType && !["homepage", "home", "home page", "index"].includes(requestType)) return false;
  const objective = normalize(payload?.objective);
  if (!objective) return false;
  return [
    /continue.*homepage/,
    /continue.*curat/,
    /remaining.*homepage/,
    /next.*homepage.*batch/,
    /whole.*homepage/,
    /entire.*homepage/,
    /every.*homepage.*section/,
    /journey zones.*remaining/,
    /current approved state/,
  ].some(pattern => pattern.test(objective));
}

export async function buildDeterministicHomepageContinuationRequest(request, payload = null) {
  const sourcePayload = payload || await safeRequestJSON(request.clone());
  if (!isHomepageContinuationPayload(sourcePayload)) {
    return { request, active: false, originalObjective: String(sourcePayload?.objective || ""), canonicalFieldCount: 0 };
  }

  const originalObjective = String(sourcePayload?.objective || "").trim();
  const objective = [
    "DETERMINISTIC HOMEPAGE CONTINUATION — TEXT ONLY",
    "",
    ...CONTINUATION_COPY.map(([label, value]) => `${label}: ${value}`),
    "",
    "Use the current managed Kairos Staging theme as the source. Preserve every prior approved text replacement already present in staging.",
    "Do not duplicate MAIN for this continuation batch.",
    "Do not change URLs, link destinations, products, collections, sections, blocks, Liquid, HTML, CSS, JavaScript, assets, colors, typography, spacing, layout, animation, or responsive behavior.",
    "Skip any field already equal to the canonical value and prepare only the remaining source-bound text replacements.",
  ].join("\n");

  const nextPayload = {
    ...sourcePayload,
    requestType: "homepage",
    objective,
    userObjective: originalObjective,
    continuationObjective: originalObjective,
    homepageContinuation: true,
    preserveManagedStaging: true,
    duplicateMainBeforePlanning: false,
    planningMode: "deterministic-homepage-continuation",
  };

  return {
    request: rebuildJSONRequest(request, nextPayload),
    active: true,
    originalObjective,
    canonicalFieldCount: CONTINUATION_COPY.length,
    mode: "deterministic-homepage-continuation",
  };
}

export async function applyHomepageContinuationMetadata(request, response, continuation) {
  if (!continuation?.active || !response) return response;
  const body = await safeResponseJSON(response.clone());
  if (!body?.result?.plan || !body?.jobID) return response;

  const result = structuredClone(body.result);
  result.objective = continuation.originalObjective || result.objective;
  result.summary = `Kairos prepared the next source-bound homepage continuation batch from the current managed staging theme without private inference or MAIN duplication.`;
  result.plan.summary = result.summary;
  result.plan.strategy = "Continue from the current verified Kairos Staging theme, preserve every prior approved text replacement, and apply only the next safe source-bound homepage text changes.";
  result.plan.continuationMode = true;
  result.plan.preserveManagedStaging = true;
  result.plan.duplicateMainBeforePlanning = false;
  result.plan.priorApprovedTextPreserved = true;
  result.plan.privateRuntimeRequired = false;
  result.evidence = {
    ...(result.evidence || {}),
    continuationBuild: KAIROS_HOMEPAGE_CONTINUATION_BUILD,
    continuationMode: true,
    currentManagedStagingReused: true,
    freshMainDuplicateRequired: false,
    priorApprovedTextPreserved: true,
    deterministicContinuation: true,
    privateRuntimeUsed: false,
    workersAIUsed: false,
    neuronsConsumed: 0,
    canonicalFieldCount: continuation.canonicalFieldCount,
  };

  body.result = result;
  body.summary = result.summary;
  const now = new Date().toISOString();
  const envelope = {
    jobID: body.jobID,
    status: "completed",
    build: result.build || body.build || KAIROS_HOMEPAGE_CONTINUATION_BUILD,
    submittedAt: now,
    updatedAt: now,
    completedAt: now,
    summary: result.summary,
    result,
  };
  await caches.default.put(planJobRequest(request, body.jobID), new Response(JSON.stringify(envelope), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${PLAN_CACHE_TTL_SECONDS}`,
    },
  }));

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Homepage-Continuation", KAIROS_HOMEPAGE_CONTINUATION_BUILD);
  headers.set("X-Kairos-Managed-Staging-Reused", "true");
  headers.set("X-Kairos-Main-Duplicated", "false");
  headers.set("X-Kairos-Private-Runtime-Used", "false");
  headers.set("X-Kairos-Neurons-Consumed", "0");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

export function continuationStatus() {
  return {
    build: KAIROS_HOMEPAGE_CONTINUATION_BUILD,
    mode: "deterministic-homepage-continuation",
    preservesManagedStaging: true,
    duplicatesMainBeforeContinuation: false,
    privateRuntimeRequired: false,
    workersAIUsed: false,
    neuronsConsumed: 0,
    canonicalFieldCount: CONTINUATION_COPY.length,
  };
}

function planJobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/autonomous-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function rebuildJSONRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(payload),
    redirect: request.redirect,
  });
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/[_–—-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
