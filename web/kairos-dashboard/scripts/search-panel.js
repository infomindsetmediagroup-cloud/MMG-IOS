import { searchKairos } from "./search-index.js";

function renderSearchPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-search-panel]")) return;

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.searchPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Search</p>
        <h3>Kairos Command Search</h3>
      </div>
      <span class="badge">Index</span>
    </div>
    <form class="auth-form" data-search-form style="margin-top:0;">
      <input data-search-input placeholder="Search modules, queues, bundles, revenue, customers, AI, system...">
    </form>
    <div class="list" data-search-results style="margin-top:16px;">
      <div class="list-item"><strong>Enter a search term</strong><span class="badge warning">Standby</span></div>
    </div>
  `;
  view.prepend(card);

  const input = card.querySelector("[data-search-input]");
  const results = card.querySelector("[data-search-results]");
  card.querySelector("[data-search-form]").addEventListener("submit", event => event.preventDefault());
  input.addEventListener("input", () => {
    const matches = searchKairos(input.value);
    results.innerHTML = matches.length
      ? matches.map(item => `<div class="list-item"><div><strong>${item.title}</strong><p class="muted">${item.source} • ${item.module} • ${item.detail}</p></div><span class="badge">Found</span></div>`).join("")
      : `<div class="list-item"><strong>No matching Kairos records</strong><span class="badge warning">None</span></div>`;
  });
}

const observer = new MutationObserver(() => renderSearchPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderSearchPanel();
});

window.addEventListener("kairos:auth", renderSearchPanel);
