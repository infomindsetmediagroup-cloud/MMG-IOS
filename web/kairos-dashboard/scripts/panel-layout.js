import { pushNotification } from "./notifications.js";

const layoutKey = "kairos.panel.layout.v1";

function readHidden() {
  try {
    return JSON.parse(localStorage.getItem(layoutKey) || "[]");
  } catch {
    return [];
  }
}

function writeHidden(ids) {
  const next = [...new Set(ids)];
  localStorage.setItem(layoutKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("kairos:panel-layout-updated", { detail: { minimized: next.length } }));
  return next;
}

function panelIdFor(card, index = 0) {
  const id = card.dataset.panelId || Object.keys(card.dataset).find(key => key.endsWith("Panel")) || "panel-" + index;
  card.dataset.panelId = id;
  return id;
}

function layoutButtonFor(header, id) {
  return header.querySelector(`[data-panel-layout-toggle="${CSS.escape(id)}"]`);
}

function compactLayoutLabel(isHidden) {
  return window.matchMedia("(max-width: 520px)").matches ? (isHidden ? "Show" : "Hide") : (isHidden ? "Expand" : "Collapse");
}

function applyStateToPanel(card, isHidden) {
  card.classList.toggle("is-minimized", isHidden);
  card.setAttribute("aria-expanded", isHidden ? "false" : "true");
  const button = card.querySelector(`[data-panel-layout-toggle="${CSS.escape(card.dataset.panelId)}"]`);
  if (button) {
    button.textContent = compactLayoutLabel(isHidden);
    button.setAttribute("aria-label", `${isHidden ? "Expand" : "Collapse"} ${card.querySelector("h3")?.textContent || "panel"}`);
  }
}

export function getHiddenPanels() {
  return readHidden();
}

export function togglePanelVisibility(id) {
  const hidden = readHidden();
  const next = hidden.includes(id) ? hidden.filter(item => item !== id) : [...hidden, id];
  writeHidden(next);
  pushNotification("Panel layout updated", `${id} ${next.includes(id) ? "collapsed" : "expanded"}.`, "Info");
  return next;
}

export function expandPanel(id) {
  const next = writeHidden(readHidden().filter(item => item !== id));
  const card = document.querySelector(`[data-panel-id="${CSS.escape(id)}"]`);
  if (card) applyStateToPanel(card, false);
  return next;
}

export function collapseAllPanels() {
  const view = document.querySelector("#dashboard-view");
  if (!view) return [];
  const ids = Array.from(view.querySelectorAll("article.card"))
    .filter(card => !card.dataset.panelLayoutPanel && !card.dataset.commandBlockPanel)
    .map((card, index) => panelIdFor(card, index));
  const next = writeHidden(ids);
  Array.from(view.querySelectorAll("article.card")).forEach(card => applyStateToPanel(card, next.includes(card.dataset.panelId)));
  pushNotification("Dashboard collapsed", `${next.length} panels collapsed.`, "Info");
  return next;
}

export function expandAllPanels() {
  const next = writeHidden([]);
  document.querySelectorAll("#dashboard-view article.card").forEach(card => applyStateToPanel(card, false));
  pushNotification("Dashboard expanded", "All dashboard panels restored.", "Info");
  return next;
}

export function applyPanelLayoutControls() {
  const view = document.querySelector("#dashboard-view");
  if (!view) return;

  const hidden = readHidden();
  Array.from(view.querySelectorAll("article.card")).forEach((card, index) => {
    const id = panelIdFor(card, index);
    const header = card.querySelector(".card-header");
    if (!header) return;

    card.dataset.layoutReady = "true";
    applyStateToPanel(card, hidden.includes(id));

    if (layoutButtonFor(header, id)) return;
    const button = document.createElement("button");
    button.className = "panel-layout-button";
    button.type = "button";
    button.dataset.panelLayoutToggle = id;
    button.textContent = compactLayoutLabel(hidden.includes(id));
    button.addEventListener("click", () => {
      const next = togglePanelVisibility(id);
      applyStateToPanel(card, next.includes(id));
    });
    header.appendChild(button);
  });
}

window.addEventListener("resize", () => {
  document.querySelectorAll("#dashboard-view article.card").forEach(card => {
    applyStateToPanel(card, card.classList.contains("is-minimized"));
  });
});
