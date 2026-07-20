(() => {
  const COMPONENT_TAG = "mmg-knowledge-library-picker";
  if (customElements.get(COMPONENT_TAG)) return;

  const reasonMessages = {
    CUSTOMER_NOT_AUTHENTICATED: "Sign in through the Customer Portal to choose this title.",
    SUBSCRIPTION_NOT_ACTIVE: "An active MMG Knowledge Subscription is required.",
    WINDOW_NOT_OPEN: "Your current selection window is not open.",
    INSUFFICIENT_REMAINING_UNITS: "This title requires more units than remain in this package.",
    ALREADY_SELECTED: "This title is already selected for the current package.",
    MISSING_DELIVERY_PACKAGE: "This title is still being prepared for subscriber delivery.",
    MISSING_SQUARE_THUMBNAIL: "This title is still being prepared for the subscription library.",
    NOT_SUBSCRIPTION_ELIGIBLE: "This title is not included with membership.",
    ASSET_NOT_ACTIVE: "This title is not currently available.",
    ASSET_RETIRED: "This title is no longer available for new selection.",
  };

  const selectionLabels = {
    available: "Available",
    selected: "Selected",
    reserved: "Processing",
    confirmed: "Confirmed",
    unavailable: "Unavailable",
  };

  const humanize = (value) =>
    String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  const uniqueSorted = (values) =>
    [...new Set(values.filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );

  const safeUrl = (value, fallback = "#") => {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      if (!["http:", "https:"].includes(url.protocol)) return fallback;
      return url.href;
    } catch {
      return fallback;
    }
  };

  const randomRequestId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `mmg-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  };

  class MMGKnowledgeLibraryPicker extends HTMLElement {
    connectedCallback() {
      if (this.dataset.mmgPickerReady === "true") return;
      this.dataset.mmgPickerReady = "true";

      this.endpoint = this.resolveEndpoint(this.dataset.endpoint);
      this.csrfToken =
        this.dataset.csrfToken ||
        document.querySelector('meta[name="mmg-csrf-token"]')?.content ||
        "";
      this.snapshot = null;
      this.busy = false;
      this.pendingFocusAssetId = null;
      this.filters = {
        search: "",
        topic: "",
        experienceLevel: "",
        format: "",
      };

      this.cacheElements();
      this.bindEvents();
      this.provisionalItems = this.readProvisionalItems();

      if (!this.endpoint) {
        this.showFatalError(
          "PICKER_ENDPOINT_INVALID",
          "The secure title-selection endpoint is not configured on this page.",
        );
        return;
      }

      this.loadSnapshot();
    }

    resolveEndpoint(value) {
      try {
        const endpoint = new URL(value || "/api/knowledge-library/picker", window.location.href);
        if (endpoint.origin !== window.location.origin) return null;
        return endpoint.href;
      } catch {
        return null;
      }
    }

    cacheElements() {
      this.status = this.querySelector("[data-mmg-picker-status]");
      this.statusText = this.querySelector("[data-mmg-picker-status-text]");
      this.spinner = this.querySelector(".mmg-picker__spinner");
      this.blocked = this.querySelector("[data-mmg-picker-blocked]");
      this.blockedTitle = this.querySelector("[data-mmg-picker-blocked-title]");
      this.blockedCopy = this.querySelector("[data-mmg-picker-blocked-copy]");
      this.blockedPrimary = this.querySelector("[data-mmg-picker-blocked-primary]");
      this.blockedSecondary = this.querySelector("[data-mmg-picker-blocked-secondary]");
      this.workspace = this.querySelector("[data-mmg-picker-workspace]");
      this.confirmed = this.querySelector("[data-mmg-picker-confirmed]");
      this.counterValue = this.querySelector("[data-mmg-picker-counter-value]");
      this.counterDetail = this.querySelector("[data-mmg-picker-counter-detail]");
      this.grid = this.querySelector("[data-mmg-picker-grid]");
      this.empty = this.querySelector("[data-mmg-picker-empty]");
      this.searchInput = this.querySelector("[data-mmg-picker-search]");
      this.topicSelect = this.querySelector("[data-mmg-picker-topic]");
      this.levelSelect = this.querySelector("[data-mmg-picker-level]");
      this.formatSelect = this.querySelector("[data-mmg-picker-format]");
      this.resetButton = this.querySelector("[data-mmg-picker-reset]");
      this.emptyResetButton = this.querySelector("[data-mmg-picker-empty-reset]");
      this.summaryText = this.querySelector("[data-mmg-picker-summary-text]");
      this.confirmTitle = this.querySelector("[data-mmg-picker-confirmation-title]");
      this.confirmCopy = this.querySelector("[data-mmg-picker-confirmation-copy]");
      this.confirmButton = this.querySelector("[data-mmg-picker-confirm]");
    }

    bindEvents() {
      this.searchInput?.addEventListener("input", () => {
        this.filters.search = this.searchInput.value.trim().toLowerCase();
        this.renderItems();
      });
      this.topicSelect?.addEventListener("change", () => {
        this.filters.topic = this.topicSelect.value;
        this.renderItems();
      });
      this.levelSelect?.addEventListener("change", () => {
        this.filters.experienceLevel = this.levelSelect.value;
        this.renderItems();
      });
      this.formatSelect?.addEventListener("change", () => {
        this.filters.format = this.formatSelect.value;
        this.renderItems();
      });
      this.resetButton?.addEventListener("click", () => this.resetFilters());
      this.emptyResetButton?.addEventListener("click", () => this.resetFilters());
      this.confirmButton?.addEventListener("click", () =>
        this.mutate({ action: "confirm" }),
      );
    }

    readProvisionalItems() {
      return Array.from(
        this.querySelectorAll(
          "[data-mmg-picker-provisional-data] script[data-mmg-library-asset]",
        ),
      ).flatMap((script) => {
        try {
          const item = JSON.parse(script.textContent || "{}");
          return item?.assetId ? [item] : [];
        } catch {
          return [];
        }
      });
    }

    async loadSnapshot() {
      this.setBusy(true, "Loading your eligible titles…");

      try {
        const response = await fetch(this.endpoint, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-MMG-Picker-Context": this.dataset.context || "knowledge-library",
          },
          credentials: "same-origin",
          cache: "no-store",
        });

        this.captureCsrfToken(response);
        const payload = await this.readJson(response);

        if (!response.ok || !payload?.ok || !payload.snapshot) {
          this.handleApiFailure(response.status, payload);
          return;
        }

        this.snapshot = payload.snapshot;
        this.renderSnapshot();
        this.dispatch("mmg:knowledge-library-picker-ready", {
          snapshot: this.snapshot,
        });
      } catch (error) {
        this.showFatalError(
          "PICKER_LOAD_FAILED",
          "We could not load your current title-selection window. Refresh the page or open the Customer Portal.",
          error,
        );
      } finally {
        this.setBusy(false);
      }
    }

    captureCsrfToken(response) {
      const responseToken = response.headers.get("X-MMG-CSRF-Token");
      if (responseToken) this.csrfToken = responseToken;
    }

    async readJson(response) {
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return null;
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    handleApiFailure(status, payload) {
      const code = payload?.error?.code || `HTTP_${status}`;
      const message =
        payload?.error?.message ||
        "The title-selection service returned an unexpected response.";

      if (payload?.snapshot) {
        this.snapshot = payload.snapshot;
        this.renderSnapshot();
        this.announce(message, "error");
      } else if (status === 401 || status === 403) {
        this.showBlocked(
          "Sign in to choose your titles",
          "Open the Customer Portal and sign in with the account connected to your MMG Knowledge Subscription.",
          "Open Customer Portal",
          this.dataset.signInUrl,
          true,
        );
      } else if (status === 404) {
        this.showBlocked(
          "No selection window is open",
          "Your subscription may still be activating, or your current package may already be confirmed. Check the Customer Portal for the latest status.",
          "Open Customer Portal",
          this.dataset.signInUrl,
          false,
        );
      } else {
        this.showFatalError(code, message);
      }

      this.dispatch("mmg:knowledge-library-picker-error", {
        code,
        message,
        snapshot: this.snapshot,
      });
    }

    renderSnapshot() {
      const snapshot = this.snapshot;
      if (!snapshot) return;

      this.status.hidden = true;
      this.blocked.hidden = true;
      this.workspace.hidden = true;
      this.confirmed.hidden = true;

      this.renderCounter();

      if (!snapshot.customerAuthenticated) {
        this.showBlocked(
          "Sign in to choose your titles",
          "Open the Customer Portal and sign in with the account connected to your membership.",
          "Open Customer Portal",
          this.dataset.signInUrl,
          true,
        );
        return;
      }

      if (!snapshot.subscriptionActive) {
        this.showBlocked(
          "An active membership is required",
          "Choose an MMG Knowledge Subscription plan to unlock personalized title selection.",
          "View Membership Plans",
          this.dataset.membershipUrl,
          false,
        );
        return;
      }

      if (snapshot.status === "confirmed" || snapshot.window?.status === "confirmed") {
        this.confirmed.hidden = false;
        this.announce("Your title package is confirmed.", "success");
        return;
      }

      if (snapshot.window?.status !== "open") {
        this.showBlocked(
          "Your selection window is not open",
          this.windowStatusMessage(snapshot.window?.status),
          "Open Customer Portal",
          this.dataset.signInUrl,
          false,
        );
        return;
      }

      this.workspace.hidden = false;
      this.populateFilterOptions();
      this.renderItems();
      this.renderConfirmation();
      this.announce(
        `${snapshot.items.length} eligible library titles loaded.`,
        "success",
        true,
      );
    }

    windowStatusMessage(status) {
      switch (status) {
        case "scheduled":
          return "Your next title-selection window is scheduled but has not opened yet.";
        case "closed":
        case "expired":
          return "This selection window has closed. Check the Customer Portal for your next package date.";
        case "canceled":
          return "This selection window is no longer active.";
        default:
          return "No title-selection window is currently available.";
      }
    }

    renderCounter() {
      const windowState = this.snapshot?.window;
      if (!windowState) {
        this.counterValue.textContent = "Unavailable";
        this.counterDetail.textContent = "No verified entitlement window";
        return;
      }

      this.counterValue.textContent = `${windowState.selectedAssetCount} of ${windowState.targetAssetCount} titles`;
      this.counterDetail.textContent = `${windowState.remainingUnits} of ${windowState.totalUnits} units remaining`;
    }

    populateFilterOptions() {
      const items = this.snapshot?.items || [];
      this.replaceSelectOptions(
        this.topicSelect,
        "All topics",
        uniqueSorted(items.map((item) => item.topic)),
      );
      this.replaceSelectOptions(
        this.levelSelect,
        "All levels",
        uniqueSorted(items.map((item) => item.experienceLevel)),
      );
      this.replaceSelectOptions(
        this.formatSelect,
        "All formats",
        uniqueSorted(items.map((item) => item.format)),
      );
    }

    replaceSelectOptions(select, allLabel, values) {
      if (!select) return;
      const currentValue = select.value;
      select.replaceChildren();

      const allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = allLabel;
      select.append(allOption);

      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = humanize(value);
        select.append(option);
      });

      select.value = values.includes(currentValue) ? currentValue : "";
    }

    filteredItems() {
      const items = this.snapshot?.items || [];
      return items.filter((item) => {
        const haystack = [
          item.title,
          item.summary,
          item.topic,
          item.experienceLevel,
          item.format,
          item.series,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!this.filters.search || haystack.includes(this.filters.search)) &&
          (!this.filters.topic || item.topic === this.filters.topic) &&
          (!this.filters.experienceLevel ||
            item.experienceLevel === this.filters.experienceLevel) &&
          (!this.filters.format || item.format === this.filters.format)
        );
      });
    }

    renderItems() {
      if (!this.grid || !this.snapshot) return;
      const items = this.filteredItems();
      this.grid.replaceChildren();
      this.grid.setAttribute("aria-busy", "false");

      items.forEach((item) => this.grid.append(this.createCard(item)));
      this.empty.hidden = items.length !== 0;

      if (this.summaryText) {
        const visibleLabel = items.length === 1 ? "title" : "titles";
        const ownedCount = this.snapshot.excluded?.ownedCount || 0;
        this.summaryText.textContent = `${items.length} ${visibleLabel} shown. ${ownedCount} already-owned ${ownedCount === 1 ? "title is" : "titles are"} excluded.`;
      }

      if (this.pendingFocusAssetId) {
        const escaped = window.CSS?.escape
          ? CSS.escape(this.pendingFocusAssetId)
          : this.pendingFocusAssetId.replace(/[^a-zA-Z0-9_-]/g, "");
        const button = this.grid.querySelector(
          `[data-asset-id="${escaped}"] [data-mmg-picker-item-action]`,
        );
        button?.focus({ preventScroll: true });
        this.pendingFocusAssetId = null;
      }
    }

    createCard(item) {
      const card = document.createElement("article");
      card.className = "mmg-picker-card";
      card.dataset.assetId = item.assetId;
      card.dataset.selectionState = item.selectionState;

      const media = document.createElement("div");
      media.className = "mmg-picker-card__media";

      const image = document.createElement("img");
      image.src = safeUrl(item.squareThumbnailUrl || item.portraitCoverUrl, "");
      image.alt = `${item.title} cover`;
      image.loading = "lazy";
      image.decoding = "async";
      media.append(image);

      const state = document.createElement("span");
      state.className = "mmg-picker-card__state";
      state.textContent = selectionLabels[item.selectionState] || "Unavailable";
      media.append(state);

      const body = document.createElement("div");
      body.className = "mmg-picker-card__body";

      const meta = document.createElement("div");
      meta.className = "mmg-picker-card__meta";
      [item.topic, item.experienceLevel, item.format]
        .filter(Boolean)
        .forEach((value) => {
          const pill = document.createElement("span");
          pill.textContent = humanize(value);
          meta.append(pill);
        });
      body.append(meta);

      const title = document.createElement("h3");
      title.className = "mmg-picker-card__title";
      title.textContent = item.title;
      body.append(title);

      if (item.summary) {
        const summary = document.createElement("p");
        summary.className = "mmg-picker-card__summary";
        summary.textContent = item.summary;
        body.append(summary);
      }

      const disabledReason = this.disabledReason(item);
      if (disabledReason) {
        const reason = document.createElement("p");
        reason.className = "mmg-picker-card__reason";
        reason.textContent = disabledReason;
        body.append(reason);
      }

      const footer = document.createElement("div");
      footer.className = "mmg-picker-card__footer";

      const link = document.createElement("a");
      link.className = "mmg-picker-card__link";
      link.href = safeUrl(item.url);
      link.textContent = "View details";
      footer.append(link);

      const action = document.createElement("button");
      action.type = "button";
      action.className = "mmg-picker__button mmg-picker-card__button";
      action.dataset.mmgPickerItemAction = "true";
      action.dataset.assetId = item.assetId;

      if (item.canRemove) {
        action.classList.add("mmg-picker__button--remove");
        action.textContent = "Remove";
        action.setAttribute("aria-label", `Remove ${item.title} from this package`);
        action.addEventListener("click", () =>
          this.mutate({ action: "remove", assetId: item.assetId }),
        );
      } else if (item.canSelect) {
        action.classList.add("mmg-picker__button--primary");
        action.textContent = "Choose Title";
        action.setAttribute("aria-label", `Choose ${item.title} for this package`);
        action.addEventListener("click", () =>
          this.mutate({ action: "select", assetId: item.assetId }),
        );
      } else {
        action.classList.add("mmg-picker__button--secondary");
        action.textContent =
          item.selectionState === "confirmed" ? "Confirmed" : "Unavailable";
        action.disabled = true;
        action.setAttribute(
          "aria-label",
          `${item.title}: ${disabledReason || "not available for selection"}`,
        );
      }

      footer.append(action);
      body.append(footer);
      card.append(media, body);
      return card;
    }

    disabledReason(item) {
      if (["selected", "reserved", "confirmed"].includes(item.selectionState)) {
        if (item.selectionState === "reserved") {
          return "This selection is being processed and cannot be changed right now.";
        }
        if (item.selectionState === "confirmed") {
          return "This title is confirmed for the current package.";
        }
        return "";
      }

      const codes = item.eligibilityReasonCodes || [];
      const code = codes.find((candidate) => reasonMessages[candidate]);
      return code
        ? reasonMessages[code]
        : "This title is not available for the current package.";
    }

    renderConfirmation() {
      const snapshot = this.snapshot;
      if (!snapshot || !this.confirmButton) return;

      const { selectedAssetCount, targetAssetCount, remainingUnits } =
        snapshot.window;
      this.confirmButton.disabled = !snapshot.canConfirm || this.busy;

      if (snapshot.canConfirm) {
        this.confirmTitle.textContent = "Your two-title package is ready";
        this.confirmCopy.textContent =
          "Review your selected titles, then confirm the package. Confirmed titles cannot be swapped through this window.";
      } else {
        const remainingTitles = Math.max(0, targetAssetCount - selectedAssetCount);
        this.confirmTitle.textContent = `Choose ${remainingTitles} more ${remainingTitles === 1 ? "title" : "titles"}`;
        this.confirmCopy.textContent = `${remainingUnits} of ${snapshot.window.totalUnits} package units remain.`;
      }
    }

    async mutate({ action, assetId }) {
      if (this.busy || !this.snapshot) return;
      if (!this.csrfToken) {
        this.announce(
          "Secure title selection is not available in this session. Open the Customer Portal and try again.",
          "error",
        );
        this.dispatch("mmg:knowledge-library-picker-error", {
          code: "PICKER_CSRF_UNAVAILABLE",
          message: "A session-bound CSRF token was not available.",
          snapshot: this.snapshot,
        });
        return;
      }

      this.pendingFocusAssetId = assetId || null;
      this.setBusy(true, this.mutationMessage(action, assetId));

      const body = {
        action,
        requestId: randomRequestId(),
        expectedWindowVersion: this.snapshot.window.version,
        ...(assetId ? { assetId } : {}),
      };

      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-MMG-CSRF-Token": this.csrfToken,
            "X-MMG-Picker-Context": this.dataset.context || "knowledge-library",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify(body),
        });

        this.captureCsrfToken(response);
        const payload = await this.readJson(response);

        if (payload?.snapshot) {
          this.snapshot = payload.snapshot;
          this.renderSnapshot();
        }

        if (!response.ok || !payload?.ok) {
          const code = payload?.error?.code || `HTTP_${response.status}`;
          const message =
            payload?.error?.message ||
            "The title selection could not be updated.";
          this.announce(message, "error");
          this.dispatch("mmg:knowledge-library-picker-error", {
            code,
            message,
            snapshot: this.snapshot,
          });
          return;
        }

        const message = this.successMessage(action, assetId);
        this.announce(message, "success");

        if (action === "confirm") {
          this.dispatch("mmg:knowledge-library-package-confirmed", {
            snapshot: this.snapshot,
          });
        } else {
          this.dispatch("mmg:knowledge-library-selection-updated", {
            action,
            assetId,
            snapshot: this.snapshot,
          });
        }
      } catch (error) {
        this.announce(
          "The selection could not be saved. Your last verified package state is still displayed.",
          "error",
        );
        this.dispatch("mmg:knowledge-library-picker-error", {
          code: "PICKER_MUTATION_FAILED",
          message: error instanceof Error ? error.message : String(error),
          snapshot: this.snapshot,
        });
      } finally {
        this.setBusy(false);
        if (this.snapshot?.status !== "confirmed") {
          this.renderConfirmation();
        }
      }
    }

    mutationMessage(action, assetId) {
      const title = this.snapshot?.items.find((item) => item.assetId === assetId)?.title;
      if (action === "select") return `Selecting ${title || "title"}…`;
      if (action === "remove") return `Removing ${title || "title"}…`;
      return "Confirming your two-title package…";
    }

    successMessage(action, assetId) {
      const title = this.snapshot?.items.find((item) => item.assetId === assetId)?.title;
      if (action === "select") return `${title || "Title"} selected.`;
      if (action === "remove") return `${title || "Title"} removed.`;
      return "Your two-title package is confirmed.";
    }

    resetFilters() {
      this.filters = {
        search: "",
        topic: "",
        experienceLevel: "",
        format: "",
      };
      if (this.searchInput) this.searchInput.value = "";
      if (this.topicSelect) this.topicSelect.value = "";
      if (this.levelSelect) this.levelSelect.value = "";
      if (this.formatSelect) this.formatSelect.value = "";
      this.renderItems();
      this.searchInput?.focus();
    }

    setBusy(busy, message = "") {
      this.busy = busy;
      this.dataset.busy = busy ? "true" : "false";
      if (busy) {
        this.status.hidden = false;
        this.status.dataset.tone = "neutral";
        this.spinner.hidden = false;
        if (message) this.statusText.textContent = message;
      }

      this.querySelectorAll("button").forEach((button) => {
        if (busy) {
          button.dataset.mmgWasDisabled = button.disabled ? "true" : "false";
          button.disabled = true;
        } else if (button.dataset.mmgWasDisabled === "false") {
          button.disabled = false;
          delete button.dataset.mmgWasDisabled;
        } else if (button.dataset.mmgWasDisabled === "true") {
          delete button.dataset.mmgWasDisabled;
        }
      });
    }

    announce(message, tone = "neutral", visuallyQuiet = false) {
      if (!this.status || !this.statusText) return;
      this.status.hidden = false;
      this.status.dataset.tone = tone;
      this.spinner.hidden = true;
      this.statusText.textContent = message;

      if (visuallyQuiet) {
        window.setTimeout(() => {
          if (!this.busy && this.statusText.textContent === message) {
            this.status.hidden = true;
          }
        }, 1800);
      }
    }

    showBlocked(title, copy, primaryLabel, primaryUrl, showMembershipSecondary) {
      this.status.hidden = true;
      this.workspace.hidden = true;
      this.confirmed.hidden = true;
      this.blocked.hidden = false;
      this.blockedTitle.textContent = title;
      this.blockedCopy.textContent = copy;
      this.blockedPrimary.textContent = primaryLabel;
      this.blockedPrimary.href = safeUrl(primaryUrl, this.dataset.signInUrl || "#");
      this.blockedSecondary.hidden = !showMembershipSecondary;
      if (showMembershipSecondary) {
        this.blockedSecondary.href = safeUrl(
          this.dataset.membershipUrl,
          "/products/mmg-knowledge-subscription",
        );
      }
    }

    showFatalError(code, message, error) {
      this.status.hidden = false;
      this.status.dataset.tone = "error";
      this.spinner.hidden = true;
      this.statusText.textContent = message;
      this.workspace.hidden = true;
      this.confirmed.hidden = true;
      this.blocked.hidden = false;
      this.blockedTitle.textContent = "Title selection is temporarily unavailable";
      this.blockedCopy.textContent = message;
      this.blockedPrimary.textContent = "Open Customer Portal";
      this.blockedPrimary.href = safeUrl(this.dataset.signInUrl, "/pages/customer-portal");
      this.blockedSecondary.hidden = false;
      this.blockedSecondary.textContent = "Browse the Knowledge Library";
      this.blockedSecondary.href = safeUrl(this.dataset.libraryUrl, "/pages/knowledge-library");

      this.dispatch("mmg:knowledge-library-picker-error", {
        code,
        message,
        error: error instanceof Error ? error.message : null,
        snapshot: this.snapshot,
        provisionalItemCount: this.provisionalItems?.length || 0,
      });
    }

    dispatch(name, detail) {
      this.dispatchEvent(
        new CustomEvent(name, {
          bubbles: true,
          detail,
        }),
      );
    }
  }

  customElements.define(COMPONENT_TAG, MMGKnowledgeLibraryPicker);
})();
