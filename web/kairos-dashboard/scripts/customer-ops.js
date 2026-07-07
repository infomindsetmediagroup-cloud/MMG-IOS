export const customerOps = {
  score: 54,
  lastRun: "Phase 1 customer architecture",
  activePortal: "Customer Portal",
  queues: [
    { title: "Customer Portal access map", area: "Portal", status: "Queued", priority: "P1" },
    { title: "Vault entitlement record", area: "Vault", status: "Queued", priority: "P1" },
    { title: "License record template", area: "Licensing", status: "Queued", priority: "P1" },
    { title: "Download center structure", area: "Deliverables", status: "Queued", priority: "P2" },
    { title: "Review follow-up workflow", area: "Reviews", status: "Queued", priority: "P2" }
  ],
  accountTypes: [
    { title: "Free Vault Member", access: "Free", status: "Queued" },
    { title: "Product Customer", access: "Purchased", status: "Queued" },
    { title: "System Owner", access: "Premium", status: "Queued" },
    { title: "Commercial Rights Holder", access: "License", status: "Approval" }
  ],
  lifecycle: [
    { title: "Join Free Vault", stage: "Lead", status: "Queued" },
    { title: "Buy First Product", stage: "Customer", status: "Queued" },
    { title: "Access Vault", stage: "Activation", status: "Queued" },
    { title: "Review Product", stage: "Trust", status: "Queued" },
    { title: "Upgrade System", stage: "Expansion", status: "Queued" }
  ]
};

export function customerMetrics() {
  return {
    score: customerOps.score,
    queues: customerOps.queues.length,
    accountTypes: customerOps.accountTypes.length,
    lifecycle: customerOps.lifecycle.length,
    approvals: customerOps.accountTypes.filter(item => item.status === "Approval").length
  };
}
