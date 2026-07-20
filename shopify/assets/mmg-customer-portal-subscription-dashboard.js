(() => {
  const ELEMENT_NAME = "mmg-customer-portal-subscription-dashboard";

  const text = (element, value) => {
    if (element) element.textContent = String(value ?? "");
  };

  const setHref = (element, value, fallback) => {
    if (!(element instanceof HTMLAnchorElement)) return;
    element.href = value || fallback || "#";
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

  const formatMoney = (cents) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format((Number(cents) || 0) / 100);

  const label = (value) =>
    String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  const countdown = (value) => {
    if (!value) return "No deadline";
    const deadline = new Date(value).getTime();
    if (!Number.isFinite(deadline)) return "No deadline";
    const difference = deadline - Date.now();
    if (difference <= 0) return "Review window closed";

    const totalMinutes = Math.ceil(difference / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  class MMGCustomerPortalSubscriptionDashboard extends HTMLElement {
    constructor() {
      super();
      this.abortController = null;
      this.countdownTimer = null;
      this.refreshTimer = null;
      this.currentDeadline = null;
      this.boundRefresh = () => this.scheduleRefresh();
    }

    connectedCallback() {
      if (this.dataset.mmgPortalReady === "true") return;
      this.dataset.mmgPortalReady = "true";
      this.cacheElements();
      this.addEventListeners();
      this.load();
    }

    disconnectedCallback() {
      this.abortController?.abort();
      window.clearInterval(this.countdownTimer);
      window.clearTimeout(this.refreshTimer);
      for (const eventName of [
        "mmg:knowledge-library-selection-updated",
        "mmg:knowledge-library-package-confirmed",
        "mmg:entitlement-counter-ready",
      ]) {
        document.removeEventListener(eventName, this.boundRefresh);
      }
    }

    cacheElements() {
      this.status = this.querySelector("[data-mmg-portal-status]");
      this.statusText = this.querySelector("[data-mmg-portal-status-text]");
      this.blocked = this.querySelector("[data-mmg-portal-blocked]");
      this.blockedKicker = this.querySelector("[data-mmg-portal-blocked-kicker]");
      this.blockedTitle = this.querySelector("[data-mmg-portal-blocked-title]");
      this.blockedCopy = this.querySelector("[data-mmg-portal-blocked-copy]");
      this.loginLink = this.querySelector("[data-mmg-portal-login-link]");
      this.dashboard = this.querySelector("[data-mmg-portal-dashboard]");
      this.membershipStatus = this.querySelector("[data-mmg-portal-membership-status]");
      this.price = this.querySelector("[data-mmg-portal-price]");
      this.plan = this.querySelector("[data-mmg-portal-plan]");
      this.planDetail = this.querySelector("[data-mmg-portal-plan-detail]");
      this.cycle = this.querySelector("[data-mmg-portal-cycle]");
      this.primaryAction = this.querySelector("[data-mmg-portal-primary-action]");
      this.primaryActionCopy = this.querySelector("[data-mmg-portal-primary-action-copy]");
      this.assetsRemaining = this.querySelector("[data-mmg-portal-assets-remaining]");
      this.assetsDetail = this.querySelector("[data-mmg-portal-assets-detail]");
      this.packagesCompleted = this.querySelector("[data-mmg-portal-packages-completed]");
      this.packagesDetail = this.querySelector("[data-mmg-portal-packages-detail]");
      this.currentProgress = this.querySelector("[data-mmg-portal-current-progress]");
      this.currentDetail = this.querySelector("[data-mmg-portal-current-detail]");
      this.ownedAssets = this.querySelector("[data-mmg-portal-owned-assets]");
      this.currentSection = this.querySelector("[data-mmg-portal-current-section]");
      this.currentTitle = this.querySelector("[data-mmg-portal-current-title]");
      this.currentCopy = this.querySelector("[data-mmg-portal-current-copy]");
      this.countdown = this.querySelector("[data-mmg-portal-countdown]");
      this.titleGrid = this.querySelector("[data-mmg-portal-title-grid]");
      this.currentAction = this.querySelector("[data-mmg-portal-current-action]");
      this.timeline = this.querySelector("[data-mmg-portal-timeline]");
    }

    addEventListeners() {
      for (const eventName of [
        "mmg:knowledge-library-selection-updated",
        "mmg:knowledge-library-package-confirmed",
        "mmg:entitlement-counter-ready",
      ]) {
        document.addEventListener(eventName, this.boundRefresh);
      }
    }

    scheduleRefresh() {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.load(), 220);
    }

    setLoading(message = "Loading your membership dashboard…") {
      if (this.status) this.status.hidden = false;
      if (this.blocked) this.blocked.hidden = true;
      if (this.dashboard) this.dashboard.hidden = true;
      text(this.statusText, message);
      this.setAttribute("aria-busy", "true");
    }

    setBlocked({ kicker, title, copy, loginVisible = true }) {
      if (this.status) this.status.hidden = true;
      if (this.dashboard) this.dashboard.hidden = true;
      if (this.blocked) this.blocked.hidden = false;
      text(this.blockedKicker, kicker);
      text(this.blockedTitle, title);
      text(this.blockedCopy, copy);
      if (this.loginLink) this.loginLink.hidden = !loginVisible;
      this.setAttribute("aria-busy", "false");
    }

    async load() {
      const endpoint = this.dataset.endpoint;
      if (!endpoint) {
        this.setBlocked({
          kicker: "Configuration required",
          title: "Membership dashboard is unavailable",
          copy: "The secure Customer Portal endpoint has not been configured.",
          loginVisible: false,
        });
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
          const code = payload?.error?.code || "SUBSCRIPTION_DASHBOARD_UNAVAILABLE";
          if (response.status === 401) {
            this.setBlocked({
              kicker: "Secure portal access",
              title: "Sign in to view your membership",
              copy: "Your plan, package windows, deliveries, and ownership history are private account information.",
              loginVisible: true,
            });
          } else if (response.status === 404) {
            this.setBlocked({
              kicker: "No membership record",
              title: "Start building your Knowledge Library",
              copy: "Choose a membership plan to receive recurring curated digital assets.",
              loginVisible: false,
            });
          } else {
            this.setBlocked({
              kicker: "Temporary service issue",
              title: "Your dashboard could not be loaded",
              copy: "Refresh the page or contact Customer Service if the issue continues.",
              loginVisible: false,
            });
          }
          this.dispatchError(code, payload?.error?.message || "Unable to load dashboard.");
          return;
        }

        this.render(payload.dashboard);
        this.dispatchEvent(
          new CustomEvent("mmg:customer-portal-subscription-ready", {
            bubbles: true,
            detail: { dashboard: payload.dashboard },
          }),
        );
      } catch (error) {
        if (error?.name === "AbortError") return;
        this.setBlocked({
          kicker: "Network issue",
          title: "Your dashboard could not be loaded",
          copy: "Check your connection, refresh the page, or contact Customer Service.",
          loginVisible: false,
        });
        this.dispatchError(
          "SUBSCRIPTION_DASHBOARD_NETWORK_ERROR",
          "The dashboard request failed.",
        );
      }
    }

    render(dashboard) {
      if (this.status) this.status.hidden = true;
      if (this.blocked) this.blocked.hidden = true;
      if (this.dashboard) this.dashboard.hidden = false;
      this.setAttribute("aria-busy", "false");

      const membership = dashboard.membership;
      const plan = membership.plan;
      const progress = dashboard.progress;
      const current = dashboard.currentPackage;
      const primaryAction = dashboard.primaryAction;

      text(this.membershipStatus, label(membership.status));
      this.membershipStatus?.setAttribute("data-status", membership.status);
      text(this.price, `${formatMoney(plan.monthlyPriceCents)}/month`);
      text(this.plan, `${plan.displayName} membership`);
      text(
        this.planDetail,
        `${plan.assetsPerBillingCycle} assets across ${plan.packagesPerBillingCycle} package${plan.packagesPerBillingCycle === 1 ? "" : "s"} per billing cycle`,
      );
      text(
        this.cycle,
        `Current cycle: ${formatDate(membership.currentPeriodStart)} – ${formatDate(membership.currentPeriodEnd)}`,
      );
      text(this.primaryAction, primaryAction.label);
      text(this.primaryActionCopy, primaryAction.description);
      setHref(this.primaryAction, primaryAction.href, this.dataset.libraryUrl);

      text(this.assetsRemaining, progress.remainingAssets);
      text(
        this.assetsDetail,
        `${progress.committedAssets} of ${progress.totalAssets} committed this cycle`,
      );
      text(
        this.packagesCompleted,
        `${progress.completedPackages}/${progress.totalPackages}`,
      );
      text(
        this.packagesDetail,
        `${progress.remainingPackages} package${progress.remainingPackages === 1 ? "" : "s"} remaining`,
      );
      text(this.ownedAssets, progress.totalOwnedAssets);

      if (current) {
        if (this.currentSection) this.currentSection.hidden = false;
        text(this.currentProgress, `${current.selectedAssetCount}/${current.targetAssetCount}`);
        text(
          this.currentDetail,
          `${label(current.status)} · ${current.selectedUnits} of ${current.totalUnits} units`,
        );
        text(this.currentTitle, `Package ${current.packageSequence} · ${label(current.status)}`);
        text(this.currentCopy, current.action.description);
        text(this.currentAction, current.action.label);
        setHref(this.currentAction, current.action.href, this.dataset.selectionUrl);
        this.renderTitles(current.selections);
        this.startCountdown(current.status === "open" ? current.closesAt : null);
      } else {
        if (this.currentSection) this.currentSection.hidden = false;
        text(this.currentProgress, "—");
        text(this.currentDetail, "No package window is currently open");
        text(this.currentTitle, "Your next package is being scheduled");
        text(this.currentCopy, primaryAction.description);
        text(this.currentAction, primaryAction.label);
        setHref(this.currentAction, primaryAction.href, this.dataset.libraryUrl);
        this.renderTitles([]);
        this.startCountdown(null);
      }

      this.renderTimeline(dashboard.packages || []);
    }

    renderTitles(selections) {
      if (!this.titleGrid) return;
      const fragment = document.createDocumentFragment();

      if (!selections.length) {
        const empty = document.createElement("p");
        empty.className = "mmg-portal-subscription__empty";
        empty.textContent = "No titles are attached to this package yet.";
        fragment.append(empty);
      }

      for (const selection of selections) {
        const article = document.createElement("article");
        article.className = "mmg-portal-subscription__title-card";

        if (selection.squareThumbnailUrl) {
          const image = document.createElement("img");
          image.src = selection.squareThumbnailUrl;
          image.alt = "";
          image.loading = "lazy";
          image.width = 180;
          image.height = 180;
          article.append(image);
        }

        const copy = document.createElement("div");
        const meta = document.createElement("span");
        meta.textContent = `${label(selection.state)} · ${label(selection.format)}`;
        const title = document.createElement("h4");
        title.textContent = selection.title;
        const topic = document.createElement("p");
        topic.textContent = label(selection.topic);
        copy.append(meta, title, topic);
        article.append(copy);
        fragment.append(article);
      }

      this.titleGrid.replaceChildren(fragment);
    }

    renderTimeline(packages) {
      if (!this.timeline) return;
      const fragment = document.createDocumentFragment();

      if (!packages.length) {
        const item = document.createElement("li");
        item.className = "mmg-portal-subscription__timeline-empty";
        item.textContent = "Your package schedule will appear after the billing cycle is reconciled.";
        fragment.append(item);
      }

      for (const item of packages) {
        const row = document.createElement("li");
        row.className = "mmg-portal-subscription__timeline-item";
        row.dataset.status = item.status;

        const marker = document.createElement("span");
        marker.className = "mmg-portal-subscription__timeline-marker";
        marker.setAttribute("aria-hidden", "true");

        const copy = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = `Package ${item.packageSequence}`;
        const detail = document.createElement("span");
        const scheduleDate = item.deliveredAt || item.deliveryReadyAt || item.confirmedAt || item.opensAt;
        detail.textContent = `${label(item.status)} · ${formatDate(scheduleDate)}`;
        const titleCount = document.createElement("small");
        titleCount.textContent = `${item.selections.length} title${item.selections.length === 1 ? "" : "s"}`;
        copy.append(heading, detail, titleCount);
        row.append(marker, copy);
        fragment.append(row);
      }

      this.timeline.replaceChildren(fragment);
    }

    startCountdown(deadline) {
      window.clearInterval(this.countdownTimer);
      this.currentDeadline = deadline;
      const update = () => text(this.countdown, countdown(this.currentDeadline));
      update();
      if (deadline) this.countdownTimer = window.setInterval(update, 30000);
    }

    dispatchError(code, message) {
      this.dispatchEvent(
        new CustomEvent("mmg:customer-portal-subscription-error", {
          bubbles: true,
          detail: { code, message },
        }),
      );
    }
  }

  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, MMGCustomerPortalSubscriptionDashboard);
  }
})();
