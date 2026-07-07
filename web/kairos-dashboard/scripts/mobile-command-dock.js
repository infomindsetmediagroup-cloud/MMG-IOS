import { runQuickLaunch, quickLaunchActions } from "./quick-launch.js";
import { pushNotification } from "./notifications.js";

const dockKey = "kairos.mobile.command.dock.v1";

const defaultDock = ["site-audit", "shopify", "revenue", "bundle", "golden"];

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

export function runDockAction(id) {
  const result = runQuickLaunch(id);
  const action = quickLaunchActions.find(item => item.id === id);
  pushNotification("Dock command executed", `${action?.title || id} launched from mobile dock.`, "Success");
  return result;
}

export function getDockActionDetails() {
  const ids = getMobileDockActions();
  return ids.map(id => quickLaunchActions.find(action => action.id === id)).filter(Boolean);
}
