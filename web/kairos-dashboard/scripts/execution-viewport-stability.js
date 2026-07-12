let repairScheduled = false;

try { history.scrollRestoration = "manual"; } catch {}

window.addEventListener("kairos:approved-action-status", event => {
  const status = event.detail?.status;
  if (["Completed", "Needs Attention", "Failed", "Rejected", "Revision Requested", "Proposal Ready"].includes(status)) {
    scheduleClamp();
  }
});

window.addEventListener("resize", scheduleClamp, { passive: true });
window.addEventListener("orientationchange", scheduleClamp, { passive: true });
window.addEventListener("pageshow", scheduleClamp, { passive: true });

function scheduleClamp() {
  if (repairScheduled) return;
  repairScheduled = true;
  requestAnimationFrame(() => {
    repairScheduled = false;
    clampScrollPosition();
  });
}

function clampScrollPosition() {
  const root = document.documentElement;
  const body = document.body;
  const viewportHeight = window.visualViewport?.height || window.innerHeight || root.clientHeight;
  const documentHeight = Math.max(root.scrollHeight, body?.scrollHeight || 0);
  const maximumScroll = Math.max(0, documentHeight - viewportHeight);
  const current = Number.isFinite(window.scrollY) ? window.scrollY : 0;

  if (current < 0) {
    window.scrollTo(0, 0);
    return;
  }

  if (current > maximumScroll + 4) {
    window.scrollTo(0, maximumScroll);
  }
}

scheduleClamp();
