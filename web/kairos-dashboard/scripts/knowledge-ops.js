export const knowledgeOps = {
  score: 61,
  activeVault: "Free Vault",
  lastRun: "Phase 1 knowledge architecture",
  categories: [
    { title: "AI", items: 12, status: "Seeding" },
    { title: "Publishing", items: 9, status: "Seeding" },
    { title: "Content Creation", items: 14, status: "Seeding" },
    { title: "Business Systems", items: 8, status: "Queued" },
    { title: "Platform Income", items: 11, status: "Queued" },
    { title: "Mindset", items: 6, status: "Queued" }
  ],
  vaultPackages: [
    { title: "AI Prompt Starter Pack", access: "Free", status: "Ready" },
    { title: "Creator Starter Kit", access: "Free", status: "Queued" },
    { title: "Publishing Checklist", access: "Free", status: "Queued" },
    { title: "Entrepreneur OS Modules", access: "Paid", status: "Queued" },
    { title: "Commercial Rights Resources", access: "License", status: "Approval" }
  ],
  moduleQueue: [
    { title: "Brand Yourself System", priority: "P1", status: "Queued" },
    { title: "AI Income Pipeline", priority: "P1", status: "Queued" },
    { title: "KDP Publishing Pipeline", priority: "P2", status: "Queued" },
    { title: "TikTok Shop Revenue Pipeline", priority: "P2", status: "Queued" },
    { title: "Marketplace Resale Pipeline", priority: "P2", status: "Queued" }
  ]
};

export function knowledgeMetrics() {
  return {
    score: knowledgeOps.score,
    categories: knowledgeOps.categories.length,
    vaultItems: knowledgeOps.vaultPackages.length,
    queuedModules: knowledgeOps.moduleQueue.filter(item => item.status !== "Complete").length
  };
}
