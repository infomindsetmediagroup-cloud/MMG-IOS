export const KAIROS_NATIVE_KERNEL_VERSION = "kairos-native-kernel-20260712-1";

export const NATIVE_DEPARTMENTS = Object.freeze([
  { id: "executive-office", name: "Executive Office", keywords: ["decision", "strategy", "objective", "priority"], capabilities: ["objective analysis", "governed routing", "approval control"] },
  { id: "research", name: "Research", keywords: ["research", "evidence", "source", "analyze", "study"], capabilities: ["direct source retrieval", "evidence normalization", "provenance ledger"] },
  { id: "publishing", name: "Publishing", keywords: ["book", "manuscript", "chapter", "publish", "publication", "kdp", "ebook", "paperback"], capabilities: ["publication architecture", "manuscript composition", "metadata"] },
  { id: "editorial", name: "Editorial", keywords: ["edit", "rewrite", "copyedit", "proofread", "manuscript"], capabilities: ["structural editing", "line editing", "copyediting"] },
  { id: "design-studio", name: "Design Studio", keywords: ["cover", "design", "image", "visual", "layout"], capabilities: ["cover composition", "interior design", "production preview"] },
  { id: "manufacturing", name: "Production Manufacturing", keywords: ["docx", "pdf", "format", "package", "export", "kdp"], capabilities: ["DOCX manufacturing", "PDF manufacturing", "KDP specifications"] },
  { id: "quality", name: "Quality Assurance", keywords: ["quality", "verify", "validate", "preflight", "proof"], capabilities: ["quality gates", "file validation", "release evidence"] },
  { id: "packaging", name: "Deliverables and Packaging", keywords: ["deliver", "zip", "package", "archive", "download"], capabilities: ["release packaging", "manifest generation", "approved delivery"] },
]);

const KERNEL_STOP_WORDS = new Set("a about an and are as at be been being but by can create do for from get has have how i in into is it its make me my of on or our please should that the their this through to using want what when where which who why will with you your".split(" "));

export function analyzeNativeObjective(objectiveInput) {
  const objective = String(objectiveInput || "").replace(/\s+/g, " ").trim();
  if (!objective) throw kernelError(400, "objective_required", "Kairos requires a non-empty objective.");
  const tokens = objective.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
  const frequency = new Map();
  for (const token of tokens) if (!KERNEL_STOP_WORDS.has(token)) frequency.set(token, (frequency.get(token) || 0) + 1);
  const concepts = [...frequency.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 12).map(([token]) => token);
  const route = routeNativeObjective(objective);
  return {
    objective,
    concepts,
    route,
    completionIntent: inferCompletionIntent(objective),
    constraints: inferConstraints(objective),
    confidence: route.confidence,
    analyzedAt: new Date().toISOString(),
    kernelVersion: KAIROS_NATIVE_KERNEL_VERSION,
    externalInferenceAPI: false,
  };
}

export function routeNativeObjective(objectiveInput) {
  const objective = String(objectiveInput || "").toLowerCase();
  const scored = NATIVE_DEPARTMENTS.map(department => {
    const matched = department.keywords.filter(keyword => objective.includes(keyword));
    const domainBoost = department.id === "publishing" && /\b(book|manuscript|publication|publish|kdp|ebook|paperback)\b/.test(objective) ? 3 : 0;
    return { ...department, score: matched.length + domainBoost, matched };
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const primary = scored[0]?.score ? scored[0] : NATIVE_DEPARTMENTS[0];
  const support = scored.filter(department => department.id !== primary.id && department.score > 0).slice(0, 5).map(department => department.id);
  if (primary.id === "publishing") for (const id of ["research", "editorial", "design-studio", "manufacturing", "quality", "packaging"]) if (!support.includes(id)) support.push(id);
  return {
    primaryDepartment: primary.id,
    supportingDepartments: support.slice(0, 7),
    matchedKeywords: primary.matched || [],
    matchedCapabilities: primary.capabilities,
    confidence: primary.score ? Math.min(0.98, Number((0.55 + primary.score * 0.1).toFixed(2))) : 0.35,
    rationale: primary.score ? `Matched the objective to ${primary.name} through: ${primary.matched.join(", ")}.` : "No domain keyword matched; Executive Office owns decomposition.",
  };
}

export function buildNativeExecutionGraph(objectiveAnalysis, workflow = "publishing") {
  const publishing = [
    ["acquisition", "Acquire and analyze objective", "executive-office", []],
    ["research", "Retrieve and normalize evidence", "research", ["acquisition"]],
    ["architecture", "Build publication architecture", "publishing", ["research"]],
    ["manuscript", "Compose Gold Master manuscript", "publishing", ["architecture"]],
    ["editorial", "Complete three editorial passes", "editorial", ["manuscript"]],
    ["design", "Create cover and production design", "design-studio", ["editorial"]],
    ["manufacturing", "Manufacture publication files", "manufacturing", ["design"]],
    ["qa", "Validate content and production files", "quality", ["manufacturing"]],
    ["preview", "Present proof for approval", "executive-office", ["qa"]],
    ["packaging", "Package approved deliverables", "packaging", ["preview"]],
  ];
  const definitions = workflow === "publishing" ? publishing : [["analysis", "Analyze objective", objectiveAnalysis.route.primaryDepartment, []], ["execution", "Execute governed objective", objectiveAnalysis.route.primaryDepartment, ["analysis"]], ["verification", "Validate completion evidence", "quality", ["execution"]]];
  return {
    graphId: crypto.randomUUID(),
    objective: objectiveAnalysis.objective,
    workflow,
    kernelVersion: KAIROS_NATIVE_KERNEL_VERSION,
    externalInferenceAPI: false,
    steps: definitions.map(([id, title, department, dependsOn], index) => ({ id, title, department, dependsOn, status: index === 0 ? "ready" : "pending", requiresApproval: id === "preview", evidenceRequired: true })),
  };
}

export function evidenceEvent({ projectId, stage, operation, status, evidence = {} }) {
  return {
    eventId: crypto.randomUUID(),
    projectId,
    stage,
    operation,
    status,
    evidence,
    occurredAt: new Date().toISOString(),
    kernelVersion: KAIROS_NATIVE_KERNEL_VERSION,
    externalInferenceAPI: false,
  };
}

function inferCompletionIntent(objective) {
  if (/\b(deliver|package|zip|ready|finished|complete|publish)\b/i.test(objective)) return "finished-deliverable";
  if (/\b(research|analyze|assess|review)\b/i.test(objective)) return "evidence-and-recommendation";
  if (/\b(create|build|write|make|design)\b/i.test(objective)) return "created-artifact";
  return "decision-ready-progress";
}

function inferConstraints(objective) {
  const constraints = [];
  if (/\b(no|without)\s+openai\b/i.test(objective)) constraints.push("no-openai");
  if (/\bnative\b/i.test(objective)) constraints.push("kairos-native-execution");
  if (/\bkdp\b/i.test(objective)) constraints.push("kdp-production-standard");
  return constraints;
}

function kernelError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
