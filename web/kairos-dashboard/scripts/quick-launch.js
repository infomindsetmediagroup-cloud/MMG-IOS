import { runCommand } from "./command-router.js";
import { runSiteAudit } from "./site-audit-runner.js";
import { runShopifyPreflight } from "./shopify-preflight-runner.js";
import { runRevenueFunnelBuild } from "./revenue-funnel-runner.js";
import { runBundleBuilder } from "./bundle-builder-runner.js";
import { runVaultBuilder } from "./vault-builder-runner.js";
import { runKnowledgeTaxonomyBuild } from "./knowledge-taxonomy-runner.js";
import { runCustomerPortalBuild } from "./customer-portal-runner.js";
import { runMilestoneValidation } from "./milestone-runner.js";
import { createGoldenMaster } from "./golden-master.js";
import { pushNotification } from "./notifications.js";

export const quickLaunchActions = [
  { id: "daily-ops", title: "Daily Ops", run: () => runCommand("CMD-WEB-AUDIT") },
  { id: "site-audit", title: "Website Audit", run: runSiteAudit },
  { id: "shopify", title: "Shopify Preflight", run: runShopifyPreflight },
  { id: "revenue", title: "Revenue Funnel", run: runRevenueFunnelBuild },
  { id: "bundle", title: "Bundle Builder", run: runBundleBuilder },
  { id: "vault", title: "Free Vault", run: runVaultBuilder },
  { id: "knowledge", title: "Knowledge Taxonomy", run: runKnowledgeTaxonomyBuild },
  { id: "customer", title: "Customer Portal", run: runCustomerPortalBuild },
  { id: "milestone", title: "Milestone", run: runMilestoneValidation },
  { id: "golden", title: "Golden Master", run: createGoldenMaster }
];

export function runQuickLaunch(id) {
  const action = quickLaunchActions.find(item => item.id === id);
  if (!action) return null;
  const result = action.run();
  pushNotification("Quick launch complete", `${action.title} executed from quick launch.`, "Success");
  return result;
}
