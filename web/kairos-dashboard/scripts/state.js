export const kairosState = {
  operator: "Mike",
  mode: "Build",
  health: 94,
  readiness: 42,
  activeBatch: "Web Operations Dashboard",
  modules: [
    { id: "dashboard", label: "Dashboard", icon: "⌘" },
    { id: "website", label: "Website Ops", icon: "◎" },
    { id: "shopify", label: "Shopify", icon: "◇" },
    { id: "products", label: "Products", icon: "▣" },
    { id: "knowledge", label: "Knowledge", icon: "◌" },
    { id: "revenue", label: "Revenue", icon: "↗" },
    { id: "customers", label: "Customers", icon: "◍" },
    { id: "ai", label: "AI Workforce", icon: "✦" },
    { id: "system", label: "System", icon: "⚙" }
  ],
  kpis: [
    { label: "System Health", value: "94%", trend: "+3%", tone: "good" },
    { label: "Readiness", value: "42%", trend: "+5%", tone: "warn" },
    { label: "Open Tasks", value: "27", trend: "Active", tone: "info" },
    { label: "Approvals", value: "3", trend: "Waiting", tone: "warn" }
  ],
  priorities: [
    { title: "Complete homepage conversion audit", lane: "Website", status: "Active", priority: "P1" },
    { title: "Configure Welcome Popup offer", lane: "Revenue", status: "Queued", priority: "P1" },
    { title: "Map Judge.me product widgets", lane: "Shopify", status: "Queued", priority: "P1" },
    { title: "Build native bundle structure", lane: "Products", status: "Queued", priority: "P1" },
    { title: "Create Free Vault entry flow", lane: "Knowledge", status: "Queued", priority: "P2" }
  ],
  approvals: [
    { title: "Publish System Vault nav item", risk: "Medium" },
    { title: "Activate 10% first-order offer", risk: "Medium" },
    { title: "Release Free Vault lead magnet", risk: "Low" }
  ],
  systems: [
    { title: "Shopify", status: "Needs widget validation", health: 82 },
    { title: "Judge.me", status: "Installed / mapping required", health: 66 },
    { title: "Knowledge Library", status: "Route audit required", health: 58 },
    { title: "System Vault", status: "Architecture ready", health: 74 },
    { title: "Revenue Engine", status: "Popup + bundle build queued", health: 71 },
    { title: "AI Workforce", status: "Planned", health: 49 }
  ],
  pipelines: [
    { label: "Website Audit", complete: 64 },
    { label: "Shopify Prep", complete: 52 },
    { label: "Knowledge Bank", complete: 38 },
    { label: "Revenue Engine", complete: 31 }
  ],
  commandCenters: {
    website: ["Run homepage audit", "Validate navigation", "Create production backlog", "Fix SEO and internal links", "Review mobile layout"],
    shopify: ["Validate Judge.me widgets", "Create bundle structure", "Prepare product templates", "Audit checkout offers", "Map product health scores"],
    products: ["Create product health score", "Generate product guides", "Map vault access", "Package white-label deliverables", "Build KDP-ready package template"],
    knowledge: ["Build Free Vault", "Classify articles", "Map revenue modules", "Create MMG Passport entry", "Prepare Knowledge Library taxonomy"],
    revenue: ["Welcome popup", "Checkout discount", "Bundle engine", "Email capture", "Cross-sell recommendations"],
    customers: ["Customer portal", "Vault access", "License records", "Review follow-up", "Support queue"],
    ai: ["Model routing", "Research queue", "Writing tasks", "Code review tasks", "Asset generation"],
    system: ["Integrations", "Runtime health", "Backups", "Golden Master", "Deployment status"]
  },
  activity: [
    "Kairos Web Dashboard is live on GitHub Pages.",
    "Dashboard promoted as Phase 1 production interface.",
    "Website audit moved to primary execution track.",
    "Revenue Optimization Engine added to managed subsystems.",
    "Judge.me Operations Manager queued for Shopify validation."
  ]
};
