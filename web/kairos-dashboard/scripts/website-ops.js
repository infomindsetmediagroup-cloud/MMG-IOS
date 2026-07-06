export const websiteAudit = {
  site: "https://themindsetmediagroup.com/",
  score: 72,
  lastRun: "Phase 1 seed audit",
  findings: [
    {
      id: "WEB-001",
      severity: "Critical",
      area: "Knowledge Library",
      title: "Verify Knowledge Library route",
      detail: "Primary navigation must resolve to a live learning hub with categories, internal links, and lead capture paths.",
      status: "Open"
    },
    {
      id: "WEB-002",
      severity: "High",
      area: "Conversion",
      title: "Add Free Vault email capture path",
      detail: "Homepage needs a first-visit opt-in path for free resources before visitors leave or purchase.",
      status: "Queued"
    },
    {
      id: "WEB-003",
      severity: "High",
      area: "Revenue",
      title: "Install checkout discount offer plan",
      detail: "Pre-checkout offer should present a controlled first-order discount without adding extra Shopify apps.",
      status: "Queued"
    },
    {
      id: "WEB-004",
      severity: "High",
      area: "Trust",
      title: "Validate Judge.me product widgets",
      detail: "Product templates need star ratings, review count, full review widget, and verified buyer trust block.",
      status: "Queued"
    },
    {
      id: "WEB-005",
      severity: "Medium",
      area: "Navigation",
      title: "Add System Vault as top-level destination",
      detail: "System Vault should become a visible return path for free resources, purchased assets, bundles, and licenses.",
      status: "Queued"
    },
    {
      id: "WEB-006",
      severity: "Medium",
      area: "Products",
      title: "Normalize product page structure",
      detail: "All products should share the same offer, outcome, deliverable, FAQ, review, and cross-sell sections.",
      status: "Queued"
    }
  ],
  opportunities: [
    "Create Free Vault lead magnet block on homepage",
    "Build System Vault landing page",
    "Create Knowledge Library category map",
    "Add product health scoring to catalog workflow",
    "Create first bundle landing page for Creator Launch Bundle"
  ]
};

export function websiteMetrics() {
  const critical = websiteAudit.findings.filter(item => item.severity === "Critical").length;
  const high = websiteAudit.findings.filter(item => item.severity === "High").length;
  const open = websiteAudit.findings.filter(item => item.status !== "Complete").length;
  return {
    score: websiteAudit.score,
    critical,
    high,
    open,
    opportunities: websiteAudit.opportunities.length
  };
}
