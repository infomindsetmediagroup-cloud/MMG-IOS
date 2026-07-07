import { getLiveWorkQueue } from "./live-work-queue.js";
import { getSiteAuditRuns } from "./site-audit-runner.js";
import { getShopifyPreflightRuns } from "./shopify-preflight-runner.js";
import { getRevenueFunnelRuns } from "./revenue-funnel-runner.js";
import { getBundleBuilderRuns } from "./bundle-builder-runner.js";
import { getVaultBuilderRuns } from "./vault-builder-runner.js";
import { getKnowledgeTaxonomyRuns } from "./knowledge-taxonomy-runner.js";
import { getCustomerPortalRuns } from "./customer-portal-runner.js";

export function buildActionOutputs() {
  const work = getLiveWorkQueue();
  const outputs = [
    { id: "OUT-001", title: "Latest Website Sweep", source: "Website", status: getSiteAuditRuns()[0] ? "Generated" : "Waiting", detail: getSiteAuditRuns()[0] ? `Score ${getSiteAuditRuns()[0].score}%` : "Run Website Audit first." },
    { id: "OUT-002", title: "Latest Shopify Queue", source: "Shopify", status: getShopifyPreflightRuns()[0] ? "Generated" : "Waiting", detail: getShopifyPreflightRuns()[0] ? `Score ${getShopifyPreflightRuns()[0].score}%` : "Run Shopify Preflight first." },
    { id: "OUT-003", title: "Latest Revenue Funnel Package", source: "Revenue", status: getRevenueFunnelRuns()[0] ? "Generated" : "Waiting", detail: getRevenueFunnelRuns()[0] ? `Score ${getRevenueFunnelRuns()[0].score}%` : "Run Revenue Funnel first." },
    { id: "OUT-004", title: "Latest Bundle Package", source: "Product", status: getBundleBuilderRuns()[0] ? "Generated" : "Waiting", detail: getBundleBuilderRuns()[0] ? `Score ${getBundleBuilderRuns()[0].score}%` : "Run Bundle Builder first." },
    { id: "OUT-005", title: "Latest Vault Package", source: "Lead Capture", status: getVaultBuilderRuns()[0] ? "Generated" : "Waiting", detail: getVaultBuilderRuns()[0] ? `Score ${getVaultBuilderRuns()[0].score}%` : "Run Free Vault first." },
    { id: "OUT-006", title: "Latest Knowledge Package", source: "Publishing", status: getKnowledgeTaxonomyRuns()[0] ? "Generated" : "Waiting", detail: getKnowledgeTaxonomyRuns()[0] ? `Score ${getKnowledgeTaxonomyRuns()[0].score}%` : "Run Knowledge Taxonomy first." },
    { id: "OUT-007", title: "Latest Customer Portal Package", source: "Customer Ops", status: getCustomerPortalRuns()[0] ? "Generated" : "Waiting", detail: getCustomerPortalRuns()[0] ? `Score ${getCustomerPortalRuns()[0].score}%` : "Run Customer Portal first." }
  ];

  return outputs.map(output => ({
    ...output,
    relatedWork: work.find(item => item.lane === output.source || output.source.includes(item.lane))?.status || "Unlinked"
  }));
}

export function actionOutputMetrics() {
  const outputs = buildActionOutputs();
  return {
    total: outputs.length,
    generated: outputs.filter(item => item.status === "Generated").length,
    waiting: outputs.filter(item => item.status === "Waiting").length
  };
}
