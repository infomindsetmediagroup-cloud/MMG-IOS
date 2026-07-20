(() => {
  const TAG = 'mmg-my-library';
  if (customElements.get(TAG)) return;

  const sourceLabels = {
    one_time_purchase: 'Purchased',
    subscription_delivery: 'Membership',
    bonus: 'Bonus',
    administrative: 'Granted',
  };

  const deliveryLabels = {
    preparing: 'Preparing access',
    ready: 'Available now',
    delivered: 'Delivered',
  };

  const formatLabel = (value) =>
    String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const requestId = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `mmg-lib-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const text = (node, value) => {
    if (node) node.textContent = value ?? '';
  };

  class MMGMyLibrary extends HTMLElement {
    constructor() {
      super();
      this.items = [];
      this.filteredItems = [];
      this.busyAssetId = null;
      this.handleInput = this.handleInput.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.handleRefresh = this.handleRefresh.bind(this);
    }

    connectedCallback() {
      if (this.dataset.mmgLibraryReady === 'true') return;
      this.dataset.mmgLibraryReady = 'true';

      this.endpoint = this.dataset.endpoint || '/api/customer-portal/my-library';
      this.accessEndpoint =
        this.dataset.accessEndpoint || '/api/customer-portal/my-library/access';
      this.csrfToken = this.dataset.csrfToken || '';

      this.status = this.querySelector('[data-mmg-library-status]');
      this.statusText = this.querySelector('[data-mmg-library-status-text]');
      this.blocked = this.querySelector('[data-mmg-library-blocked]');
      this.workspace = this.querySelector('[data-mmg-library-workspace]');
      this.total = this.querySelector('[data-mmg-library-total]');
      this.summaryCopy = this.querySelector('[data-mmg-library-summary-copy]');
      this.search = this.querySelector('[data-mmg-library-search]');
      this.topic = this.querySelector('[data-mmg-library-topic]');
      this.format = this.querySelector('[data-mmg-library-format]');
      this.source = this.querySelector('[data-mmg-library-source]');
      this.sort = this.querySelector('[data-mmg-library-sort]');
      this.clear = this.querySelector('[data-mmg-library-clear]');
      this.resultCount = this.querySelector('[data-mmg-library-result-count]');
      this.empty = this.querySelector('[data-mmg-library-empty]');
      this.emptyTitle = this.querySelector('[data-mmg-library-empty-title]');
      this.emptyCopy = this.querySelector('[data-mmg-library-empty-copy]');
      this.grid = this.querySelector('[data-mmg-library-grid]');
      this.template = this.querySelector('[data-mmg-library-card-template]');
      this.accessStatus = this.querySelector('[data-mmg-library-access-status]');

      this.addEventListener('input', this.handleInput);
      this.addEventListener('change', this.handleInput);
      this.addEventListener('click', this.handleClick);
      document.addEventListener('mmg:my-library-refresh', this.handleRefresh);
      document.addEventListener('mmg:package-delivered', this.handleRefresh);

      this.load();
    }

    disconnectedCallback() {
      this.removeEventListener('input', this.handleInput);
      this.removeEventListener('change', this.handleInput);
      this.removeEventListener('click', this.handleClick);
      document.removeEventListener('mmg:my-library-refresh', this.handleRefresh);
      document.removeEventListener('mmg:package-delivered', this.handleRefresh);
    }

    handleRefresh() {
      if (this.isConnected) this.load({ quiet: true });
    }

    handleInput(event) {
      if (
        [this.search, this.topic, this.format, this.source, this.sort].includes(
          event.target,
        )
      ) {
        this.applyFilters();
      }
    }

    handleClick(event) {
      const clearButton = event.target.closest('[data-mmg-library-clear]');
      if (clearButton && this.contains(clearButton)) {
        this.search.value = '';
        this.topic.value = '';
        this.format.value = '';
        this.source.value = '';
        this.sort.value = 'newest';
        this.applyFilters();
        this.search.focus();
        return;
      }

      const accessButton = event.target.closest('[data-mmg-library-access]');
      if (!accessButton || !this.contains(accessButton)) return;
      const card = accessButton.closest('[data-asset-id]');
      if (!card) return;
      this.requestAccess({
        assetId: card.dataset.assetId,
        kind: accessButton.dataset.mmgLibraryAccess,
        button: accessButton,
      });
    }

    async load({ quiet = false } = {}) {
      if (!quiet) this.setLoading('Loading your digital library…');

      try {
        const response = await fetch(this.endpoint, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const payload = await response.json().catch(() => null);

        if (response.status === 401) {
          this.showBlocked();
          return;
        }

        if (!response.ok || !payload?.ok || !payload.library) {
          throw new Error(payload?.error?.message || 'My Library could not be loaded.');
        }

        this.items = Array.isArray(payload.library.items) ? payload.library.items : [];
        this.populateFilters(payload.library.filters || {});
        text(this.total, String(payload.library.totalAssets || this.items.length));
        text(
          this.summaryCopy,
          this.items.length === 1
            ? 'One digital resource is available in your MMG library.'
            : `${this.items.length} digital resources are connected to your account.`,
        );

        this.status.hidden = true;
        this.blocked.hidden = true;
        this.workspace.hidden = false;
        this.applyFilters();

        this.dispatchEvent(
          new CustomEvent('mmg:my-library-loaded', {
            bubbles: true,
            detail: { totalAssets: this.items.length },
          }),
        );
      } catch (error) {
        this.setError(error?.message || 'My Library could not be loaded.');
      }
    }

    populateFilters(filters) {
      this.replaceOptions(this.topic, 'All topics', filters.topics || []);
      this.replaceOptions(this.format, 'All formats', filters.formats || []);
      this.replaceOptions(
        this.source,
        'All sources',
        filters.sources || [],
        (value) => sourceLabels[value] || formatLabel(value),
      );
    }

    replaceOptions(select, firstLabel, values, labeler = formatLabel) {
      if (!select) return;
      const current = select.value;
      const options = [new Option(firstLabel, '')];
      [...new Set(values)].forEach((value) =>
        options.push(new Option(labeler(value), value)),
      );
      select.replaceChildren(...options);
      if (values.includes(current)) select.value = current;
    }

    applyFilters() {
      const query = String(this.search?.value || '').trim().toLowerCase();
      const topic = this.topic?.value || '';
      const format = this.format?.value || '';
      const source = this.source?.value || '';
      const sort = this.sort?.value || 'newest';

      this.filteredItems = this.items.filter((item) => {
        const haystack = [
          item.title,
          item.summary,
          item.topic,
          item.format,
          item.series,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return (
          (!query || haystack.includes(query)) &&
          (!topic || item.topic === topic) &&
          (!format || item.format === format) &&
          (!source || item.ownership?.sources?.includes(source))
        );
      });

      this.filteredItems.sort((left, right) => {
        if (sort === 'title') return left.title.localeCompare(right.title);
        return (
          new Date(right.ownership.latestGrantedAt).getTime() -
          new Date(left.ownership.latestGrantedAt).getTime()
        );
      });

      this.render();
    }

    render() {
      const count = this.filteredItems.length;
      text(this.resultCount, `${count} ${count === 1 ? 'resource' : 'resources'}`);
      this.clear.hidden = this.items.length === 0;
      this.grid.replaceChildren();

      if (this.items.length === 0) {
        this.empty.hidden = false;
        text(this.emptyTitle, 'Your library is ready for its first resource');
        text(
          this.emptyCopy,
          'Purchased and delivered digital products will appear here automatically.',
        );
        return;
      }

      if (count === 0) {
        this.empty.hidden = false;
        text(this.emptyTitle, 'No resources match these filters');
        text(this.emptyCopy, 'Clear the filters or search for a different title.');
        return;
      }

      this.empty.hidden = true;
      const fragment = document.createDocumentFragment();
      this.filteredItems.forEach((item) => fragment.append(this.cardFor(item)));
      this.grid.append(fragment);
    }

    cardFor(item) {
      const card = this.template.content.firstElementChild.cloneNode(true);
      card.dataset.assetId = item.assetId;

      const image = card.querySelector('[data-mmg-library-card-image]');
      image.src = item.squareThumbnailUrl || item.portraitCoverUrl || '';
      image.alt = `${item.title} cover`;
      if (!image.src) image.hidden = true;

      const delivery = card.querySelector('[data-mmg-library-card-delivery]');
      delivery.dataset.state = item.delivery.state;
      text(delivery, deliveryLabels[item.delivery.state] || formatLabel(item.delivery.state));

      const meta = card.querySelector('[data-mmg-library-card-meta]');
      [item.format, item.topic]
        .filter(Boolean)
        .forEach((value) => {
          const span = document.createElement('span');
          span.textContent = formatLabel(value);
          meta.append(span);
        });

      text(card.querySelector('[data-mmg-library-card-title]'), item.title);
      text(
        card.querySelector('[data-mmg-library-card-summary]'),
        item.summary || 'Open this MMG resource through your secure customer library.',
      );

      const sourceText = (item.ownership.sources || [])
        .map((value) => sourceLabels[value] || formatLabel(value))
        .join(' · ');
      const acquired = formatDate(item.ownership.latestGrantedAt);
      text(
        card.querySelector('[data-mmg-library-card-owned]'),
        `${sourceText}${acquired ? ` · Added ${acquired}` : ''}`,
      );

      const read = card.querySelector('[data-mmg-library-access="read"]');
      const download = card.querySelector('[data-mmg-library-access="download"]');
      read.disabled = !item.access.readAvailable;
      download.disabled = !item.access.downloadAvailable;
      read.title = item.access.readAvailable
        ? 'Create a secure read-online link'
        : 'Read-online access is not available for this resource yet';
      download.title = item.access.downloadAvailable
        ? 'Create a secure download link'
        : 'Download access is not available for this resource yet';

      const productLink = card.querySelector('[data-mmg-library-card-product-link]');
      productLink.href = item.productUrl || this.dataset.catalogUrl || '/pages/knowledge-library';

      return card;
    }

    async requestAccess({ assetId, kind, button }) {
      if (!assetId || !['read', 'download'].includes(kind) || this.busyAssetId) return;
      if (!this.csrfToken) {
        this.setAccessStatus(
          'Secure file access is still being configured. Contact Customer Service for assistance.',
          true,
        );
        return;
      }

      this.busyAssetId = assetId;
      button.disabled = true;
      const previousLabel = button.textContent;
      button.textContent = kind === 'read' ? 'Opening…' : 'Preparing…';
      this.setAccessStatus(
        kind === 'read' ? 'Preparing secure read access…' : 'Preparing secure download access…',
        false,
      );

      try {
        const response = await fetch(this.accessEndpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-MMG-CSRF-Token': this.csrfToken,
          },
          body: JSON.stringify({ requestId: requestId(), assetId, kind }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok || !payload.access?.url) {
          throw new Error(
            payload?.error?.message || 'Secure file access could not be prepared.',
          );
        }

        this.dispatchEvent(
          new CustomEvent('mmg:my-library-access-granted', {
            bubbles: true,
            detail: { assetId, kind, expiresAt: payload.access.expiresAt },
          }),
        );
        this.setAccessStatus('Secure access is ready. Opening your resource…', false);
        window.location.assign(payload.access.url);
      } catch (error) {
        this.setAccessStatus(
          error?.message || 'Secure file access could not be prepared.',
          true,
        );
      } finally {
        this.busyAssetId = null;
        button.textContent = previousLabel;
        const item = this.items.find((candidate) => candidate.assetId === assetId);
        button.disabled =
          kind === 'read'
            ? !item?.access?.readAvailable
            : !item?.access?.downloadAvailable;
      }
    }

    setLoading(message) {
      this.status.hidden = false;
      this.blocked.hidden = true;
      this.workspace.hidden = true;
      text(this.statusText, message);
    }

    showBlocked() {
      this.status.hidden = true;
      this.workspace.hidden = true;
      this.blocked.hidden = false;
    }

    setError(message) {
      this.status.hidden = false;
      this.blocked.hidden = true;
      this.workspace.hidden = true;
      this.status.classList.add('mmg-my-library__status--error');
      text(this.statusText, message);
    }

    setAccessStatus(message, isError) {
      this.accessStatus.hidden = false;
      this.accessStatus.dataset.tone = isError ? 'error' : 'working';
      text(this.accessStatus, message);
    }
  }

  customElements.define(TAG, MMGMyLibrary);
})();
