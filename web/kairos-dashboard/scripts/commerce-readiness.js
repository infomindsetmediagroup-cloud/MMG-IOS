import { productLaunchMetrics } from "./product-launch-packager.js";
import { deliveryBoardMetrics } from "./delivery-board.js";
import { pageChangeMetrics } from "./page-change-packager.js";
import { contentBatchMetrics } from "./content-batch-packager.js";
import { getShopifyPreflightRuns } from "./shopify-preflight-runner.js";

export function calculateCommerceReadiness() {
  const products = productLaunchMetrics();
  const delivery = deliveryBoardMetrics();
  const pages = pageChangeMetrics();
  const content = contentBatchMetrics();
  const preflight = getShopifyPreflightRuns()[0];

  const productScore = products.total ? Math.round((products.staged / products.total) * 100) : 0;
  const deliveryScore = delivery.total ? Math.round((delivery.staged / delivery.total) * 100) : 0;
  const pageScore = pages.total ? Math.round((pages.ready / pages.total) * 100) : 0;
  const contentScore = content.total ? Math.round((content.staged / content.total) * 100) : 0;
  const preflightScore = preflight?.score || 0;
  const score = Math.round((productScore + deliveryScore + pageScore + contentScore + preflightScore) / 5);

  return {
    score,
    productScore,
    deliveryScore,
    pageScore,
    contentScore,
    preflightScore,
    createdAt: new Date().toLocaleString()
  };
}

export function commerceReadinessStatus(score) {
  if (score >= 90) return "Launch Ready";
  if (score >= 70) return "Strong";
  if (score >= 45) return "Building";
  return "Early";
}
