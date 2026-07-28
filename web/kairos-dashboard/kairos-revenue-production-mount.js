import { mountRevenueLivePanel } from "./kairos-revenue-live-panel.js";
import { createRevenueLiveController, projectRevenueLiveView } from "./kairos-revenue-live-controller.js";

export const KAIROS_REVENUE_PRODUCTION_MOUNT_BUILD = "kairos-revenue-production-mount-20260728-1";

export function mountKairosRevenueProduction(options = {}) {
  const root = resolveRoot(options.root);
  if (!root) throw new Error("Revenue dashboard mount target was not found.");
  const controller = createRevenueLiveController(options);
  const state = { payload: null, view: null, error: null, loading: false };

  async function refresh() {
    state.loading = true;
    render();
    try {
      state.payload = await controller.load(options.runId);
      state.view = projectRevenueLiveView(state.payload);
      state.error = null;
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      render();
    }
    return state.view;
  }

  async function executeNext(input = {}) {
    if (!state.view?.canExecute) throw new Error("The current revenue stage is not executable.");
    const confirmation = input.confirmation || state.view.exactConfirmation;
    const result = await controller.executeNext(options.runId, { ...input, confirmation });
    await refresh();
    return result;
  }

  function render() {
    root.dataset.kairosRevenueBuild = KAIROS_REVENUE_PRODUCTION_MOUNT_BUILD;
    root.dataset.automaticPublication = "disabled";
    root.toggleAttribute("aria-busy", state.loading);
    if (state.error) {
      root.replaceChildren();
      const section = document.createElement("section");
      section.className = "kairos-revenue-error";
      section.setAttribute("role", "alert");
      const heading = document.createElement("h2");
      heading.textContent = "Revenue runtime unavailable";
      const detail = document.createElement("p");
      detail.textContent = state.error.message || "Unable to load the revenue run.";
      section.append(heading, detail);
      root.append(section);
      return;
    }
    if (state.view) mountRevenueLivePanel(root, state.view, { executeNext });
  }

  const api = Object.freeze({ refresh, executeNext, getState: () => Object.freeze({ ...state }), build: KAIROS_REVENUE_PRODUCTION_MOUNT_BUILD });
  if (options.autoLoad !== false) void refresh();
  return api;
}

function resolveRoot(root) {
  if (typeof root === "string") return document.querySelector(root);
  return root || document.querySelector("[data-kairos-revenue-live]");
}
