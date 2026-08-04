(() => {
  const BUILD = "kairos-manuscript-final-deliverable-control-owner-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_FINAL_DELIVERABLE_CONTROL_OWNER__";

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptFinalDeliverableControlOwner = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    claimedManufacture: 0,
    claimedRefresh: 0,
    claimedApprove: 0,
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    claim: claimControls,
    snapshot() {
      return {
        build: BUILD,
        ...state,
        activeManufactureControls: document.querySelectorAll(
          "#manuscript-auto-pipeline [data-final-deliverable-retry]",
        ).length,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptFinalDeliverableControlOwner = api;

  const observer = new MutationObserver(claimControls);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("kairos:production:state-changed", claimControls);
  window.addEventListener("kairos:manuscript-studio:opened", claimControls);
  claimControls();

  function claimControls() {
    document.querySelectorAll(
      "#manuscript-auto-pipeline [data-start-local-production]",
    ).forEach(control => {
      control.removeAttribute("data-start-local-production");
      control.setAttribute("data-final-deliverable-retry", "");
      control.dataset.kairosFinalDeliverableOwner = BUILD;
      state.claimedManufacture += 1;
    });

    document.querySelectorAll(
      "#manuscript-auto-pipeline [data-retry-production-state]",
    ).forEach(control => {
      control.removeAttribute("data-retry-production-state");
      control.setAttribute("data-final-deliverable-refresh", "");
      control.dataset.kairosFinalDeliverableOwner = BUILD;
      state.claimedRefresh += 1;
    });

    document.querySelectorAll(
      "#manuscript-auto-pipeline [data-approve-package]",
    ).forEach(control => {
      control.removeAttribute("data-approve-package");
      control.setAttribute("data-final-deliverable-approve", "");
      control.dataset.kairosFinalDeliverableOwner = BUILD;
      state.claimedApprove += 1;
    });
  }
})();
