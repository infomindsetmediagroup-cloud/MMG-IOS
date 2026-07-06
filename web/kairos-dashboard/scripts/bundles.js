export const bundlePackages = [
  {
    id: "creator-launch",
    title: "Creator Launch Bundle",
    price: "$49.95",
    value: "$74.97",
    status: "Ready",
    items: ["Creators Bible", "AI Prompting for Beginners", "Go Viral This Week"],
    destination: "Shopify and Vault"
  },
  {
    id: "entrepreneur-system",
    title: "Entrepreneur Operating System",
    price: "$199.95",
    value: "$399+",
    status: "Queued",
    items: ["Business Roadmap", "Branding Module", "Revenue Playbook", "SOP Library", "Vault Upgrade"],
    destination: "System Vault"
  },
  {
    id: "ai-business-os",
    title: "AI Business OS Package",
    price: "$299.95",
    value: "$599+",
    status: "Queued",
    items: ["AI Instructions", "Prompt Library", "Command Framework", "Dashboard Blueprint", "Setup Guide"],
    destination: "Premium Vault"
  },
  {
    id: "commercial-rights",
    title: "Commercial Rights Package",
    price: "$399.95",
    value: "$999+",
    status: "Approval",
    items: ["Editable assets", "Branding zones", "Agreement", "Distribution guide", "Customer handoff pack"],
    destination: "Rights Center"
  }
];

export function bundleMetrics() {
  return {
    activeBundles: bundlePackages.length,
    ready: bundlePackages.filter(bundle => bundle.status === "Ready").length,
    approvals: bundlePackages.filter(bundle => bundle.status === "Approval").length,
    projectedRevenue: "$949.80"
  };
}
