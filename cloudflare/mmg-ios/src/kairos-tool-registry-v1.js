export const KAIROS_TOOL_REGISTRY_BUILD = "kairos-tool-registry-20260725-1";

const TOOLS = Object.freeze({
  "shopify.product.read": Object.freeze({
    id: "shopify.product.read",
    label: "Read Shopify product",
    department: "commerce",
    capability: "read",
    risk: "low",
    approvalRequired: false,
    executor: "shopify-readonly",
    description: "Retrieve governed product data without changing Shopify state.",
  }),
  "shopify.product.update": Object.freeze({
    id: "shopify.product.update",
    label: "Update Shopify product",
    department: "commerce",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-governed-mutation",
    description: "Update approved product fields after an authorized continuation token is verified.",
  }),
  "shopify.product.publish": Object.freeze({
    id: "shopify.product.publish",
    label: "Publish Shopify product",
    department: "commerce",
    capability: "mutation",
    risk: "critical",
    approvalRequired: true,
    executor: "shopify-governed-mutation",
    description: "Publish an approved Shopify product only through the production publication boundary.",
  }),
  "knowledge.search": Object.freeze({
    id: "knowledge.search",
    label: "Search Knowledge Vault",
    department: "executive",
    capability: "read",
    risk: "low",
    approvalRequired: false,
    executor: "knowledge-vault",
    description: "Retrieve bounded active records from the canonical Knowledge Vault.",
  }),
  "publishing.project.read": Object.freeze({
    id: "publishing.project.read",
    label: "Read publishing project",
    department: "publishing",
    capability: "read",
    risk: "low",
    approvalRequired: false,
    executor: "publishing-readonly",
    description: "Read governed publishing project state without modifying production assets.",
  }),
});

export function getKairosTool(id) {
  const tool = TOOLS[String(id || "").trim().toLowerCase()];
  return tool ? publicTool(tool) : null;
}

export function listKairosTools({ department, capability } = {}) {
  const normalizedDepartment = normalize(department);
  const normalizedCapability = normalize(capability);
  return Object.values(TOOLS)
    .filter((tool) => !normalizedDepartment || tool.department === normalizedDepartment)
    .filter((tool) => !normalizedCapability || tool.capability === normalizedCapability)
    .map(publicTool);
}

export function classifyKairosToolRequest(id) {
  const tool = getKairosTool(id);
  if (!tool) {
    return {
      allowed: false,
      classification: "prohibited",
      reason: "The requested tool is not registered in the governed Kairos tool registry.",
      tool: null,
    };
  }
  return {
    allowed: true,
    classification: tool.approvalRequired ? "approval_required" : "informational",
    reason: tool.approvalRequired
      ? "The requested tool can change external or production state and requires authorized continuation."
      : "The requested tool is read-only and may execute through its governed adapter.",
    tool,
  };
}

function publicTool(tool) {
  return {
    id: tool.id,
    label: tool.label,
    department: tool.department,
    capability: tool.capability,
    risk: tool.risk,
    approvalRequired: tool.approvalRequired,
    executor: tool.executor,
    description: tool.description,
    build: KAIROS_TOOL_REGISTRY_BUILD,
  };
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
