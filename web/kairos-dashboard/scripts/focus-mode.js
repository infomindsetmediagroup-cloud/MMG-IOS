const focusKey = "kairos.focus.mode.v1";

export function getFocusMode() {
  return localStorage.getItem(focusKey) || "overview";
}

export function setFocusMode(mode) {
  localStorage.setItem(focusKey, mode);
  document.body.dataset.focusMode = mode;
  return mode;
}

export function initializeFocusMode() {
  document.body.dataset.focusMode = getFocusMode();
}

export function availableFocusModes() {
  return [
    { id: "overview", label: "Overview", detail: "Show all panels." },
    { id: "ops", label: "Ops", detail: "Prioritize command centers and execution queues." },
    { id: "revenue", label: "Revenue", detail: "Prioritize bundles, revenue, Shopify, and customers." },
    { id: "system", label: "System", detail: "Prioritize diagnostics, runtime, notifications, and safeguards." }
  ];
}
