import { createRevenueLiveController, projectRevenueLiveView } from "./kairos-revenue-live-controller.js";

export const KAIROS_REVENUE_LIVE_PANEL_BUILD = "kairos-revenue-live-panel-20260728-1";

export function mountRevenueLivePanel(root, options = {}) {
  if (!root) throw new Error("Revenue live panel root is required.");
  const controller = createRevenueLiveController(options);
  let state = null;

  async function refresh(runId) {
    const payload = await controller.load(runId);
    state = projectRevenueLiveView(payload);
    render(root, state);
    return state;
  }

  async function executeNext(runId) {
    if (!state?.exactConfirmation) throw new Error("The current stage confirmation is unavailable.");
    await controller.executeNext(runId, { confirmation: state.exactConfirmation });
    return refresh(runId);
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-kairos-revenue-execute]");
    if (!button || button.disabled) return;
    button.disabled = true;
    executeNext(button.dataset.runId).catch((error) => renderError(root, error)).finally(() => { button.disabled = false; });
  });

  return Object.freeze({ refresh, executeNext, getState: () => state, build: KAIROS_REVENUE_LIVE_PANEL_BUILD });
}

function render(root, view) {
  root.innerHTML = `<section class="kairos-revenue-live" aria-live="polite"><header><p>Revenue Product</p><h2>${escapeHtml(view.revenueProductId || "First Revenue Run")}</h2></header><div class="kairos-revenue-metrics"><strong>${view.progressPercent}%</strong><span>${view.completedStages}/${view.totalStages} stages</span><span>${view.assets.ready}/${view.assets.total} assets ready</span><span>${view.jobs.completed}/${view.jobs.total} jobs complete</span></div><p>Current stage: <b>${escapeHtml(view.currentStage || "Complete")}</b></p><button type="button" data-kairos-revenue-execute data-run-id="${escapeHtml(view.runId || "")}" ${view.canExecute ? "" : "disabled"}>Execute Next Stage</button><small>Automatic Shopify publication is disabled.</small></section>`;
}

function renderError(root, error) { root.insertAdjacentHTML("beforeend", `<p role="alert">${escapeHtml(error?.message || "Revenue execution failed.")}</p>`); }
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
