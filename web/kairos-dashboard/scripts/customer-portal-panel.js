import {
  getCustomerPortalRuns,
  runCustomerPortalBuild,
  getValueDiscoveryFields,
  getCustomerValueProfile,
  saveCustomerValueProfile,
  getKairosRecommendations,
  deriveKairosRecommendations
} from "./customer-portal-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ready") return "badge good";
  if (normalized === "needs setup") return "badge warning";
  return "badge";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderFields(profile) {
  return getValueDiscoveryFields().map(field => `
    <label class="value-discovery-field">
      <strong>${escapeHtml(field.label)}</strong>
      <span class="muted">${escapeHtml(field.prompt)}</span>
      <textarea data-field="${escapeHtml(field.id)}" rows="2">${escapeHtml(profile[field.id])}</textarea>
    </label>
  `).join("");
}

function renderRecommendations(items) {
  return items.map(item => `
    <div class="list-item" data-value-recommendation>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p class="muted">${escapeHtml(item.lane)} - ${escapeHtml(item.detail)}</p>
      </div>
      <span class="badge good">Kairos</span>
    </div>
  `).join("");
}

function readDraftProfile(card) {
  const input = {};
  card.querySelectorAll("[data-field]").forEach(field => {
    input[field.dataset.field] = field.value;
  });
  return input;
}

function refreshDraftRecommendations(card) {
  const list = card.querySelector("[data-value-recommendations]");
  if (!list) return;
  const recommendations = deriveKairosRecommendations(readDraftProfile(card));
  list.innerHTML = renderRecommendations(recommendations);
}

function renderCustomerPortalPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-customer-portal-panel]")) return;

  const latest = getCustomerPortalRuns()[0];
  const profile = getCustomerValueProfile();
  const recommendations = getKairosRecommendations();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.customerPortalPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Customers</p>
        <h3>Your Knowledge Has Value.</h3>
      </div>
      <span class="badge ${latest ? "warning" : "good"}">${latest ? `${escapeHtml(latest.score)}%` : "Ready"}</span>
    </div>
    <p class="muted">Capture knowledge, expertise, skills, professional experience, life experience, interests, and desired outcomes so Kairos can recommend the next useful asset or action.</p>
    <div class="action-row">
      <button class="action-button" data-run-customer-portal>Map Customer Portal</button>
      <button class="action-button" data-save-value-discovery>Save Value Discovery</button>
    </div>
    <div class="value-discovery-grid" style="margin-top:16px;">${renderFields(profile)}</div>
    <div class="list" style="margin-top:16px;">
      <div class="list-item"><div><strong>Value Discovery Profile</strong><p class="muted">Completion: ${escapeHtml(profile.completionScore || 0)}%</p></div><span class="badge good">Profile</span></div>
      <div data-value-recommendations>${renderRecommendations(recommendations)}</div>
      ${latest ? latest.items.map(item => `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p class="muted">${escapeHtml(item.lane)} - ${escapeHtml(latest.createdAt)}</p>
          </div>
          <span class="${badgeClass(item.status)}">${escapeHtml(item.status)}</span>
        </div>
      `).join("") : `<div class="list-item"><strong>No customer portal run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-field]").forEach(field => {
    field.addEventListener("input", () => refreshDraftRecommendations(card));
  });

  card.querySelector("[data-run-customer-portal]").addEventListener("click", () => {
    runCustomerPortalBuild();
    card.remove();
    renderCustomerPortalPanel();
  });

  card.querySelector("[data-save-value-discovery]").addEventListener("click", () => {
    saveCustomerValueProfile(readDraftProfile(card));
    card.remove();
    renderCustomerPortalPanel();
  });
}

const observer = new MutationObserver(() => renderCustomerPortalPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCustomerPortalPanel();
});

window.addEventListener("kairos:auth", renderCustomerPortalPanel);
