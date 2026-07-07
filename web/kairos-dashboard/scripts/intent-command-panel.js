import { runIntentCommand } from "./intent-command.js";

function badgeClass(status) {
  return status === "Executed" ? "badge good" : "badge warning";
}

function renderIntentCommandPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-intent-command-panel]")) return;

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.intentCommandPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Command Input</p>
        <h3>Natural Language Command Router</h3>
      </div>
      <span class="badge good">Ready</span>
    </div>
    <form class="auth-form" data-intent-form style="margin-top:16px;">
      <input data-intent-input placeholder="Type a Kairos command: audit site, build vault, validate milestone...">
      <button class="action-button" type="submit">Run Command</button>
    </form>
    <div class="list" data-intent-result style="margin-top:16px;">
      <div class="list-item"><strong>Awaiting command</strong><span class="badge warning">Standby</span></div>
    </div>
  `;
  view.prepend(card);

  const form = card.querySelector("[data-intent-form]");
  const input = card.querySelector("[data-intent-input]");
  const result = card.querySelector("[data-intent-result]");

  form.addEventListener("submit", event => {
    event.preventDefault();
    const response = runIntentCommand(input.value);
    result.innerHTML = `<div class="list-item"><div><strong>${response.intent?.label || "Unresolved Command"}</strong><p class="muted">${input.value || "No command text provided."}</p></div><span class="${badgeClass(response.status)}">${response.status}</span></div>`;
    input.value = "";
  });
}

const observer = new MutationObserver(() => renderIntentCommandPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderIntentCommandPanel();
});

window.addEventListener("kairos:auth", renderIntentCommandPanel);
