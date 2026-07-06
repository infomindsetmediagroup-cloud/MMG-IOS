export const shopifyOps = {
  score: 69,
  store: "themindsetmediagroup.com",
  lastRun: "Phase 1 commerce audit",
  queues: [
    {
      id: "SHOP-001",
      area: "Judge.me",
      severity: "Critical",
      title: "Install product review widgets",
      detail: "Product page template needs star summary, review count, full widget, and verified buyer trust block.",
      status: "Open"
    },
    {
      id: "SHOP-002",
      area: "Bundles",
      severity: "High",
      title: "Create Creator Launch Bundle listing",
      detail: "Bundle package needs product page, pricing, included items, vault entitlement, and checkout path.",
      status: "Queued"
    },
    {
      id: "SHOP-003",
      area: "Discounts",
      severity: "High",
      title: "Stage first-order checkout offer",
      detail: "Create controlled discount offer for checkout recovery without adding another Shopify app.",
      status: "Queued"
    },
    {
      id: "SHOP-004",
      area: "Products",
      severity: "Medium",
      title: "Normalize product template",
      detail: "All products need consistent offer sections, deliverables, trust proof, FAQs, and related modules.",
      status: "Queued"
    },
    {
      id: "SHOP-005",
      area: "Navigation",
      severity: "Medium",
      title: "Add System Vault commerce route",
      detail: "Storefront needs a visible route from product purchase to vault access and updates.",
      status: "Queued"
    }
  ],
  productHealth: [
    { title: "Creators Bible", score: 82, status: "Needs review widget" },
    { title: "AI Prompting for Beginners", score: 76, status: "Needs bundle mapping" },
    { title: "The Failure Advantage", score: 72, status: "Needs cross-sells" },
    { title: "Creator Launch Bundle", score: 54, status: "Listing required" }
  ],
  judgeMe: {
    installed: true,
    widgetStatus: "Template placement required",
    requiredBlocks: ["Star rating", "Review count", "Full review widget", "Write review button", "Verified buyer badge"]
  }
};

export function shopifyMetrics() {
  return {
    score: shopifyOps.score,
    open: shopifyOps.queues.filter(item => item.status !== "Complete").length,
    critical: shopifyOps.queues.filter(item => item.severity === "Critical").length,
    high: shopifyOps.queues.filter(item => item.severity === "High").length,
    products: shopifyOps.productHealth.length
  };
}
