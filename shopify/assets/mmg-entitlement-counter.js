(() => {
  const ELEMENT_NAME = "mmg-entitlement-counter";

  const text = (element, value) => {
    if (element) element.textContent = String(value ?? "");
  };

  const percent = (value, total) => {
    const safeTotal = Number(total) || 0;
    if (safeTotal <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((Number(value) || 0) / safeTotal) * 100)));
  };

  const formatDate = (value) => {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not scheduled";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  class MMGEntitlementCounter extends HTMLElement {
    constructor() {
      super();
      this.abortController = null;
      this.refreshTimer = null;
      this.boundRefresh = () => this.scheduleRefresh();
    }

    connectedCallback() {
      if (this.dataset.mmgEntitlementReady === "true") return;
      this.dataset.mmgEntitlementReady = "true";

      this.cacheElements();
      this.addEventListeners();
      this.load();
    }

    disconnectedCallback() {
      this.abortController?.abort();
      window.clearTimeout(this.refreshTimer);
      document.removeEventListener(
        "mmg:knowledge-library-selection-updated",
        this.boundRefresh,
      );
      document.removeEventListener(
        "mmg:knowledge-library-package-confirmed",
        this.boundRefresh,
      );
      document.removeEventListener(
        "mmg:knowledge-library-picker-ready",
        this.boundRefresh,
      );
    }

    cacheElements() {
      this.status = this.querySelector("[data-mmg-entitlement-status]");
      this.statusText = this.querySelector("[data-mmg-entitlement-status-text]");
      this.blocked = this.querySelector("[data-mmg-entitlement-blocked]");
      this.blockedTitle = this.querySelector("[data-mmg-entitlement-blocked-title]");
      this.blockedCopy = this.querySelector("[data-mmg-entitlement-blocked-copy]");
      this.dashboard = this.querySelector("[data-mmg-entitlement-dashboard]");
      this.plan = this.querySelector("[data-mmg-entitlement-plan]");
      this.cycle = this.querySelector("[data-mmg-entitlement-cycle]");
      this.assetsRemaining = this.querySelector(
        "[data-mmg-entitlement-assets-remaining]",
      );
      this.assetsDetail = this.querySelector(
        "[data-mmg-entitlement-assets-detail]",
      );
      this.packagesComplete = this.querySelector(
        "[data-mmg-entitlement-packages-complete]",
      );
      this.packagesDetail = this.querySelector(
        "[data-mmg-entitlement-packages-detail]",
      );
      this.windowProgress = this.querySelector(
        "[data-mmg-entitlement-window-progress]",
      );
      this.windowDetail = this.querySelector(
        "[data-mmg-entitlement-window-detail]",
      );
      this.owned = this.querySelector("[data-mmg-entitlement-owned]");
      this.progressLabel = this.querySelector(
        "[data-mmg-entitlement-progress-label]",
      );
      this.progress = this.querySelector("[data-mmg-entitlement-progress]");
      this.progressFill = this.querySelector(
        "[data-mmg-entitlement-progress-fill]",
      );
    }

    addEventListeners() {
      document.addEventListener(
        "mmg:knowledge-library-selection-updated",
        this.boundRefresh,
      );
      document.addEventListener(
        "mmg:knowledge-library-package-confirmed",
        this.boundRefresh,
      );
      document.addEventListener(
        "mmg:knowledge-library-picker-ready",
        this.boundRefresh,
      );
    }

    scheduleRefresh() {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.load(), 180);
    }

    setLoading(message = "Loading your membership progress…") {
      if (this.status) this.status.hidden = false;
      if (this.blocked) this.blocked.hidden = true;
      if (this.dashboard) this.dashboard.hidden = true;
      text(this.statusText, message);
      this.setAttribute("aria-busy", "true");
    }

    setBlocked(title, copy) {
      if (this.status) this.status.hidden = true;
      if (this.dashboard) this.dashboard.hidden = true;
      if (this.blocked) this.blocked.hidden = false;
      text(this.blockedTitle, title);
      text(this.blockedCopy, copy);
      this.setAttribute("aria-busy", "false");
    }

    async load() {
      const endpoint = this.dataset.endpoint;
      if (!endpoint) {
        this.setBlocked(
          "Membership progress is unavailable",
          "The entitlement endpoint has not been configured.",
        );
        return;
      }

      this.abortController?.abort();
      this.abortController = new AbortController();
      this.setLoading();

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: this.abortController.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok || !payload.dashboard) {
          const code = payload?.error?.code || "ENTITLEMENT_UNAVAILABLE";
          if (response.status === 401) {
            this.setBlocked(
              "Sign in to view your progress",
              "Open the Customer Portal to securely access your subscription entitlement.",
            );
          } else if (response.status === 404 || code === "ENTITLEMENT_NOT_FOUND") {
            this.setBlocked(
              "No active membership entitlement",
              "Choose an MMG Knowledge Subscription plan to begin receiving digital assets.",
            );
          } else {
            this.setBlocked(
              "Membership progress could not be loaded",
              "Refresh the page or open the Customer Portal to review your account.",
            );
          }
          this.dispatchError(code, payload?.error?.message || "Unable to load entitlement.");
          return;
        }

        this.render(payload.dashboard);
        this.dispatchEvent(
          new CustomEvent("mmg:entitlement-counter-ready", {
            bubbles: true,
            detail: { dashboard: payload.dashboard },
          }),
        );
      } catch (error) {
        if (error?.name === "AbortError") return;
        this.setBlocked(
          "Membership progress could not be loaded",
          "Refresh the page or open the Customer Portal to review your account.",
        );
        this.dispatchError("ENTITLEMENT_NETWORK_ERROR", "The entitlement request failed.");
      }
    }

    render(dashboard) {
      const counter = dashboard.counter;
      const assets = counter.assets;
      const packages = counter.packages;
      const currentWindow = counter.currentWindow;
      const usedUnits = Math.max(0, Number(assets.totalUnits) - Number(assets.remainingUnits));
      const progressPercent = percent(usedUnits, assets.totalUnits);

      if (this.status) this.status.hidden = true;
      if (this.blocked) this.blocked.hidden = true;
      if (this.dashboard) this.dashboard.hidden = false;
      this.setAttribute("aria-busy", "false");

      text(
        this.plan,
        `${counter.plan.displayName} — ${counter.plan.assetsPerBillingCycle} assets/month`,
      );
      text(
        this.cycle,
        `${formatDate(counter.cycle.startsAt)} – ${formatDate(counter.cycle.endsAt)}`,
      );
      text(this.assetsRemaining, assets.remainingUnits);
      text(
        this.assetsDetail,
        `${usedUnits} of ${assets.totalUnits} units committed this cycle`,
      );
      text(this.packagesComplete, `${packages.confirmed}/${packages.total}`);
      text(
        this.packagesDetail,
        `${packages.remaining} package${packages.remaining === 1 ? "" : "s"} remaining`,
      );
      text(this.owned, dashboard.ownership.totalOwnedAssets);

      if (currentWindow) {
        text(
          this.windowProgress,
          `${currentWindow.selectedAssetCount}/${currentWindow.targetAssetCount}`,
        );
        const windowState = currentWindow.status.replaceAll("_", " ");
        text(
          this.windowDetail,
          `${windowState} · ${currentWindow.remainingUnits} unit${currentWindow.remainingUnits === 1 ? "" : "s"} remaining`,
        );
      } else {
        text(this.windowProgress, "—");
        text(this.windowDetail, "No package window is currently scheduled");
      }

      text(this.progressLabel, `${usedUnits} of ${assets.totalUnits} assets committed`);
      if (this.progress) {
        this.progress.setAttribute("aria-valuenow", String(progressPercent));
        this.progress.setAttribute(
          "aria-valuetext",
          `${usedUnits} of ${assets.totalUnits} entitlement units committed`,
        );
      }
      if (this.progressFill) {
        this.progressFill.style.setProperty("--mmg-entitlement-progress", `${progressPercent}%`);
      }
    }

    dispatchError(code, message) {
      this.dispatchEvent(
        new CustomEvent("mmg:entitlement-counter-error", {
          bubbles: true,
          detail: { code, message },
        }),
      );
    }
  }

  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, MMGEntitlementCounter);
  }
})();
