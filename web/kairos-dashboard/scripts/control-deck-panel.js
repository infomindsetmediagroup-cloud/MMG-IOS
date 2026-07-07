import { buildControlDeck } from "./control-deck.js";

function badgeClass(status) {
  return status === "Good" ? "badge good" : "badge warning";
}

function renderControlDeckPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-control-deck-panel]")) return;

  const cards = buildControlDeck();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.controlDeckPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Control Deck</p>
        <h3>Executive Runtime Summary</h3>
      </div>
      <span class="badge good">Live</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      ${cards.map(item => `
        <article class="card kpi-card">
          <div class="card-header"><h3>${item.title}</h3><span class="${badgeClass(item.status)}">${item.status}</span></div>
          <p class="metric">${item.value}</p>
        </article>
      `).join("")}
    </section>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderControlDeckPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderControlDeckPanel();
});

window.addEventListener("kairos:auth", renderControlDeckPanel);
