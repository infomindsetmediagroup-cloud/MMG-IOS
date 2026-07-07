import { kairosState } from "./state.js";
import { bundlePackages } from "./bundles.js";
import { websiteAudit } from "./website-ops.js";
import { shopifyOps } from "./shopify-ops.js";
import { knowledgeOps } from "./knowledge-ops.js";
import { revenueOps } from "./revenue-ops.js";
import { customerOps } from "./customer-ops.js";
import { aiOps } from "./ai-ops.js";
import { systemOps } from "./system-ops.js";

function normalize(value) {
  return String(value || "").toLowerCase();
}

function flattenRecord(source, record, module = source) {
  return {
    source,
    module,
    title: record.title || record.label || record.id || source,
    detail: record.detail || record.status || record.priority || record.area || record.access || record.type || record.trigger || record.stage || record.route || record.destination || "Kairos record",
    raw: record
  };
}

export function buildSearchIndex() {
  return [
    ...kairosState.modules.map(item => flattenRecord("Module", item, item.id)),
    ...kairosState.priorities.map(item => flattenRecord("Priority", item, item.lane)),
    ...kairosState.approvals.map(item => flattenRecord("Approval", item, "Approvals")),
    ...bundlePackages.map(item => flattenRecord("Bundle", item, "Bundles")),
    ...websiteAudit.findings.map(item => flattenRecord("Website Finding", item, "Website Ops")),
    ...websiteAudit.opportunities.map(item => flattenRecord("Website Opportunity", { title: item, status: "Queued" }, "Website Ops")),
    ...shopifyOps.queues.map(item => flattenRecord("Shopify Queue", item, "Shopify")),
    ...shopifyOps.productHealth.map(item => flattenRecord("Product Health", item, "Shopify")),
    ...knowledgeOps.categories.map(item => flattenRecord("Knowledge Category", item, "Knowledge")),
    ...knowledgeOps.vaultPackages.map(item => flattenRecord("Vault Package", item, "Knowledge")),
    ...knowledgeOps.moduleQueue.map(item => flattenRecord("Knowledge Module", item, "Knowledge")),
    ...revenueOps.funnels.map(item => flattenRecord("Revenue Funnel", item, "Revenue")),
    ...revenueOps.offers.map(item => flattenRecord("Revenue Offer", item, "Revenue")),
    ...customerOps.queues.map(item => flattenRecord("Customer Queue", item, "Customers")),
    ...customerOps.accountTypes.map(item => flattenRecord("Customer Account", item, "Customers")),
    ...aiOps.workers.map(item => flattenRecord("AI Worker", item, "AI Workforce")),
    ...aiOps.taskQueue.map(item => flattenRecord("AI Task", item, "AI Workforce")),
    ...systemOps.integrations.map(item => flattenRecord("Integration", item, "System")),
    ...systemOps.safeguards.map(item => flattenRecord("Safeguard", item, "System")),
    ...systemOps.releaseQueue.map(item => flattenRecord("Release Item", item, "System"))
  ];
}

export function searchKairos(query) {
  const term = normalize(query);
  if (!term) return [];
  return buildSearchIndex()
    .filter(item => [item.source, item.module, item.title, item.detail].some(value => normalize(value).includes(term)))
    .slice(0, 12);
}
