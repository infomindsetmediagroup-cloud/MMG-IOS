import runtime from "./kairos-canonical-shopify-planner-v3.js";

const BUILD = "kairos-standalone-command-20260712-5";

const ACTIONS = {
  "knowledge-library": { title: "Knowledge Library", operation: "search", input: "Search terms" },
  "research-brief": { title: "Research Brief", operation: "build", input: "Research question" },
  "decision-record": { title: "Decision Record", operation: "record", input: "Decision" },
  "publishing-studio": { title: "Publishing Project", operation: "create", input: "Publication title" },
  "creative-studio": { title: "Creative Project", operation: "create", input: "Asset or campaign name" },
  "product-launch": { title: "Product Launch", operation: "build", input: "Product or offer" },
  "revenue-intelligence": { title: "Revenue Review", operation: "review", input: "Review period or objective" },
  "growth-plan": { title: "Growth Plan", operation: "build", input: "Growth objective" },
  "visitor-activity": { title: "Visitor Activity", operation: "inspect", input: "" },
  "customer-portal": { title: "Customer Portal", operation: "open", input: "Customer or project" },
  "deliverables": { title: "Deliverables", operation: "inspect", input: "Project or customer" },
  "work-queue": { title: "Work Queue", operation: "inspect", input: "" },
  "release-control": { title: "Release Control", operation: "inspect", input: "Release or project" },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/hub/run" && request.method === "POST") return runAction(request, env);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const response = await runtime.fetch(request, env, ctx);
      const body = await readJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-command-v4";
      body.externalModelAPIUsed = false;
      body.capabilities = {
        ...(body.capabilities || {}),
        childCardActionContracts: "operational",
        deterministicChildDeliverables: "operational",
        deterministicGrowthPlanning: "operational",
      };
      return json(body, response.status);
    }
    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-command-v4");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

async function runAction(request, env) {
  try {
    const payload = await request.json();
    const action = String(payload?.action || "").trim().toLowerCase();
    const objective = String(payload?.objective || "").trim();
    const definition = ACTIONS[action];
    if (!definition) return json({ status: "unavailable", build: BUILD, error: { code: "unknown_child_action", message: "This child-card action is not registered." } }, 404);
    if (definition.input && objective.length < 2) return json({ status: "needs-input", build: BUILD, error: { code: "action_input_required", message: `Enter ${definition.input.toLowerCase()} before running this action.` } }, 400);
    return json(buildDeliverable(action, objective, env));
  } catch (error) {
    return json({ status: "failed", build: BUILD, error: { code: "child_action_failed", message: error instanceof Error ? error.message : "The child-card action failed." } }, 500);
  }
}

function buildDeliverable(action, objective, env) {
  const base = {
    status: "completed",
    build: BUILD,
    kernel: "standalone-command-v4",
    externalModelAPIUsed: false,
    action,
    operation: ACTIONS[action].operation,
    workItemID: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: objective || ACTIONS[action].title,
    destination: ACTIONS[action].title,
    evidence: { source: "deterministic-child-deliverable-v1", externalActionTaken: false },
  };

  const builders = {
    "growth-plan": () => complete(base, "The deterministic MMG growth plan is complete and ready for execution review.", [
      section("Executive summary", "MMG will pursue the stated objective through a focused 90-day operating cycle connecting audience growth, ecosystem discovery, offer clarity, conversion, and retention while preserving knowledge stewardship and execution-first governance."),
      section("90-day objective", objective),
      section("Priority audiences", "Creators seeking practical growth systems; authors and experts converting knowledge into products; entrepreneurs needing coordinated brand, content, AI, and publishing support; existing MMG visitors who have not entered a guided pathway."),
      section("Core initiatives", "1. Guided website pathways. 2. One primary lead-capture offer. 3. Consistent creator-education distribution. 4. Productized publishing, creator, AI, and business journeys. 5. Weekly verified conversion and retention review."),
      section("Milestones", "Days 1–14: establish baselines and priorities. Days 15–30: launch lead capture and content cadence. Days 31–60: optimize pathways and conversion. Days 61–90: scale verified winners and stop low-performing work."),
      section("Metrics", "Track verified sessions, leads, opt-ins, pathway engagement, product conversion, customer acquisition, repeat purchase, subscriptions, content reach, and completed customer outcomes. Approve numerical targets only after baselines are verified."),
      section("Risks", "Fragmented execution, unsupported analytics, too many concurrent initiatives, unclear offers, and dependence on one channel. Mitigate with bounded weekly priorities, verified evidence, ownership, and stop conditions."),
      section("Next action", "Record current baselines and approve the first two-week execution sprint."),
    ], "Review the plan and approve the first two-week sprint."),

    "research-brief": () => complete(base, "The deterministic research brief framework is complete.", [
      section("Research question", objective),
      section("Scope", "Define the decision this research must support, the time horizon, affected MMG systems, and exclusions."),
      section("Required sources", "Use primary documentation, authoritative internal MMG doctrine, direct platform data, and current verified public sources. Separate facts, assumptions, and recommendations."),
      section("Evidence standard", "Every material claim requires provenance, date, confidence, and relevance to the decision."),
      section("Analysis framework", "Current state; constraints; alternatives; trade-offs; risks; recommended decision; implementation implications."),
      section("Deliverable", "A concise executive brief followed by evidence, findings, unresolved questions, and a decision-ready recommendation."),
    ], "Connect approved sources and execute evidence collection."),

    "decision-record": () => complete(base, "The governed decision record is complete.", [
      section("Decision", objective),
      section("Authority", "Executive approval required before implementation when the decision changes production behavior, customer data, publishing, billing, or external systems."),
      section("Rationale", "Record the problem, evidence, alternatives considered, and why this decision best serves MMG's long-term architecture and operating doctrine."),
      section("Dependencies", "Identify affected departments, repositories, data sources, integrations, release gates, and rollback requirements."),
      section("Implementation impact", "Translate the decision into bounded work orders with acceptance criteria and proof requirements."),
      section("Review trigger", "Revisit when assumptions change, evidence contradicts the decision, or the governing architecture is amended."),
    ], "Approve and persist this record in the authoritative decision registry."),

    "publishing-studio": () => complete(base, "The publication production package is complete.", [
      section("Publication", objective),
      section("Editorial architecture", "Define audience, promise, scope, table of contents, chapter objectives, examples, exercises, front matter, and back matter."),
      section("Production pipeline", "Manuscript development → editorial review → fact and rights review → formatting → cover and metadata → proof → release approval."),
      section("Asset requirements", "Manuscript source, approved logo and brand assets, cover brief, product description, metadata, ISBN or identifier when applicable, and delivery formats."),
      section("Quality gates", "Completeness, factual accuracy, brand consistency, readability, accessibility, file integrity, and publication authorization."),
      section("Release package", "Final files, source archive, version record, metadata, storefront copy, launch assets, and rollback/archive record."),
    ], "Open the manuscript workspace and begin the editorial architecture."),

    "creative-studio": () => complete(base, "The creative production brief is complete.", [
      section("Project", objective),
      section("Objective", "Define the audience action, channel, campaign context, and measurable outcome."),
      section("Creative direction", "Preserve MMG's premium black-and-blue visual identity, cinematic restraint, correct typography, approved assets, and zero-hallucination standard."),
      section("Required assets", "Source images, exact copy, dimensions, variants, brand marks, delivery format, and usage rights."),
      section("Production stages", "Brief → concept → production → internal review → revisions → approval → channel-ready export."),
      section("Acceptance criteria", "Correct spelling, legible hierarchy, accurate branding, required dimensions, no invented UI or claims, and channel-safe composition."),
    ], "Attach approved source assets and begin production."),

    "product-launch": () => complete(base, "The product launch plan is complete.", [
      section("Product or offer", objective),
      section("Positioning", "Define the customer problem, promised outcome, proof, differentiation, price logic, and fit within the MMG ecosystem."),
      section("Audience", "Identify primary buyer, secondary buyer, objections, readiness signals, and the guided path into the offer."),
      section("Launch assets", "Product page, checkout path, email sequence, short-form content, launch graphics, FAQ, support plan, and tracking."),
      section("Readiness gates", "Offer approved; fulfillment tested; links verified; analytics connected; customer support ready; rollback and pause criteria defined."),
      section("Launch cadence", "Pre-launch education, announcement, proof and demonstrations, objection handling, deadline or evergreen transition, and post-launch review."),
    ], "Complete the readiness checklist and approve the launch window."),

    "knowledge-library": () => sourceReport(base, "Knowledge Library search", objective, Boolean(env?.KNOWLEDGE_LIBRARY), ["Doctrine", "Specifications", "Research", "Decision records"]),
    "revenue-intelligence": () => sourceReport(base, "Revenue intelligence review", objective, Boolean(env?.COMMERCE_DATA), ["Revenue", "Product performance", "Trends", "Evidence"]),
    "visitor-activity": () => sourceReport(base, "Visitor activity review", "Current visitor activity", Boolean(env?.ANALYTICS_DATA), ["Traffic", "Journeys", "Conversions", "Source health"]),
    "customer-portal": () => sourceReport(base, "Customer portal lookup", objective, Boolean(env?.CUSTOMER_DATA), ["Projects", "Approvals", "Files", "Messages", "Billing"]),
    "deliverables": () => sourceReport(base, "Deliverables lookup", objective, Boolean(env?.DELIVERABLES_DATA), ["Completed work", "Verification", "Release status", "Delivery"]),
    "work-queue": () => sourceReport(base, "Work queue review", "Current work queue", Boolean(env?.WORK_QUEUE_DATA), ["Active", "Waiting", "Completed", "Blocked"]),
    "release-control": () => sourceReport(base, "Release control review", objective || "Current releases", Boolean(env?.RELEASE_DATA), ["Pending approvals", "Verified releases", "Rollback packages", "History"]),
  };

  return (builders[action] || (() => complete(base, `${ACTIONS[action].title} deliverable is complete.`, [section("Objective", objective || ACTIONS[action].title)], "Review the deliverable and continue the governed workflow.")))();
}

function complete(base, summary, sections, nextAction) {
  return { ...base, summary, sections, nextAction, evidence: { ...base.evidence, completeness: "deterministic-working-deliverable" } };
}

function sourceReport(base, label, objective, connected, names) {
  const status = connected ? "connected" : "not-connected";
  const sections = [
    section("Request", objective),
    section("Source status", connected ? "An authoritative source binding is present and ready for adapter-specific retrieval." : "No authoritative source binding is available in this runtime. Kairos did not invent or simulate records."),
    ...names.map(name => section(name, connected ? "Ready for verified retrieval through the promoted adapter." : "Unavailable until the authoritative connector is promoted.")),
  ];
  return {
    ...base,
    status: connected ? "completed" : "needs-connector",
    summary: connected ? `${label} is ready for verified retrieval.` : `${label} completed as a source-readiness report; live records were not fabricated.`,
    sections,
    nextAction: connected ? "Run the promoted source adapter and return verified records." : "Promote the authoritative connector, then rerun this action.",
    evidence: { ...base.evidence, sourceConnected: connected, inventedData: false, sourceStatus: status },
  };
}

function section(name, content) {
  return { name, status: "completed", content };
}

async function readJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-command-v4",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
