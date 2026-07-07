import { calculateCommerceReadiness } from "./commerce-readiness.js";
import { calculateReadinessScore } from "./readiness-score.js";
import { deliveryBoardMetrics } from "./delivery-board.js";
import { productLaunchMetrics } from "./product-launch-packager.js";
import { pageChangeMetrics } from "./page-change-packager.js";

export function buildLaunchReadinessBoard() {
  const system = calculateReadinessScore();
  const commerce = calculateCommerceReadiness();
  const delivery = deliveryBoardMetrics();
  const products = productLaunchMetrics();
  const pages = pageChangeMetrics();

  return [
    { title: "System Readiness", value: `${system.score}%`, status: system.score >= 75 ? "Strong" : "Build" },
    { title: "Commerce Readiness", value: `${commerce.score}%`, status: commerce.score >= 70 ? "Strong" : "Build" },
    { title: "Products Staged", value: `${products.staged}/${products.total}`, status: products.staged ? "Active" : "Draft" },
    { title: "Delivery Staged", value: `${delivery.staged}/${delivery.total}`, status: delivery.staged ? "Active" : "Draft" },
    { title: "Page Changes Ready", value: `${pages.ready}/${pages.total}`, status: pages.ready ? "Active" : "Draft" }
  ];
}
