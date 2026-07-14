const BUILD = "kairos-readiness-priority-ui-20260714-1";

start();

function start() {
  document.addEventListener("click", handleClick, true);
}

function handleClick(event) {
  const centerButton = event.target.closest?.("[data-center]");
  if (centerButton) {
    setTimeout(enhanceReadinessPanel, 40);
    return;
  }

  const nextButton = event.target.closest?.("[data-build-next]");
  if (!nextButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const childID = nextButton.dataset.buildNext;
  const childButton = document.querySelector(`.child-action[data-child="${CSS.escape(childID)}"]`);
  childButton?.click();
  setTimeout(() => document.querySelector(".job, #workflow-runtime, .workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
}

function enhanceReadinessPanel() {
  const panel = document.querySelector(".center-readiness");
  if (!panel || panel.querySelector(".readiness-priority")) return;

  const childCards = [...document.querySelectorAll(".child-card[data-readiness]")]
    .map(card => ({
      card,
      score: Number(card.dataset.readiness || 0),
      title: card.querySelector("h3")?.textContent?.trim() || "Capability",
      childID: card.querySelector("[data-child]")?.dataset.child || "",
    }))
    .filter(item => item.childID)
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

  if (!childCards.length) return;
  const next = childCards[0];
  const remaining = Math.max(0, 100 - next.score);
  const priority = document.createElement("section");
  priority.className = "readiness-priority";
  priority.innerHTML = `<div><p class="eyebrow">Next Build Priority</p><h4>${escapeHTML(next.title)}</h4><p>Lowest-readiness capability in this center · ${next.score}% operational · ${remaining} points remaining</p></div><button type="button" data-build-next="${escapeHTML(next.childID)}">Build Next →</button>`;
  panel.appendChild(priority);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

window.KairosReadinessPriority = { build: BUILD, refresh: enhanceReadinessPanel };