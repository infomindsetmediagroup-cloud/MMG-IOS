const modeGateKey = "kairos.dashboard.modeGate.v1";

const modeState = {
  dashboardMode: "Setup",
  buildMode: "Locked",
  transitionGate: "Dashboard Completion Acknowledgement Required",
  currentFocus: "Dashboard functionality before website/product execution"
};

function readGateAcknowledgement() {
  try {
    return JSON.parse(localStorage.getItem(modeGateKey) || "{}");
  } catch {
    return {};
  }
}

function writeGateAcknowledgement(next) {
  localStorage.setItem(modeGateKey, JSON.stringify(next));
  return next;
}

function setRuntimeModeLabel() {
  const mode = document.querySelector("#runtime-mode");
  if (!mode) return;
  const acknowledged = readGateAcknowledgement().dashboardComplete === true;
  mode.textContent = acknowledged ? "Build Ready" : "Setup";
}

function renderDashboardModeGatePanel() {
  setRuntimeModeLabel();

  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-dashboard-mode-gate-panel]")) return;

  const acknowledgement = readGateAcknowledgement();
  const isDashboardComplete = acknowledgement.dashboardComplete === true;

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.dashboardModeGatePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Operating Phase</p>
        <h3>Dashboard Setup Mode</h3>
      </div>
      <span class="badge warning">${isDashboardComplete ? "Build Ready" : "Setup"}</span>
    </div>
    <p class="muted">Kairos stays in dashboard setup mode until dashboard functionality is complete. Website pages, products, Shopify publishing, and live business execution remain locked behind the completion acknowledgement gate.</p>
    <div class="list" style="margin-top:16px;">
      <div class="list-item"><div><strong>Current Mode</strong><p class="muted">${modeState.currentFocus}</p></div><span class="badge warning">${modeState.dashboardMode}</span></div>
      <div class="list-item"><div><strong>Build Mode</strong><p class="muted">Activates after dashboard completion is acknowledged.</p></div><span class="badge">${isDashboardComplete ? "Ready" : modeState.buildMode}</span></div>
      <div class="list-item"><div><strong>Transition Gate</strong><p class="muted">${modeState.transitionGate}</p></div><span class="badge warning">Gate</span></div>
    </div>
  `;

  const completionGate = view.querySelector("[data-completion-gate-panel]");
  if (completionGate?.nextSibling) {
    view.insertBefore(card, completionGate.nextSibling);
  } else {
    view.prepend(card);
  }
}

export function acknowledgeDashboardCompletion() {
  const next = writeGateAcknowledgement({ dashboardComplete: true, acknowledgedAt: new Date().toISOString() });
  setRuntimeModeLabel();
  window.dispatchEvent(new CustomEvent("kairos:dashboard-completion-acknowledged", { detail: next }));
  return next;
}

const observer = new MutationObserver(() => renderDashboardModeGatePanel());

window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderDashboardModeGatePanel();
});

window.addEventListener("kairos:auth", renderDashboardModeGatePanel);
