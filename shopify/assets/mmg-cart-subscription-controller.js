(() => {
  const COMPONENT_TAG = 'mmg-cart-subscription-controller';
  const COMPONENT_VERSION = '1.0.0';

  if (customElements.get(COMPONENT_TAG)) return;

  const routesRoot = () => {
    const root = window.Shopify?.routes?.root || '/';
    return root.endsWith('/') ? root : `${root}/`;
  };

  const parsePositiveInteger = (value) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const normalizePlanCode = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

  const responseError = async (response) => {
    let payload = null;

    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    const message =
      payload?.description ||
      payload?.message ||
      `Cart request failed with status ${response.status}.`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    return error;
  };

  class MMGCartSubscriptionController extends HTMLElement {
    constructor() {
      super();
      this.abortController = null;
      this.busy = false;
      this.handleSubmit = this.handleSubmit.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.handleExternalCartUpdate = this.handleExternalCartUpdate.bind(this);
    }

    connectedCallback() {
      if (this.dataset.mmgControllerReady === 'true') return;

      this.dataset.mmgControllerReady = 'true';
      this.dataset.mmgControllerVersion = COMPONENT_VERSION;
      this.productId = parsePositiveInteger(this.dataset.productId);
      this.productHandle = this.dataset.productHandle || 'mmg-knowledge-subscription';
      this.context = this.dataset.context || 'cart';
      this.sections = String(this.dataset.sections || '')
        .split(',')
        .map((section) => section.trim())
        .filter(Boolean)
        .slice(0, 5);
      this.sectionsUrl = this.dataset.sectionsUrl || window.location.pathname || '/cart';

      this.planPanel = this.querySelector('[data-mmg-cart-plan-panel]');
      this.liveRegion = this.querySelector('[data-mmg-cart-live-region]');
      this.removeConfirmation = this.querySelector('[data-mmg-remove-confirmation]');

      this.addEventListener('submit', this.handleSubmit, true);
      this.addEventListener('click', this.handleClick);
      document.addEventListener('mmg:cart-subscription-updated', this.handleExternalCartUpdate);
      document.addEventListener('cart:updated', this.handleExternalCartUpdate);
      document.addEventListener('shopify:cart:lines-update', this.handleExternalCartUpdate);

      this.syncFromCart({ announce: false }).catch(() => {
        this.setStatus('Unable to verify the current cart. You can still review the membership plans.', 'neutral');
      });
    }

    disconnectedCallback() {
      this.removeEventListener('submit', this.handleSubmit, true);
      this.removeEventListener('click', this.handleClick);
      document.removeEventListener('mmg:cart-subscription-updated', this.handleExternalCartUpdate);
      document.removeEventListener('cart:updated', this.handleExternalCartUpdate);
      document.removeEventListener('shopify:cart:lines-update', this.handleExternalCartUpdate);
      this.abortController?.abort();
    }

    async handleExternalCartUpdate(event) {
      if (event?.detail?.source === 'mmg-cart-subscription-controller') return;
      if (!this.isConnected || this.busy) return;

      try {
        await this.syncFromCart({ announce: false });
      } catch (_error) {
        // External cart updates should not interrupt the customer's current task.
      }
    }

    handleClick(event) {
      const openButton = event.target.closest('[data-mmg-open-plans]');
      if (openButton && this.contains(openButton)) {
        event.preventDefault();
        this.openPlanPanel();
        return;
      }

      const closeButton = event.target.closest('[data-mmg-close-plans]');
      if (closeButton && this.contains(closeButton)) {
        event.preventDefault();
        this.closePlanPanel();
        return;
      }

      const requestRemoveButton = event.target.closest('[data-mmg-request-remove]');
      if (requestRemoveButton && this.contains(requestRemoveButton)) {
        event.preventDefault();
        this.showRemoveConfirmation();
        return;
      }

      const cancelRemoveButton = event.target.closest('[data-mmg-cancel-remove]');
      if (cancelRemoveButton && this.contains(cancelRemoveButton)) {
        event.preventDefault();
        this.hideRemoveConfirmation();
        return;
      }

      const confirmRemoveButton = event.target.closest('[data-mmg-confirm-remove]');
      if (confirmRemoveButton && this.contains(confirmRemoveButton)) {
        event.preventDefault();
        this.removeSubscription();
      }
    }

    async handleSubmit(event) {
      const form = event.target.closest('.mmg-three-plan-selector__form');
      if (!form || !this.contains(form)) return;

      event.preventDefault();
      event.stopPropagation();

      if (this.busy) return;

      const selectedPlan = form.querySelector('[data-mmg-plan-input]:checked');
      const sellingPlanInput = form.querySelector('[data-mmg-selling-plan-input]');
      const consentInput = form.querySelector('[data-mmg-recurring-consent]');

      if (!selectedPlan) {
        form.querySelector('[data-mmg-plan-input]:not(:disabled)')?.focus();
        this.setStatus('Select a membership plan before continuing.', 'error');
        return;
      }

      if (!consentInput?.checked) {
        consentInput?.focus();
        this.setStatus('Confirm the recurring monthly billing terms before continuing.', 'error');
        return;
      }

      const variantId = parsePositiveInteger(selectedPlan.value);
      const sellingPlanId = parsePositiveInteger(
        selectedPlan.dataset.sellingPlanId || sellingPlanInput?.value,
      );

      if (!variantId || !sellingPlanId) {
        this.setStatus(
          'This membership plan is not fully configured yet. Please try again later.',
          'error',
        );
        this.dispatchEvent(
          new CustomEvent('mmg:cart-subscription-error', {
            bubbles: true,
            detail: {
              code: 'MISSING_VARIANT_OR_SELLING_PLAN',
              context: this.context,
              planCode: selectedPlan.dataset.planCode || null,
            },
          }),
        );
        return;
      }

      const selection = {
        variantId,
        sellingPlanId,
        planCode: selectedPlan.dataset.planCode || normalizePlanCode(selectedPlan.dataset.planName),
        planName: selectedPlan.dataset.planName || 'Selected plan',
        price: selectedPlan.dataset.planPrice || '',
        priceCents: Number(selectedPlan.dataset.planPriceCents || 0),
        assetsPerBillingCycle: Number(selectedPlan.dataset.planAssets || 0),
        packagesPerBillingCycle: Number(selectedPlan.dataset.planPackages || 0),
      };

      await this.commitSelection(selection);
    }

    async commitSelection(selection) {
      this.setBusy(true);
      this.setStatus('Updating your cart…', 'working');

      try {
        const cart = await this.fetchCart();
        const existingLines = this.subscriptionLines(cart);
        const currentLine = existingLines[0] || null;
        const currentSellingPlanId = parsePositiveInteger(
          currentLine?.selling_plan_allocation?.selling_plan?.id,
        );

        if (
          existingLines.length === 1 &&
          Number(currentLine.variant_id) === selection.variantId &&
          currentSellingPlanId === selection.sellingPlanId
        ) {
          this.setStatus(`${selection.planName} is already in your cart.`, 'success');
          this.closePlanPanel();
          return;
        }

        let result;
        let action;

        if (existingLines.length === 0) {
          result = await this.addSubscription(selection, { includeSections: true });
          action = 'add';
        } else {
          result = await this.replaceSubscription(existingLines, selection);
          action = 'replace';
        }

        this.applyRenderedSections(result.sections);
        const verifiedCart = await this.fetchCart();
        const verifiedLines = this.subscriptionLines(verifiedCart);

        if (verifiedLines.length !== 1 || Number(verifiedLines[0].variant_id) !== selection.variantId) {
          throw new Error('The cart could not verify the selected membership plan.');
        }

        this.renderCartState(verifiedCart, { announce: false });
        this.closePlanPanel();
        this.hideRemoveConfirmation();
        this.setStatus(
          action === 'add'
            ? `${selection.planName} membership was added to your cart.`
            : `Your membership was changed to ${selection.planName}.`,
          'success',
        );
        this.emitCartUpdate(verifiedCart, action, selection);
      } catch (error) {
        this.setStatus(
          error?.message || 'The membership could not be added to your cart. Please try again.',
          'error',
        );
        this.dispatchEvent(
          new CustomEvent('mmg:cart-subscription-error', {
            bubbles: true,
            detail: {
              code: 'CART_MUTATION_FAILED',
              context: this.context,
              message: error?.message || 'Unknown cart error',
            },
          }),
        );
      } finally {
        this.setBusy(false);
      }
    }

    async addSubscription(selection, { includeSections, replacementToken = null } = {}) {
      const properties = {
        _mmg_subscription_plan_code: selection.planCode,
        _mmg_recurring_consent: 'confirmed',
        _mmg_cart_offer_context: this.context,
      };

      if (replacementToken) {
        properties._mmg_replacement_token = replacementToken;
      }

      const payload = {
        items: [
          {
            id: selection.variantId,
            quantity: 1,
            selling_plan: selection.sellingPlanId,
            properties,
          },
        ],
      };

      if (includeSections) this.attachSections(payload);
      return this.postCart('cart/add.js', payload);
    }

    async replaceSubscription(existingLines, selection) {
      const replacementToken = this.createReplacementToken();
      await this.addSubscription(selection, { includeSections: false, replacementToken });

      try {
        const updates = {};
        existingLines.forEach((line) => {
          if (line.key) updates[line.key] = 0;
        });

        if (Object.keys(updates).length === 0) {
          throw new Error('The existing membership line could not be identified for replacement.');
        }

        const payload = { updates };
        this.attachSections(payload);
        return await this.postCart('cart/update.js', payload);
      } catch (error) {
        await this.rollbackReplacement(replacementToken);
        throw error;
      }
    }

    async rollbackReplacement(replacementToken) {
      try {
        const cart = await this.fetchCart();
        const replacementLine = this.subscriptionLines(cart).find(
          (line) => line.properties?._mmg_replacement_token === replacementToken,
        );

        if (!replacementLine?.key) return;

        await this.postCart('cart/change.js', {
          id: replacementLine.key,
          quantity: 0,
        });
      } catch (_error) {
        this.dispatchEvent(
          new CustomEvent('mmg:cart-subscription-critical-error', {
            bubbles: true,
            detail: {
              code: 'REPLACEMENT_ROLLBACK_FAILED',
              context: this.context,
            },
          }),
        );
      }
    }

    async removeSubscription() {
      if (this.busy) return;

      this.setBusy(true);
      this.setStatus('Removing the membership from your cart…', 'working');

      try {
        const cart = await this.fetchCart();
        const existingLines = this.subscriptionLines(cart);

        if (existingLines.length === 0) {
          this.hideRemoveConfirmation();
          this.renderCartState(cart, { announce: false });
          this.setStatus('The membership is no longer in your cart.', 'neutral');
          return;
        }

        const updates = {};
        existingLines.forEach((line) => {
          if (line.key) updates[line.key] = 0;
        });

        const payload = { updates };
        this.attachSections(payload);
        const result = await this.postCart('cart/update.js', payload);
        this.applyRenderedSections(result.sections);

        const verifiedCart = await this.fetchCart();
        if (this.subscriptionLines(verifiedCart).length > 0) {
          throw new Error('The membership could not be removed from the cart.');
        }

        this.renderCartState(verifiedCart, { announce: false });
        this.hideRemoveConfirmation();
        this.setStatus('The membership was removed from your cart.', 'success');
        this.emitCartUpdate(verifiedCart, 'remove', null);
      } catch (error) {
        this.setStatus(
          error?.message || 'The membership could not be removed. Please try again.',
          'error',
        );
      } finally {
        this.setBusy(false);
      }
    }

    async syncFromCart({ announce }) {
      if (!this.productId) return;
      const cart = await this.fetchCart();
      this.renderCartState(cart, { announce });
    }

    renderCartState(cart, { announce }) {
      const lines = this.subscriptionLines(cart);
      const primaryLine = lines[0] || null;
      const hasSubscription = Boolean(primaryLine);
      const offerState = this.querySelector('[data-mmg-cart-state="offer"]');
      const activeState = this.querySelector('[data-mmg-cart-state="active"]');
      const duplicateWarning = this.querySelector('[data-mmg-duplicate-warning]');

      if (offerState) offerState.hidden = hasSubscription;
      if (activeState) activeState.hidden = !hasSubscription;
      if (duplicateWarning) duplicateWarning.hidden = lines.length <= 1;

      this.dataset.hasSubscription = hasSubscription ? 'true' : 'false';
      this.dataset.subscriptionLineCount = String(lines.length);

      if (primaryLine) {
        const planName = primaryLine.variant_title || primaryLine.options_with_values?.[0]?.value || 'Membership';
        const sellingPlanName =
          primaryLine.selling_plan_allocation?.selling_plan?.name || 'Monthly billing';
        const planCode =
          primaryLine.properties?._mmg_subscription_plan_code || normalizePlanCode(planName);
        const entitlement = this.entitlementForPlan(planCode);

        this.setText('[data-mmg-current-plan-name]', `${planName} membership`);
        this.setText('[data-mmg-current-plan-price]', this.formatMoney(primaryLine.final_price));
        this.setText('[data-mmg-current-selling-plan]', sellingPlanName);
        this.setText(
          '[data-mmg-current-entitlement]',
          entitlement
            ? `${entitlement.assets} digital assets in ${entitlement.packages} ${
                entitlement.packages === 1 ? 'package' : 'packages'
              } per monthly billing cycle`
            : 'Recurring digital-asset membership',
        );
      }

      if (announce) {
        this.setStatus(
          hasSubscription
            ? 'Your MMG Knowledge Subscription is in the cart.'
            : 'Membership plans are available as an optional cart addition.',
          'neutral',
        );
      }
    }

    entitlementForPlan(planCode) {
      const normalized = normalizePlanCode(planCode);

      if (normalized === 'monthly') return { packages: 1, assets: 2 };
      if (normalized === 'biweekly') return { packages: 2, assets: 4 };
      if (normalized === 'weekly') return { packages: 4, assets: 8 };
      return null;
    }

    subscriptionLines(cart) {
      if (!cart?.items || !this.productId) return [];

      return cart.items
        .map((item, index) => ({ ...item, line: index + 1 }))
        .filter((item) => Number(item.product_id) === this.productId);
    }

    attachSections(payload) {
      if (this.sections.length > 0) {
        payload.sections = this.sections;
        payload.sections_url = this.sectionsUrl.startsWith('/') ? this.sectionsUrl : '/cart';
      }
    }

    async fetchCart() {
      const response = await fetch(`${routesRoot()}cart.js`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });

      if (!response.ok) throw await responseError(response);
      return response.json();
    }

    async postCart(endpoint, payload) {
      const response = await fetch(`${routesRoot()}${endpoint}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw await responseError(response);
      return response.json();
    }

    applyRenderedSections(sections) {
      if (!sections || typeof sections !== 'object') return;

      Object.entries(sections).forEach(([sectionId, html]) => {
        if (!html) return;

        const currentSection = document.getElementById(`shopify-section-${sectionId}`);
        if (!currentSection) return;

        const template = document.createElement('template');
        template.innerHTML = String(html).trim();
        const replacement =
          template.content.querySelector(`#shopify-section-${CSS.escape(sectionId)}`) ||
          template.content.firstElementChild;

        if (replacement) currentSection.replaceWith(replacement);
      });
    }

    emitCartUpdate(cart, action, selection) {
      const detail = {
        source: 'mmg-cart-subscription-controller',
        context: this.context,
        action,
        cart,
        selection,
      };

      this.dispatchEvent(
        new CustomEvent('mmg:cart-subscription-updated', {
          bubbles: true,
          detail,
        }),
      );

      document.dispatchEvent(
        new CustomEvent('cart:updated', {
          detail,
        }),
      );

      document.dispatchEvent(
        new CustomEvent('cart:refresh', {
          detail,
        }),
      );
    }

    openPlanPanel() {
      if (!this.planPanel) return;
      this.planPanel.open = true;
      this.planPanel.querySelector('[data-mmg-plan-input]:not(:disabled)')?.focus();
    }

    closePlanPanel() {
      if (!this.planPanel) return;
      this.planPanel.open = false;
      this.querySelector('[data-mmg-open-plans]')?.focus({ preventScroll: true });
    }

    showRemoveConfirmation() {
      if (!this.removeConfirmation) return;
      this.removeConfirmation.hidden = false;
      this.removeConfirmation.querySelector('[data-mmg-confirm-remove]')?.focus();
    }

    hideRemoveConfirmation() {
      if (!this.removeConfirmation) return;
      this.removeConfirmation.hidden = true;
    }

    setBusy(isBusy) {
      this.busy = isBusy;
      this.toggleAttribute('aria-busy', isBusy);
      this.querySelectorAll('button, input, summary').forEach((control) => {
        if ('disabled' in control) {
          if (isBusy) {
            control.dataset.mmgWasDisabled = control.disabled ? 'true' : 'false';
            control.disabled = true;
          } else if (control.dataset.mmgWasDisabled === 'false') {
            control.disabled = false;
            delete control.dataset.mmgWasDisabled;
          } else if (control.dataset.mmgWasDisabled === 'true') {
            delete control.dataset.mmgWasDisabled;
          }
        }
      });
    }

    setStatus(message, tone) {
      if (!this.liveRegion) return;
      this.liveRegion.textContent = message;
      this.liveRegion.dataset.tone = tone || 'neutral';
      this.liveRegion.hidden = false;
    }

    setText(selector, value) {
      const element = this.querySelector(selector);
      if (element) element.textContent = value || '';
    }

    formatMoney(cents) {
      const numericCents = Number(cents || 0);
      const currency = window.Shopify?.currency?.active || 'USD';

      try {
        return new Intl.NumberFormat(document.documentElement.lang || 'en-US', {
          style: 'currency',
          currency,
        }).format(numericCents / 100);
      } catch (_error) {
        return `$${(numericCents / 100).toFixed(2)}`;
      }
    }

    createReplacementToken() {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      return `mmg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  customElements.define(COMPONENT_TAG, MMGCartSubscriptionController);
})();
