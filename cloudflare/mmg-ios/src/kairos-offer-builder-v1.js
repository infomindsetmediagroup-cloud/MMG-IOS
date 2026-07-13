import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-offer-builder-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const TYPES = new Set(["digital-product", "service", "subscription", "bundle", "book", "course", "consulting", "custom"]);

export async function createOffer(request, payload = {}) {
  const title = clean(payload.title, 180);
  const customer = clean(payload.customer, 1600);
  const outcome = clean(payload.outcome, 2400);
  if (!title) throw new Error("Enter an offer name.");
  if (!customer) throw new Error("Define the intended customer.");
  if (!outcome) throw new Error("Define the customer outcome.");

  const type = TYPES.has(payload.type) ? payload.type : "custom";
  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Offer Builder · ${title}`,
    objective: `Build and validate the ${title} offer for ${customer}. Desired outcome: ${outcome}`,
    center: "business",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Offer Builder",
    source: "business/offer-builder",
    tasks: [
      { title: "Lock customer and problem", description: "Confirm the intended customer, current problem, urgency, and evidence." },
      { title: "Define promise and value", description: "Specify the outcome, value proposition, differentiation, and proof boundaries." },
      { title: "Design delivery model", description: "Define format, scope, fulfillment, timing, support, and internal production requirements." },
      { title: "Build pricing and economics", description: "Prepare pricing inputs, costs, margin assumptions, and approval requirements without unsupported guarantees." },
      { title: "Approve offer package", description: "Review the complete offer, claims, pricing, delivery readiness, and launch handoff." },
    ],
  });

  const offer = {
    id: `offer-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    type,
    status: "offer-brief-ready",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    customer,
    problem: clean(payload.problem, 2400),
    outcome,
    promise: clean(payload.promise, 2400),
    differentiation: clean(payload.differentiation, 2400),
    deliverables: clean(payload.deliverables, 4000),
    deliveryModel: clean(payload.deliveryModel, 2400),
    timeframe: clean(payload.timeframe, 300),
    support: clean(payload.support, 1800),
    price: clean(payload.price, 600),
    costInputs: clean(payload.costInputs, 1800),
    proof: clean(payload.proof, 2400),
    risks: clean(payload.risks, 2400),
    releaseBoundary: {
      pricingRequiresApproval: true,
      customerClaimsRequireApproval: true,
      externalPublicationAutomatic: false,
      automaticDiscounting: false,
      guaranteedOutcomeClaims: false,
    },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then lock the customer and problem." : "Open the workflow and lock the customer and problem.",
  };

  await caches.default.put(offerRequest(request, offer.id), stored(offer));
  await caches.default.put(latestRequest(request), stored(offer));
  return { offer, workflow };
}

export async function readOffer(request, offerID) {
  const response = await caches.default.match(offerRequest(request, offerID));
  if (!response) return null;
  try {
    const offer = await response.json();
    return { offer, workflow: await readWorkflow(request, offer.workflowID) };
  } catch { return null; }
}

export async function readLatestOffer(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try {
    const offer = await response.json();
    return { offer, workflow: await readWorkflow(request, offer.workflowID) };
  } catch { return null; }
}

function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function offerRequest(request, id) { return new Request(new URL(`/_kairos/offers/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/offers/latest", request.url).toString(), { method: "GET" }); }
