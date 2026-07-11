const SUMMARY_LIMIT = 520;
const BULLET_LIMIT = 3;

function condenseExecutivePackages(root = document) {
  root.querySelectorAll(".proposal-presentation").forEach(panel => {
    const summary = panel.querySelector(".proposal-summary");
    if (summary) summary.textContent = condense(summary.textContent, SUMMARY_LIMIT);

    panel.querySelectorAll(".proposal-section").forEach(section => {
      const heading = section.querySelector("h5")?.textContent?.trim() || "";
      if (/pages and assets affected/i.test(heading)) {
        section.hidden = true;
        return;
      }
      const items = [...section.querySelectorAll("li")];
      items.forEach((item, index) => {
        if (index >= BULLET_LIMIT) item.remove();
        else item.textContent = condense(item.textContent, 180);
      });
    });

    const evidenceSummary = panel.querySelector(".proposal-evidence > summary");
    if (evidenceSummary) evidenceSummary.textContent = "View implementation details and evidence";
  });
}

function condense(value, maximum) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1).trim()}…`;
}

const observer = new MutationObserver(() => condenseExecutivePackages());
observer.observe(document.documentElement, { subtree: true, childList: true });
window.addEventListener("kairos:command-center-updated", () => queueMicrotask(() => condenseExecutivePackages()));
condenseExecutivePackages();
