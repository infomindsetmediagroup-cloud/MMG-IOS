const BUILD = "kairos-website-production-clarity-20260713-1";

function clarifyHomepagePrompt(root = document) {
  const overlay = root.querySelector?.("#website-production-overlay") || document.querySelector("#website-production-overlay");
  if (!overlay) return;

  const active = overlay.querySelector('[data-wp-action="homepage"].active');
  const label = overlay.querySelector(".wp-objective-label");
  const textarea = overlay.querySelector("#wp-objective");
  if (!label || !textarea) return;

  let promptTitle = label.querySelector(".wp-prompt-title");
  if (!promptTitle) {
    const textNodes = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    textNodes.forEach(node => node.remove());
    promptTitle = document.createElement("span");
    promptTitle.className = "wp-prompt-title";
    label.insertBefore(promptTitle, textarea);
  }

  promptTitle.textContent = active
    ? "Describe the homepage you want Kairos to build"
    : "Describe the website outcome you want Kairos to produce";

  if (active) {
    textarea.setAttribute("aria-label", "Homepage build prompt");
    textarea.dataset.promptPurpose = "homepage-build";
  } else {
    textarea.setAttribute("aria-label", "Website production prompt");
    textarea.dataset.promptPurpose = "website-production";
  }

  overlay.dataset.clarityBuild = BUILD;
}

const observer = new MutationObserver(() => clarifyHomepagePrompt());
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
document.addEventListener("click", event => {
  if (event.target.closest?.("[data-wp-action]")) queueMicrotask(() => clarifyHomepagePrompt());
}, true);
clarifyHomepagePrompt();
