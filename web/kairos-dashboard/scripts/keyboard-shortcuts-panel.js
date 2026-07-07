import { getKeyboardShortcuts, initializeKeyboardShortcuts, runKeyboardShortcut } from "./keyboard-shortcuts.js";

function renderKeyboardShortcutsPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-keyboard-shortcuts-panel]")) return;

  const shortcuts = getKeyboardShortcuts();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.keyboardShortcutsPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Shortcuts</p>
        <h3>Keyboard Command Layer</h3>
      </div>
      <span class="badge good">Option</span>
    </div>
    <div class="list">
      ${shortcuts.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">Press Option+${item.key}</p>
          </div>
          <button class="action-button" data-shortcut-run="${item.key}">Run</button>
        </div>
      `).join("")}
    </div>
  `;
  view.appendChild(card);

  card.querySelectorAll("[data-shortcut-run]").forEach(button => {
    button.addEventListener("click", () => runKeyboardShortcut(button.dataset.shortcutRun));
  });
}

const observer = new MutationObserver(() => renderKeyboardShortcutsPanel());
window.addEventListener("DOMContentLoaded", () => {
  initializeKeyboardShortcuts();
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderKeyboardShortcutsPanel();
});

window.addEventListener("kairos:auth", renderKeyboardShortcutsPanel);
