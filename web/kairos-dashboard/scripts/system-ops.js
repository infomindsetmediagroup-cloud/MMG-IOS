export const systemOps = {
  score: 63,
  lastRun: "Phase 1 system architecture",
  activeMode: "GitHub Pages Runtime",
  integrations: [
    { title: "GitHub Repository", status: "Active", health: 94 },
    { title: "GitHub Pages", status: "Active", health: 92 },
    { title: "Shopify", status: "Queued", health: 69 },
    { title: "Judge.me", status: "Queued", health: 66 },
    { title: "Vault Access Layer", status: "Queued", health: 54 },
    { title: "Persistent Database", status: "Planned", health: 28 }
  ],
  safeguards: [
    { title: "Use skip ci during active dashboard work", priority: "P1", status: "Active" },
    { title: "Batch repository changes before validation", priority: "P1", status: "Active" },
    { title: "Reserve GitHub Actions minutes for milestone checks", priority: "P1", status: "Active" },
    { title: "Keep GitHub Pages as live dashboard target", priority: "P2", status: "Active" },
    { title: "Avoid parallel dashboard forks", priority: "P2", status: "Active" }
  ],
  releaseQueue: [
    { title: "Phase 1 command centers online", status: "Active", priority: "P1" },
    { title: "Authentication shell", status: "Queued", priority: "P1" },
    { title: "Persistent runtime store", status: "Queued", priority: "P1" },
    { title: "Shopify API planning package", status: "Queued", priority: "P2" },
    { title: "Golden Master snapshot", status: "Queued", priority: "P2" }
  ]
};

export function systemMetrics() {
  return {
    score: systemOps.score,
    integrations: systemOps.integrations.length,
    active: systemOps.integrations.filter(item => item.status === "Active").length,
    safeguards: systemOps.safeguards.length,
    releaseItems: systemOps.releaseQueue.length
  };
}
