(() => {
  const text = (value, fallback = "—") => {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  };

  const label = (value) =>
    text(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const dateTime = (value) => {
    if (!value) return "Not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
  };

  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = text(content, "");
    return node;
  };

  const pill = (value, modifier = value) => {
    const node = element("span", "mmg-operations-dashboard__pill", label(value));
    node.dataset.state = text(modifier, "unknown").toLowerCase();
    return node;
  };

  class MMGCommerceOperationsDashboard extends HTMLElement {
    connectedCallback() {
      if (this.dataset.initialized === "true") return;
      this.dataset.initialized = "true";
      this.endpoint = this.dataset.endpoint || "/api/admin/commerce/operations";
      this.environment = this.querySelector("[data-mmg-operations-environment]");
      this.refresh = this.querySelector("[data-mmg-operations-refresh]");
      this.status = this.querySelector("[data-mmg-operations-status]");
      this.statusText = this.querySelector("[data-mmg-operations-status-text]");
      this.blocked = this.querySelector("[data-mmg-operations-blocked]");
      this.content = this.querySelector("[data-mmg-operations-content]");
      this.summary = this.querySelector("[data-mmg-operations-summary]");
      this.incidents = this.querySelector("[data-mmg-operations-incidents]");
      this.incidentCount = this.querySelector("[data-mmg-operations-incident-count]");
      this.signals = this.querySelector("[data-mmg-operations-signals]");
      this.evaluated = this.querySelector("[data-mmg-operations-evaluated]");
      this.controls = this.querySelector("[data-mmg-operations-controls]");
      this.refresh?.addEventListener("click", () => this.load());
      this.environment?.addEventListener("change", () => this.load());
      this.load();
    }

    setLoading(message) {
      if (this.status) this.status.hidden = false;
      if (this.statusText) this.statusText.textContent = message;
      if (this.blocked) this.blocked.hidden = true;
      if (this.content) this.content.hidden = true;
      if (this.refresh) this.refresh.disabled = true;
    }

    setBlocked(title, copy) {
      if (this.status) this.status.hidden = true;
      if (this.content) this.content.hidden = true;
      if (this.blocked) this.blocked.hidden = false;
      const titleNode = this.querySelector("[data-mmg-operations-blocked-title]");
      const copyNode = this.querySelector("[data-mmg-operations-blocked-copy]");
      if (titleNode) titleNode.textContent = title;
      if (copyNode) copyNode.textContent = copy;
      if (this.refresh) this.refresh.disabled = false;
    }

    async load() {
      this.setLoading("Loading protected operations state…");
      const environment = this.environment?.value || this.dataset.environment || "production";
      try {
        const url = new URL(this.endpoint, window.location.origin);
        url.searchParams.set("environment", environment);
        const response = await fetch(url, {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok !== true || !payload.dashboard) {
          if (response.status === 401 || response.status === 403) {
            this.setBlocked(
              "Operator access required",
              "Sign in with an authorized MMG commerce operator account to view private operations state.",
            );
            return;
          }
          throw new Error(payload?.error?.code || "MMG_OPERATIONS_DASHBOARD_LOAD_FAILED");
        }
        this.render(payload.dashboard);
      } catch (error) {
        this.setBlocked(
          "Operations state unavailable",
          "The protected operations service could not be reached. No controls were changed.",
        );
        this.dispatchEvent(
          new CustomEvent("mmg:commerce-operations-dashboard-error", {
            bubbles: true,
            detail: { code: error instanceof Error ? error.message : "UNKNOWN" },
          }),
        );
      }
    }

    render(dashboard) {
      if (this.status) this.status.hidden = true;
      if (this.blocked) this.blocked.hidden = true;
      if (this.content) this.content.hidden = false;
      if (this.refresh) this.refresh.disabled = false;
      this.renderSummary(dashboard);
      this.renderIncidents(dashboard.incidents || []);
      this.renderSignals(dashboard.health?.signals || [], dashboard.health?.evaluatedAt);
      this.renderControls(dashboard.controls || []);
      this.dispatchEvent(
        new CustomEvent("mmg:commerce-operations-dashboard-loaded", {
          bubbles: true,
          detail: {
            environment: dashboard.environment,
            healthStatus: dashboard.health?.status || "unknown",
            rolloutStage: dashboard.rollout?.stage || "not_initialized",
            incidentCount: Array.isArray(dashboard.incidents) ? dashboard.incidents.length : 0,
          },
        }),
      );
    }

    renderSummary(dashboard) {
      if (!this.summary) return;
      this.summary.replaceChildren();
      const items = [
        {
          label: "Health",
          value: label(dashboard.health?.status || "unknown"),
          state: dashboard.health?.status || "unknown",
          detail: `Evaluated ${dateTime(dashboard.health?.evaluatedAt)}`,
        },
        {
          label: "Rollout",
          value: label(dashboard.rollout?.stage || "not_initialized"),
          state: dashboard.rollout?.stage || "unknown",
          detail: `${text(dashboard.rollout?.cohortPercentage, "0")}% cohort`,
        },
        {
          label: "Consistency",
          value: label(dashboard.consistency?.status || "unknown"),
          state: dashboard.consistency?.status || "unknown",
          detail: `Completed ${dateTime(dashboard.consistency?.completedAt)}`,
        },
        {
          label: "Open incidents",
          value: text(dashboard.incidents?.length, "0"),
          state: dashboard.incidents?.some((item) => item.severity === "SEV1")
            ? "critical"
            : dashboard.incidents?.length
              ? "degraded"
              : "healthy",
          detail: `Release ${text(dashboard.rollout?.releaseId, "not initialized")}`,
        },
      ];
      items.forEach((item) => {
        const card = element("article", "mmg-operations-dashboard__summary-card");
        card.dataset.state = item.state;
        card.append(
          element("span", "mmg-operations-dashboard__summary-label", item.label),
          element("strong", "mmg-operations-dashboard__summary-value", item.value),
          element("small", "mmg-operations-dashboard__summary-detail", item.detail),
        );
        this.summary.append(card);
      });
    }

    renderIncidents(items) {
      if (!this.incidents) return;
      this.incidents.replaceChildren();
      if (this.incidentCount) this.incidentCount.textContent = `${items.length} open`;
      if (!items.length) {
        this.incidents.append(
          element("p", "mmg-operations-dashboard__empty", "No open incidents are recorded."),
        );
        return;
      }
      items.forEach((item) => {
        const card = element("article", "mmg-operations-dashboard__incident");
        card.dataset.severity = text(item.severity, "SEV4");
        const header = element("div", "mmg-operations-dashboard__incident-header");
        const title = element("div");
        title.append(
          element("h4", "", item.title),
          element("p", "", item.summary),
        );
        header.append(title, pill(item.severity, item.severity));
        const meta = element("div", "mmg-operations-dashboard__incident-meta");
        meta.append(
          pill(item.state, item.state),
          element("span", "", `First seen ${dateTime(item.firstSeenAt)}`),
          element("span", "", `Last seen ${dateTime(item.lastSeenAt)}`),
          element("span", "", `Version ${text(item.version)}`),
        );
        card.append(header, meta);
        this.incidents.append(card);
      });
    }

    renderSignals(items, evaluatedAt) {
      if (!this.signals) return;
      this.signals.replaceChildren();
      if (this.evaluated) this.evaluated.textContent = dateTime(evaluatedAt);
      if (!items.length) {
        this.signals.append(
          element("p", "mmg-operations-dashboard__empty", "No health snapshot has been recorded."),
        );
        return;
      }
      items.forEach((item) => {
        const card = element("article", "mmg-operations-dashboard__signal");
        card.dataset.state = item.status || "unknown";
        const header = element("div", "mmg-operations-dashboard__signal-header");
        header.append(
          element("h4", "", item.title),
          pill(item.status || "unknown", item.status || "unknown"),
        );
        card.append(
          header,
          element(
            "strong",
            "mmg-operations-dashboard__signal-value",
            `${text(item.value)} ${label(item.unit)}`,
          ),
          element(
            "p",
            "mmg-operations-dashboard__signal-meta",
            `${text(item.sampleSize, "0")} samples · ${label(item.reasonCode)}`,
          ),
        );
        this.signals.append(card);
      });
    }

    renderControls(items) {
      if (!this.controls) return;
      this.controls.replaceChildren();
      if (!items.length) {
        this.controls.append(
          element("p", "mmg-operations-dashboard__empty", "Operational controls have not been initialized."),
        );
        return;
      }
      items.forEach((item) => {
        const card = element("article", "mmg-operations-dashboard__control");
        card.append(
          element("h4", "", label(item.control)),
          pill(item.mode, item.mode),
          element("p", "", item.reason),
          element("small", "", `Version ${text(item.version)} · ${dateTime(item.changedAt)}`),
        );
        this.controls.append(card);
      });
    }
  }

  if (!customElements.get("mmg-commerce-operations-dashboard")) {
    customElements.define(
      "mmg-commerce-operations-dashboard",
      MMGCommerceOperationsDashboard,
    );
  }
})();
