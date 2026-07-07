import { pushNotification } from "./notifications.js";

const jumpKey = "kairos.section.jump.v1";

function panelTitle(card) {
  return card.querySelector("h3")?.textContent?.trim() || card.dataset.panelId || "Panel";
}

function panelId(card, index) {
  const id = card.dataset.panelId || `panel-${index}`;
  card.dataset.panelId = id;
  card.id = `kairos-${id}`;
  return id;
}

export function buildSectionJumpIndex() {
  const view = document.querySelector("#dashboard-view");
  if (!view) return [];

  return Array.from(view.querySelectorAll("article.card"))
    .map((card, index) => ({ id: panelId(card, index), title: panelTitle(card) }))
    .filter(item => item.title !== "Panel");
}

export function saveLastJump(id) {
  localStorage.setItem(jumpKey, id);
}

export function getLastJump() {
  return localStorage.getItem(jumpKey) || "";
}

export function jumpToSection(id) {
  const target = document.querySelector(`#kairos-${CSS.escape(id)}`);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("is-jump-target");
  setTimeout(() => target.classList.remove("is-jump-target"), 1200);
  saveLastJump(id);
  pushNotification("Section jump complete", `Opened ${panelTitle(target)}.`, "Info");
  return true;
}
