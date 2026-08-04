(() => {
  const BUILD = "kairos-manuscript-final-deliverable-control-owner-20260804-2-navigation";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_FINAL_DELIVERABLE_CONTROL_OWNER__";

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptFinalDeliverableControlOwner = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    claimedManufacture: 0,
    claimedRefresh: 0,
    claimedApprove: 0,
    navigationMounted: false,
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
  document.addEventListener("click", onNavigation, true);
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

    mountNavigation();
  }

  function mountNavigation() {
    const finalControl = document.querySelector("#kairos-final-delivery-control");
    const pipeline = document.querySelector("#manuscript-auto-pipeline");
    if (!finalControl && !pipeline) return;
    if (document.querySelector("#kairos-final-delivery-navigation")) {
      state.navigationMounted = true;
      return;
    }

    const nav = document.createElement("nav");
    nav.id = "kairos-final-delivery-navigation";
    nav.setAttribute("aria-label", "Final delivery navigation");
    nav.innerHTML = `
      <button type="button" data-kairos-return-command-center>Return to Command Center</button>
      <button type="button" data-kairos-return-manuscript-studio>Return to Manuscript Studio</button>
    `;
    nav.style.cssText = [
      "position:fixed",
      "z-index:2147483001",
      "top:max(12px,env(safe-area-inset-top))",
      "left:max(12px,env(safe-area-inset-left))",
      "right:max(12px,env(safe-area-inset-right))",
      "display:flex",
      "gap:8px",
      "justify-content:space-between",
      "pointer-events:none",
    ].join(";");
    nav.querySelectorAll("button").forEach(button => {
      button.style.cssText = [
        "pointer-events:auto",
        "min-height:44px",
        "padding:10px 14px",
        "border:1px solid #365d88",
        "border-radius:12px",
        "background:#0b1622",
        "color:#fff",
        "font:800 14px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "box-shadow:0 8px 24px rgba(0,0,0,.35)",
      ].join(";");
    });
    document.body.append(nav);
    state.navigationMounted = true;
  }

  function onNavigation(event) {
    const target = event.target instanceof Element ? event.target : null;
    const command = target?.closest?.("[data-kairos-return-command-center]");
    const manuscript = target?.closest?.("[data-kairos-return-manuscript-studio]");
    if (!command && !manuscript) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (command) {
      location.assign(new URL("./", location.href).href);
      return;
    }

    const next = new URL("./manuscript", location.href);
    next.searchParams.set("open", "manuscript");
    const projectId = activeProjectId();
    if (projectId) next.searchParams.set("project", projectId);
    location.assign(next.href);
  }

  function activeProjectId() {
    const direct = new URL(location.href).searchParams.get("project");
    if (direct) return direct;
    try {
      const active = JSON.parse(sessionStorage.getItem("kairos.production.active-workspace") || "null");
      return String(active?.projectId || active?.id || "").trim();
    } catch {
      return "";
    }
  }
})();