import { runQuickLaunch } from "./quick-launch.js";
import { pushNotification } from "./notifications.js";

const shortcuts = [
  { key: "1", title: "Run Website Audit", action: "site-audit" },
  { key: "2", title: "Run Shopify Preflight", action: "shopify" },
  { key: "3", title: "Run Revenue Funnel", action: "revenue" },
  { key: "4", title: "Run Bundle Builder", action: "bundle" },
  { key: "5", title: "Run Free Vault", action: "vault" },
  { key: "6", title: "Run Knowledge Taxonomy", action: "knowledge" },
  { key: "7", title: "Run Customer Portal", action: "customer" },
  { key: "8", title: "Run Milestone Validation", action: "milestone" },
  { key: "9", title: "Create Golden Master", action: "golden" }
];

export function getKeyboardShortcuts() {
  return shortcuts;
}

export function runKeyboardShortcut(key) {
  const shortcut = shortcuts.find(item => item.key === String(key));
  if (!shortcut) return null;
  const result = runQuickLaunch(shortcut.action);
  pushNotification("Keyboard shortcut executed", `${shortcut.title} executed with Option+${shortcut.key}.`, "Success");
  return { shortcut, result };
}

export function initializeKeyboardShortcuts() {
  window.addEventListener("keydown", event => {
    const tag = String(document.activeElement?.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return;
    if (!event.altKey) return;
    const result = runKeyboardShortcut(event.key);
    if (result) event.preventDefault();
  });
}
