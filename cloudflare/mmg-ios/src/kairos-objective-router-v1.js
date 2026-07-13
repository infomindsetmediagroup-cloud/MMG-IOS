import { createWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-objective-router-20260713-1";

const ROUTES = [
  route("knowledge", "knowledge-library", "Knowledge Library", ["knowledge", "library", "find doctrine", "search doctrine", "lookup", "reference"]),
  route("knowledge", "research-brief", "Research Brief", ["research", "investigate", "evidence", "compare", "study", "brief"]),
  route("knowledge", "decision-record", "Decision Record", ["decision", "record approval", "document decision", "preserve decision"]),
  route("knowledge", "doctrine-vault", "Doctrine Vault", ["doctrine", "constitution", "policy", "governance rule"]),
  route("knowledge", "intelligence-synthesis", "Intelligence Synthesis", ["synthesize", "synthesis", "combine findings", "executive summary"]),
  route("content", "website", "Website Retool", ["website", "shopify", "homepage", "page", "storefront", "header", "footer"]),
  route("content", "manuscript-studio", "Manuscript Studio", ["book", "manuscript", "chapter", "author", "editing", "proofread"]),
  route("content", "social-production", "Social Production", ["tiktok", "instagram", "social post", "caption", "carousel", "video post", "content post"]),
  route("content", "publishing-studio", "Publishing Studio", ["publish", "publication", "ebook", "pdf", "print ready", "isbn"]),
  route("content", "creative-studio", "Creative Studio", ["design", "image", "graphic", "cover", "poster", "creative asset", "thumbnail"]),
  route("business", "product-launch", "Product Launch", ["launch product", "product launch", "release product", "go to market"]),
  route("business", "revenue-intelligence", "Revenue Intelligence", ["revenue", "sales", "orders", "profit", "commerce", "performance"]),
  route("business", "growth-plan", "Growth Plan", ["growth", "followers", "audience", "scale", "traffic", "conversion"]),
  route("business", "offer-builder", "Offer Builder", ["offer", "pricing", "value proposition", "package service", "bundle"]),
  route("business", "campaign-operations", "Campaign Operations", ["campaign", "promotion", "marketing plan", "launch calendar"]),
  route("customers", "visitor-activity", "Visitor Activity", ["visitors", "sessions", "analytics", "site traffic", "user activity"]),
  route("customers", "customer-portal", "Customer Portal", ["customer portal", "client portal", "customer project", "client project"]),
  route("customers", "deliverables", "Deliverables", ["deliverable", "delivery", "completed work", "client files"]),
  route("customers", "customer-journey", "Customer Journey", ["customer journey", "onboarding", "customer experience", "funnel"]),
  route("customers", "support-intelligence", "Support Intelligence", ["support", "customer issue", "complaint", "help request", "resolution"]),
  route("operations", "health", "Runtime Health", ["runtime", "health", "status", "uptime", "deployment"]),
  route("operations", "work-queue", "Work Queue", ["workflow", "task", "queue", "work tonight", "to do", "project plan"]),
  route("operations", "release-control", "Release Control", ["release", "rollback", "deployment approval", "publish approval"]),
  route("operations", "executive-briefing", "Executive Briefing", ["briefing", "approval brief", "morning brief", "evening brief"]),
  route("operations", "system-registry", "System Registry", ["registry", "service", "route", "system map", "ownership"]),
];

export function routeObjective(payload = {}) {
  const objective = clean(payload.objective, 6000);
  if (!objective) throw new Error("Enter an objective for Kairos to route.");
  const normalized = objective.toLowerCase();
  const scored = ROUTES.map(candidate => ({ ...candidate, score: score(candidate, normalized) }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const best = scored[0];
  const confidence = best.score >= 6 ? "high" : best.score >= 3 ? "medium" : "low";
  const selected = best.score > 0 ? best : ROUTES.find(candidate => candidate.entryPoint === "work-queue");
  return {
    build: BUILD,
    status: "routed",
    objective,
    center: selected.center,
    entryPoint: selected.entryPoint,
    label: selected.label,
    confidence,
    score: Math.max(best.score, 0),
    rationale: selected.score > 0
      ? `The objective matches ${selected.label} based on its requested outcome and work type.`
      : "The objective is broad, so Kairos routed it to Work Queue for structured decomposition.",
    alternatives: scored.filter(item => item.entryPoint !== selected.entryPoint && item.score > 0).slice(0, 3).map(item => ({ center: item.center, entryPoint: item.entryPoint, label: item.label })),
    workflow: workflowBlueprint(objective, selected),
    safeguards: {
      onePermanentHome: true,
      fiveByFiveArchitecturePreserved: true,
      floatingControlCreated: false,
      externalActionAutomatic: false,
    },
  };
}

export async function dispatchObjective(request, payload = {}) {
  const routed = routeObjective(payload);
  const workflow = await createWorkflow(request, {
    title: clean(payload.title, 180) || routed.workflow.title,
    objective: routed.objective,
    center: routed.center,
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Kairos",
    source: `objective-router:${routed.entryPoint}`,
    tasks: routed.workflow.tasks,
  });
  return {
    ...routed,
    status: "dispatched",
    workflow,
    nextAction: routed.entryPoint === "work-queue"
      ? "Open Operations → Work Queue and start the workflow."
      : `Open ${routed.label} or Operations → Work Queue to begin execution.`,
  };
}

function workflowBlueprint(objective, selected) {
  return {
    title: objective.length > 72 ? `${objective.slice(0, 69)}…` : objective,
    tasks: [
      { title: `Confirm ${selected.label} scope`, description: "Resolve the objective, constraints, inputs, and completion evidence." },
      { title: `Prepare ${selected.label} work package`, description: `Build the governed work package inside the ${selected.center} operating center.` },
      { title: "Execute bounded work", description: "Perform only the authorized work using the registered execution path." },
      { title: "Verify authoritative result", description: "Read back the result, preserve evidence, and identify any remaining gaps." },
      { title: "Close and capture knowledge", description: "Complete the workflow and preserve the reusable result in the appropriate system record." },
    ],
  };
}

function route(center, entryPoint, label, keywords) { return { center, entryPoint, label, keywords }; }
function score(candidate, objective) {
  return candidate.keywords.reduce((total, keyword) => {
    if (!objective.includes(keyword)) return total;
    return total + (keyword.includes(" ") ? 4 : 2);
  }, 0);
}
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
