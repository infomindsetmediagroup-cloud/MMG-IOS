import { runQuickLaunch, quickLaunchActions } from "./quick-launch.js";
import { pushNotification } from "./notifications.js";

const dockKey = "kairos.mobile.command.dock.v1";

const commandBlockAction = {
  id: "command-block",
  title: "Command Block",
  shortLabel: "Command",
  target: "[data-command-block-panel]",
  focusTarget: "[data-command-block-input]"
};

const actionTargets = {
  "command-block": commandBlockAction,
  "site-audit": { target: "[data-site-audit-panel]", fallbackTarget: "[data-website-build-panel]" },
  "shopify": { target: "[data-shopify-preflight-panel]", fallbackTarget: "[data-product-ops-workflow-panel]" },
  "revenue": { target: "[data-revenue-funnel-panel]", fallbackTarget: "[data-marketing-ops-panel]" },
  "bundle": { target: "[data-bundle-builder-panel]", fallbackTarget: "[data-product-ops-workflow-panel]" },
  "vault": { target: "[data-vault-builder-panel]", fallbackTarget: "[data-publishing-queue-panel]" },
  "knowledge": { target: "[data-knowledge-taxonomy-panel]", fallbackTarget: "[data-seo-ops-panel]" },
  "customer": { target: "[data-customer-portal-panel]", fallbackTarget: "[data-customer-ops-workflow-panel]" },
  "milestone": { target: "[data-milestone-panel]", fallbackTarget: "[data-release-readiness-panel]" },
  "golden": { target: "[data-golden-master-panel]", fallbackTarget: "[data-release-readiness-panel]" },
  "daily-ops": { target: "[data-dashboard-mode-gate-panel]", fallbackTarget: "[data-completion-gate-panel]" }
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
  const allowed = new Set([commandBlockAction.id, ...quickLaunchActions.map(action => action.id)]);
  const next = [...new Set(actions)].filter(id => allowed.has(id));
  localStorage.setItem(dockKey, JSON.stringify(next.length ? next : defaultDock));
  pushNotification("Quick links updated", "Bottom dashboard action strip saved.", "Success");
  window.dispatchEvent(new CustomEvent("kairos:mobile-dock-updated", { detail: { actions: next } }));
  return next;
}

export function resetMobileDockActions() {
  localStorage.removeItem(dockKey);
  window.dispatchEvent(new CustomEvent("kairos:mobile-dock-updated", { detail: { actions: defaultDock } }));
  pushNotification("Quick links reset", "Bottom dashboard action strip restored to defaults.", "Info");
  return defaultDock;
}

function findTarget(id) {
  const detail = actionTargets[id] || {};
  return document.querySelector(detail.target) || document.querySelector(detail.fallbackTarget) || null;
}

function focusTarget(id) {
  const detail = actionTargets[id] || {};
  const target = findTarget(id);
  if (!target) return false;

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("is-jump-target");
  setTimeout(() => target.classList.remove("is-jump-target"), 1200);

  const focusable = detail.focusTarget ? document.querySelector(detail.focusTarget) : target.querySelector("button, input, select, textarea, a[href]");
  if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 260);
  return true;
}

function markDockButton(id) {
  document.querySelectorAll("[data-dock-action]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.dockAction === id);
  });
}

function runMappedAction(id) {
  if (focusTarget(id)) {
    markDockButton(id);
    const action = getDockActionDetails().find(item => item.id === id);
    pushNotification("Quick link opened", `${action?.title || id} opened from the bottom action strip.`, "Info");
    return { id, opened: true };
  }
  return null;
}

export function runDockAction(id) {
  if (!id) return null;

  if (id === commandBlockAction.id) {
    const opened = runMappedAction(id);
    if (!opened) pushNotification("Command Block unavailable", "Open the dashboard and try again.", "Warning");
    return opened;
  }

  const opened = runMappedAction(id);
  try {
    const result = runQuickLaunch(id);
    return result || opened;
  } catch (error) {
    pushNotification("Quick link mapped", "Opened the matching dashboard section.", opened ? "Info" : "Warning");
    return opened;
  }
}

export function getDockActionDetails() {
  const ids = getMobileDockActions();
  return ids
    .map(id => id === commandBlockAction.id ? commandBlockAction : quickLaunchActions.find(action => action.id === id))
    .filter(Boolean);
}
