import { updateWorkItem } from "./executive-command-center-store.js";

const ACTION_TIMEOUT_MS = 60000;
const timers = new Map();

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail || {};
  if (!action.id) return;
  clearTimer(action.id);
  const timer = setTimeout(() => {
    timers.delete(action.id);
    updateWorkItem(action.id, {
      status: "Needs Attention",
      progress: 45,
      error: "Kairos did not return a response within 60 seconds. The interface recovered automatically; retry the action.",
      updatedAt: "Execution timed out safely",
    });
    showNotice("Kairos stopped waiting for an unresponsive request. The page remains usable; retry the action.", "error");
  }, ACTION_TIMEOUT_MS);
  timers.set(action.id, timer);
}, true);

window.addEventListener("kairos:approved-action-status", event => {
  const { id, status } = event.detail || {};
  if (!id) return;
  if (["Proposal Ready", "Completed", "Needs Attention", "Failed", "Rejected", "Revision Requested"].includes(status)) clearTimer(id);
});

window.addEventListener("error", event => {
  console.error("Kairos UI error", event.error || event.message);
  showNotice("A Command Center interface error was intercepted. Reload once; your saved work state is preserved.", "error");
});

window.addEventListener("unhandledrejection", event => {
  console.error("Kairos unhandled request error", event.reason);
  showNotice("A Kairos request failed without completing. The interface has been released instead of freezing.", "error");
});

// Do not disable action buttons during capture. Doing so can suppress the
// dashboard's target-phase click handlers on mobile Safari and Chrome.
// The work-item state itself provides the visible execution feedback.

function clearTimer(id) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}

function showNotice(message, tone = "info") {
  let notice = document.querySelector("#kairos-runtime-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "kairos-runtime-notice";
    notice.setAttribute("role", "status");
    notice.style.cssText = "position:fixed;left:16px;right:16px;bottom:90px;z-index:9999;padding:14px 16px;border-radius:16px;font:600 14px/1.35 system-ui;box-shadow:0 12px 36px rgba(0,0,0,.35)";
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.style.background = tone === "error" ? "#3b171d" : "#123144";
  notice.style.color = tone === "error" ? "#ffb8bf" : "#d7f4ff";
  notice.style.border = tone === "error" ? "1px solid #8f3945" : "1px solid #287290";
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => notice.remove(), 8000);
}
