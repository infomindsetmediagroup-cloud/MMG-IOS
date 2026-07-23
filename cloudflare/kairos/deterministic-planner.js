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

const PROTECTED_PATTERNS = Object.freeze([
  /\bpublish(?:ed|ing)?\b/i,
  /\bgo live\b|\blive publication\b/i,
  /\bprice|pricing|discount|charge|refund|payment|invoice|financial\b/i,
  /\bdelete|destroy|purge|remove permanently|overwrite\b/i,
  /\bproduction deploy|deploy to production|production mutation\b/i,
  /\bcustomer message|message (?:a |the )?customer|send (?:an )?email|notify customers?\b/i,
  /\bpermission|access role|credential|secret|api key|token rotation\b/i,
  /\binventory|subscription billing|entitlement revocation\b/i,
  /\btheme publish|domain change|dns change\b/i,
]);

const SENSITIVE_KEY_PATTERN = /token|secret|password|passphrase|credential|api[_-]?key|private[_-]?key|authorization|cookie|session/i;
const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_KEYS = 50;
const MAX_ARRAY_ITEMS = 20;
const MAX_CONTEXT_STRING = 2_000;

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
  const requiresApproval = PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized));

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
  const seen = new WeakSet();
  const sanitized = sanitizeValue(value, 0, seen);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : {};
}

function sanitizeValue(value, depth, seen) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, MAX_CONTEXT_STRING);
  if (depth >= MAX_CONTEXT_DEPTH || typeof value !== "object") return undefined;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, seen))
      .filter((item) => item !== undefined);
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .slice(0, MAX_CONTEXT_KEYS)
      .map(([key, item]) => [key.slice(0, 120), sanitizeValue(item, depth + 1, seen)])
      .filter(([, item]) => item !== undefined),
  );
}

function plannerError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
