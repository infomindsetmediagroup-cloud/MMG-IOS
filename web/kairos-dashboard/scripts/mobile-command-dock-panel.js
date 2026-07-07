import { getDockActionDetails, runDockAction } from "./mobile-command-dock.js";

function dockLabel(action) {
  if (action.shortLabel) return action.shortLabel;
  return String(action.title || action.id || "Action")
    .replace(/^(Run|Create|Build|Stage|Prepare|Validate)\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

function renderMobileCommandDock() {
  let dock = document.querySelector("[data-mobile-command-dock]");
  const actions = getDockActionDetails();

  if (!dock) {
    dock = document.createElement("nav");
    dock.className = "mobile-command-dock";
    dock.dataset.mobileCommandDock = "true";
    dock.setAttribute("aria-label", "Dashboard quick link actions");
    document.body.appendChild(dock);
  }

  dock.innerHTML = actions.map(action => `
    <button class="dock-button" type="button" data-dock-action="${action.id}" aria-label="${action.title}" title="${action.title}">
      <span>${dockLabel(action)}</span>
    </button>
  `).join("");

  dock.querySelectorAll("[data-dock-action]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      runDockAction(button.dataset.dockAction);
    });
  });
}

window.addEventListener("DOMContentLoaded", renderMobileCommandDock);
window.addEventListener("kairos:auth", renderMobileCommandDock);
window.addEventListener("kairos:mobile-dock-updated", renderMobileCommandDock);
