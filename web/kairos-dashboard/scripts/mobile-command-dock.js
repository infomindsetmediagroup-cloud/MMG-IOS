import { runQuickLaunch, quickLaunchActions } from "./quick-launch.js";
import { pushNotification } from "./notifications.js";

const dockKey = "kairos.mobile.command.dock.v1";

const commandBlockAction = {
  id: "command-block",
  title: "Command Block",
  shortLabel: "Command"
};

const defaultDock = ["command-block", "site-audit", "shopify", "revenue", "bundle"];

export function getMobileDockActions() {
  try {
    const saved = JSON.parse(localStorage.getItem(dockKey) || "null");
    return Array.isArray(saved) && saved.length ? saved : defaultDock;
  } catch {
    return defaultDock;
  }
}

export function setMobileDockActions(actions) {
  localStorage.setItem(dockKey, JSON.stringify(actions));
  pushNotification("Mobile dock updated", "Quick access command dock saved.", "Success");
  return actions;
}

function focusCommandBlock() {
  const panel = document.querySelector("[data-command-block-panel]");
  const input = document.querySelector("[data-command-block-input]");
  if (!panel || !input) {
    pushNotification("Command Block unavailable", "Open the dashboard and try again.", "Warning");
    return false;
  }

  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  panel.classList.add("is-jump-target");
  setTimeout(() => panel.classList.remove("is-jump-target"), 1200);
  setTimeout(() => input.focus({ preventScroll: true }), 280);
  pushNotification("Command Block ready", "Type a natural-language work request.", "Info");
  return true;
}

export function runDockAction(id) {
  if (id === commandBlockAction.id) return focusCommandBlock();

  const result = runQuickLaunch(id);
  const action = quickLaunchActions.find(item => item.id === id);
  pushNotification("Dock command executed", `${action?.title || id} launched from mobile dock.`, "Success");
  return result;
}

export function getDockActionDetails() {
  const ids = getMobileDockActions();
  return ids
    .map(id => id === commandBlockAction.id ? commandBlockAction : quickLaunchActions.find(action => action.id === id))
    .filter(Boolean);
}
