export const aiOps = {
  score: 46,
  lastRun: "Phase 1 AI workforce architecture",
  activeQueue: "Operations Routing",
  workers: [
    { title: "Research Agent", lane: "Research", status: "Queued", strength: "Deep research and module sourcing" },
    { title: "Writing Agent", lane: "Content", status: "Queued", strength: "Knowledge articles, guides, and product copy" },
    { title: "Engineering Agent", lane: "Code", status: "Active", strength: "Dashboard and repository implementation" },
    { title: "Commerce Agent", lane: "Shopify", status: "Queued", strength: "Products, bundles, discounts, and reviews" },
    { title: "QA Agent", lane: "Validation", status: "Queued", strength: "Audit, verification, and release checks" }
  ],
  taskQueue: [
    { title: "Generate Website Audit Fix Batch", priority: "P1", status: "Queued" },
    { title: "Research Platform Income Modules", priority: "P1", status: "Queued" },
    { title: "Draft Free Vault Lead Magnet", priority: "P2", status: "Queued" },
    { title: "Prepare Judge.me Install Checklist", priority: "P2", status: "Queued" },
    { title: "Create Bundle Product Copy", priority: "P2", status: "Queued" }
  ],
  routingRules: [
    { title: "Code and repository work", route: "Engineering Agent", status: "Active" },
    { title: "Website and SEO findings", route: "QA Agent", status: "Queued" },
    { title: "Product copy and modules", route: "Writing Agent", status: "Queued" },
    { title: "Market and platform research", route: "Research Agent", status: "Queued" },
    { title: "Shopify product operations", route: "Commerce Agent", status: "Queued" }
  ]
};

export function aiMetrics() {
  return {
    score: aiOps.score,
    workers: aiOps.workers.length,
    queuedTasks: aiOps.taskQueue.filter(item => item.status !== "Complete").length,
    activeWorkers: aiOps.workers.filter(item => item.status === "Active").length,
    routingRules: aiOps.routingRules.length
  };
}
