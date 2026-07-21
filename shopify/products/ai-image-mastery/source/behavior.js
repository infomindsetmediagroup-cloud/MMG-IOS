(() => {
  'use strict';

  const PAGE_CLASS = 'mmg-ai-image-mastery-page';
  document.documentElement.classList.add(PAGE_CLASS);
  if (document.body) document.body.classList.add(PAGE_CLASS);

  const root = document.getElementById('mmg-ai-image-mastery');
  if (!root || root.dataset.mmgReady === 'true') return;
  root.dataset.mmgReady = 'true';

  const handle = root.dataset.mmgProductHandle;
  let variant = null;

  const setText = (selector, text) => {
    root.querySelectorAll(selector).forEach((node) => {
      node.textContent = text;
    });
  };

  const formatMoney = (value) => {
    const amount = Number.parseFloat(String(value));
    return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : '';
  };

  const setPurchaseEnabled = (enabled) => {
    root.querySelectorAll('[data-mmg-add]').forEach((button) => {
      button.disabled = !enabled || !variant || variant.available === false;
    });
  };

  const hydrateProduct = async () => {
    setPurchaseEnabled(false);

    try {
      const response = await fetch(`/products/${encodeURIComponent(handle)}.js`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Product request failed: ${response.status}`);
      }

      const product = await response.json();
      variant = (product.variants || []).find((item) => item.available !== false)
        || (product.variants || [])[0]
        || null;

      const image = root.querySelector('[data-mmg-featured-image]');
      const imageUrl = typeof product.featured_image === 'string'
        ? product.featured_image
        : product.featured_image?.src;

      if (image && imageUrl) {
        image.src = imageUrl;
      }

      if (variant) {
        const price = formatMoney(variant.price);
        if (price) setText('[data-mmg-price]', price);
      }

      const available = Boolean(variant && variant.available !== false);
      setText('[data-mmg-availability]', available ? 'Available now · immediate digital access' : 'Currently unavailable');
      setText('[data-mmg-add]', available ? 'Add Digital Guide to Cart' : 'Digital Guide Unavailable');
      setPurchaseEnabled(available);
    } catch (error) {
      console.error('[MMG digital product] Product hydration failed', error);
      setText('[data-mmg-availability]', 'Live product data is temporarily unavailable');
      setText('[data-mmg-cart-status]', 'Purchase controls remain disabled until Shopify product data loads safely.');
      setPurchaseEnabled(false);
    }
  };

  const addToCart = async (button) => {
    if (!variant?.id || variant.available === false) {
      setText('[data-mmg-cart-status]', 'AI Image Mastery™ is not available right now.');
      return;
    }

    setPurchaseEnabled(false);
    setText('[data-mmg-cart-status]', 'Adding AI Image Mastery™ to your cart…');

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          id: variant.id,
          quantity: 1
        })
      });

      if (!response.ok) {
        throw new Error(`Cart request failed: ${response.status}`);
      }

      await response.json();
      setText('[data-mmg-cart-status]', 'AI Image Mastery™ was added to your cart.');
      document.dispatchEvent(new CustomEvent('cart:refresh'));
      document.dispatchEvent(new CustomEvent('cart:updated'));
    } catch (error) {
      console.error('[MMG digital product] Cart addition failed', error);
      setText('[data-mmg-cart-status]', 'Shopify could not add the guide. Open the cart and try again.');
      button?.focus();
    } finally {
      setPurchaseEnabled(Boolean(variant && variant.available !== false));
    }
  };

  root.querySelector('[data-mmg-add]')?.addEventListener('click', (event) => {
    addToCart(event.currentTarget);
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

  const revealTargets = root.querySelectorAll(
    '.mmg-card, .mmg-purchase__card, .mmg-section__head, .mmg-process li'
  );

  if (
    'IntersectionObserver' in window
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    root.classList.add('mmg-motion-ready');

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });

    revealTargets.forEach((node) => {
      node.classList.add('mmg-reveal');
      observer.observe(node);
    });

    window.setTimeout(() => {
      revealTargets.forEach((node) => node.classList.add('is-visible'));
      root.classList.remove('mmg-motion-ready');
    }, 2400);
  } else {
    revealTargets.forEach((node) => node.classList.add('is-visible'));
  }

  hydrateProduct();
})();
