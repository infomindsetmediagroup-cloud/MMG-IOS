export const kairosState = {
  operator: "Mike",
  mode: "Execution Mode",
  health: 99,
  readiness: 76,
  activeBatch: "Post-Green Operational Buildout",
  lastUpdated: "2026-07-09 10:32 PT",
  currentStatus: {
    headline: "Main is green. Native runtime is compiling. Dashboard visibility is now being synced.",
    summary: "Kairos has moved past repository recovery into production hardening. The native iOS foundation is green on main, Command Center release-gate visibility has been merged, and the next work is batched to avoid burning GitHub Actions minutes after every small slice.",
    mainBranch: "Green",
    validationGate: "Manual iOS Validation passed on main after the Command Center release gate fix.",
    activePr: "PR #16 — Customer release gate detail view is open as the next unvalidated batch item.",
    actionsPolicy: "Skip-CI batching active. Run GitHub Actions only after meaningful batches are ready.",
    visibleDashboard: "Updated now so the browser view reflects current operational progress."
  },
  operationalReadiness: [
    { label: "Native iOS Foundation", value: "Green", complete: 78, status: "Live", detail: "SwiftUI shell, SwiftData model graph, Command Center runtime, Customer Portal, Design Studio, Workflow Runtime, Task Engine, Production Queue, Asset Management, Deliverables, and Release Runtime are compiling on main." },
    { label: "Command Center", value: "Release Gates Live", complete: 82, status: "Active", detail: "Executive runtime summary now separates draft/internal-review, blocked, publish-ready, and published customer releases." },
    { label: "Customer Portal", value: "Runtime Foundation", complete: 72, status: "Build", detail: "Value Discovery, request editing/detail surfaces, portal delivery models, and session support are staged in the native runtime." },
    { label: "Release Runtime", value: "Gate Policy Active", complete: 74, status: "Active", detail: "CustomerReleaseGatePolicy and approval service protect customer publication behind final-deliverable approval metadata." },
    { label: "Web Dashboard", value: "Visibility Sync", complete: 69, status: "Active", detail: "Static GitHub Pages dashboard now reflects real build state instead of stale dashboard state." },
    { label: "Production Hardening", value: "Batching", complete: 65, status: "Queued", detail: "Next slices should be grouped, committed with skip-CI, and validated once per batch to conserve Actions minutes." }
  ],
  liveMilestones: [
    "Main branch returned to green after fixing SwiftUI foreground style mismatch.",
    "PR #15 merged: Command Center release gate operations.",
    "Post-green operational prep documentation created.",
    "PR #16 opened: Customer release gate detail drill-down.",
    "Dashboard status updated for browser visibility.",
    "Actions-minute policy shifted to batch validation only."
  ],
  nextBatch: [
    { title: "Customer Release Gate Detail", lane: "Release Runtime", status: "Open PR", priority: "P1" },
    { title: "Seed preview/sample release records", lane: "Runtime Data", status: "Queued", priority: "P1" },
    { title: "Command Center navigation to release detail", lane: "Command Center", status: "Queued", priority: "P1" },
    { title: "Dashboard auto-status JSON source", lane: "Web Dashboard", status: "Queued", priority: "P2" },
    { title: "One batch validation run", lane: "GitHub", status: "Hold", priority: "P1" }
  ],
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
      metric: "82%",
      status: "Active",
      summary: "Executive decisions, runtime health, approvals, blockers, release gates, operational visibility, and next-best-action flow.",
      nodes: ["Decision Queue", "Execution Pipeline", "Release Gates", "Blockers", "Next Action"]
    },
    {
      id: "commerce",
      label: "Commerce",
      metric: "68%",
      status: "Build",
      summary: "Shopify, products, bundles, checkout offers, revenue capture, and value-to-income conversion paths remain queued behind runtime stabilization.",
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
      metric: "94%",
      status: "Protected",
      summary: "Runtime health, integrations, security, repository workflow, deployment discipline, rollback, and constitutional guardrails.",
      nodes: ["Runtime", "Integrations", "Security", "GitHub", "Deployment"]
    }
  ],
  brandDoctrine: {
    promise: "Your Knowledge Has Value.",
    support: "Helping you discover it, build it, and share it with the world.",
    positioning: "Build around the value only you can provide.",
    customerOutcome: "Turn knowledge, experience, skill, creativity, and perspective into durable digital assets and long-term opportunity.",
    messageSequence: ["Outcome", "Identity", "Agency", "Guidance", "System"],
    valuePathways: [
      {
        title: "Income Path",
        detail: "Help the customer identify practical ways their knowledge can support extra income without promising results."
      },
      {
        title: "Asset Path",
        detail: "Turn experience into reusable content, guides, products, services, education assets, and project libraries."
      },
      {
        title: "Audience Path",
        detail: "Translate lived skill and perspective into trustworthy public positioning and repeatable creator output."
      },
      {
        title: "Execution Path",
        detail: "Convert scattered ideas into concrete next actions, drafts, reviews, delivery steps, and reusable operating workflows."
      }
    ],
    forbiddenTone: ["Easy money", "Get rich quick", "Hype", "Shortcut promises", "Guaranteed income", "No-work claims"],
    approvedTone: ["Guidance", "Education", "Stewardship", "Execution", "Long-term value", "Practical opportunity"]
  },
  stewardshipDoctrine: {
    role: "Kairos is the steady guide that preserves context, recommends next actions, and helps users compound their body of work.",
    assetModel: "Ideas, posts, books, videos, services, products, lessons, and workflows should be connected into durable knowledge assets.",
    operatingRule: "Every surface should help the user become more capable, more organized, and closer to sharing value with the right audience.",
    customerGuidanceRule: "Every recommendation should connect the customer's existing knowledge to one stronger asset, one clearer message, or one more executable next step."
  },
  kpis: [
    { label: "System Health", value: "99%", trend: "main green", tone: "good" },
    { label: "Readiness", value: "76%", trend: "+7%", tone: "good" },
    { label: "Native Build", value: "Green", trend: "Manual iOS", tone: "good" },
    { label: "Actions Policy", value: "Batch", trend: "skip-CI", tone: "good" },
    { label: "Open Runtime PR", value: "#16", trend: "unvalidated", tone: "warning" }
  ],
  priorities: [
    { title: "Keep main green after Command Center release gate merge", lane: "GitHub", status: "Completed", priority: "P1" },
    { title: "Surface live operational progress on GitHub Pages dashboard", lane: "Dashboard", status: "Completed", priority: "P1" },
    { title: "Hold PR #16 validation until more batch work is ready", lane: "GitHub", status: "Active", priority: "P1" },
    { title: "Build customer release gate drill-down", lane: "Release Runtime", status: "Open PR", priority: "P1" },
    { title: "Prepare sample data for browser/native progress demos", lane: "Runtime Data", status: "Queued", priority: "P1" },
    { title: "Continue web dashboard sync so browser reflects real repo status", lane: "Web", status: "Active", priority: "P2" }
  ],
  approvals: [
    { title: "Approve next batch validation run only after several slices are ready", risk: "Low" },
    { title: "Merge PR #16 only after batch validation or further review", risk: "Medium" },
    { title: "Continue using dashboard as executive visibility surface", risk: "Low" }
  ],
  systems: [
    { title: "Kairos Dashboard", status: "Visibility Sync Active", health: 90 },
    { title: "Native iOS Runtime", status: "Main Green", health: 78 },
    { title: "GitHub Workflow", status: "Manual Batch Validation", health: 94 },
    { title: "Command Center", status: "Release Gates Active", health: 82 },
    { title: "Customer Portal", status: "Runtime Foundation", health: 72 },
    { title: "Release Runtime", status: "Gate Detail Queued", health: 74 }
  ],
  pipelines: [
    { label: "Native Runtime Foundation", complete: 78 },
    { label: "Command Center Operations", complete: 82 },
    { label: "Customer Portal Runtime", complete: 72 },
    { label: "Release Runtime", complete: 74 },
    { label: "Web Dashboard Visibility", complete: 69 },
    { label: "Production Hardening", complete: 65 }
  ],
  activity: [
    "Main branch green after Command Center foreground style fix.",
    "Command Center release gate operations merged into main.",
    "Customer release gate detail view opened as PR #16.",
    "GitHub Actions strategy shifted to batch validation only.",
    "Dashboard updated to show real operational status.",
    "Next target: batch visible status, sample data, and release detail work before next workflow run."
  ]
};