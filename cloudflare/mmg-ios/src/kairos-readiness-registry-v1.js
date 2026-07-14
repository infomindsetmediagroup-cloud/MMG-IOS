import { readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-readiness-registry-20260714-1";
const CACHE_SECONDS = 60 * 60 * 24 * 365;
const DEFAULTS = {
  knowledge: { "knowledge-library":60, "research-brief":60, "decision-record":60, "doctrine-vault":50, "intelligence-synthesis":60 },
  content: { website:90, "manuscript-studio":80, "social-production":70, "publishing-studio":60, "creative-studio":60 },
  business: { "product-launch":50, "revenue-intelligence":45, "growth-plan":40, "offer-builder":40, "campaign-operations":35 },
  customers: { "visitor-activity":40, "customer-portal":35, deliverables:35, "customer-journey":30, "support-intelligence":30 },
  operations: { health:100, "work-queue":100, "release-control":100, "executive-briefing":100, "system-registry":100 },
};

export async function handleReadinessRegistry(request) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/readiness-registry") return null;
  try {
    if (request.method === "GET") return json(await readRegistry(request));
    if (request.method === "PATCH") return json(await applyPromotion(request, await request.json()));
    return json({ error: { message: "Method not allowed." } }, 405);
  } catch (error) {
    return json({ error: { message: error.message || "Readiness registry operation failed." } }, 400);
  }
}

async function applyPromotion(request, payload = {}) {
  const center = clean(payload.center, 40).toLowerCase();
  const capability = clean(payload.capability, 120);
  const actor = clean(payload.actor, 120);
  const evidence = clean(payload.evidence, 4000);
  const authorizationWorkflowID = clean(payload.authorizationWorkflowID, 180);
  const targetScore = Math.round(Number(payload.targetScore));
  if (!DEFAULTS[center] || !(capability in DEFAULTS[center])) throw new Error("Unknown readiness capability.");
  if (!actor) throw new Error("Promotion actor is required.");
  if (evidence.length < 10) throw new Error("Promotion evidence is required.");
  if (!authorizationWorkflowID) throw new Error("Authorization workflow is required.");
  if (!Number.isFinite(targetScore) || targetScore < 0 || targetScore > 100) throw new Error("Target score must be between 0 and 100.");

  const authorization = await readWorkflow(request, authorizationWorkflowID);
  if (!authorization) throw new Error("Authorization workflow was not found.");
  if (authorization.state !== "completed") throw new Error("Authorization workflow must be completed before readiness can change.");
  if (authorization.approvalRequired && authorization.approvalStatus !== "approved") throw new Error("Authorization workflow must be approved.");
  if (authorization.source !== "command-center-readiness-promotion") throw new Error("Workflow is not a readiness promotion authorization.");

  const registry = await readRegistry(request);
  const currentScore = Number(registry.scores[center][capability] ?? DEFAULTS[center][capability]);
  if (targetScore < currentScore) throw new Error("Readiness promotion cannot lower the current score.");
  if (targetScore === currentScore) throw new Error("Target score must exceed the current score.");

  const now = new Date().toISOString();
  const entry = {
    id: `readiness-change-${crypto.randomUUID()}`,
    center,
    capability,
    priorScore: currentScore,
    targetScore,
    actor,
    evidence,
    authorizationWorkflowID,
    appliedAt: now,
    build: BUILD,
  };
  registry.scores[center][capability] = targetScore;
  registry.history.unshift(entry);
  registry.history = registry.history.slice(0, 250);
  registry.updatedAt = now;
  registry.build = BUILD;
  await caches.default.put(registryRequest(request), stored(registry));
  return { status: "applied", registry, change: entry, governance: { authorizationRequired: true, completedWorkflowRequired: true, evidenceRequired: true, scoreDecreasesForbidden: true, silentMutationForbidden: true } };
}

async function readRegistry(request) {
  const response = await caches.default.match(registryRequest(request));
  if (response) {
    try {
      const value = await response.json();
      if (value?.scores) return value;
    } catch {}
  }
  return { build: BUILD, scores: structuredClone(DEFAULTS), history: [], updatedAt: null, governance: { authorizationRequired: true, evidenceRequired: true, noAutomaticPromotion: true } };
}

function registryRequest(request) { return new Request(new URL("/_kairos/readiness-registry", request.url).toString(), { method: "GET" }); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
