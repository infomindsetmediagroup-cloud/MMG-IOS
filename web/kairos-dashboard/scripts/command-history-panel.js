import { buildCommandHistory, commandHistoryMetrics } from "./command-history.js";

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["direct", "intent", "replayed", "queued"].includes(normalized)) return "badge good";
  if (["pending", "warning"].includes(normalized)) return "badge warning";
  return "badge";
}

function renderCommandHistoryPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-command-history-panel]")) return;

  const history = buildCommandHistory();
  const metrics = commandHistoryMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.commandHistoryPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">History</p>
        <h3>Command History Analytics</h3>
      </div>
      <span class="badge good">${metrics.total}</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Handled</h3><span class="badge good">Done</span></div><p class="metric">${metrics.handled}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Waiting</h3><span class="badge warning">Open</span></div><p class="metric">${metrics.waiting}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Sources</h3><span class="badge">Input</span></div><p class="metric">${metrics.sources}</p></article>
    </section>
    <div class="list" style="margin-top:16px;">
      ${(history.length ? history : [{ title: "No commands yet", detail: "Command history will appear after execution.", source: "History", status: "Standby", createdAt: "Runtime" }]).map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.source} • ${item.detail} • ${item.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
    </div>
  `;
  view.appendChild(card);
}

const observer = new MutationObserver(() => renderCommandHistoryPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCommandHistoryPanel();
});

window.addEventListener("kairos:auth", renderCommandHistoryPanel);
