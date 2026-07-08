const validGroupStatuses = ["Live", "Build", "Active", "Protected", "Queued", "Ready", "Completed"];
const validTones = ["good", "warning", "danger"];

function clampPercent(value, fallback = 0) {
  const numeric = Number(String(value).replace("%", ""));
  return Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : fallback));
}

function asText(value, fallback = "") {
  return String(value || fallback);
}

function asArray(items) {
  return Array.isArray(items) ? items : [];
}

function normalizeStatus(status, fallback = "Queued") {
  const value = asText(status, fallback);
  return validGroupStatuses.includes(value) ? value : fallback;
}

function normalizeTone(tone) {
  const value = asText(tone, "good");
  return validTones.includes(value) ? value : "good";
}

function normalizeModule(module, index) {
  return {
    id: asText(module?.id, `module-${index + 1}`),
    label: asText(module?.label, "Module"),
    icon: asText(module?.icon, "•")
  };
}

function normalizeCoreGroup(group, index) {
  const health = clampPercent(group?.metric, 0);
  return {
    id: asText(group?.id, `group-${index + 1}`),
    label: asText(group?.label, "Kairos"),
    metric: `${health}%`,
    status: normalizeStatus(group?.status),
    summary: asText(group?.summary, "System details are queued for configuration."),
    nodes: asArray(group?.nodes).map(node => asText(node, "Node")).slice(0, 5)
  };
}

function normalizePathway(path, index) {
  return {
    title: asText(path?.title, `Path ${index + 1}`),
    detail: asText(path?.detail, "Pathway details are queued for configuration.")
  };
}

function normalizeBrandDoctrine(doctrine = {}) {
  return {
    promise: asText(doctrine.promise, "Your Knowledge Has Value."),
    support: asText(doctrine.support, "Helping you discover it, build it, and share it with the world."),
    positioning: asText(doctrine.positioning, "Build around the value only you can provide."),
    customerOutcome: asText(doctrine.customerOutcome, "Turn knowledge, experience, skill, creativity, and perspective into durable digital assets and long-term opportunity."),
    messageSequence: asArray(doctrine.messageSequence).map(step => asText(step, "Message Layer")),
    valuePathways: asArray(doctrine.valuePathways).map(normalizePathway),
    forbiddenTone: asArray(doctrine.forbiddenTone).map(rule => asText(rule, "Avoid hype")),
    approvedTone: asArray(doctrine.approvedTone).map(rule => asText(rule, "Use guidance"))
  };
}

function normalizeStewardshipDoctrine(doctrine = {}) {
  return {
    role: asText(doctrine.role, "Kairos is the steady guide that preserves context, recommends next actions, and helps users compound their body of work."),
    assetModel: asText(doctrine.assetModel, "Ideas, posts, books, videos, services, products, lessons, and workflows should be connected into durable knowledge assets."),
    operatingRule: asText(doctrine.operatingRule, "Every surface should help the user become more capable, more organized, and closer to sharing value with the right audience."),
    customerGuidanceRule: asText(doctrine.customerGuidanceRule, "Every recommendation should connect the customer's existing knowledge to one stronger asset, one clearer message, or one more executable next step.")
  };
}

function normalizeKpi(item) {
  return {
    label: asText(item?.label, "Metric"),
    value: asText(item?.value, "0"),
    trend: asText(item?.trend, "Stable"),
    tone: normalizeTone(item?.tone)
  };
}

function normalizePriority(item) {
  return {
    title: asText(item?.title, "Untitled Priority"),
    lane: asText(item?.lane, "System"),
    status: asText(item?.status, "Queued"),
    priority: asText(item?.priority, "P2")
  };
}

function normalizeApproval(item) {
  return {
    title: asText(item?.title, "Untitled Approval"),
    risk: asText(item?.risk, "Medium")
  };
}

function normalizeSystem(item) {
  return {
    title: asText(item?.title, "System"),
    status: asText(item?.status, "Queued"),
    health: clampPercent(item?.health, 0)
  };
}

function normalizePipeline(item) {
  return {
    label: asText(item?.label, "Pipeline"),
    complete: clampPercent(item?.complete, 0)
  };
}

function normalizeState(state) {
  return {
    operator: asText(state.operator, "Mike"),
    mode: asText(state.mode, "Operation"),
    health: clampPercent(state.health, 0),
    readiness: clampPercent(state.readiness, 0),
    activeBatch: asText(state.activeBatch, "Kairos Runtime"),
    modules: asArray(state.modules).map(normalizeModule),
    coreGroups: asArray(state.coreGroups).map(normalizeCoreGroup),
    brandDoctrine: normalizeBrandDoctrine(state.brandDoctrine),
    stewardshipDoctrine: normalizeStewardshipDoctrine(state.stewardshipDoctrine),
    kpis: asArray(state.kpis).map(normalizeKpi),
    priorities: asArray(state.priorities).map(normalizePriority),
    approvals: asArray(state.approvals).map(normalizeApproval),
    systems: asArray(state.systems).map(normalizeSystem),
    pipelines: asArray(state.pipelines).map(normalizePipeline),
    activity: asArray(state.activity).map(item => asText(item, "Runtime activity recorded."))
  };
}

export const kairosState = normalizeState({
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
    { label: "System Health", value: "98%", trend: "+1%", tone: "good" },
    { label: "Readiness", value: "69%", trend: "+5%", tone: "good" },
    { label: "Doctrine Lock", value: "Live", trend: "Customer Value", tone: "good" },
    { label: "Operation Mode", value: "Live", trend: "Skip-CI", tone: "good" },
    { label: "Value Pathways", value: "4", trend: "Income / Asset / Audience / Execution", tone: "good" }
  ],
  priorities: [
    { title: "Carry customer value doctrine into dashboard runtime", lane: "Dashboard", status: "Completed", priority: "P1" },
    { title: "Wire customer value pathways into runtime state", lane: "Dashboard", status: "Completed", priority: "P1" },
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
    { title: "Kairos Dashboard", status: "Customer Value Runtime", health: 92 },
    { title: "Official Kairos Asset", status: "Ready", health: 100 },
    { title: "GitHub Workflow", status: "Skip-CI batching active", health: 92 },
    { title: "Website System", status: "Queued", health: 70 },
    { title: "Shopify Operations", status: "Queued", health: 68 }
  ],
  pipelines: [
    { label: "Dashboard Completion", complete: 84 },
    { label: "Asset Integration", complete: 84 },
    { label: "Website System Queue", complete: 58 },
    { label: "Shopify Prep", complete: 60 }
  ],
  activity: [
    "Customer value doctrine locked into dashboard runtime.",
    "Brand promise set to Your Knowledge Has Value.",
    "Guidance and knowledge stewardship state seeded.",
    "Value pathways seeded into dashboard state.",
    "Dashboard state switched into Customer Value Runtime.",
    "GitHub commit strategy locked to skip-CI batching until final validation."
  ]
});
