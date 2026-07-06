export const kairosState = {
  operator: "Mike",
  mode: "Build",
  health: 96,
  readiness: 48,
  activeBatch: "Bundle Packaging Engine",
  modules: [
    { id: "dashboard", label: "Dashboard", icon: "⌘" },
    { id: "website", label: "Website Ops", icon: "◎" },
    { id: "shopify", label: "Shopify", icon: "◇" },
    { id: "products", label: "Products", icon: "▣" },
    { id: "bundles", label: "Bundles", icon: "⬡" },
    { id: "knowledge", label: "Knowledge", icon: "◌" },
    { id: "revenue", label: "Revenue", icon: "↗" },
    { id: "customers", label: "Customers", icon: "◍" },
    { id: "ai", label: "AI Workforce", icon: "✦" },
    { id: "system", label: "System", icon: "⚙" }
  ],
  kpis: [
    { label: "System Health", value: "96%", trend: "+2%", tone: "good" },
    { label: "Readiness", value: "48%", trend: "+6%", tone: "warn" },
    { label: "Open Tasks", value: "31", trend: "Active", tone: "info" },
    { label: "Bundles", value: "4", trend: "Packaging", tone: "good" }
  ],
  priorities: [
    { title: "Package Creator Launch Bundle", lane: "Bundles", status: "Active", priority: "P1" },
    { title: "Build Entrepreneur Operating System package", lane: "Bundles", status: "Queued", priority: "P1" },
    { title: "Map Judge.me product widgets", lane: "Shopify", status: "Queued", priority: "P1" },
    { title: "Create Free Vault entry flow", lane: "Knowledge", status: "Queued", priority: "P2" },
    { title: "Configure Welcome Popup offer", lane: "Revenue", status: "Queued", priority: "P2" }
  ],
  approvals: [
    { title: "Approve Creator Launch Bundle pricing", risk: "Medium" },
    { title: "Activate 10% first-order offer", risk: "Medium" },
    { title: "Release Free Vault lead magnet", risk: "Low" }
  ],
  systems: [
    { title: "Shopify", status: "Needs widget validation", health: 82 },
    { title: "Judge.me", status: "Installed / mapping required", health: 66 },
    { title: "Bundle Engine", status: "Package queue active", health: 78 },
    { title: "Knowledge Library", status: "Route audit required", health: 58 },
    { title: "System Vault", status: "Architecture ready", health: 74 },
    { title: "Revenue Engine", status: "Popup + bundle build queued", health: 73 }
  ],
  pipelines: [
    { label: "Bundle Packaging", complete: 58 },
    { label: "Website Audit", complete: 64 },
    { label: "Shopify Prep", complete: 52 },
    { label: "Revenue Engine", complete: 35 }
  ],
  commandCenters: {
    website: ["Run homepage audit", "Validate navigation", "Create production backlog", "Fix SEO and internal links", "Review mobile layout"],
    shopify: ["Validate Judge.me widgets", "Create bundle structure", "Prepare product templates", "Audit checkout offers", "Map product health scores"],
    products: ["Create product health score", "Generate product guides", "Map vault access", "Package editable deliverables", "Build KDP-ready package template"],
    bundles: ["Package Creator Launch Bundle", "Package Entrepreneur OS", "Package AI Business OS", "Prepare commercial rights package", "Map bundle vault access"],
    knowledge: ["Build Free Vault", "Classify articles", "Map revenue modules", "Create MMG Passport entry", "Prepare Knowledge Library taxonomy"],
    revenue: ["Welcome popup", "Checkout discount", "Bundle engine", "Email capture", "Cross-sell recommendations"],
    customers: ["Customer portal", "Vault access", "Rights records", "Review follow-up", "Support queue"],
    ai: ["Model routing", "Research queue", "Writing tasks", "Code review tasks", "Asset generation"],
    system: ["Integrations", "Runtime health", "Backups", "Golden Master", "Deployment status"]
  },
  activity: [
    "Bundle Packaging Engine added to Kairos dashboard.",
    "Creator Launch Bundle entered active package queue.",
    "Entrepreneur OS and AI Business OS moved into bundle queue.",
    "Commercial rights package added to approval workflow.",
    "Kairos dashboard updated live through GitHub Pages."
  ]
};
