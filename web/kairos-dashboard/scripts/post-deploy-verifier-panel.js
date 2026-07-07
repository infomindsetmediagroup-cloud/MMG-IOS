import { getPostDeployVerifierRuns, postDeployVerifierMetrics, runPostDeployVerifier } from "./post-deploy-verifier.js";

function badgeClass(status) {
  return status === "Ready" || status === "Pass" ? "badge good" : "badge warning";
}

function renderPostDeployVerifierPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-post-deploy-verifier-panel]")) return;

  const runs = getPostDeployVerifierRuns();
  const metrics = postDeployVerifierMetrics();
  const latest = runs[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.postDeployVerifierPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Verification</p><h3>Post Deploy Verifier</h3></div>
      <span class="badge good">${metrics.ready}/${metrics.total}</span>
    </div>
    <div class="action-row"><button class="action-button" data-run-post-deploy>Run Verification</button></div>
    <div class="list" style="margin-top:16px;">
      ${(latest?.checks || [{ title: "No verification run", status: "Hold" }]).map(item => `
        <div class="list-item"><strong>${item.title}</strong><span class="${badgeClass(item.status)}">${item.status}</span></div>
      `).join("")}
      ${latest ? `<div class="list-item"><strong>Latest Score</strong><span class="${badgeClass(latest.status)}">${latest.score}%</span></div>` : ""}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-post-deploy]").addEventListener("click", () => {
    runPostDeployVerifier();
    card.remove();
    renderPostDeployVerifierPanel();
  });
}

const observer = new MutationObserver(() => renderPostDeployVerifierPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderPostDeployVerifierPanel();
});
window.addEventListener("kairos:auth", renderPostDeployVerifierPanel);
