const BUILD = "kairos-executive-feedback-20260729-1";
const root = document.querySelector("#kairos-executive-os");
const nativeFetch = window.fetch.bind(window);
let dismissTimer = 0;

if (root && !window.KairosExecutiveFeedback) {
  installStyles();
  installFetchObserver();
  installEventFeedback();
  window.KairosExecutiveFeedback = Object.freeze({ ready: true, build: BUILD, notify: showFeedback });
}

function installFetchObserver() {
  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    const requestURL = requestPath(input);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "POST" && response.ok) {
      queueMicrotask(() => reportSuccessfulAction(requestURL, init));
    }
    return response;
  };
}

function reportSuccessfulAction(path, init) {
  if (path === "/api/hub/run") {
    const action = requestBody(init)?.action || "objective";
    const message = action === "objective"
      ? "Objective accepted. Kairos has started governed execution."
      : action === "growth-plan"
        ? "Growth-plan work started. Kairos will place results in the governed workflow queue."
        : action === "revenue-intelligence"
          ? "Revenue review started using verified connected data."
          : "Governed work started successfully.";
    showFeedback({ title: "Work started", message, view: "today", actionLabel: "View live work" });
    window.dispatchEvent(new CustomEvent("kairos:workflow:changed"));
    return;
  }
  if (path === "/api/executive-briefing/decide") {
    const decision = requestBody(init)?.decision || "updated";
    const copy = decision === "approve"
      ? "Approval recorded. Kairos can continue the authorized work."
      : decision === "fix"
        ? "Correction request recorded and returned to Kairos."
        : decision === "deny"
          ? "Decision denied. Kairos will not execute that action."
          : "Decision recorded successfully.";
    showFeedback({ title: "Decision recorded", message: copy, view: "approvals", actionLabel: "Review approvals" });
    window.dispatchEvent(new CustomEvent("kairos:workflow:changed"));
  }
}

function installEventFeedback() {
  window.addEventListener("kairos:deliverable:ready", event => {
    showFeedback({
      title: "Deliverable ready",
      message: String(event.detail?.message || "A governed deliverable is ready for review."),
      view: "assets",
      actionLabel: "Open assets",
    });
  });
}

function showFeedback({ title, message, view = "today", actionLabel = "Open" } = {}) {
  document.querySelector("[data-kairos-feedback]")?.remove();
  clearTimeout(dismissTimer);
  const toast = document.createElement("section");
  toast.className = "abos-feedback";
  toast.dataset.kairosFeedback = "true";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `<div class="abos-feedback-mark" aria-hidden="true">✓</div><div class="abos-feedback-copy"><strong>${escapeHTML(title || "Completed")}</strong><p>${escapeHTML(message || "The governed action completed successfully.")}</p></div><div class="abos-feedback-actions"><button data-feedback-open>${escapeHTML(actionLabel)}</button><button data-feedback-close aria-label="Dismiss confirmation">×</button></div>`;
  document.body.append(toast);
  requestAnimationFrame(() => toast.dataset.visible = "true");
  toast.querySelector("[data-feedback-open]")?.addEventListener("click", () => {
    root.querySelector(`[data-view="${safeView(view)}"]`)?.click();
    closeFeedback();
  });
  toast.querySelector("[data-feedback-close]")?.addEventListener("click", closeFeedback);
  dismissTimer = window.setTimeout(closeFeedback, 9000);
}

function closeFeedback() {
  const toast = document.querySelector("[data-kairos-feedback]");
  if (!toast) return;
  toast.dataset.visible = "false";
  window.setTimeout(() => toast.remove(), 180);
}

function requestPath(input) {
  try {
    const raw = input instanceof Request ? input.url : String(input || "");
    return new URL(raw, location.origin).pathname;
  } catch {
    return "";
  }
}

function requestBody(init) {
  try {
    return typeof init?.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    return {};
  }
}

function safeView(view) {
  return ["today", "approvals", "create", "assets", "growth", "settings"].includes(view) ? view : "today";
}

function installStyles() {
  if (document.querySelector("link[data-kairos-feedback-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./styles/executive-os-feedback.css?v=20260729-1";
  link.dataset.kairosFeedbackStyle = "true";
  document.head.append(link);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
