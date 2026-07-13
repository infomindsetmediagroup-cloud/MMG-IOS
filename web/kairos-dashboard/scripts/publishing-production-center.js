const BUILD = "kairos-publishing-production-center-20260713-4";

function enforce() {
  hideLegacyLaunchers();
  removeObsoleteComposite();
}

function hideLegacyLaunchers() {
  document.querySelectorAll(".creation-engine-launch,.manuscript-launch").forEach(button => {
    button.hidden = true;
    button.setAttribute("aria-hidden", "true");
    button.tabIndex = -1;
    button.dataset.embeddedEntry = "true";
  });
}

function removeObsoleteComposite() {
  document.querySelector("#kairos-publishing-production-parent")?.remove();
}

window.KairosPublishingProductionBridge = {
  build: BUILD,
  openPublishingStudio() {
    window.dispatchEvent(new CustomEvent("kairos:publishing-studio:open"));
  },
  openManuscriptStudio() {
    window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:open"));
  },
  openCompleteProduct() {
    if (window.KairosProductionWorkspace?.open) return window.KairosProductionWorkspace.open("complete-product");
    window.dispatchEvent(new CustomEvent("kairos:production:open", { detail: { workspace: "complete-product" } }));
  },
};

new MutationObserver(enforce).observe(document.documentElement, { childList: true, subtree: true });
enforce();
