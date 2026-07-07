import "./completion-gate-panel.js";
import "./dashboard-mode-gate-panel.js";
import "./product-ops-workflow-panel.js";
import "./website-build-workflow-panel.js";
import "./automation-queue-panel.js";
import "./quick-link-health-panel.js";
import { submitCommandPipeline } from "./command-pipeline.js";

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[character]));
}

function renderCommandBlockPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-command-block-panel]")) return;

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.commandBlockPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">AI Work Intake</p>
        <h3>Kairos Command Block</h3>
      </div>
      <span class="badge good">Pipeline</span>
    </div>
    <p class="muted" style="margin-top:10px;">Type an operational request. Kairos converts it into a structured work item, creates an execution run, records history, and routes it into the Command Center pipeline.</p>
    <form class="auth-form" data-command-block-form style="margin-top:16px;">
      <input data-command-block-input placeholder="Create a product, update an image, queue a website change, add a Shopify listing...">
      <button class="action-button" type="submit">Queue Pipeline</button>
    </form>
    <div class="list" data-command-block-result style="margin-top:16px;">
      <div class="list-item"><strong>Awaiting operational command</strong><span class="badge warning">Ready</span></div>
    </div>
  `;
  view.prepend(card);

  const form = card.querySelector("[data-command-block-form]");
  const input = card.querySelector("[data-command-block-input]");
  const result = card.querySelector("[data-command-block-result]");

  form.addEventListener("submit", event => {
    event.preventDefault();
    const command = input.value.trim();
    if (!command) {
      result.innerHTML = `<div class="list-item"><strong>No command entered</strong><span class="badge warning">Hold</span></div>`;
      return;
    }

    const response = submitCommandPipeline(command);
    const item = response.item;
    const run = response.run;
    const pipeline = response.pipelineItem;
    result.innerHTML = `
      <div class="list-item">
        <div>
          <strong>${escapeHTML(pipeline.id)} • ${escapeHTML(item.id)} • ${escapeHTML(item.title)}</strong>
          <p class="muted">${escapeHTML(item.lane)} • ${escapeHTML(item.type)} • Run: ${escapeHTML(run.id)} • Stage: ${escapeHTML(pipeline.stage)}</p>
        </div>
        <div class="action-row" style="margin-top:0;">
          <span class="badge warning">${escapeHTML(item.priority)}</span>
          <span class="badge">${escapeHTML(pipeline.status)}</span>
        </div>
      </div>
    `;
    input.value = "";
  });
}

const observer = new MutationObserver(() => renderCommandBlockPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCommandBlockPanel();
});
window.addEventListener("kairos:auth", renderCommandBlockPanel);
