export const kairosState = {
  operator: "Mike",
  mode: "Build",
  health: 91,
  readiness: 37,
  activeBatch: "Web Operations Dashboard",
  modules: [
    { id: "dashboard", label: "Dashboard" },
    { id: "website", label: "Website" },
    { id: "shopify", label: "Shopify" },
    { id: "products", label: "Products" },
    { id: "knowledge", label: "Knowledge" },
    { id: "revenue", label: "Revenue" },
    { id: "customers", label: "Customers" },
    { id: "ai", label: "AI Workforce" },
    { id: "system", label: "System" }
  ],
  priorities: [
    { title: "Complete homepage conversion audit", lane: "Website", status: "Active" },
    { title: "Configure Welcome Pop-up offer", lane: "Revenue", status: "Queued" },
    { title: "Map Judge.me product widgets", lane: "Shopify", status: "Queued" },
    { title: "Build native bundle structure", lane: "Products", status: "Queued" },
    { title: "Create Free Vault entry flow", lane: "Knowledge", status: "Queued" }
  ],
  approvals: [
    { title: "Publish System Vault nav item", risk: "Medium" },
    { title: "Activate 10% first-order offer", risk: "Medium" },
    { title: "Release Free Vault lead magnet", risk: "Low" }
  ],
  systems: [
    { title: "Shopify", status: "Needs widget validation" },
    { title: "Judge.me", status: "Installed / mapping required" },
    { title: "Knowledge Library", status: "Route audit required" },
    { title: "System Vault", status: "Architecture ready" },
    { title: "Revenue Engine", status: "Popup + bundle build queued" },
    { title: "AI Workforce", status: "Planned" }
  ],
  activity: [
    "Kairos Web Dashboard repository shell created.",
    "Runtime state initialized for Phase 1 operations.",
    "Website audit moved to primary execution track.",
    "iOS remains secondary client until build access is restored."
  ]
};
