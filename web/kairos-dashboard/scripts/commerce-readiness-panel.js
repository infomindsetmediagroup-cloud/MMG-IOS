import { calculateCommerceReadiness, commerceReadinessStatus } from "./commerce-readiness.js";

function badgeClass(score) {
  if (score >= 80) return "badge good";
  if (score >= 45) return "badge warning";
  return "badge danger";
}

function renderCommerceReadinessPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-commerce-readiness-panel]")) return;

  const readiness = calculateCommerceReadiness();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.commerceReadinessPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Commerce</p><h3>Commerce Readiness Score</h3></div>
      <span class="${badgeClass(readiness.score)}">${commerceReadinessStatus(readiness.score)}</span>
    </div>
    <p class="metric">${readiness.score}%</p>
    <div class="list">
      <div class="list-item"><strong>Product Packages</strong><span class="${badgeClass(readiness.productScore)}">${readiness.productScore}%</span></div>
      <div class="list-item"><strong>Delivery Packages</strong><span class="${badgeClass(readiness.deliveryScore)}">${readiness.deliveryScore}%</span></div>
      <div class="list-item"><strong>Page Changes</strong><span class="${badgeClass(readiness.pageScore)}">${readiness.pageScore}%</span></div>
      <div class="list-item"><strong>Content Batches</strong><span class="${badgeClass(readiness.contentScore)}">${readiness.contentScore}%</span></div>
      <div class="list-item"><strong>Shopify Preflight</strong><span class="${badgeClass(readiness.preflightScore)}">${readiness.preflightScore}%</span></div>
    </div>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderCommerceReadinessPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCommerceReadinessPanel();
});
window.addEventListener("kairos:auth", renderCommerceReadinessPanel);
