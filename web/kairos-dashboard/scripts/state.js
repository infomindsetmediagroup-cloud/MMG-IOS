export const kairosState = {
  operator: "Mike",
  mode: "Operation",
  health: 98,
  readiness: 69,
  activeBatch: "Kairos Customer Value Runtime",
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
      metric: "98%",
      status: "Live",
      summary: "Executive decisions, daily operations, approvals, blockers, next-best-action flow, and customer value doctrine governance.",
      nodes: ["Decision Queue", "Execution Pipeline", "Approval Gate", "Blockers", "Next Action"]
    },
    {
      id: "commerce",
      label: "Commerce",
      metric: "68%",
      status: "Build",
      summary: "Shopify, products, bundles, checkout offers, revenue capture, and value-to-income conversion paths.",
      nodes: ["Shopify", "Products", "Bundles", "Revenue", "Offers"]
    },
    {
      id: "content",
      label: "Content",
      metric: "76%",
      status: "Active",
      summary: "Knowledge Bank, customer-facing education, asset packaging, publishing workflows, and body-of-work development.",
      nodes: ["Knowledge Bank", "Publishing", "Vault", "Library", "Content Batches"]
    },
    {
      id: "intelligence",
      label: "Intelligence",
      metric: "82%",
      status: "Active",
      summary: "AI workforce, analytics, routing, customer intelligence, brand guidance, and next-best-action recommendations.",
      nodes: ["AI Workforce", "Analytics", "Customer Intel", "Routing", "Forecasts"]
    },
    {
      id: "system",
      label: "System",
      metric: "92%",
      status: "Protected",
      summary: "Runtime health, integrations, security, repository workflow, deployment, rollback, and constitutional guardrails.",
      nodes: ["Runtime", "Integrations", "Security", "GitHub", "Deployment"]
    }
  ],
  brandDoctrine: {
    promise: "Your Knowledge Has Value.",
    support: "Helping you discover it, build it, and share it with the world.",
    positioning: "Build around the value only you can provide.",
    customerOutcome: "Turn knowledge, experience, skill, creativity, and perspective into durable digital assets and long-term opportunity.",
    messageSequence: ["Outcome", "Identity", "Agency", "Guidance", "System"],
    forbiddenTone: ["Easy money", "Get rich quick", "Hype", "Shortcut promises"],
    approvedTone: ["Guidance", "Education", "Stewardship", "Execution", "Long-term value"]
  },
  stewardshipDoctrine: {
    role: "Kairos is the steady guide that preserves context, recommends next actions, and helps users compound their body of work.",
    assetModel: "Ideas, posts, books, videos, services, products, lessons, and workflows should be connected into durable knowledge assets.",
    operatingRule: "Every surface should help the user become more capable, more organized, and closer to sharing value with the right audience."
  },
  kpis: [
    { label: "System Health", value: "98%", trend: "+1%", tone: "good" },
    { label: "Readiness", value: "69%", trend: "+5%", tone: "good" },
    { label: "Doctrine Lock", value: "Live", trend: "Customer Value", tone: "good" },
    { label: "Operation Mode", value: "Live", trend: "Skip-CI", tone: "good" }
  ],
  priorities: [
    { title: "Carry customer value doctrine into dashboard runtime", lane: "Dashboard", status: "Completed", priority: "P1" },
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
    { title: "Kairos Dashboard", status: "Customer Value Runtime", health: 90 },
    { title: "Official Kairos Asset", status: "Ready", health: 100 },
    { title: "GitHub Workflow", status: "Skip-CI batching active", health: 92 },
    { title: "Website System", status: "Queued", health: 70 },
    { title: "Shopify Operations", status: "Queued", health: 66 }
  ],
  pipelines: [
    { label: "Dashboard Completion", complete: 78 },
    { label: "Asset Integration", complete: 84 },
    { label: "Website System Queue", complete: 58 },
    { label: "Shopify Prep", complete: 55 }
  ],
  activity: [
    "Customer value doctrine locked into dashboard runtime.",
    "Brand promise set to Your Knowledge Has Value.",
    "Guidance and knowledge stewardship state seeded.",
    "Dashboard state switched into Customer Value Runtime.",
    "GitHub commit strategy locked to skip-CI batching until final validation."
  ]
};