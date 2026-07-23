const WORKFLOW_CATALOG = Object.freeze([
  {
    id: "digital-product.publish.v1",
    domain: "publishing",
    keywords: ["digital product", "ebook", "book", "guide", "pdf", "publish"],
    stages: ["validate concept", "create production specification", "manufacture assets", "create Shopify draft", "validate delivery", "request publication approval"],
  },
  {
    id: "shopify-page.manufacture.v1",
    domain: "shopify",
    keywords: ["shopify page", "landing page", "homepage", "website", "liquid"],
    stages: ["inspect canonical page standard", "build scoped page source", "validate links and markup", "create preview", "request production approval"],
  },
  {
    id: "application.develop.v1",
    domain: "engineering",
    keywords: ["app", "application", "code", "runtime", "deploy", "github"],
    stages: ["inspect repository", "define acceptance contract", "implement on branch", "run tests", "deploy to staging", "verify health", "request production approval"],
  },
  {
    id: "marketing.campaign.v1",
    domain: "marketing",
    keywords: ["market", "marketing", "promote", "campaign", "social", "email", "seo"],
    stages: ["define objective and audience", "prepare channel assets", "validate claims and links", "request scheduling approval", "measure results"],
  },
  {
    id: "service.fulfillment.v1",
    domain: "operations",
    keywords: ["service", "client", "customer order", "fulfill", "delivery"],
    stages: ["validate order and scope", "prepare work plan", "produce deliverables", "quality assurance", "deliver through approved channel", "capture evidence"],
  },
  {
    id: "subscription.operations.v1",
    domain: "commerce",
    keywords: ["subscription", "membership", "weekly", "bi-weekly", "monthly"],
    stages: ["validate entitlement", "schedule asset production", "prepare delivery", "verify access", "record completion"],
  },
]);

const PROTECTED_TERMS = Object.freeze([
  "publish",
  "live",
  "price",
  "pricing",
  "charge",
  "delete",
  "production",
  "customer message",
  "send email",
  "deploy",
]);

export function createDeterministicPlan(input = {}) {
  const objective = requireObjective(input.objective);
  const normalized = objective.toLowerCase();
  const matches = WORKFLOW_CATALOG.map((workflow) => ({
    workflow,
    score: workflow.keywords.reduce(
      (total, keyword) => total + (normalized.includes(keyword) ? keyword.length : 0),
      0,
    ),
  }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const selected = matches[0]?.workflow || {
    id: "executive.objective.triage.v1",
    domain: "executive",
    stages: ["clarify measurable outcome", "identify authoritative sources", "select workflow", "prepare governed execution plan"],
  };
  const requiresApproval = PROTECTED_TERMS.some((term) => normalized.includes(term));

  return Object.freeze({
    planVersion: "1.0",
    mode: "deterministic",
    objective,
    workflowId: selected.id,
    domain: selected.domain,
    autonomyLevel: 2,
    executionPolicy: requiresApproval ? "draft_then_approval" : "automatic_low_risk",
    requiresApproval,
    stages: selected.stages.map((stage, index) => ({
      order: index + 1,
      action: stage,
      status: "pending",
    })),
    constraints: Object.freeze([
      "Do not perform production mutations without an approved workflow manifest.",
      "Do not invent business state, prices, links, customer data, or completion evidence.",
      "Verify durable output and read it back before declaring completion.",
      "Use deterministic tools and validators whenever they can complete the task safely.",
    ]),
    context: sanitizeContext(input.context),
    generatedAt: new Date().toISOString(),
  });
}

function requireObjective(value) {
  const objective = String(value || "").trim();
  if (!objective) throw plannerError("OBJECTIVE_REQUIRED", "A Kairos business objective is required.", 400);
  if (objective.length > 20_000) throw plannerError("OBJECTIVE_TOO_LARGE", "The objective exceeds 20,000 characters.", 413);
  return objective;
}

function sanitizeContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/token|secret|password|key/i.test(key))
      .slice(0, 50),
  );
}

function plannerError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
