const EXECUTION_FOCUS_DURATION_MS = 45_000;

let pendingWorkId = null;
let pendingUntil = 0;
let scheduled = false;

try { history.scrollRestoration = "manual"; } catch {}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-approve-proposal], [data-prepare-action], [data-retry-action]");
  if (!button) return;
  pendingWorkId = button.dataset.approveProposal || button.dataset.prepareAction || button.dataset.retryAction || null;
  pendingUntil = Date.now() + EXECUTION_FOCUS_DURATION_MS;
  scheduleViewportRepair(true);
}, true);

window.addEventListener("kairos:approved-action-status", event => {
  const id = event.detail?.id;
  if (!id) return;
  pendingWorkId = id;
  pendingUntil = Date.now() + EXECUTION_FOCUS_DURATION_MS;
  scheduleViewportRepair(true);
}, true);

window.addEventListener("kairos:command-center-updated", () => scheduleViewportRepair(false));
window.addEventListener("resize", () => scheduleViewportRepair(false), { passive: true });
window.addEventListener("orientationchange", () => scheduleViewportRepair(false), { passive: true });

const observer = new MutationObserver(() => scheduleViewportRepair(false));
const dashboard = document.querySelector("#dashboard-view");
if (dashboard) observer.observe(dashboard, { childList: true, subtree: true });

function scheduleViewportRepair(forceFocus) {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    repairViewport(forceFocus);
  });
}

function repairViewport(forceFocus) {
  const documentElement = document.documentElement;
  const body = document.body;
  const maximumScroll = Math.max(0, Math.max(documentElement.scrollHeight, body.scrollHeight) - window.innerHeight);

  if (window.scrollY > maximumScroll + 2) {
    window.scrollTo({ top: maximumScroll, behavior: "auto" });
  }

  if (!pendingWorkId || Date.now() > pendingUntil) {
    pendingWorkId = null;
    return;
  }

  const workItem = document.querySelector(`[data-work-id="${cssEscape(pendingWorkId)}"]`);
  if (!workItem) return;

  const rect = workItem.getBoundingClientRect();
  const visibleTop = 92;
  const visibleBottom = Math.max(visibleTop + 120, window.innerHeight - 150);
  const isVisible = rect.bottom > visibleTop && rect.top < visibleBottom;

  if (forceFocus || !isVisible || rect.top > window.innerHeight * 0.72) {
    const target = Math.max(0, window.scrollY + rect.top - Math.min(140, window.innerHeight * 0.18));
    window.scrollTo({ top: target, behavior: "auto" });
  }
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
}

scheduleViewportRepair(false);
