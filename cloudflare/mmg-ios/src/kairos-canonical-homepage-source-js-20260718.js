export const JS_SOURCE = String.raw`(() => {
  const root = document.querySelector('[data-mmg-canonical-homepage]');
  if (!root || root.dataset.enhanced === 'true') return;
  root.dataset.enhanced = 'true';

  const navigation = [
    ['Home', '/'],
    ['Knowledge Library', '/pages/knowledge-library'],
    ['Shop', '/collections/all'],
    ['Publishing Services', '/pages/publishing-services'],
    ['Membership', '/pages/membership'],
    ['Kairos', '/pages/kairos'],
    ['About', '/pages/about-mindset-media-group'],
    ['Contact', '/pages/contact'],
    ['Customer Portal', '/pages/customer-portal']
  ];

  function enhanceNativeHeader() {
    const drawerList = document.querySelector('#menu-drawer .menu-drawer__menu, .menu-drawer__navigation .menu-drawer__menu, header-drawer ul.menu-drawer__menu');
    if (!drawerList || drawerList.dataset.mmgNavigation === 'true') return;
    drawerList.dataset.mmgNavigation = 'true';
    drawerList.replaceChildren();
    navigation.forEach(([label, href]) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      link.className = 'menu-drawer__menu-item list-menu__item link link--text focus-inset';
      if (label === 'Customer Portal') link.classList.add('mmg-native-portal-link');
      if (location.pathname === href) link.setAttribute('aria-current', 'page');
      item.appendChild(link);
      drawerList.appendChild(item);
    });

    const desktopList = document.querySelector('header .header__inline-menu ul.list-menu--inline');
    if (desktopList && desktopList.dataset.mmgNavigation !== 'true') {
      desktopList.dataset.mmgNavigation = 'true';
      desktopList.replaceChildren();
      navigation.slice(0, 6).forEach(([label, href]) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = href;
        link.textContent = label;
        link.className = 'header__menu-item list-menu__item link link--text focus-inset';
        item.appendChild(link);
        desktopList.appendChild(item);
      });
    }
  }

  function enhanceNativeFooter() {
    document.querySelectorAll('.footer__payment, .list-payment, [class*="payment-icons"], [class*="payment_icons"]').forEach((element) => element.remove());
    const copyright = document.querySelector('.footer__copyright');
    if (copyright) {
      copyright.replaceChildren();
      const line = document.createElement('small');
      line.className = 'copyright__content mmg-footer-credit';
      line.textContent = 'Mindset Media Group, powered by Kairos.';
      copyright.appendChild(line);
    }
  }

  enhanceNativeHeader();
  enhanceNativeFooter();
  const shellObserver = new MutationObserver(() => {
    enhanceNativeHeader();
    enhanceNativeFooter();
  });
  shellObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => shellObserver.disconnect(), 12000);

  const themeHeading = document.querySelector('header h1.header__heading, header .header__heading h1');
  if (themeHeading && !root.contains(themeHeading)) {
    const replacement = document.createElement('div');
    for (const attribute of themeHeading.attributes) replacement.setAttribute(attribute.name, attribute.value);
    while (themeHeading.firstChild) replacement.appendChild(themeHeading.firstChild);
    themeHeading.replaceWith(replacement);
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = [...root.querySelectorAll('.mmg-reveal')];
  if (reducedMotion || !('IntersectionObserver' in window)) {
    reveal.forEach((element) => element.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveal.forEach((element) => observer.observe(element));
  }

  root.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = root.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });
})();`;