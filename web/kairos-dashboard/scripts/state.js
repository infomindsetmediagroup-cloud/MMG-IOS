export const kairosState = {
  operator: "Mike",
  mode: "Operation",
  health: 97,
  readiness: 64,
  activeBatch: "Kairos Operation Mode",
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
    { label: "System Health", value: "97%", trend: "+1%", tone: "good" },
    { label: "Readiness", value: "64%", trend: "+16%", tone: "good" },
    { label: "Open Tasks", value: "27", trend: "Active", tone: "info" },
    { label: "Operation Mode", value: "Live", trend: "Locked", tone: "good" }
  ],
  priorities: [
    { title: "Finish Kairos dashboard runtime", lane: "Dashboard", status: "Active", priority: "P1" },
    { title: "Wire official Kairos button asset", lane: "System", status: "Active", priority: "P1" },
    { title: "Batch implementation commits with skip-CI", lane: "GitHub", status: "Active", priority: "P1" },
    { title: "Prepare website system work queue", lane: "Website", status: "Queued", priority: "P1" },
    { title: "Prepare Shopify operations queue", lane: "Shopify", status: "Queued", priority: "P2" }
  ],
  approvals: [
    { title: "Approve final validation run", risk: "Medium" },
    { title: "Release dashboard to operational use", risk: "Low" },
    { title: "Begin website system implementation after dashboard completion", risk: "Medium" }
  ],
  systems: [
    { title: "Kairos Dashboard", status: "Active", health: 86 },
    { title: "Official Kairos Asset", status: "Ready", health: 100 },
    { title: "GitHub Workflow", status: "Skip-CI batching active", health: 90 },
    { title: "Website System", status: "Queued", health: 68 },
    { title: "Shopify Operations", status: "Queued", health: 64 },
    { title: "System Vault", status: "Architecture ready", health: 78 }
  ],
  pipelines: [
    { label: "Dashboard Completion", complete: 72 },
    { label: "Asset Integration", complete: 82 },
    { label: "Website System Queue", complete: 54 },
    { label: "Shopify Prep", complete: 52 }
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
    "Kairos moved from architecture writing into execution mode.",
    "Operation Mode panel added to the dashboard.",
    "Official Kairos button asset wired into the runtime.",
    "Dashboard state switched from Build to Operation.",
    "GitHub commit strategy locked to skip-CI batching until final validation."
  ]
};
