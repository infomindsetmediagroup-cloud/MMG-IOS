(() => {
  const ELEMENT_NAME = "mmg-learning-profile";

  const text = (element, value) => {
    if (element) element.textContent = String(value ?? "");
  };

  const valuesFor = (root, groupName) =>
    [...root.querySelectorAll(`[data-profile-group="${groupName}"] input[type="checkbox"]:checked`)]
      .map((input) => input.value)
      .filter(Boolean);

  const setGroup = (root, groupName, values) => {
    const selected = new Set(Array.isArray(values) ? values : []);
    for (const input of root.querySelectorAll(
      `[data-profile-group="${groupName}"] input[type="checkbox"]`,
    )) {
      input.checked = selected.has(input.value);
    }
  };

  class MMGLearningProfile extends HTMLElement {
    constructor() {
      super();
      this.abortController = null;
      this.boundSubmit = (event) => this.submit(event);
      this.boundChange = () => this.updateCompletion();
    }

    connectedCallback() {
      if (this.dataset.mmgLearningProfileReady === "true") return;
      this.dataset.mmgLearningProfileReady = "true";
      this.cache();
      this.form?.addEventListener("submit", this.boundSubmit);
      this.form?.addEventListener("change", this.boundChange);
      this.load();
    }

    disconnectedCallback() {
      this.abortController?.abort();
      this.form?.removeEventListener("submit", this.boundSubmit);
      this.form?.removeEventListener("change", this.boundChange);
    }

    cache() {
      this.status = this.querySelector("[data-mmg-learning-profile-status]");
      this.statusText = this.querySelector("[data-mmg-learning-profile-status-text]");
      this.blocked = this.querySelector("[data-mmg-learning-profile-blocked]");
      this.blockedTitle = this.querySelector("[data-mmg-learning-profile-blocked-title]");
      this.blockedCopy = this.querySelector("[data-mmg-learning-profile-blocked-copy]");
      this.login = this.querySelector("[data-mmg-learning-profile-login]");
      this.form = this.querySelector("[data-mmg-learning-profile-form]");
      this.saveButton = this.querySelector("[data-mmg-learning-profile-save]");
      this.message = this.querySelector("[data-mmg-learning-profile-message]");
      this.completion = this.querySelector("[data-mmg-learning-profile-completion]");
    }

    setLoading(message) {
      if (this.status) this.status.hidden = false;
      if (this.blocked) this.blocked.hidden = true;
      if (this.form) this.form.hidden = true;
      text(this.statusText, message);
      this.setAttribute("aria-busy", "true");
    }

    setBlocked(title, copy, showLogin = false) {
      if (this.status) this.status.hidden = true;
      if (this.form) this.form.hidden = true;
      if (this.blocked) this.blocked.hidden = false;
      if (this.login) this.login.hidden = !showLogin;
      text(this.blockedTitle, title);
      text(this.blockedCopy, copy);
      this.setAttribute("aria-busy", "false");
    }

    showForm() {
      if (this.status) this.status.hidden = true;
      if (this.blocked) this.blocked.hidden = true;
      if (this.form) this.form.hidden = false;
      this.setAttribute("aria-busy", "false");
      this.updateCompletion();
    }

    async load() {
      const endpoint = this.dataset.endpoint;
      if (!endpoint) {
        this.setBlocked(
          "Learning profile unavailable",
          "The secure profile endpoint has not been configured.",
        );
        return;
      }

      this.abortController?.abort();
      this.abortController = new AbortController();
      this.setLoading("Loading your learning profile…");

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: this.abortController.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          if (response.status === 401) {
            this.setBlocked(
              "Sign in to manage your profile",
              "Your learning preferences are private Customer Portal data.",
              true,
            );
          } else {
            this.setBlocked(
              "Your learning profile could not be loaded",
              "Refresh the page or contact Customer Service if the issue continues.",
            );
          }
          return;
        }

        this.populate(payload.profile);
        this.showForm();
      } catch (error) {
        if (error?.name === "AbortError") return;
        this.setBlocked(
          "Your learning profile could not be loaded",
          "Check your connection and refresh the page.",
        );
      }
    }

    populate(profile) {
      if (!profile || !this.form) return;
      const setSelect = (name, value) => {
        const select = this.form.elements.namedItem(name);
        if (select instanceof HTMLSelectElement && value) select.value = value;
      };
      setSelect("roleCode", profile.roleCode);
      setSelect("primaryGoal", profile.primaryGoal);
      setSelect("experienceLevel", profile.experienceLevel || "beginner");
      setGroup(this, "primaryTopics", profile.primaryTopics);
      setGroup(this, "secondaryTopics", profile.secondaryTopics);
      setGroup(this, "preferredFormats", profile.preferredFormats);
      setGroup(this, "excludedTopics", profile.excludedTopics);
    }

    payload() {
      const role = this.form?.elements.namedItem("roleCode");
      const goal = this.form?.elements.namedItem("primaryGoal");
      const experience = this.form?.elements.namedItem("experienceLevel");
      return {
        roleCode: role instanceof HTMLSelectElement ? role.value : "",
        primaryGoal: goal instanceof HTMLSelectElement ? goal.value : "",
        secondaryGoals: [],
        experienceLevel:
          experience instanceof HTMLSelectElement ? experience.value : "beginner",
        primaryTopics: valuesFor(this, "primaryTopics"),
        secondaryTopics: valuesFor(this, "secondaryTopics"),
        preferredFormats: valuesFor(this, "preferredFormats"),
        excludedTopics: valuesFor(this, "excludedTopics"),
        onboardingVersion: "1.0.0",
      };
    }

    updateCompletion() {
      const payload = this.payload();
      const complete = Boolean(
        payload.roleCode && payload.primaryGoal && payload.primaryTopics.length > 0,
      );
      text(
        this.completion,
        complete
          ? "Profile ready for personalized curation"
          : "Choose a role, primary goal, and at least one primary topic",
      );
      if (this.saveButton) this.saveButton.disabled = !complete;
      return complete;
    }

    async submit(event) {
      event.preventDefault();
      if (!this.updateCompletion()) return;
      const endpoint = this.dataset.endpoint;
      const csrfToken = this.dataset.csrfToken;
      if (!endpoint || !csrfToken) {
        this.showMessage(
          "The secure profile token is unavailable. Refresh the Customer Portal.",
          true,
        );
        return;
      }

      if (this.saveButton) this.saveButton.disabled = true;
      this.showMessage("Saving your learning profile…", false);
      try {
        const response = await fetch(endpoint, {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-MMG-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(this.payload()),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error?.code || "MMG_LEARNING_PROFILE_SAVE_FAILED");
        }
        this.populate(payload.profile);
        this.showMessage(
          "Learning profile saved. Kairos will use it for future eligible packages.",
          false,
        );
        this.dispatchEvent(
          new CustomEvent("mmg:learning-profile-updated", {
            bubbles: true,
            detail: { status: payload.profile?.status || "active" },
          }),
        );
      } catch {
        this.showMessage(
          "Your profile could not be saved. Try again or contact Customer Service.",
          true,
        );
      } finally {
        if (this.saveButton) this.saveButton.disabled = !this.updateCompletion();
      }
    }

    showMessage(message, error) {
      if (!this.message) return;
      this.message.hidden = false;
      this.message.dataset.state = error ? "error" : "success";
      text(this.message, message);
    }
  }

  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, MMGLearningProfile);
  }
})();