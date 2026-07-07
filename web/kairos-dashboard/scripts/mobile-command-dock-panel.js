import { getDockActionDetails, runDockAction } from "./mobile-command-dock.js";

function renderMobileCommandDock() {
  if (document.querySelector("[data-mobile-command-dock]")) return;

  const actions = getDockActionDetails();
  const dock = document.createElement("nav");
  dock.className = "mobile-command-dock";
  dock.dataset.mobileCommandDock = "true";
  dock.setAttribute("aria-label", "Mobile command dock");
  dock.innerHTML = actions.map(action => `
    <button class="dock-button" data-dock-action="${action.id}">
      <span>${action.title.split(" ")[0]}</span>
    </button>
  `).join("");

  document.body.appendChild(dock);

  dock.querySelectorAll("[data-dock-action]").forEach(button => {
    button.addEventListener("click", () => runDockAction(button.dataset.dockAction));
  });
}

window.addEventListener("DOMContentLoaded", renderMobileCommandDock);
window.addEventListener("kairos:auth", renderMobileCommandDock);
