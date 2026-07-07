import { quickLaunchActions, runQuickLaunch } from "./quick-launch.js";

function renderQuickLaunchPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-quick-launch-panel]")) return;

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.quickLaunchPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Quick Launch</p>
        <h3>One-Tap Execution Deck</h3>
      </div>
      <span class="badge good">${quickLaunchActions.length} Actions</span>
    </div>
    <div class="action-row">
      ${quickLaunchActions.map(action => `<button class="action-button" data-quick-launch="${action.id}">${action.title}</button>`).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-quick-launch]").forEach(button => {
    button.addEventListener("click", () => {
      runQuickLaunch(button.dataset.quickLaunch);
      card.remove();
      renderQuickLaunchPanel();
    });
  });
}

const observer = new MutationObserver(() => renderQuickLaunchPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderQuickLaunchPanel();
});

window.addEventListener("kairos:auth", renderQuickLaunchPanel);
