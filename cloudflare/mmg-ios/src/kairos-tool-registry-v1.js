export const KAIROS_TOOL_REGISTRY_BUILD = "kairos-tool-registry-20260807-4-shopify-site-capabilities";

const TOOLS = Object.freeze({
  "shopify.site.inspect": Object.freeze({
    id: "shopify.site.inspect",
    label: "Inspect Shopify site",
    department: "commerce",
    capability: "read",
    risk: "low",
    approvalRequired: false,
    executor: "shopify-site-inspect",
    description: "Inspect governed Shopify storefront structure, pages, navigation, and store identity without changing state.",
  }),
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
  "shopify.product.create": Object.freeze({
    id: "shopify.product.create",
    label: "Create Shopify product draft",
    department: "commerce",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-product-create",
    description: "Create an allowlisted Shopify product as a draft unless an approved status is explicitly supplied.",
  }),
  "shopify.product.update": Object.freeze({
    id: "shopify.product.update",
    label: "Update Shopify product",
    department: "commerce",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-product-update",
    description: "Update only allowlisted product fields after a durable single-use approval is consumed.",
  }),
  "shopify.product.publish": Object.freeze({
    id: "shopify.product.publish",
    label: "Publish Shopify product",
    department: "commerce",
    capability: "mutation",
    risk: "critical",
    approvalRequired: true,
    executor: "shopify-product-publish",
    description: "Publish an approved Shopify product only through the separately governed publication boundary.",
  }),
  "shopify.collection.create": Object.freeze({
    id: "shopify.collection.create",
    label: "Create Shopify collection",
    department: "commerce",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-collection-create",
    description: "Create a governed manual Shopify collection using allowlisted merchandising and SEO fields.",
  }),
  "shopify.collection.update": Object.freeze({
    id: "shopify.collection.update",
    label: "Update Shopify collection",
    department: "commerce",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-collection-update",
    description: "Update allowlisted Shopify collection content and presentation fields after approval.",
  }),
  "shopify.page.create": Object.freeze({
    id: "shopify.page.create",
    label: "Create Shopify page draft",
    department: "content",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-page-create",
    description: "Create a Shopify Online Store page; new pages default to unpublished until explicitly approved otherwise.",
  }),
  "shopify.page.update": Object.freeze({
    id: "shopify.page.update",
    label: "Update Shopify page",
    department: "content",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-page-update",
    description: "Update allowlisted page content, handle, template, or publication state after approval.",
  }),
  "shopify.menu.create": Object.freeze({
    id: "shopify.menu.create",
    label: "Create Shopify navigation menu",
    department: "content",
    capability: "mutation",
    risk: "high",
    approvalRequired: true,
    executor: "shopify-menu-create",
    description: "Create governed storefront navigation with bounded, validated menu items.",
  }),
  "shopify.menu.update": Object.freeze({
    id: "shopify.menu.update",
    label: "Update Shopify navigation menu",
    department: "content",
    capability: "mutation",
    risk: "critical",
    approvalRequired: true,
    executor: "shopify-menu-update",
    description: "Replace approved storefront navigation structure only after durable confirmation.",
  }),
  "shopify.theme.files.upsert": Object.freeze({
    id: "shopify.theme.files.upsert",
    label: "Stage Shopify theme files",
    department: "operations",
    capability: "mutation",
    risk: "critical",
    approvalRequired: true,
    executor: "shopify-theme-files-upsert",
    description: "Write approved theme files only to a server-verified non-live Shopify theme; MAIN themes are rejected.",
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

export function assertKairosExecutor(toolId, executorId) {
  const tool = getKairosTool(toolId);
  return Boolean(tool && tool.executor === String(executorId || "").trim());
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
