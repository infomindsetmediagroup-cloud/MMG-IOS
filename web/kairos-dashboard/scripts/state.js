export const kairosState = {
  operator: "Mike",
  mode: "Operation",
  health: 97,
  readiness: 64,
  activeBatch: "Kairos Operation Mode",
  modules: [
    { id: "command", label: "Command", icon: "⌘" },
    { id: "commerce", label: "Commerce", icon: "◇" },
    { id: "content", label: "Content", icon: "▣" },
    { id: "intelligence", label: "Intelligence", icon: "✦" },
    { id: "system", label: "System", icon: "⚙" }
  ],
  coreGroups: [
    {
      id: "command",
      label: "Command",
      metric: "97%",
      status: "Live",
      summary: "Executive decisions, daily operations, approvals, blockers, and next-best-action flow.",
      nodes: ["Decision Queue", "Execution Pipeline", "Approval Gate", "Blockers", "Next Action"]
    },
    {
      id: "commerce",
      label: "Commerce",
      metric: "64%",
      status: "Build",
      summary: "Shopify, products, bundles, checkout offers, and revenue capture.",
      nodes: ["Shopify", "Products", "Bundles", "Revenue", "Offers"]
    },
    {
      id: "content",
      label: "Content",
      metric: "72%",
      status: "Queued",
      summary: "Knowledge Bank, publishing assets, customer-facing education, and content packaging.",
      nodes: ["Knowledge Bank", "Publishing", "Vault", "Library", "Content Batches"]
    },
    {
      id: "intelligence",
      label: "Intelligence",
      metric: "78%",
      status: "Active",
      summary: "AI workforce, analytics, routing, customer intelligence, and business insights.",
      nodes: ["AI Workforce", "Analytics", "Customer Intel", "Routing", "Forecasts"]
    },
    {
      id: "system",
      label: "System",
      metric: "90%",
      status: "Protected",
      summary: "Runtime health, integrations, security, repository workflow, deployment, and rollback.",
      nodes: ["Runtime", "Integrations", "Security", "GitHub", "Deployment"]
    }
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
    { title: "Shopify Operations", status: "Queued", health: 64 }
  ],
  pipelines: [
    { label: "Dashboard Completion", complete: 72 },
    { label: "Asset Integration", complete: 82 },
    { label: "Website System Queue", complete: 54 },
    { label: "Shopify Prep", complete: 52 }
  ],
  activity: [
    "Kairos moved from architecture writing into execution mode.",
    "Operation Mode panel added to the dashboard.",
    "Official Kairos button asset wired into the runtime.",
    "Dashboard state switched from Build to Operation.",
    "GitHub commit strategy locked to skip-CI batching until final validation."
  ]
};
