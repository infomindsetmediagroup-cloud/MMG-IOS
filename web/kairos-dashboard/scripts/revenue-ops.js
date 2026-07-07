export const revenueOps = {
  score: 57,
  lastRun: "Phase 1 revenue architecture",
  activeFunnel: "Free Vault Capture",
  funnels: [
    { title: "Welcome Popup", trigger: "5 to 10 seconds", status: "Queued", impact: "High" },
    { title: "Checkout Discount Offer", trigger: "Before checkout", status: "Queued", impact: "High" },
    { title: "Free Vault Email Capture", trigger: "Homepage and vault entry", status: "Queued", impact: "High" },
    { title: "Creator Launch Bundle Upsell", trigger: "Book and AI product pages", status: "Queued", impact: "Medium" },
    { title: "Post Purchase Review Flow", trigger: "7 to 14 days after order", status: "Queued", impact: "Medium" }
  ],
  offers: [
    { title: "Free Vault Access", type: "Lead Magnet", status: "Queued" },
    { title: "10 Percent First Order", type: "Discount", status: "Approval" },
    { title: "Creator Launch Bundle", type: "Bundle", status: "Ready" },
    { title: "Entrepreneur OS Upgrade", type: "Upsell", status: "Queued" }
  ],
  analytics: [
    { label: "Email Capture", value: "0%", status: "Not connected" },
    { label: "Bundle Attachment", value: "0%", status: "Not connected" },
    { label: "Checkout Recovery", value: "0%", status: "Not connected" },
    { label: "Average Order Value", value: "$0", status: "Not connected" }
  ]
};

export function revenueMetrics() {
  return {
    score: revenueOps.score,
    funnels: revenueOps.funnels.length,
    offers: revenueOps.offers.length,
    approvals: revenueOps.offers.filter(item => item.status === "Approval").length,
    queued: revenueOps.funnels.filter(item => item.status === "Queued").length
  };
}
