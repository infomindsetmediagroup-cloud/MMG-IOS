import { availableFocusModes, getFocusMode, setFocusMode, initializeFocusMode } from "./focus-mode.js";
import { pushNotification } from "./notifications.js";

function renderFocusPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-focus-panel]")) return;

  const current = getFocusMode();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.focusPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Focus Mode</p>
        <h3>Operator View Control</h3>
      </div>
      <span class="badge good">${current}</span>
    </div>
    <div class="list">
      ${availableFocusModes().map(mode => `
        <div class="list-item">
          <div>
            <strong>${mode.label}</strong>
            <p class="muted">${mode.detail}</p>
          </div>
          <button class="action-button" data-focus-mode="${mode.id}">${mode.id === current ? "Active" : "Set"}</button>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-focus-mode]").forEach(button => {
    button.addEventListener("click", () => {
      const next = setFocusMode(button.dataset.focusMode);
      pushNotification("Focus mode changed", `Kairos focus mode set to ${next}.`, "Info");
      card.remove();
      renderFocusPanel();
    });
  });
}

const observer = new MutationObserver(() => renderFocusPanel());
window.addEventListener("DOMContentLoaded", () => {
  initializeFocusMode();
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderFocusPanel();
});

window.addEventListener("kairos:auth", renderFocusPanel);
