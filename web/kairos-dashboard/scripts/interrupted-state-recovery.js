const STORE_KEY = "kairos.executive.command-center.v7";
const INTERRUPTED_STATUSES = new Set(["Starting", "Working", "Finalizing"]);

recoverInterruptedWork();
disableMobileWorkAutoFollow();

function recoverInterruptedWork() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const store = JSON.parse(raw);
    if (!store || !Array.isArray(store.work)) return;

    let changed = false;
    store.work = store.work.map(item => {
      if (!item || item.id === "SYS-001" || !INTERRUPTED_STATUSES.has(item.status)) return item;
      changed = true;
      return {
        ...item,
        status: "Needs Attention",
        progress: 45,
        error: "The previous execution was interrupted before a verified terminal result was recorded. Retry this action from the current Command Center session.",
        updatedAt: "Interrupted execution recovered safely",
      };
    });

    if (changed) {
      store.updatedAt = new Date().toISOString();
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    }
  } catch {
    // The Command Center store already contains its own safe fallback behavior.
  }
}

function disableMobileWorkAutoFollow() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  const nativeScrollIntoView = Element.prototype.scrollIntoView;
  if (nativeScrollIntoView.__kairosWrapped) return;

  function guardedScrollIntoView(options) {
    if (this instanceof Element && this.matches("[data-work-id]")) return;
    return nativeScrollIntoView.call(this, options);
  }

  guardedScrollIntoView.__kairosWrapped = true;
  Element.prototype.scrollIntoView = guardedScrollIntoView;
  try { history.scrollRestoration = "manual"; } catch {}
  window.addEventListener("pageshow", () => window.scrollTo({ top: 0, behavior: "auto" }), { once: true });
}
