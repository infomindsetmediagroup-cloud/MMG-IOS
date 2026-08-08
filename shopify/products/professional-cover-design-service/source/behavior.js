(() => {
  'use strict';

  const root = document.getElementById('mmg-professional-cover-design');
  if (!root || root.dataset.mmgReady === 'true') return;
  root.dataset.mmgReady = 'true';

  const handle = root.dataset.mmgProductHandle;
  const defaultTier = root.dataset.mmgDefaultTier || 'Growth';
  const tierNames = ['Starter', 'Growth', 'Professional'];
  const variants = new Map();
  let selectedTier = defaultTier;

  const setText = (selector, text) => {
    root.querySelectorAll(selector).forEach((node) => { node.textContent = text; });
  };

  const formatCents = (value) => {
    const normalized = String(value ?? '').trim();
    if (!/^\d+$/.test(normalized)) return '';
    const cents = Number(normalized);
    return Number.isSafeInteger(cents) && cents >= 0
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(cents / 100)
      : '';
  };

  const selectTier = (tier) => {
    if (!tierNames.includes(tier)) return;
    selectedTier = tier;
    root.querySelectorAll('[data-mmg-tier]').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.mmgTier === tier);
    });
  };

  const setControlsEnabled = (enabled) => {
    root.querySelectorAll('[data-mmg-add]').forEach((button) => {
      const variant = variants.get(button.dataset.mmgAdd);
      button.disabled = !enabled || !variant || variant.available === false;
    });
  };

  const hydrateProduct = async () => {
    setControlsEnabled(false);
    try {
      const response = await fetch(`/products/${encodeURIComponent(handle)}.js`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Product request failed: ${response.status}`);
      const product = await response.json();

      const image = root.querySelector('[data-mmg-featured-image]');
      const imageUrl = typeof product.featured_image === 'string'
        ? product.featured_image
        : product.featured_image?.src;
      if (image && imageUrl) image.src = imageUrl;

      for (const variant of product.variants || []) {
        const tier = tierNames.find((name) => String(variant.title).toLowerCase().includes(name.toLowerCase()));
        if (tier) variants.set(tier, variant);
      }

      for (const tier of tierNames) {
        const variant = variants.get(tier);
        const price = root.querySelector(`[data-mmg-price="${tier}"]`);
        const button = root.querySelector(`[data-mmg-add="${tier}"]`);
        if (variant && price) price.textContent = formatCents(variant.price);
        if (button) {
          button.disabled = !variant || variant.available === false;
          button.textContent = variant?.available === false ? `${tier} Unavailable` : `Add ${tier} to Cart`;
        }
      }

      const available = [...variants.values()].some((variant) => variant.available !== false);
      setText('[data-mmg-availability]', available ? 'Available now' : 'Currently unavailable');
      setControlsEnabled(true);
    } catch (error) {
      console.error('[MMG service product] Product hydration failed', error);
      setText('[data-mmg-availability]', 'Live package data is temporarily unavailable');
      setText('[data-mmg-cart-status]', 'Purchase controls are disabled until Shopify package data loads safely.');
      setControlsEnabled(false);
    }
  };

  const addToCart = async (tier, button) => {
    const variant = variants.get(tier);
    if (!variant?.id || variant.available === false) {
      setText('[data-mmg-cart-status]', `${tier} is not available right now.`);
      return;
    }

    setControlsEnabled(false);
    setText('[data-mmg-cart-status]', `Adding ${tier} to your cart…`);
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: variant.id, quantity: 1 })
      });
      if (!response.ok) throw new Error(`Cart request failed: ${response.status}`);
      await response.json();
      setText('[data-mmg-cart-status]', `${tier} was added to your cart.`);
      document.dispatchEvent(new CustomEvent('cart:refresh'));
      document.dispatchEvent(new CustomEvent('cart:updated'));
    } catch (error) {
      console.error('[MMG service product] Cart addition failed', error);
      setText('[data-mmg-cart-status]', 'Shopify could not add this package. Open the cart and try again.');
      if (button) button.focus();
    } finally {
      setControlsEnabled(true);
    }
  };

  root.querySelectorAll('[data-mmg-tier]').forEach((card) => {
    const tier = card.dataset.mmgTier;
    card.addEventListener('click', (event) => {
      if (!event.target.closest('[data-mmg-add]')) selectTier(tier);
    });
    card.addEventListener('focus', () => selectTier(tier));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectTier(tier);
      }
    });
  });

  root.querySelectorAll('[data-mmg-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const tier = button.dataset.mmgAdd;
      selectTier(tier);
      addToCart(tier, button);
    });
  });

  root.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = root.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  });

  root.querySelector('[data-mmg-back-top]')?.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });

  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    root.querySelectorAll('.mmg-card, .mmg-tier, .mmg-section__head').forEach((node) => {
      node.classList.add('mmg-reveal');
      observer.observe(node);
    });
    window.setTimeout(() => {
      root.querySelectorAll('.mmg-reveal').forEach((node) => node.classList.add('is-visible'));
    }, 2200);
  }

  selectTier(defaultTier);
  hydrateProduct();
})();
