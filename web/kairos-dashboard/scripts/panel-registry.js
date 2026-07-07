const registryKey = "kairos.panel.registry.v1";

const panelRegistry = [
  { id: "operator", title: "Operator Briefing", group: "Core", status: "Active" },
  { id: "search", title: "Command Search", group: "Core", status: "Active" },
  { id: "focus", title: "Focus Mode", group: "Core", status: "Active" },
  { id: "approvals", title: "Approval Center", group: "Governance", status: "Active" },
  { id: "tasks", title: "Task Board", group: "Execution", status: "Active" },
  { id: "router", title: "Command Router", group: "Execution", status: "Active" },
  { id: "site-audit", title: "Website Audit Runner", group: "Runners", status: "Active" },
  { id: "shopify-preflight", title: "Shopify Preflight Runner", group: "Runners", status: "Active" },
  { id: "revenue-funnel", title: "Revenue Funnel Runner", group: "Runners", status: "Active" },
  { id: "bundle-builder", title: "Bundle Builder Runner", group: "Runners", status: "Active" },
  { id: "vault-builder", title: "Vault Builder Runner", group: "Runners", status: "Active" },
  { id: "knowledge-taxonomy", title: "Knowledge Taxonomy Runner", group: "Runners", status: "Active" },
  { id: "customer-portal", title: "Customer Portal Runner", group: "Runners", status: "Active" },
  { id: "milestone", title: "Milestone Validation", group: "Validation", status: "Active" },
  { id: "golden-master", title: "Golden Master", group: "Validation", status: "Active" },
  { id: "runtime", title: "Runtime Store", group: "System", status: "Active" },
  { id: "export", title: "Export Center", group: "System", status: "Active" },
  { id: "import", title: "Import Center", group: "System", status: "Active" },
  { id: "notifications", title: "Notification Center", group: "System", status: "Active" },
  { id: "diagnostics", title: "Diagnostics", group: "System", status: "Active" },
  { id: "reset", title: "Runtime Reset", group: "System", status: "Active" }
];

export function getPanelRegistry() {
  try {
    return JSON.parse(localStorage.getItem(registryKey) || "null") || panelRegistry;
  } catch {
    return panelRegistry;
  }
}

export function panelRegistryMetrics() {
  const panels = getPanelRegistry();
  return {
    total: panels.length,
    active: panels.filter(panel => panel.status === "Active").length,
    groups: [...new Set(panels.map(panel => panel.group))].length
  };
}
