import { buildSectionJumpIndex, getLastJump, jumpToSection } from "./section-jump.js";

function renderSectionJumpPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-section-jump-panel]")) return;

  const sections = buildSectionJumpIndex().slice(0, 32);
  const lastJump = getLastJump();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.sectionJumpPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Navigation</p>
        <h3>Section Jump Controls</h3>
      </div>
      <span class="badge good">${sections.length} Sections</span>
    </div>
    <div class="action-row">
      ${sections.map(item => `<button class="action-button" data-jump-section="${item.id}">${item.id === lastJump ? "Last: " : ""}${item.title}</button>`).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-jump-section]").forEach(button => {
    button.addEventListener("click", () => jumpToSection(button.dataset.jumpSection));
  });
}

const observer = new MutationObserver(() => renderSectionJumpPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderSectionJumpPanel();
});

window.addEventListener("kairos:auth", renderSectionJumpPanel);
