const BUILD = "kairos-website-production-clarity-20260713-2";

const ACTION_LABELS = {
  homepage: "Retool Homepage",
  buildPage: "Build Page",
  retoolPage: "Retool Existing Page",
  productPage: "Build Product Page",
  journey: "Connect Customer Journey",
  guidance: "Add Kairos Guidance",
  inspect: "Inspect Website"
};

function clarifyWebsiteProduction(root = document) {
  const overlay = root.querySelector?.("#website-production-overlay") || document.querySelector("#website-production-overlay");
  if (!overlay) return;

  const activeButton = overlay.querySelector("[data-wp-action].active");
  const activeID = activeButton?.dataset.wpAction || "homepage";
  const label = overlay.querySelector(".wp-objective-label");
  const textarea = overlay.querySelector("#wp-objective");
  const grid = overlay.querySelector(".wp-action-grid");
  if (!label || !textarea || !grid) return;

  let promptTitle = label.querySelector(".wp-prompt-title");
  if (!promptTitle) {
    [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
    promptTitle = document.createElement("span");
    promptTitle.className = "wp-prompt-title";
    label.insertBefore(promptTitle, textarea);
  }

  const homepageActive = activeID === "homepage";
  promptTitle.textContent = homepageActive
    ? "Describe the homepage you want Kairos to build"
    : "Describe the website outcome you want Kairos to produce";
  textarea.setAttribute("aria-label", homepageActive ? "Homepage build prompt" : "Website production prompt");
  textarea.dataset.promptPurpose = homepageActive ? "homepage-build" : "website-production";

  let picker = overlay.querySelector(".wp-mobile-action-picker");
  if (!picker) {
    picker = document.createElement("div");
    picker.className = "wp-mobile-action-picker";
    picker.innerHTML = `<label for="wp-mobile-action-select">Website job</label><select id="wp-mobile-action-select" aria-label="Choose website job"></select>`;
    grid.parentNode.insertBefore(picker, grid);
    picker.querySelector("select").addEventListener("change", event => {
      overlay.querySelector(`[data-wp-action="${CSS.escape(event.target.value)}"]`)?.click();
    });
  }

  const select = picker.querySelector("select");
  select.innerHTML = Object.entries(ACTION_LABELS)
    .map(([id, title]) => `<option value="${id}"${id === activeID ? " selected" : ""}>${title}</option>`)
    .join("");

  overlay.dataset.clarityBuild = BUILD;
}

const observer = new MutationObserver(() => clarifyWebsiteProduction());
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
document.addEventListener("click", event => {
  if (event.target.closest?.("[data-wp-action]")) queueMicrotask(() => clarifyWebsiteProduction());
}, true);
clarifyWebsiteProduction();
