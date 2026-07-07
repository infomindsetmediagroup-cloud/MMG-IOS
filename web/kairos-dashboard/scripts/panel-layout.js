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
  localStorage.setItem(layoutKey, JSON.stringify([...new Set(ids)]));
}

export function getHiddenPanels() {
  return readHidden();
}

export function togglePanelVisibility(id) {
  const hidden = readHidden();
  const next = hidden.includes(id) ? hidden.filter(item => item !== id) : [...hidden, id];
  writeHidden(next);
  pushNotification("Panel layout updated", `${id} ${next.includes(id) ? "minimized" : "restored"}.`, "Info");
  return next;
}

export function applyPanelLayoutControls() {
  const view = document.querySelector("#dashboard-view");
  if (!view) return;

  const hidden = readHidden();
  Array.from(view.querySelectorAll("article.card")).forEach((card, index) => {
    if (card.dataset.layoutReady === "true") return;
    const id = card.dataset.panelId || Object.keys(card.dataset).find(key => key.endsWith("Panel")) || `panel-${index}`;
    card.dataset.panelId = id;
    card.dataset.layoutReady = "true";
    if (hidden.includes(id)) card.classList.add("is-minimized");

    const header = card.querySelector(".card-header");
    if (!header) return;
    const button = document.createElement("button");
    button.className = "panel-layout-button";
    button.type = "button";
    button.textContent = hidden.includes(id) ? "Restore" : "Minimize";
    button.addEventListener("click", () => {
      const next = togglePanelVisibility(id);
      const isHidden = next.includes(id);
      card.classList.toggle("is-minimized", isHidden);
      button.textContent = isHidden ? "Restore" : "Minimize";
    });
    header.appendChild(button);
  });
}
